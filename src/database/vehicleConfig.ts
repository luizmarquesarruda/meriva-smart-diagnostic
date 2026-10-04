import * as FileSystem from 'expo-file-system';
import { MERIVA_BIBLE_SOURCE, MERIVA_TECHNICAL_PROFILE } from './merivaBible';

export interface VehicleProfile {
  vehicleName: string;
  year: number;
  make: string;
  model: string;
  engine: string;
  vin?: string;
  createdAt: string;
  lastModified: string;
  protocolBaseline: string;
  ecuAddress?: string;
  technicalSource?: string;
  engineFamily?: string;
  fuelType?: string;
  applicationCode?: string;
  ecuReferences?: string[];
}

export async function createVehicleProfile(basePath: string, profile: VehicleProfile): Promise<void> {
  await FileSystem.makeDirectoryAsync(`${basePath}/CONFIG`, { intermediates: true });
  const target = `${basePath}/CONFIG/veiculo.json`;
  await FileSystem.writeAsStringAsync(target, JSON.stringify(profile, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
}

export async function readVehicleProfile(basePath: string): Promise<VehicleProfile | null> {
  const target = `${basePath}/CONFIG/veiculo.json`;
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists || info.isDirectory) return null;
  try {
    const content = await FileSystem.readAsStringAsync(target);
    const parsed = JSON.parse(content) as Partial<VehicleProfile>;
    if (
      typeof parsed.vehicleName !== 'string' ||
      typeof parsed.year !== 'number' ||
      typeof parsed.make !== 'string' ||
      typeof parsed.model !== 'string' ||
      typeof parsed.engine !== 'string' ||
      typeof parsed.createdAt !== 'string' ||
      typeof parsed.lastModified !== 'string' ||
      typeof parsed.protocolBaseline !== 'string'
    ) {
      return null;
    }
    return parsed as VehicleProfile;
  } catch {
    return null;
  }
}

export async function ensureMerivaBibleProfile(basePath: string): Promise<VehicleProfile> {
  const existing = await readVehicleProfile(basePath);
  if (existing) return existing;

  const now = new Date().toISOString();
  const profile: VehicleProfile = {
    vehicleName: 'Meriva Maxx',
    year: 2012,
    make: MERIVA_TECHNICAL_PROFILE.make,
    model: MERIVA_TECHNICAL_PROFILE.model,
    engine: MERIVA_TECHNICAL_PROFILE.engine,
    createdAt: now,
    lastModified: now,
    protocolBaseline: 'NÃO CONFIRMADO',
    technicalSource: MERIVA_BIBLE_SOURCE.name,
    engineFamily: MERIVA_TECHNICAL_PROFILE.engine,
    fuelType: MERIVA_TECHNICAL_PROFILE.fuel,
    applicationCode: MERIVA_TECHNICAL_PROFILE.application,
    ecuReferences: [...MERIVA_TECHNICAL_PROFILE.ecuReferences],
  };

  await createVehicleProfile(basePath, profile);
  return profile;
}
