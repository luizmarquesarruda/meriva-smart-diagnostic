import type { Elm327Session } from './elm327';
import type { BluetoothDeviceInfo } from './bluetoothClassicTransport';
import { createRealElmSession, discoverPairedDevices, ensureBluetoothReady } from './bluetoothManager';
import { DEFAULT_ELM327_COMPATIBILITY, Elm327CompatibilityConfig, mergeCompatibilityConfig } from './elm327Compatibility';

export interface SharedObdConnection {
  session: Elm327Session;
  device: BluetoothDeviceInfo;
  protocol: string | null;
  supportedPids: string[];
  getDiagnosticsText: () => string;
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

async function connectCandidate(device: BluetoothDeviceInfo, compatibility: Elm327CompatibilityConfig): Promise<SharedObdConnection> {
  const connection = await createRealElmSession(device, compatibility);
  active = {
    session: connection.session,
    device,
    protocol: connection.protocol,
    supportedPids: connection.supportedPids,
    getDiagnosticsText: () => connection.session.getTransportDiagnosticsText(),
  };
  lastConnectionError = null;
  emit();
  return active;
}

async function connectPreferredElmOnce(
  preferredAddress: string | null,
  compatibility: Elm327CompatibilityConfig,
): Promise<SharedObdConnection> {
  // Primeiro usamos o inventário de dispositivos PAREADOS pelo Android.
  // Não tentamos um MAC arbitrário antes disso.
  await ensureBluetoothReady();

  let devices: BluetoothDeviceInfo[] = [];
  try {
    devices = await discoverPairedDevices();
  } catch (cause) {
    setConnectionError(cause);
  }

  const candidates: BluetoothDeviceInfo[] = [];
  const addCandidate = (device: BluetoothDeviceInfo) => {
    if (!candidates.some((item) => sameAddress(item.address, device.address))) {
      candidates.push(device);
    }
  };

  // 1) endereço previamente selecionado, se realmente estiver pareado;
  // 2) nomes típicos de ELM/OBD;
  // 3) qualquer outro Bluetooth Classic pareado.
  // O teste ATI + 010C decide qual dispositivo é o ELM327.
  if (preferredAddress) {
    const preferredDevice = devices.find((device) => sameAddress(device.address, preferredAddress));
    if (preferredDevice) addCandidate(preferredDevice);
  }
  for (const device of devices.filter(looksLikeElm327)) addCandidate(device);
  for (const device of devices) addCandidate(device);

  let lastError: unknown = lastConnectionError;

  for (const device of candidates) {
    try {
      return await connectCandidate(device, compatibility);
    } catch (cause) {
      lastError = cause;
      setConnectionError(cause);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'NENHUM DISPOSITIVO RESPONDEU');
  throw new Error('ELM327 NÃO CONECTOU. ÚLTIMO ERRO: ' + detail);
}

export async function connectPreferredElm(
  preferredAddress: string | null = null,
  compatibility?: Partial<Elm327CompatibilityConfig>,
): Promise<SharedObdConnection> {
  if (active) return active;
  if (connecting) return connecting;

  const config = mergeCompatibilityConfig(compatibility ?? DEFAULT_ELM327_COMPATIBILITY);

  connecting = (async () => {
    let lastError: unknown = null;
    let attempts = 0;

    while (!active) {
      attempts += 1;
      try {
        return await connectPreferredElmOnce(preferredAddress, config);
      } catch (cause) {
        lastError = cause;
        setConnectionError(cause);
        if (config.maxConnectionAttempts > 0 && attempts >= config.maxConnectionAttempts) {
          throw cause;
        }
        // Reconexão agressiva: clones ELM327 costumam liberar o RFCOMM
        // somente depois de uma pequena janela após uma tentativa falha.
        await new Promise((resolve) => setTimeout(resolve, 1000));
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
