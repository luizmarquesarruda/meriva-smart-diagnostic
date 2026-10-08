import type { Elm327Session } from './elm327';
import type { BluetoothDeviceInfo } from './bluetoothClassicTransport';
import { createRealElmSession, discoverPairedDevices, ensureBluetoothReady } from './bluetoothManager';
import { DEFAULT_ELM327_COMPATIBILITY, Elm327CompatibilityConfig, mergeCompatibilityConfig } from './elm327Compatibility';
import { getAutoSaveState, closeObdAutosaveSession, startObdAutosaveSession, updateAutoSaveState } from '../meriva/autosaveManager';
import { clearBluetoothDiagnostic, getLastBluetoothDiagnosticText } from './bluetoothManager';
import { isBluetoothLinkUp, type BluetoothLifecycleState } from './bluetoothState';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import * as FileSystem from 'expo-file-system';
import { readAppSettings, writeAppSettings } from '../database/appSettings';

export interface SharedObdConnection {
  session: Elm327Session;
  device: BluetoothDeviceInfo;
  protocol: string | null;
  supportedPids: string[];
  ecuValidated: boolean;
  getDiagnosticsText: () => string;
}

export interface SharedObdStatus {
  lifecycle: BluetoothLifecycleState;
  bluetoothConnected: boolean;
  ecuConnected: boolean;
}

let active: SharedObdConnection | null = null;
let connecting: Promise<SharedObdConnection> | null = null;
let lastConnectionError: string | null = null;
let lastDiscoveryDevices: BluetoothDeviceInfo[] = [];

const listeners = new Set<(connection: SharedObdConnection | null) => void>();
const statusListeners = new Set<(status: SharedObdStatus) => void>();
let lifecycle: BluetoothLifecycleState = 'BLUETOOTH_OFF';
let bluetoothConnected = false;
let monitorTimer: ReturnType<typeof setInterval> | null = null;
let monitorBusy = false;
let intentionalDisconnect = false;
let connectionGeneration = 0;

function emit(): void {
  bluetoothConnected = isBluetoothLinkUp(lifecycle);
  for (const listener of listeners) listener(active);
  const status: SharedObdStatus = {
    lifecycle,
    bluetoothConnected,
    ecuConnected: Boolean(active?.ecuValidated),
  };
  for (const listener of statusListeners) listener(status);
}

function setLifecycle(next: BluetoothLifecycleState): void {
  lifecycle = next;
  emit();
}

async function persistDisconnectedState(): Promise<void> {
  try {
    await closeObdAutosaveSession();
  } catch {
    // a perda de conectividade não deve derrubar a interface
  }
}

async function handleUnexpectedDisconnect(reason: string): Promise<void> {
  if (intentionalDisconnect) return;

  connectionGeneration += 1;
  lastConnectionError = reason;
  const connection = active;
  active = null;

  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }

  lifecycle = reason.includes('DESLIGADO') ? 'BLUETOOTH_OFF' : 'DISCONNECTED';
  emit();

  if (connection) {
    intentionalDisconnect = true;
    try {
      await persistDisconnectedState();
      try { await connection.session.close(); } catch { /* sessão já perdida */ }
    } finally {
      intentionalDisconnect = false;
    }
  }
}

