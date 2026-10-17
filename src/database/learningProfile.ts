import * as FileSystem from 'expo-file-system';
import type {
  ConfidenceLevel,
  SampleStatistics,
  VehicleCondition,
} from '../types/sourceTypes';

const profileQueues = new Map<string, Promise<void>>();

export interface ContextualStatistics {
  condition: VehicleCondition;
  statistics: Record<string, SampleStatistics>;
  lastUpdate: string;
  sampleCount: number;
}

export interface MerivaLearningProfile {
  vehicleId: string;
  profileCreated: string;
  lastUpdated: string;
  seedVersion: string;
  seedImportDate: string;
  learningStatus: 'COLD_START' | 'SEED_INITIALIZED' | 'LEARNING_ACTIVE' | 'CONFIDENT';
  confidenceThresholds: {
    low: number;
    medium: number;
    good: number;
    high: number;
  };
  contextualData: ContextualStatistics[];
  overallStatistics: Record<string, SampleStatistics>;
  globalSampleCounts: {
    seedSamples: number;
    realSamples: number;
    totalSamples: number;
  };
  source: 'HYBRID' | 'REAL_ONLY';
  seedWeight: number;
  dataContamination: {
    simulationDetected: number;
    simulationFiltered: number;
  };
}

function profilePath(basePath: string): string {
  return `${basePath}/APRENDIZADO/dna_meriva.json`;
}
const MEDIAN_WINDOW_LIMIT = 101;

function medianOf(values: number[]): number {
  const finite = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!finite.length) return 0;
  const middle = Math.floor(finite.length / 2);
  return finite.length % 2 === 1
    ? finite[middle]
    : (finite[middle - 1] + finite[middle]) / 2;
}

function extendMedianWindow(existing: SampleStatistics, value: number): number[] {
  const window = (existing.medianWindow ?? []).filter((item) => Number.isFinite(item)).slice(-MEDIAN_WINDOW_LIMIT);
  if (!window.length && Number.isFinite(existing.median)) window.push(existing.median);
  window.push(value);
  while (window.length > MEDIAN_WINDOW_LIMIT) window.shift();
  return window;
}

function createStatistics(
  value: number,
  source: 'REAL_OBD' | 'CARSCANNER_BASELINE',
  realSamples: number,
  seedSamples: number,
  thresholds: Record<string, number>,
): SampleStatistics {
  return {
    mean: value,
    median: value,
    min: value,
    max: value,
    stddev: 0,
    samples: realSamples + seedSamples,
    realSamples,
    seedSamples,
    confidence: determineConfidence(realSamples, thresholds),
    lastUpdate: new Date().toISOString(),
    source: [source],
    medianWindow: [value],
  };
}

function updateStatisticsWithRealSample(
  existing: SampleStatistics,
  value: number,
  profile: MerivaLearningProfile,
  now: string,
): void {
  const previousMean = existing.mean;
  const previousSamples = Math.max(1, existing.realSamples);
  const previousM2 = existing.stddev * existing.stddev * Math.max(0, previousSamples - 1);

  existing.samples = previousSamples + 1;
  existing.realSamples = previousSamples + 1;
  existing.seedSamples = 0;
  existing.mean = previousMean + (value - previousMean) / existing.samples;
  const delta = value - previousMean;
  const m2 = previousM2 + delta * (value - existing.mean);
  existing.stddev = Math.sqrt(Math.max(0, m2 / Math.max(1, existing.samples - 1)));

  existing.medianWindow = extendMedianWindow(existing, value);
  existing.median = medianOf(existing.medianWindow);
  existing.min = Math.min(existing.min, value);
  existing.max = Math.max(existing.max, value);
  existing.confidence = determineConfidence(existing.realSamples, profile.confidenceThresholds);
  existing.lastUpdate = now;
  existing.source = Array.from(new Set([...existing.source, 'REAL_OBD']));
}

async function readLearningProfileUnsafe(
  basePath: string,
): Promise<MerivaLearningProfile | null> {
  const target = profilePath(basePath);
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists || info.isDirectory) return null;

  try {
    const content = await FileSystem.readAsStringAsync(target);
    return JSON.parse(content) as MerivaLearningProfile;
  } catch {
    return null;
  }
}

