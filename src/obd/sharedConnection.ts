import type { Elm327Session } from './elm327';
import type { BluetoothDeviceInfo } from './bluetoothClassicTransport';
import { createRealElmSession, discoverPairedDevices, ensureBluetoothReady } from './bluetoothManager';
import { DEFAULT_ELM327_COMPATIBILITY, Elm327CompatibilityConfig, mergeCompatibilityConfig } from './elm327Compatibility';
import { getAutoSaveState } from '../meriva/autosaveManager';
import { clearBluetoothDiagnostic, getLastBluetoothDiagnosticText } from './bluetoothManager';

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
let lastDiscoveryDevices: BluetoothDeviceInfo[] = [];

const listeners = new Set<(connection: SharedObdConnection | null) => void>();
const statusListeners = new Set<(status: { bluetoothConnected: boolean; ecuConnected: boolean }) => void>();
let bluetoothConnected = false;

function emit(): void {
  for (const listener of listeners) listener(active);
  const status = { bluetoothConnected, ecuConnected: Boolean(active?.ecuValidated) };
  for (const listener of statusListeners) listener(status);
}

function setConnectionError(cause: unknown): void {
  lastConnectionError = cause instanceof Error ? cause.message : String(cause ?? 'ERRO DESCONHECIDO');
}

export function getSharedObdLastError(): string | null {
  return lastConnectionError;
}

export function getSharedObdDiagnosticContext(): { devices: BluetoothDeviceInfo[]; trace: string } {
  return { devices: [...lastDiscoveryDevices], trace: getLastBluetoothDiagnosticText() };
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

export function getSharedObdStatus(): { bluetoothConnected: boolean; ecuConnected: boolean } {
  return { bluetoothConnected, ecuConnected: Boolean(active?.ecuValidated) };
}

export function subscribeSharedObdStatus(listener: (status: { bluetoothConnected: boolean; ecuConnected: boolean }) => void): () => void {
  statusListeners.add(listener);
  listener(getSharedObdStatus());
  return () => statusListeners.delete(listener);
}

async function connectCandidate(device: BluetoothDeviceInfo, compatibility: Elm327CompatibilityConfig): Promise<SharedObdConnection> {
  bluetoothConnected = false;
  emit();
  const connection = await createRealElmSession(device, compatibility, getAutoSaveState().pidDiscovery, () => {
    bluetoothConnected = true;
    emit();
  });
  if (!connection.ecuValidated) {
    try { await connection.session.close(); } catch { /* preserva o estado inválido */ }
    throw new Error('ECU NÃO VALIDADA. OBLIGATÓRIO RECEBER 41 0C PARA MARCAR OBD COMO CONECTADO.');
  }
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
  clearBluetoothDiagnostic();
  lastDiscoveryDevices = [];
  await ensureBluetoothReady();

  const devices = await discoverPairedDevices();
  lastDiscoveryDevices = devices;
  const candidates: BluetoothDeviceInfo[] = [];
  const addCandidate = (device: BluetoothDeviceInfo) => {
    if (!candidates.some((item) => sameAddress(item.address, device.address))) candidates.push(device);
  };

  // O aplicativo escolhe. Primeiro tenta nomes que indicam adaptador OBD/ELM;
  // depois testa qualquer dispositivo Classic pareado. O candidato só é aceito
  // após passar pela inicialização ELM e pelo teste real da ECU.
  for (const device of devices.filter(looksLikeElm327)) addCandidate(device);
  for (const device of devices) addCandidate(device);

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
    // O fluxo de tentativa já é controlado por bluetooth_config.json:
    // cada candidato recebe até 20 tentativas, com 8 s entre elas, e para
    // imediatamente no primeiro sucesso. Não repetir uma nova rodada inteira
    // após esgotar os candidatos evita um ciclo de conexão potencialmente
    // infinito quando nenhum adaptador responde.
    try {
      return await connectPreferredElmOnce(config);
    } catch (cause) {
      setConnectionError(cause);
      throw cause;
    }
  })();

  try {
    return await connecting;
  } finally {
    connecting = null;
  }
}

export async function setSharedObdConnection(connection: SharedObdConnection | null): Promise<void> {
  active = connection;
  bluetoothConnected = Boolean(connection);
  if (connection) lastConnectionError = null;
  emit();
}

export async function disconnectSharedObd(): Promise<void> {
  connecting = null;
  const connection = active;
  active = null;
  bluetoothConnected = false;
  emit();
  if (connection) await connection.session.close();
}
