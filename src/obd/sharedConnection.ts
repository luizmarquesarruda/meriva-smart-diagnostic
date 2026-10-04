import type { Elm327Session } from './elm327';
import type { BluetoothDeviceInfo } from './bluetoothClassicTransport';
import { createRealElmSession, discoverPairedDevices } from './bluetoothManager';

export interface SharedObdConnection {
  session: Elm327Session;
  device: BluetoothDeviceInfo;
  protocol: string | null;
}

let active: SharedObdConnection | null = null;
const listeners = new Set<(connection: SharedObdConnection | null) => void>();

function emit(): void {
  for (const listener of listeners) listener(active);
}

export function getSharedObdConnection(): SharedObdConnection | null {
  return active;
}

export function subscribeSharedObd(listener: (connection: SharedObdConnection | null) => void): () => void {
  listeners.add(listener);
  listener(active);
  return () => listeners.delete(listener);
}

export async function connectPreferredElm(): Promise<SharedObdConnection> {
  if (active) return active;

  const devices = await discoverPairedDevices();
  if (!devices.length) {
    throw new Error('NENHUM ELM327 PAREADO. PAREIE O ADAPTADOR NO ANDROID PRIMEIRO.');
  }

  const preferred = devices.find((device) => /ELM|OBD|OBDII|OBD2|V-LINK|VLINK|CAR/i.test(device.name))
    ?? (devices.length === 1 ? devices[0] : null);

  if (!preferred) {
    throw new Error('MAIS DE UM BLUETOOTH PAREADO. SELECIONE O ELM327 NO LABORATÓRIO OBD.');
  }

  const connection = await createRealElmSession(preferred);
  active = {
    session: connection.session,
    device: preferred,
    protocol: connection.protocol,
  };
  emit();
  return active;
}

export async function setSharedObdConnection(connection: SharedObdConnection | null): Promise<void> {
  active = connection;
  emit();
}

export async function disconnectSharedObd(): Promise<void> {
  const connection = active;
  active = null;
  emit();
  if (connection) await connection.session.close();
}
