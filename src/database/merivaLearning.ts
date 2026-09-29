import { LearningEngine } from '../learning/learner';
import { ProfileSample } from '../learning/dnaMeriva';
import * as FileSystem from 'expo-file-system';

export interface RpmProfile {
  piddle: { min: number; max: number; avg: number };
  acceleration: { min: number; max: number; avg: number };
  cruise: { min: number; max: number; avg: number };
  deceleration: { min: number; max: number; avg: number };
  samples: number;
}

export interface TemperatureProfile {
  coldStart: { min: number; max: number; avg: number };
  warming: { min: number; max: number; avg: number };
  normal: { min: number; max: number; avg: number };
  samples: number;
}

export interface MerivaLearningProfile {
  rpm: RpmProfile | null;
  temperature: TemperatureProfile | null;
  lastUpdated: string;
  totalSamples: number;
}

export async function saveLearningProfile(basePath: string, profile: MerivaLearningProfile): Promise<void> {
  const target = `${basePath}/APRENDIZADO/dna_meriva.json`;
  await FileSystem.writeAsStringAsync(target, JSON.stringify(profile, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
}

export async function readLearningProfile(basePath: string): Promise<MerivaLearningProfile | null> {
  const target = `${basePath}/APRENDIZADO/dna_meriva.json`;
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) return null;
  const content = await FileSystem.readAsStringAsync(target);
  return JSON.parse(content);
}
