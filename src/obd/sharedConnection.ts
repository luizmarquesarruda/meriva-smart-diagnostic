import type { Elm327Session } from './elm327';
import type { BluetoothDeviceInfo } from './bluetoothClassicTransport';
import { createRealElmSession, discoverPairedDevices, ensureBluetoothReady } from './bluetoothManager';
import { DEFAULT_ELM327_COMPATIBILITY, Elm327CompatibilityConfig, mergeCompatibilityConfig } from './elm327Compatibility';
import { getAutoSaveState } from '../meriva/autosaveManager';
import { readAppSettings } from '../database/appSettings';
import * as FileSystem from 'expo-file-system';
import { prioritizeBluetoothCandidates } from './bluetoothCandidatePriority';

export interface SharedObdConnection {
  session: Elm327Session;
  device: BluetoothDeviceInfo;
  protocol: string | null;
  supportedPids: string[];
  ecuValidated: boolean;
  getDiagnosticsText: () => string;
}

let active: SharedObdConnection | null = null;
let connecting: Promise<SharedObdConnection> | null = null;
let lastConnectionError: string | null = null;

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
  const connection = await createRealElmSession(device, compatibility, getAutoSaveState().pidDiscovery);
  if (!connection.ecuValidated) {
    try { await connection.session.close(); } catch { /* preserva o estado inválido */ }
    throw new Error('ECU NÃO VALIDADA. OBLIGATÓRIO RECEBER 41 0C PARA MARCAR OBD COMO CONECTADO.');
  }
  const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
  const settings = await readAppSettings(basePath);
  await import('../database/appSettings').then(({ writeAppSettings }) =>
    writeAppSettings(basePath, {
      ...settings,
      selectedAdapterAddress: device.address,
    }),
  );

  active = {
    session: connection.session,
    device,
    protocol: connection.protocol,
    supportedPids: connection.supportedPids,
    ecuValidated: connection.ecuValidated,
    getDiagnosticsText: () => connection.session.getTransportDiagnosticsText(),
  };
  lastConnectionError = null;
  emit();
  return active;
}

async function connectPreferredElmOnce(
  compatibility: Elm327CompatibilityConfig,
): Promise<SharedObdConnection> {
  await ensureBluetoothReady();

  const devices = await discoverPairedDevices();
  const candidates: BluetoothDeviceInfo[] = [];
  const addCandidate = (device: BluetoothDeviceInfo) => {
    if (!candidates.some((item) => sameAddress(item.address, device.address))) candidates.push(device);
  };

  // O aplicativo escolhe. O último ELM327 que conseguiu uma conexão real
  // entra primeiro na fila. Depois vêm outros adaptadores OBD/ELM e, por fim,
  // os demais dispositivos Classic pareados.
  const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
  const settings = await readAppSettings(basePath);
  const prioritized = prioritizeBluetoothCandidates(
    devices,
    settings.selectedAdapterAddress,
    looksLikeElm327,
  );
  for (const device of prioritized) addCandidate(device);

  let lastError: unknown = null;
  for (const device of candidates) {
    try {
      return await connectCandidate(device, compatibility);
    } catch (cause) {
      lastError = cause;
      setConnectionError(cause);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'NENHUM DISPOSITIVO PAREADO RESPONDEU');
  throw new Error('ELM327 NÃO CONECTOU. DISPOSITIVOS TESTADOS: ' + candidates.length + '. ÚLTIMO ERRO: ' + detail);
}

export async function connectPreferredElm(
  _ignoredPreferredAddress: string | null = null,
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
        return await connectPreferredElmOnce(config);
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
