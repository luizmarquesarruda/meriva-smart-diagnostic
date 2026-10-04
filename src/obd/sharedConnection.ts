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

export async function connectPreferredElm(): Promise<SharedObdConnection> {
  if (active) return active;

  const devices = await discoverPairedDevices();
  if (!devices.length) {
    throw new Error('NENHUM ELM327 PAREADO. PAREIE O ADAPTADOR NO ANDROID PRIMEIRO.');
  }

  // Nunca trate um Bluetooth desconhecido como ELM só porque é o único pareado.
  // O nome apenas seleciona candidatos. A prova real continua sendo o PID 010C.
  const candidates = devices.filter(looksLikeElm327);

  if (!candidates.length) {
    const names = devices.map((device) => device.name).join(', ');
    throw new Error(
      'NENHUM ELM327 IDENTIFICADO ENTRE OS DISPOSITIVOS PAREADOS: ' + names +
      '. PAREIE O ELM327 OU SELECIONE-O NO LABORATÓRIO OBD.',
    );
  }

  let lastError: unknown = null;

  // Se houver mais de um candidato, testa um por um. createRealElmSession()
  // só retorna sucesso depois de confirmar a ECU pelo 010C.
  for (const device of candidates) {
    try {
      const connection = await createRealElmSession(device);
      active = {
        session: connection.session,
        device,
        protocol: connection.protocol,
      };
      emit();
      return active;
    } catch (cause) {
      lastError = cause;
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? '');
  throw new Error(
    'NENHUM DOS ELM327 PAREADOS RESPONDEU AO PID 010C.' +
    (detail ? ' ' + detail : ''),
  );
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