function startBluetoothMonitor(): void {
  if (monitorTimer) return;

  monitorTimer = setInterval(() => {
    if (monitorBusy || !active) return;
    monitorBusy = true;

    void (async () => {
      try {
        const enabled = await RNBluetoothClassic.isBluetoothEnabled();
        if (!enabled) await handleUnexpectedDisconnect('BLUETOOTH DESLIGADO');
      } catch {
        // onDeviceDisconnected continua sendo a primeira linha de detecção
      } finally {
        monitorBusy = false;
      }
    })();
  }, 1000);
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
export type ConnectionSelectionMode = 'PREFERRED' | 'EXPLICIT';

export function buildCandidateList(
  devices: BluetoothDeviceInfo[],
  preferredAddress: string | null,
  selectionMode: ConnectionSelectionMode = 'PREFERRED',
): BluetoothDeviceInfo[] {
  const candidates: BluetoothDeviceInfo[] = [];
  const addCandidate = (device: BluetoothDeviceInfo) => {
    if (!candidates.some((item) => sameAddress(item.address, device.address))) {
      candidates.push(device);
    }
  };

  if (preferredAddress) {
    const preferred = devices.find((device) => sameAddress(device.address, preferredAddress));
    if (preferred) addCandidate(preferred);
  }

  if (selectionMode === 'EXPLICIT') return candidates;

  for (const device of devices.filter(looksLikeElm327)) addCandidate(device);
  for (const device of devices) addCandidate(device);
  return candidates;
}

export function getSharedObdConnection(): SharedObdConnection | null {
  return active;
}

export function subscribeSharedObd(listener: (connection: SharedObdConnection | null) => void): () => void {
  listeners.add(listener);
  listener(active);
  return () => listeners.delete(listener);
}

export function getSharedObdStatus(): SharedObdStatus {
  return {
    lifecycle,
    bluetoothConnected: isBluetoothLinkUp(lifecycle),
    ecuConnected: Boolean(active?.ecuValidated),
  };
}

export function subscribeSharedObdStatus(listener: (status: SharedObdStatus) => void): () => void {
  statusListeners.add(listener);
  listener(getSharedObdStatus());
  return () => statusListeners.delete(listener);
}

async function connectCandidate(device: BluetoothDeviceInfo, compatibility: Elm327CompatibilityConfig): Promise<SharedObdConnection> {
  setLifecycle('DEVICE_SELECTED');
  setLifecycle('BLUETOOTH_CONNECTING');
  intentionalDisconnect = false;

  try {
      const attemptGeneration = connectionGeneration;
    let disconnectedDuringAttempt = false;
    const connection = await createRealElmSession(
      device,
      compatibility,
      getAutoSaveState().pidDiscovery,
      {
        onBluetoothConnected: () => setLifecycle('BLUETOOTH_CONNECTED'),
        onElmResponding: () => setLifecycle('ELM_RESPONDING'),
        onElmInitialized: () => setLifecycle('ELM_INITIALIZED'),
        onEcuResponding: () => setLifecycle('ECU_RESPONDING'),
        onDisconnected: (reason) => {
          disconnectedDuringAttempt = true;
          void handleUnexpectedDisconnect(reason);
        },
      },
    );

    if (attemptGeneration !== connectionGeneration || disconnectedDuringAttempt || intentionalDisconnect) {
      try { await connection.session.close(); } catch { /* sessão já perdida */ }
      throw new Error('CONEXÃO BLUETOOTH CANCELADA OU PERDIDA DURANTE A VALIDAÇÃO.');
    }

    if (!connection.ecuValidated) {
      try { await connection.session.close(); } catch { /* preserva o estado inválido */ }
      throw new Error('ECU NÃO VALIDADA. OBRIGATÓRIO RECEBER 41 0C PARA MARCAR OBD COMO CONECTADO.');
    }

    active = {
      session: connection.session,
      device,
      protocol: connection.protocol,
      supportedPids: connection.supportedPids,
      ecuValidated: connection.ecuValidated,
      getDiagnosticsText: () => connection.session.getTransportDiagnosticsText(),
    };

    // Persistência local: o próximo diagnóstico reutiliza automaticamente o
    // adaptador validado. A ECU só é marcada como validada após o gate 41 0C.
    const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
    try {
      const settings = await readAppSettings(basePath);
      await writeAppSettings(basePath, {
        ...settings,
        selectedAdapterAddress: device.address.toUpperCase(),
      });
      const validatedAt = new Date().toISOString();
      updateAutoSaveState((state) => {
        state.obd = {
          ...state.obd,
          connected: true,
          adapterName: device.name,
          protocol: connection.protocol ?? undefined,
          lastKnownProtocol: connection.protocol ?? state.obd.lastKnownProtocol,
          ecuAddress: state.vehicle?.ecuAddress ?? state.obd.ecuAddress,
          ecuValidatedAt: validatedAt,
          ecuValidationSource: state.vehicle?.ecuAddress ? 'VEHICLE_PROFILE' : 'OBD_RESPONSE',
          lastConnectedAt: validatedAt,
        };
      });
      const sessionSaved = await startObdAutosaveSession();
      if (!sessionSaved) {
        console.warn('[obd] ECU validada, mas não foi possível iniciar o autosave da sessão.');
      }
    } catch (persistCause) {
      // Falha de persistência não invalida uma conexão já validada pelo ELM/ECU.
      console.warn('[obd] falha ao persistir adaptador/ECU:', persistCause instanceof Error ? persistCause.message : persistCause);
    }
    lastConnectionError = null;
    setLifecycle('READY');
    startBluetoothMonitor();
    return active;
  } catch (cause) {
    if (!active) {
      lifecycle = 'DISCONNECTED';
      emit();
    }
    throw cause;
  }
}

async function connectPreferredElmOnce(
  compatibility: Elm327CompatibilityConfig,
  preferredAddress: string | null,
  selectionMode: ConnectionSelectionMode = 'PREFERRED',
): Promise<SharedObdConnection> {
  clearBluetoothDiagnostic();
  lastDiscoveryDevices = [];
  await ensureBluetoothReady();
  setLifecycle('BLUETOOTH_ON');

  const devices = await discoverPairedDevices();
  lastDiscoveryDevices = devices;
  const candidates = buildCandidateList(devices, preferredAddress, selectionMode);
  if (selectionMode === 'EXPLICIT' && candidates.length === 0) {
    throw new Error('DISPOSITIVO BLUETOOTH SELECIONADO NÃO ESTÁ MAIS PAREADO.');
  }

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
  preferredAddress: string | null = null,
  compatibility?: Partial<Elm327CompatibilityConfig>,
  selectionMode: ConnectionSelectionMode = 'PREFERRED',
): Promise<SharedObdConnection> {
  if (active) {
    if (selectionMode === 'EXPLICIT' && preferredAddress && !sameAddress(active.device.address, preferredAddress)) {
      throw new Error('OUTRO ADAPTADOR JÁ ESTÁ CONECTADO. DESCONECTE O ATUAL ANTES DE TROCAR DE DISPOSITIVO.');
    }
    return active;
  }
  if (connecting) return connecting;

  const config = mergeCompatibilityConfig(compatibility ?? DEFAULT_ELM327_COMPATIBILITY);

  connecting = (async () => {
    // O fluxo de tentativa já é controlado por bluetooth_config.json:
    // cada candidato usa o limite efetivo configurado (20 por padrão), com 8 s
    // entre falhas, e para imediatamente no primeiro sucesso. Não repetir uma nova rodada inteira
    // após esgotar os candidatos evita um ciclo de conexão potencialmente
    // infinito quando nenhum adaptador responde.
    try {
      return await connectPreferredElmOnce(config, preferredAddress, selectionMode);
    } catch (cause) {
      setConnectionError(cause);
      const message = cause instanceof Error ? cause.message : String(cause);
      if (/BLUETOOTH.*DESLIGADO|BLUETOOTH CONTINUA DESLIGADO|BLUETOOTH NÃO FOI ATIVADO/i.test(message)) {
        setLifecycle('BLUETOOTH_OFF');
      } else {
        setLifecycle('ERROR');
      }
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
  intentionalDisconnect = !connection;
  if (!connection) connectionGeneration += 1;

  if (connection) {
    lastConnectionError = null;
    setLifecycle('READY');
    if (connection.ecuValidated) {
      const sessionSaved = await startObdAutosaveSession();
      if (!sessionSaved) {
        console.warn('[obd] ECU validada, mas não foi possível iniciar o autosave da sessão.');
      }
    }
    startBluetoothMonitor();
  } else {
    lifecycle = 'DISCONNECTED';
    emit();
    await closeObdAutosaveSession();
  }
}

export async function disconnectSharedObd(): Promise<void> {
  intentionalDisconnect = true;
  connectionGeneration += 1;
  connecting = null;

  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }

  const connection = active;
  active = null;
  lifecycle = 'DISCONNECTED';
  emit();

  try {
    if (connection) await connection.session.close();
  } finally {
    await closeObdAutosaveSession();
    intentionalDisconnect = false;
  }
}
