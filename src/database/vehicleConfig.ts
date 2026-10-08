import * as FileSystem from 'expo-file-system';
import { MERIVA_MANUAL } from './merivaManual';
import { emitAppEvent } from '../state/appEventBus';

export interface VehicleProfile {
  vehicleName: string;
  year: number;
  make: string;
  model: string;
  engine: string;
  displacementCm3: number;
  cylinders: number;
  fuel: string;
  modelYearReference: string;
  tankCapacityL: number;
  reserveCapacityL: number;
  manualSource: string;
  vin?: string;
  createdAt: string;
  lastModified: string;
  protocolBaseline: string;
  ecuAddress?: string;
}

export async function createVehicleProfile(basePath: string, profile: VehicleProfile): Promise<void> {
  await FileSystem.makeDirectoryAsync(`${basePath}/CONFIG`, { intermediates: true });
  const target = `${basePath}/CONFIG/veiculo.json`;
  await FileSystem.writeAsStringAsync(target, JSON.stringify(profile, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
  emitAppEvent('VEHICLE_UPDATED');
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

export async function ensureMerivaVehicleProfile(basePath: string): Promise<VehicleProfile> {
  const existing = await readVehicleProfile(basePath);
  const now = new Date().toISOString();

  if (existing) {
    const normalized: VehicleProfile = {
      ...existing,
      vehicleName: 'Meriva Maxx',
      year: MERIVA_MANUAL.modelYear,
      make: 'Chevrolet',
      model: 'Meriva Maxx',
      engine: MERIVA_MANUAL.engine.designation,
      displacementCm3: MERIVA_MANUAL.engine.displacementCm3,
      cylinders: MERIVA_MANUAL.engine.cylinders,
      fuel: 'Gasolina / Álcool',
      modelYearReference: MERIVA_MANUAL.modelYearReference,
      tankCapacityL: MERIVA_MANUAL.capacities.fuelTankL,
      reserveCapacityL: MERIVA_MANUAL.capacities.fuelReserveApproxL,
      manualSource: MERIVA_MANUAL.source,
      protocolBaseline: 'ISO 14230-4 KWP FAST INIT / K-LINE (OBSERVADO)',
      ecuAddress: '0x11',
      lastModified: now,
    };
    if (JSON.stringify(normalized) !== JSON.stringify(existing)) await createVehicleProfile(basePath, normalized);
    return normalized;
  }

  const profile: VehicleProfile = {
    vehicleName: 'Meriva Maxx',
    year: 2012,
    make: 'Chevrolet',
    model: 'Meriva Maxx',
    engine: MERIVA_MANUAL.engine.designation,
    displacementCm3: MERIVA_MANUAL.engine.displacementCm3,
    cylinders: MERIVA_MANUAL.engine.cylinders,
    fuel: 'Gasolina / Álcool',
    modelYearReference: MERIVA_MANUAL.modelYearReference,
    tankCapacityL: MERIVA_MANUAL.capacities.fuelTankL,
    reserveCapacityL: MERIVA_MANUAL.capacities.fuelReserveApproxL,
    manualSource: MERIVA_MANUAL.source,
    createdAt: now,
    lastModified: now,
    protocolBaseline: 'ISO 14230-4 KWP FAST INIT / K-LINE (OBSERVADO)',
    ecuAddress: '0x11',
  };

  await createVehicleProfile(basePath, profile);
  return profile;
}