/**
 * Migra perfis legados para estatísticas com proveniência exclusivamente REAL_OBD.
 * Médias misturadas com dados de referência não podem ser separadas com segurança;
 * são descartadas e reaprendidas a partir de novas respostas reais.
 */
function sanitizeProfileToRealOnly(profile: MerivaLearningProfile): void {
  profile.contextualData = profile.contextualData
    .map((context) => {
      const statistics = Object.fromEntries(Object.entries(context.statistics).filter(([, stats]) => {
        const sources = Array.isArray(stats.source) ? stats.source : [];
        return stats.realSamples > 0
          && stats.seedSamples === 0
          && sources.includes('REAL_OBD')
          && !sources.includes('CARSCANNER_BASELINE');
      })) as Record<string, SampleStatistics>;

      for (const stats of Object.values(statistics)) {
        stats.samples = stats.realSamples;
      }
      const sampleCount = Object.values(statistics).reduce((sum, stats) => sum + stats.realSamples, 0);
      return { ...context, statistics, sampleCount };
    })
    .filter((context) => Object.keys(context.statistics).length > 0);

  profile.overallStatistics = Object.fromEntries(Object.entries(profile.overallStatistics).filter(([, stats]) => {
    const sources = Array.isArray(stats.source) ? stats.source : [];
    return stats.realSamples > 0
      && stats.seedSamples === 0
      && sources.includes('REAL_OBD')
      && !sources.includes('CARSCANNER_BASELINE');
  })) as Record<string, SampleStatistics>;
  for (const stats of Object.values(profile.overallStatistics)) {
    stats.samples = stats.realSamples;
  }

  const realSampleCount = profile.contextualData.reduce(
    (sum, context) => sum + Object.values(context.statistics).reduce((inner, stats) => inner + stats.realSamples, 0),
    0,
  );
  profile.seedVersion = 'NONE';
  profile.seedImportDate = '';
  profile.seedWeight = 0;
  profile.source = 'REAL_ONLY';
  profile.globalSampleCounts.seedSamples = 0;
  profile.globalSampleCounts.realSamples = realSampleCount;
  profile.globalSampleCounts.totalSamples = realSampleCount;

  if (realSampleCount >= profile.confidenceThresholds.high) profile.learningStatus = 'CONFIDENT';
  else if (realSampleCount >= profile.confidenceThresholds.low) profile.learningStatus = 'LEARNING_ACTIVE';
  else profile.learningStatus = 'COLD_START';
}

/** Run once during startup and before each learning write to clean legacy profiles. */
export async function sanitizeLearningProfileToRealOnly(basePath: string): Promise<MerivaLearningProfile | null> {
  return enqueueProfileTransaction(basePath, async () => {
    const profile = await readLearningProfileUnsafe(basePath);
    if (!profile) return null;
    sanitizeProfileToRealOnly(profile);
    // A limpeza de proveniência não é uma nova amostra nem deve falsificar o horário do aprendizado.
    await writeLearningProfileUnsafe(basePath, profile);
    return profile;
  });
}

