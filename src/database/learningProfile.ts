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

export interface CarScannerSeedSample {
  pidName: string;
  value: number;
  condition: VehicleCondition;
  timestamp: string;
}

export const CARSCANNER_SEED_VERSION = 'CARSCANNER_2026-09-24';

export const CARSCANNER_SEED_SAMPLES: CarScannerSeedSample[] = [
  { pidName: 'Coolant Temperature', value: 81, condition: 'IDLE_WARM', timestamp: '2026-09-24T14:48:00.000Z' },
  { pidName: 'STFT Bank 1', value: -8.59, condition: 'IDLE_WARM', timestamp: '2026-09-24T14:48:00.000Z' },
  { pidName: 'LTFT Bank 1', value: 10.94, condition: 'IDLE_WARM', timestamp: '2026-09-24T14:48:00.000Z' },
  { pidName: 'MAP', value: 39.02, condition: 'IDLE_WARM', timestamp: '2026-09-24T14:48:00.000Z' },
  { pidName: 'Engine RPM', value: 778, condition: 'IDLE_WARM', timestamp: '2026-09-24T14:48:00.000Z' },
  { pidName: 'Timing Advance', value: 8, condition: 'IDLE_WARM', timestamp: '2026-09-24T14:48:00.000Z' },
  { pidName: 'Intake Air Temperature', value: 33, condition: 'IDLE_WARM', timestamp: '2026-09-24T14:48:00.000Z' },
  { pidName: 'MAF', value: 2.48, condition: 'IDLE_WARM', timestamp: '2026-09-24T14:48:00.000Z' },
  { pidName: 'Throttle Position', value: 3.53, condition: 'IDLE_WARM', timestamp: '2026-09-24T14:48:00.000Z' },
  { pidName: 'O2 Sensor 1 Voltage', value: 0.53, condition: 'IDLE_WARM', timestamp: '2026-09-24T14:48:00.000Z' },
];

export async function initializeCarScannerSeed(
  basePath: string,
  seedImportDate = '2026-09-24T14:48:00.000Z',
): Promise<MerivaLearningProfile | null> {
  return enqueueProfileTransaction(basePath, async () => {
    const profile = await readLearningProfileUnsafe(basePath);
    if (!profile) return null;
    if (profile.seedVersion === CARSCANNER_SEED_VERSION && profile.globalSampleCounts.seedSamples > 0) {
      return profile;
    }

    const now = new Date().toISOString();
    profile.seedVersion = CARSCANNER_SEED_VERSION;
    profile.seedImportDate = seedImportDate;
    profile.learningStatus = 'SEED_INITIALIZED';
    profile.source = 'HYBRID';
    profile.seedWeight = 0.25;
    profile.globalSampleCounts.seedSamples = CARSCANNER_SEED_SAMPLES.length;
    profile.globalSampleCounts.totalSamples = profile.globalSampleCounts.realSamples + profile.globalSampleCounts.seedSamples;
    profile.lastUpdated = now;

    for (const sample of CARSCANNER_SEED_SAMPLES) {
      const context = profile.contextualData.find((item) => item.condition === sample.condition) ?? {
        condition: sample.condition,
        statistics: {},
        lastUpdate: now,
        sampleCount: 0,
      };
      if (!profile.contextualData.includes(context)) profile.contextualData.push(context);

      const existing = context.statistics[sample.pidName];
      if (existing && existing.realSamples > 0) continue;

      context.sampleCount = Math.max(context.sampleCount, 1);
      context.lastUpdate = now;
      context.statistics[sample.pidName] = {
        mean: sample.value,
        median: sample.value,
        min: sample.value,
        max: sample.value,
        stddev: 0,
        samples: 1,
        realSamples: 0,
        seedSamples: 1,
        confidence: 'LOW',
        lastUpdate: sample.timestamp,
        source: ['CARSCANNER_BASELINE'],
      };
    }

    await writeLearningProfileUnsafe(basePath, profile);
    return profile;
  });
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
      contextStats = {
        condition,
        statistics: {},
        lastUpdate: now,
        sampleCount: 0,
      };
      profile.contextualData.push(contextStats);
    }

    contextStats.sampleCount += 1;
    contextStats.lastUpdate = now;

    const existing = contextStats.statistics[pidName];
    if (!existing) {
      contextStats.statistics[pidName] = {
        mean: value,
        median: value,
        min: value,
        max: value,
        stddev: 0,
        samples: 1,
        realSamples: 1,
        seedSamples: 0,
        confidence: determineConfidence(1, profile.confidenceThresholds),
        lastUpdate: now,
        source: ['REAL_OBD'],
      };
    } else {
      const previousMean = existing.mean;
      const previousSamples = existing.samples;
      const previousM2 =
        existing.stddev * existing.stddev * Math.max(0, previousSamples - 1);
      existing.samples = previousSamples + 1;
      existing.realSamples += 1;
      existing.mean =
        previousMean + (value - previousMean) / existing.samples;
      const delta = value - previousMean;
      const m2 = previousM2 + delta * (value - existing.mean);
      existing.stddev = Math.sqrt(
        Math.max(0, m2 / Math.max(1, existing.samples - 1)),
      );
      existing.min = Math.min(existing.min, value);
      existing.max = Math.max(existing.max, value);
      existing.confidence = determineConfidence(
        existing.samples,
        profile.confidenceThresholds,
      );
      existing.lastUpdate = now;
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
