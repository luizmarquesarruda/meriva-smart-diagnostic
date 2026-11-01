import * as FileSystem from 'expo-file-system';
import { MERIVA_MANUAL } from './merivaManual';
import { readJsonWithRecovery, writeJsonAtomically } from '../storage/atomicJsonFile';
import { recordStorageHealthIssue } from '../storage/storageHealth';

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


const VEHICLE_PROFILE_SCHEMA_VERSION = 1;
type StoredVehicleProfile = VehicleProfile & { schemaVersion?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isVehicleProfile(value: unknown): value is StoredVehicleProfile {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== undefined &&
      (!Number.isInteger(value.schemaVersion) || (value.schemaVersion as number) < 0)) return false;
  return typeof value.vehicleName === 'string' &&
    typeof value.year === 'number' && Number.isFinite(value.year) &&
    typeof value.make === 'string' &&
    typeof value.model === 'string' &&
    typeof value.engine === 'string' &&
    typeof value.displacementCm3 === 'number' && Number.isFinite(value.displacementCm3) &&
    typeof value.cylinders === 'number' && Number.isFinite(value.cylinders) &&
    typeof value.fuel === 'string' &&
    typeof value.modelYearReference === 'string' &&
    typeof value.tankCapacityL === 'number' && Number.isFinite(value.tankCapacityL) &&
    typeof value.reserveCapacityL === 'number' && Number.isFinite(value.reserveCapacityL) &&
    typeof value.manualSource === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.lastModified === 'string' &&
    typeof value.protocolBaseline === 'string';
}

function hasFutureVehicleProfileSchema(value: unknown): boolean {
  return isRecord(value) && typeof value.schemaVersion === 'number'
    && value.schemaVersion > VEHICLE_PROFILE_SCHEMA_VERSION;
}

export async function createVehicleProfile(basePath: string, profile: VehicleProfile): Promise<void> {
  await FileSystem.makeDirectoryAsync(`${basePath}/CONFIG`, { intermediates: true });
  const target = `${basePath}/CONFIG/veiculo.json`;
  await writeJsonAtomically(
    target,
    { ...profile, schemaVersion: VEHICLE_PROFILE_SCHEMA_VERSION },
    isVehicleProfile,
    hasFutureVehicleProfileSchema,
  );
}

export async function readVehicleProfile(basePath: string): Promise<VehicleProfile | null> {
  const target = `${basePath}/CONFIG/veiculo.json`;
  try {
    const result = await readJsonWithRecovery(target, isVehicleProfile, hasFutureVehicleProfileSchema);
    if (result.recoveredFromPrevious) {
      recordStorageHealthIssue(
        'JSON_RECOVERED',
        'Perfil do veículo recuperado da cópia anterior',
        'O arquivo principal está inválido. A cópia validada foi usada somente para leitura; a gravação permanece bloqueada.',
        'critical',
        'CONFIG/veiculo.json',
      );
    }
    return result.value as VehicleProfile | null;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const future = detail.includes('SCHEMA_VERSION_NEWER_THAN_APP');
    recordStorageHealthIssue(
      future ? 'FUTURE_SCHEMA' : 'JSON_CORRUPTED',
      future ? 'Schema futuro do perfil do veículo' : 'Perfil do veículo JSON inválido',
      detail + ' O arquivo original foi preservado; nenhum perfil padrão será gravado sobre ele.',
      'critical',
      'CONFIG/veiculo.json',
    );
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
