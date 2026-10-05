import type { Elm327Session } from './elm327';
import type { BluetoothDeviceInfo } from './bluetoothClassicTransport';
import { createRealElmSession, discoverPairedDevices, ensureBluetoothReady } from './bluetoothManager';

export interface SharedObdConnection {
  session: Elm327Session;
  device: BluetoothDeviceInfo;
  protocol: string | null;
  supportedPids: string[];
}

let active: SharedObdConnection | null = null;
let connecting: Promise<SharedObdConnection> | null = null;
let lastConnectionError: string | null = null;

export const MERIVA_ELM327_ADDRESS = '01:23:45:67:89:BA';
const listeners = new Set<(connection: SharedObdConnection | null) => void>();

function emit(): void {
  for (const listener of listeners) listener(active);
}

function setConnectionError(cause: unknown): void {
  lastConnectionError = cause instanceof Error ? cause.message : String(cause ?? 'ERRO DESCONHECIDO');
}

export function getSharedObdLastError(): string | null {
  return lastConnectionError;
}

function looksLikeElm327(device: BluetoothDeviceInfo): boolean {
  return /ELM327|OBD\s*(?:II|2|Ⅱ)|V-LINK|VLINK|V-GATE|VLINKER|KONNWEI/i.test(device.name);
}

function sameAddress(a: string, b: string): boolean {
  return a.replace(/:/g, '').toUpperCase() === b.replace(/:/g, '').toUpperCase();
}

export function getSharedObdConnection(): SharedObdConnection | null {
  return active;
}

export function subscribeSharedObd(listener: (connection: SharedObdConnection | null) => void): () => void {
  listeners.add(listener);
  listener(active);
  return () => listeners.delete(listener);
}

async function connectCandidate(device: BluetoothDeviceInfo): Promise<SharedObdConnection> {
  const connection = await createRealElmSession(device);
  active = {
    session: connection.session,
    device,
    protocol: connection.protocol,
    supportedPids: connection.supportedPids,
  };
  lastConnectionError = null;
  emit();
  return active;
}

async function connectPreferredElmOnce(preferredAddress: string | null): Promise<SharedObdConnection> {
  // IMPORTANTE: o MAC configurado é tentado diretamente primeiro.
  // Não bloqueamos a conexão porque getBondedDevices() falhou, demorou
  // ou não devolveu o ELM corretamente no Android.
  await ensureBluetoothReady();

  if (preferredAddress) {
    const directDevice: BluetoothDeviceInfo = {
      address: preferredAddress.toUpperCase(),
      name: 'ELM327 (ENDEREÇO CONFIGURADO)',
      bonded: true,
    };

    try {
      return await connectCandidate(directDevice);
    } catch (cause) {
      setConnectionError(cause);
    }
  }

  let devices: BluetoothDeviceInfo[] = [];
  try {
    devices = await discoverPairedDevices();
  } catch (cause) {
    setConnectionError(cause);
  }

  const candidates: BluetoothDeviceInfo[] = [];
  const preferredDevice = preferredAddress
    ? devices.find((device) => sameAddress(device.address, preferredAddress))
    : undefined;

  if (preferredDevice && !candidates.some((item) => sameAddress(item.address, preferredDevice.address))) {
    candidates.push(preferredDevice);
  }

  for (const device of devices.filter(looksLikeElm327)) {
    if (!candidates.some((candidate) => sameAddress(candidate.address, device.address))) {
      candidates.push(device);
    }
  }

  let lastError: unknown = lastConnectionError;

  for (const device of candidates) {
    try {
      return await connectCandidate(device);
    } catch (cause) {
      lastError = cause;
      setConnectionError(cause);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'NENHUM DISPOSITIVO RESPONDEU');
  throw new Error('ELM327 NÃO CONECTOU. ÚLTIMO ERRO: ' + detail);
}

export async function connectPreferredElm(
  preferredAddress: string | null = MERIVA_ELM327_ADDRESS,
): Promise<SharedObdConnection> {
  if (active) return active;
  if (connecting) return connecting;

  connecting = (async () => {
    let lastError: unknown = null;

    // Continua tentando enquanto o aplicativo estiver aberto e não houver
    // conexão válida. Isso cobre ligar o ELM depois de abrir o app.
    while (!active) {
      try {
        return await connectPreferredElmOnce(preferredAddress);
      } catch (cause) {
        lastError = cause;
        setConnectionError(cause);
        await new Promise((resolve) => setTimeout(resolve, 2500));
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
  if (connection) lastConnectionError = null;
  emit();
}

export async function disconnectSharedObd(): Promise<void> {
  connecting = null;
  const connection = active;
  active = null;
  emit();
  if (connection) await connection.session.close();
}
