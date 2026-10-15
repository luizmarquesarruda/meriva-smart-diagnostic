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
  source: 'REAL_OBD',
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
  const previousSamples = existing.samples;
  const previousM2 = existing.stddev * existing.stddev * Math.max(0, previousSamples - 1);

  if (existing.seedSamples > 0 || !existing.source.includes('REAL_OBD')) {
    // Não reaproveitar estatística antiga contaminada: reiniciar com a primeira amostra real.
    existing.mean = value;
    existing.median = value;
    existing.min = value;
    existing.max = value;
    existing.stddev = 0;
    existing.samples = 1;
    existing.realSamples = 1;
    existing.seedSamples = 0;
    existing.medianWindow = [value];
  } else {
    existing.samples = previousSamples + 1;
    existing.realSamples += 1;
    existing.mean = previousMean + (value - previousMean) / existing.samples;
    const delta = value - previousMean;
    const m2 = previousM2 + delta * (value - existing.mean);
    existing.stddev = Math.sqrt(Math.max(0, m2 / Math.max(1, existing.samples - 1)));
  }

  existing.medianWindow = extendMedianWindow(existing, value);
  existing.median = medianOf(existing.medianWindow);
  existing.min = Math.min(existing.min, value);
  existing.max = Math.max(existing.max, value);
  existing.confidence = determineConfidence(existing.realSamples, profile.confidenceThresholds);
  existing.lastUpdate = now;
  existing.source = Array.from(new Set([...existing.source, 'REAL_OBD']));
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isValidLearningStatistics(value: unknown): value is SampleStatistics {
  if (!isObjectRecord(value)) return false;
  const finiteKeys = ['mean', 'median', 'min', 'max', 'stddev', 'samples', 'realSamples', 'seedSamples'];
  if (!finiteKeys.every((key) => typeof value[key] === 'number' && Number.isFinite(value[key]))) return false;
  if (!isFiniteNonNegative(value.samples) || !isFiniteNonNegative(value.realSamples) ||
      !isFiniteNonNegative(value.seedSamples) || !isFiniteNonNegative(value.stddev)) return false;
  if ((value.min as number) > (value.max as number)) return false;
  if (!['LOW', 'MEDIUM', 'GOOD', 'HIGH'].includes(String(value.confidence))) return false;
  if (typeof value.lastUpdate !== 'string' || !Number.isFinite(Date.parse(value.lastUpdate))) return false;
  if (!Array.isArray(value.source) || !value.source.every((source) => typeof source === 'string')) return false;
  if (value.medianWindow !== undefined &&
      (!Array.isArray(value.medianWindow) || !value.medianWindow.every((item) => typeof item === 'number' && Number.isFinite(item)))) return false;
  return true;
}

function isValidStatisticsMap(value: unknown): value is Record<string, SampleStatistics> {
  return isObjectRecord(value) && Object.values(value).every(isValidLearningStatistics);
}

function isValidLearningProfile(value: unknown): value is MerivaLearningProfile {
  if (!isObjectRecord(value)) return false;

  const thresholds = isObjectRecord(value.confidenceThresholds) ? value.confidenceThresholds : null;
  const counts = isObjectRecord(value.globalSampleCounts) ? value.globalSampleCounts : null;
  const contamination = isObjectRecord(value.dataContamination) ? value.dataContamination : null;
  const contextualData = value.contextualData;

  if (!thresholds || !counts || !contamination || !Array.isArray(contextualData)) return false;
  if (
    !isFiniteNonNegative(thresholds.low) ||
    !isFiniteNonNegative(thresholds.medium) ||
    !isFiniteNonNegative(thresholds.good) ||
    !isFiniteNonNegative(thresholds.high) ||
    thresholds.low > thresholds.medium ||
    thresholds.medium > thresholds.good ||
    thresholds.good > thresholds.high
  ) return false;
  if (
    !isFiniteNonNegative(counts.seedSamples) ||
    !isFiniteNonNegative(counts.realSamples) ||
    !isFiniteNonNegative(counts.totalSamples) ||
    !isFiniteNonNegative(contamination.simulationDetected) ||
    !isFiniteNonNegative(contamination.simulationFiltered)
  ) return false;
  if (
    typeof value.vehicleId !== 'string' ||
    typeof value.profileCreated !== 'string' || !Number.isFinite(Date.parse(value.profileCreated)) ||
    typeof value.lastUpdated !== 'string' || !Number.isFinite(Date.parse(value.lastUpdated)) ||
    typeof value.seedVersion !== 'string' ||
    typeof value.seedImportDate !== 'string' ||
    !['COLD_START', 'SEED_INITIALIZED', 'LEARNING_ACTIVE', 'CONFIDENT'].includes(String(value.learningStatus)) ||
    !['HYBRID', 'REAL_ONLY'].includes(String(value.source)) ||
    typeof value.seedWeight !== 'number' || !Number.isFinite(value.seedWeight) || value.seedWeight < 0 ||
    !contextualData.every((context) => {
      if (!isObjectRecord(context)) return false;
      return (
        ['IDLE_COLD', 'IDLE_WARM', 'ACCELERATION', 'CRUISE', 'DECELERATION', 'UNKNOWN'].includes(String(context.condition)) &&
        typeof context.lastUpdate === 'string' && Number.isFinite(Date.parse(context.lastUpdate)) &&
        isFiniteNonNegative(context.sampleCount) &&
        isValidStatisticsMap(context.statistics)
      );
    }) ||
    !isValidStatisticsMap(value.overallStatistics)
  ) return false;

  return true;
}

