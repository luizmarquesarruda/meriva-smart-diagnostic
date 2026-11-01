import * as FileSystem from 'expo-file-system';
import { MERIVA_MANUAL } from './merivaManual';
import { readJsonWithRecovery, writeJsonAtomically } from '../storage/atomicJsonFile';

export interface VehicleProfile {
  schemaVersion?: number;
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

const VEHICLE_SCHEMA_VERSION = 1;
let vehicleProfileStorageWarning: string | null = null;

export function getVehicleProfileStorageWarning(): string | null { return vehicleProfileStorageWarning; }

function isVehicleProfile(value: unknown): value is VehicleProfile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== VEHICLE_SCHEMA_VERSION) return false;
  return typeof raw.vehicleName === 'string' && typeof raw.year === 'number' && Number.isFinite(raw.year) &&
    typeof raw.make === 'string' && typeof raw.model === 'string' && typeof raw.engine === 'string' &&
    typeof raw.createdAt === 'string' && Number.isFinite(Date.parse(raw.createdAt)) &&
    typeof raw.lastModified === 'string' && Number.isFinite(Date.parse(raw.lastModified)) &&
    typeof raw.protocolBaseline === 'string';
}

function isFutureVehicleProfile(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  return typeof version === 'number' && Number.isInteger(version) && version > VEHICLE_SCHEMA_VERSION;
}

export async function createVehicleProfile(basePath: string, profile: VehicleProfile): Promise<void> {
  await FileSystem.makeDirectoryAsync(`${basePath}/CONFIG`, { intermediates: true });
  const target = `${basePath}/CONFIG/veiculo.json`;
  await writeJsonAtomically(target, { ...profile, schemaVersion: VEHICLE_SCHEMA_VERSION }, isVehicleProfile, isFutureVehicleProfile);
  vehicleProfileStorageWarning = null;
}

export async function readVehicleProfile(basePath: string): Promise<VehicleProfile | null> {
  const target = `${basePath}/CONFIG/veiculo.json`;
  const result = await readJsonWithRecovery(target, isVehicleProfile, isFutureVehicleProfile);
  vehicleProfileStorageWarning = result.recoveredFromPrevious ? 'PERFIL RECUPERADO DA CÓPIA ANTERIOR; O ARQUIVO PRINCIPAL FOI PRESERVADO.' : null;
  return result.value ?? null;
}

function createDefaultVehicleProfile(now: string): VehicleProfile {
  return {
    schemaVersion: VEHICLE_SCHEMA_VERSION, vehicleName: 'Meriva Maxx', year: 2012,
    make: 'Chevrolet', model: 'Meriva Maxx', engine: MERIVA_MANUAL.engine.designation,
    displacementCm3: MERIVA_MANUAL.engine.displacementCm3, cylinders: MERIVA_MANUAL.engine.cylinders,
    fuel: 'Gasolina / Álcool', modelYearReference: MERIVA_MANUAL.modelYearReference,
    tankCapacityL: MERIVA_MANUAL.capacities.fuelTankL,
    reserveCapacityL: MERIVA_MANUAL.capacities.fuelReserveApproxL, manualSource: MERIVA_MANUAL.source,
    createdAt: now, lastModified: now,
    protocolBaseline: 'ISO 14230-4 KWP FAST INIT / K-LINE (OBSERVADO)', ecuAddress: '0x11',
  };
}

export async function ensureMerivaVehicleProfile(basePath: string): Promise<VehicleProfile> {
  const now = new Date().toISOString();
  let existing: VehicleProfile | null;
  try {
    existing = await readVehicleProfile(basePath);
  } catch (cause) {
    vehicleProfileStorageWarning = 'PERFIL DO VEÍCULO NÃO GRAVÁVEL: '
      + (cause instanceof Error ? cause.message : String(cause))
      + '. PERFIL PADRÃO USADO SOMENTE EM MEMÓRIA; ARQUIVO ORIGINAL PRESERVADO.';
    console.warn('[vehicle] ', vehicleProfileStorageWarning);
    return createDefaultVehicleProfile(now);
  }
  if (existing) {
    const normalized: VehicleProfile = {
      ...existing, schemaVersion: VEHICLE_SCHEMA_VERSION,
      vehicleName: 'Meriva Maxx', year: MERIVA_MANUAL.modelYear, make: 'Chevrolet', model: 'Meriva Maxx',
      engine: MERIVA_MANUAL.engine.designation, displacementCm3: MERIVA_MANUAL.engine.displacementCm3,
      cylinders: MERIVA_MANUAL.engine.cylinders, fuel: 'Gasolina / Álcool',
      modelYearReference: MERIVA_MANUAL.modelYearReference, tankCapacityL: MERIVA_MANUAL.capacities.fuelTankL,
      reserveCapacityL: MERIVA_MANUAL.capacities.fuelReserveApproxL, manualSource: MERIVA_MANUAL.source,
      protocolBaseline: 'ISO 14230-4 KWP FAST INIT / K-LINE (OBSERVADO)', ecuAddress: '0x11', lastModified: now,
    };
    if (JSON.stringify(normalized) !== JSON.stringify(existing)) await createVehicleProfile(basePath, normalized);
    return normalized;
  }
  const profile = createDefaultVehicleProfile(now);
  await createVehicleProfile(basePath, profile);
  return profile;
}
