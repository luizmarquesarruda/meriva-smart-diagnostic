import * as FileSystem from 'expo-file-system';

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
}

export async function createVehicleProfile(basePath: string, profile: VehicleProfile): Promise<void> {
  const target = `${basePath}/CONFIG/veiculo.json`;
  await FileSystem.writeAsStringAsync(target, JSON.stringify(profile, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
}

export async function readVehicleProfile(basePath: string): Promise<VehicleProfile | null> {
  const target = `${basePath}/CONFIG/veiculo.json`;
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) return null;
  const content = await FileSystem.readAsStringAsync(target);
  return JSON.parse(content);
}