async function writeLearningProfileUnsafe(
  basePath: string,
  profile: MerivaLearningProfile,
): Promise<void> {
  const target = profilePath(basePath);
  await FileSystem.makeDirectoryAsync(`${basePath}/APRENDIZADO`, { intermediates: true });
  await FileSystem.writeAsStringAsync(target, JSON.stringify(profile, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

async function enqueueProfileTransaction<T>(
  basePath: string,
  operation: () => Promise<T>,
): Promise<T> {
  const target = profilePath(basePath);
  const previous = profileQueues.get(target) ?? Promise.resolve();

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  const current = previous
    .catch(() => undefined)
    .then(async () => operation());

  const queued = current.then(() => gate, () => gate);
  profileQueues.set(target, queued);

  try {
    return await current;
  } finally {
    release();
    if (profileQueues.get(target) === queued) {
      profileQueues.delete(target);
    }
  }
}

export async function createLearningProfile(
  basePath: string,
  seedImportDate: string,
): Promise<MerivaLearningProfile> {
  const now = new Date().toISOString();
  const profile: MerivaLearningProfile = {
    vehicleId: 'MERIVA_MAXX',
    profileCreated: now,
    lastUpdated: now,
    seedVersion: 'NONE',
    seedImportDate,
    learningStatus: 'COLD_START',
    confidenceThresholds: {
      low: 10,
      medium: 50,
      good: 200,
      high: 500,
    },
    contextualData: [],
    overallStatistics: {},
    globalSampleCounts: {
      seedSamples: 0,
      realSamples: 0,
      totalSamples: 0,
    },
    source: 'REAL_ONLY',
    seedWeight: 0,
    dataContamination: {
      simulationDetected: 0,
      simulationFiltered: 0,
    },
  };

  await saveLearningProfile(basePath, profile);
  return profile;
}

export async function saveLearningProfile(
  basePath: string,
  profile: MerivaLearningProfile,
): Promise<void> {
  await enqueueProfileTransaction(basePath, () =>
    writeLearningProfileUnsafe(basePath, profile),
  );
}

export async function readLearningProfile(
  basePath: string,
): Promise<MerivaLearningProfile | null> {
  const target = profilePath(basePath);
  await (profileQueues.get(target) ?? Promise.resolve()).catch(() => undefined);
  return readLearningProfileUnsafe(basePath);
}

export async function updateLearningProfileRealSample(
  basePath: string,
  pidName: string,
  value: number,
  condition: VehicleCondition,
): Promise<void> {
  if (!Number.isFinite(value)) return;

  await enqueueProfileTransaction(basePath, async () => {
    const profile = await readLearningProfileUnsafe(basePath);
    if (!profile) return;

    sanitizeProfileToRealOnly(profile);
    const now = new Date().toISOString();
    profile.lastUpdated = now;
    profile.globalSampleCounts.realSamples += 1;
    profile.globalSampleCounts.totalSamples += 1;

    const realSamples = profile.globalSampleCounts.realSamples;
    if (realSamples >= profile.confidenceThresholds.high) {
      profile.learningStatus = 'CONFIDENT';
    } else if (realSamples >= profile.confidenceThresholds.low) {
      profile.learningStatus = 'LEARNING_ACTIVE';
    } else {
      profile.learningStatus = 'COLD_START';
    }

    let contextStats = profile.contextualData.find((item) => item.condition === condition);
    if (!contextStats) {
      contextStats = { condition, statistics: {}, lastUpdate: now, sampleCount: 0 };
      profile.contextualData.push(contextStats);
    }

    contextStats.sampleCount += 1;
    contextStats.lastUpdate = now;

    const existing = contextStats.statistics[pidName];
    if (!existing) {
      contextStats.statistics[pidName] = createStatistics(value, 'REAL_OBD', 1, 0, profile.confidenceThresholds);
      contextStats.statistics[pidName].lastUpdate = now;
    } else {
      updateStatisticsWithRealSample(existing, value, profile, now);
    }

    const overall = profile.overallStatistics[pidName];
    if (!overall) {
      profile.overallStatistics[pidName] = createStatistics(value, 'REAL_OBD', 1, 0, profile.confidenceThresholds);
      profile.overallStatistics[pidName].lastUpdate = now;
    } else {
      updateStatisticsWithRealSample(overall, value, profile, now);
    }

    await writeLearningProfileUnsafe(basePath, profile);
  });
}
export async function blockSimulationLearning(basePath: string): Promise<void> {
  await enqueueProfileTransaction(basePath, async () => {
    const profile = await readLearningProfileUnsafe(basePath);
    if (!profile) return;

    profile.dataContamination.simulationDetected += 1;
    profile.dataContamination.simulationFiltered += 1;
    await writeLearningProfileUnsafe(basePath, profile);
  });
}

function determineConfidence(
  samples: number,
  thresholds: Record<string, number>,
): ConfidenceLevel {
  if (samples < thresholds.low) return 'LOW';
  if (samples < thresholds.medium) return 'MEDIUM';
  if (samples < thresholds.good) return 'GOOD';
  return 'HIGH';
}
