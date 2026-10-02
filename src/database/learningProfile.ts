import * as FileSystem from 'expo-file-system';
import type {
  ConfidenceLevel,
  SampleStatistics,
  VehicleCondition,
} from '../types/sourceTypes';

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
  await FileSystem.makeDirectoryAsync(`${basePath}/APRENDIZADO`, { intermediates: true });
  const target = `${basePath}/APRENDIZADO/dna_meriva.json`;
  await FileSystem.writeAsStringAsync(target, JSON.stringify(profile, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export async function readLearningProfile(
  basePath: string,
): Promise<MerivaLearningProfile | null> {
  const target = `${basePath}/APRENDIZADO/dna_meriva.json`;
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists || info.isDirectory) return null;

  try {
    const content = await FileSystem.readAsStringAsync(target);
    return JSON.parse(content) as MerivaLearningProfile;
  } catch {
    return null;
  }
}

export async function updateLearningProfileRealSample(
  basePath: string,
  pidName: string,
  value: number,
  condition: VehicleCondition,
): Promise<void> {
  const profile = await readLearningProfile(basePath);
  if (!profile || !Number.isFinite(value)) return;

  profile.lastUpdated = new Date().toISOString();
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
      lastUpdate: new Date().toISOString(),
      sampleCount: 0,
    };
    profile.contextualData.push(contextStats);
  }

  contextStats.sampleCount += 1;
  contextStats.lastUpdate = new Date().toISOString();

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
      lastUpdate: new Date().toISOString(),
      source: ['REAL_OBD'],
    };
  } else {
    const previousMean = existing.mean;
    const previousSamples = existing.samples;
    const previousM2 = existing.stddev * existing.stddev * Math.max(0, previousSamples - 1);
    existing.samples = previousSamples + 1;
    existing.realSamples += 1;
    existing.mean = previousMean + (value - previousMean) / existing.samples;
    const delta = value - previousMean;
    const m2 = previousM2 + delta * (value - existing.mean);
    existing.stddev = Math.sqrt(Math.max(0, m2 / Math.max(1, existing.samples - 1)));
    existing.min = Math.min(existing.min, value);
    existing.max = Math.max(existing.max, value);
    existing.confidence = determineConfidence(existing.samples, profile.confidenceThresholds);
    existing.lastUpdate = new Date().toISOString();
  }

  await saveLearningProfile(basePath, profile);
}

export async function blockSimulationLearning(basePath: string): Promise<void> {
  const profile = await readLearningProfile(basePath);
  if (!profile) return;

  profile.dataContamination.simulationDetected += 1;
  profile.dataContamination.simulationFiltered += 1;
  await saveLearningProfile(basePath, profile);
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
