import * as FileSystem from 'expo-file-system';

export interface RpmProfile {
  iddle: { min: number; max: number; avg: number };
  acceleration: { min: number; max: number; avg: number };
  cruise: { min: number; max: number; avg: number };
  deceleration: { min: number; max: number; avg: number };
  samples: number;
  realSamples: number;
  seedSamples: number;
}

export interface TemperatureProfile {
  coldStart: { min: number; max: number; avg: number };
  warming: { min: number; max: number; avg: number };
  normal: { min: number; max: number; avg: number };
  samples: number;
  realSamples: number;
  seedSamples: number;
}

export interface MerivaLearningProfileLegacy {
  rpm: RpmProfile | null;
  temperature: TemperatureProfile | null;
  lastUpdated: string;
  totalSamples: number;
  realSamples: number;
  seedSamples: number;
}

export async function saveLearningProfileLegacy(basePath: string, profile: MerivaLearningProfileLegacy): Promise<void> {
  const target = `${basePath}/APRENDIZADO/dna_meriva_legacy.json`;
  await FileSystem.makeDirectoryAsync(`${basePath}/APRENDIZADO`, { intermediates: true });
  await FileSystem.writeAsStringAsync(target, JSON.stringify(profile, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
}

export async function readLearningProfileLegacy(basePath: string): Promise<MerivaLearningProfileLegacy | null> {
  const target = `${basePath}/APRENDIZADO/dna_meriva_legacy.json`;
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) return null;
  const content = await FileSystem.readAsStringAsync(target);
  return JSON.parse(content);
}
