import type { Elm327Session } from './elm327';
import type { BluetoothDeviceInfo } from './bluetoothClassicTransport';
import { createRealElmSession, discoverPairedDevices } from './bluetoothManager';

export interface SharedObdConnection {
  session: Elm327Session;
  device: BluetoothDeviceInfo;
  protocol: string | null;
  supportedPids: string[];
}

let active: SharedObdConnection | null = null;
let connecting: Promise<SharedObdConnection> | null = null;

export const MERIVA_ELM327_ADDRESS = '01:23:45:67:89:BA';
const listeners = new Set<(connection: SharedObdConnection | null) => void>();

function emit(): void {
  for (const listener of listeners) listener(active);
}

function looksLikeElm327(device: BluetoothDeviceInfo): boolean {
  return /ELM327|OBD\s*(?:II|2|Ⅱ)|V-LINK|VLINK|V-GATE|VLINKER|KONNWEI/i.test(device.name);
}

export function getSharedObdConnection(): SharedObdConnection | null {
  return active;
}

export function subscribeSharedObd(listener: (connection: SharedObdConnection | null) => void): () => void {
  listeners.add(listener);
  listener(active);
  return () => listeners.delete(listener);
}

async function connectPreferredElmOnce(preferredAddress: string | null): Promise<SharedObdConnection> {
  const devices = await discoverPairedDevices();
  const preferredKnown = preferredAddress
    ? devices.find((device) => device.address.toUpperCase() === preferredAddress.toUpperCase())
    : undefined;

  if (!devices.length && preferredAddress) {
    const directDevice: BluetoothDeviceInfo = {
      address: preferredAddress.toUpperCase(),
      name: 'ELM327 (ENDEREÇO CONFIGURADO)',
      bonded: true,
    };
    const connection = await createRealElmSession(directDevice);
    active = { session: connection.session, device: directDevice, protocol: connection.protocol, supportedPids: connection.supportedPids };
    emit();
    return active;
  }

  if (!devices.length) throw new Error('NENHUM ELM327 PAREADO');

  const namedCandidates = devices.filter(looksLikeElm327);
  const candidates = preferredKnown
    ? [preferredKnown, ...namedCandidates.filter((device) => device.address !== preferredKnown.address)]
    : namedCandidates;

  if (!candidates.length) throw new Error('ELM327 NÃO ENCONTRADO ENTRE OS PAREADOS');

  let lastError: unknown = null;
  for (const device of candidates) {
    try {
      const connection = await createRealElmSession(device);
      active = { session: connection.session, device, protocol: connection.protocol, supportedPids: connection.supportedPids };
      emit();
      return active;
    } catch (cause) {
      lastError = cause;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? '');
  throw new Error('ELM327 NÃO CONECTOU. ENDEREÇO TESTADO: ' + MERIVA_ELM327_ADDRESS + (detail ? '. ' + detail : ''));
}

export async function connectPreferredElm(
  preferredAddress: string | null = MERIVA_ELM327_ADDRESS,
): Promise<SharedObdConnection> {
  if (active) return active;
  if (connecting) return connecting;

  connecting = (async () => {
    let lastError: unknown = null;
    while (!active) {
      try {
        return await connectPreferredElmOnce(preferredAddress);
      } catch (cause) {
        lastError = cause;
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }
    throw lastError instanceof Error ? lastError : new Error('ELM327 NÃO CONECTADO');
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

export async function setSharedObdConnection(connection: SharedObdConnection | null): Promise<void> {
  active = connection;
  emit();
}

export async function disconnectSharedObd(): Promise<void> {
  connecting = null;
  const connection = active;
  active = null;
  emit();
  if (connection) await connection.session.close();
}
