import * as FileSystem from 'expo-file-system';
import { DataSource, ConfidenceLevel, VehicleCondition, SampleStatistics } from '../types/sourceTypes';

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

export async function createLearningProfile(basePath: string, seedImportDate: string): Promise<MerivaLearningProfile> {
  const profile: MerivaLearningProfile = {
    vehicleId: 'MERIVA_MAXX_2011',
    profileCreated: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
    seedVersion: '1.0',
    seedImportDate,
    learningStatus: 'SEED_INITIALIZED',
    confidenceThresholds: {
      low: 10,
      medium: 50,
      good: 200,
      high: 500,
    },
    contextualData: [],
    overallStatistics: {},
    globalSampleCounts: {
      seedSamples: 1,
      realSamples: 0,
      totalSamples: 1,
    },
    source: 'HYBRID',
    seedWeight: 1,
    dataContamination: {
      simulationDetected: 0,
      simulationFiltered: 0,
    },
  };

  await saveLearningProfile(basePath, profile);
  return profile;
}

export async function saveLearningProfile(basePath: string, profile: MerivaLearningProfile): Promise<void> {
  await FileSystem.makeDirectoryAsync(`${basePath}/APRENDIZADO`, { intermediates: true });
  const target = `${basePath}/APRENDIZADO/dna_meriva.json`;
  await FileSystem.writeAsStringAsync(target, JSON.stringify(profile, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
}

export async function readLearningProfile(basePath: string): Promise<MerivaLearningProfile | null> {
  const target = `${basePath}/APRENDIZADO/dna_meriva.json`;
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) return null;
  const content = await FileSystem.readAsStringAsync(target);
  return JSON.parse(content) as MerivaLearningProfile;
}

export async function updateLearningProfileRealSample(
  basePath: string,
  pidName: string,
  value: number,
  condition: VehicleCondition
): Promise<void> {
  const profile = await readLearningProfile(basePath);
  if (!profile) return;

  profile.lastUpdated = new Date().toISOString();
  profile.globalSampleCounts.realSamples++;
  profile.globalSampleCounts.totalSamples++;

  if (profile.globalSampleCounts.realSamples >= 100) {
    profile.learningStatus = 'LEARNING_ACTIVE';
  }
  if (profile.globalSampleCounts.realSamples >= 1000) {
    profile.learningStatus = 'CONFIDENT';
  }

  let contextStats = profile.contextualData.find((c) => c.condition === condition);
  if (!contextStats) {
    contextStats = {
      condition,
      statistics: {},
      lastUpdate: new Date().toISOString(),
      sampleCount: 0,
    };
    profile.contextualData.push(contextStats);
  }

  contextStats.sampleCount++;
  contextStats.lastUpdate = new Date().toISOString();

  if (!contextStats.statistics[pidName]) {
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
    const stat = contextStats.statistics[pidName];
    const prevMean = stat.mean;
    const prevM2 = stat.stddev * stat.stddev * (stat.samples - 1);
    stat.samples++;
    stat.realSamples++;
    stat.mean = (prevMean * (stat.samples - 1) + value) / stat.samples;
    const delta = value - prevMean;
    const m2 = prevM2 + delta * (value - stat.mean);
    stat.stddev = Math.sqrt(m2 / (stat.samples - 1));
    stat.min = Math.min(stat.min, value);
    stat.max = Math.max(stat.max, value);
    stat.confidence = determineConfidence(stat.samples, profile.confidenceThresholds);
    stat.lastUpdate = new Date().toISOString();
  }

  await saveLearningProfile(basePath, profile);
}

export async function blockSimulationLearning(basePath: string): Promise<void> {
  const profile = await readLearningProfile(basePath);
  if (!profile) return;
  profile.dataContamination.simulationDetected++;
  profile.dataContamination.simulationFiltered++;
  await saveLearningProfile(basePath, profile);
}

function determineConfidence(samples: number, thresholds: Record<string, number>): ConfidenceLevel {
  if (samples < thresholds.low) return 'LOW';
  if (samples < thresholds.medium) return 'LOW';
  if (samples < thresholds.good) return 'MEDIUM';
  if (samples < thresholds.high) return 'GOOD';
  return 'HIGH';
}