async function readLearningProfileUnsafe(
  basePath: string,
): Promise<MerivaLearningProfile | null> {
  const target = profilePath(basePath);
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists || info.isDirectory) return null;

  try {
    const content = await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.UTF8 });
    const parsed = JSON.parse(content) as unknown;
    return isValidLearningProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function writeLearningProfileUnsafe(
  basePath: string,
  profile: MerivaLearningProfile,
): Promise<void> {
  const target = profilePath(basePath);
  const temp = target + '.tmp';
  const backup = target + '.previous';
  const quarantine = target + '.invalid';
  await FileSystem.makeDirectoryAsync(`${basePath}/APRENDIZADO`, { intermediates: true });

  const content = JSON.stringify(profile, null, 2);
  await FileSystem.writeAsStringAsync(temp, content, { encoding: FileSystem.EncodingType.UTF8 });
  const staged = JSON.parse(await FileSystem.readAsStringAsync(temp, { encoding: FileSystem.EncodingType.UTF8 })) as unknown;
  if (!isValidLearningProfile(staged)) throw new Error('LEARNING_PROFILE_STAGING_VALIDATION_FAILED');

  const info = await FileSystem.getInfoAsync(target);
  if (info.exists && !info.isDirectory) {
    const current = await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.UTF8 }).catch(() => '');
    let parsedCurrent: unknown = null;
    try { parsedCurrent = JSON.parse(current) as unknown; } catch { /* preserve below */ }
    if (isValidLearningProfile(parsedCurrent)) {
      await FileSystem.copyAsync({ from: target, to: backup });
    } else {
      // Preserve malformed legacy content separately before replacing it with a
      // clean profile, without allowing invalid shape to reach learning logic.
      await FileSystem.copyAsync({ from: target, to: quarantine }).catch(() => undefined);
    }
  }

  let committed = false;
  try {
    await FileSystem.copyAsync({ from: temp, to: target });
    const readBack = JSON.parse(await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.UTF8 })) as unknown;
    if (!isValidLearningProfile(readBack)) throw new Error('LEARNING_PROFILE_COMMIT_VALIDATION_FAILED');
    committed = true;
  } catch (cause) {
    const backupInfo = await FileSystem.getInfoAsync(backup).catch(() => ({ exists: false, isDirectory: false }));
    if (backupInfo.exists && !backupInfo.isDirectory) {
      try { await FileSystem.copyAsync({ from: backup, to: target }); } catch { /* recovery backup remains */ }
    }
    throw cause;
  } finally {
    if (committed) {
      try { await FileSystem.deleteAsync(temp, { idempotent: true }); } catch { /* clean on next write */ }
    }
  }
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

  const existingInfo = await FileSystem.getInfoAsync(profilePath(basePath));
  if (existingInfo.exists && !existingInfo.isDirectory) {
    const existing = await readLearningProfileUnsafe(basePath);
    if (!existing) {
      // New blank profile must not destroy an unreadable legacy DNA file.
      const invalidCopy = profilePath(basePath) + '.invalid';
      await FileSystem.copyAsync({ from: profilePath(basePath), to: invalidCopy }).catch(() => undefined);
    }
  }
  await saveLearningProfile(basePath, profile);
  return profile;
}

/**
 * Remove definitivamente a influência histórica do CarScanner do perfil local.
 * Estatísticas mistas não podem ser separadas com exatidão porque a média antiga
 * combinava seed e amostras reais; por segurança, essas estatísticas são descartadas.
 * Estatísticas comprovadamente REAL_OBD sem amostras seed são preservadas.
 */
export async function purgeCarScannerHistory(basePath: string): Promise<MerivaLearningProfile | null> {
  return enqueueProfileTransaction(basePath, async () => {
    const profile = await readLearningProfileUnsafe(basePath);
    if (!profile) return null;

    const cleanStats = (stats: Record<string, SampleStatistics>): Record<string, SampleStatistics> => {
      const clean: Record<string, SampleStatistics> = {};
      for (const [pidName, value] of Object.entries(stats)) {
        const sources = Array.isArray(value.source) ? value.source : [];
        if (value.seedSamples > 0 || sources.includes('CARSCANNER_BASELINE')) continue;
        if (value.realSamples <= 0 || !sources.includes('REAL_OBD')) continue;
        clean[pidName] = {
          ...value,
          samples: value.realSamples,
          seedSamples: 0,
          source: ['REAL_OBD'],
          medianWindow: (value.medianWindow ?? []).slice(-MEDIAN_WINDOW_LIMIT),
        };
      }
      return clean;
    };

    profile.contextualData = profile.contextualData
      .map((context) => {
        const statistics = cleanStats(context.statistics);
        return { ...context, statistics, sampleCount: Object.values(statistics).reduce((sum, item) => sum + item.realSamples, 0) };
      })
      .filter((context) => Object.keys(context.statistics).length > 0);

    profile.overallStatistics = cleanStats(profile.overallStatistics);
    profile.globalSampleCounts.seedSamples = 0;
    profile.globalSampleCounts.totalSamples = profile.globalSampleCounts.realSamples;
    profile.seedVersion = 'NONE';
    profile.seedImportDate = '';
    profile.seedWeight = 0;
    profile.source = 'REAL_ONLY';
    profile.learningStatus = profile.globalSampleCounts.realSamples >= profile.confidenceThresholds.high
      ? 'CONFIDENT'
      : profile.globalSampleCounts.realSamples >= profile.confidenceThresholds.low
        ? 'LEARNING_ACTIVE'
        : 'COLD_START';
    profile.lastUpdated = new Date().toISOString();

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
