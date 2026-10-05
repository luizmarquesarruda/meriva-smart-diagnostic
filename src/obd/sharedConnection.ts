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

async function connectPreferredElmOnce(preferredAddress: string | null): Promise<SharedObdConnection> {
  const devices = await discoverPairedDevices();

  // O endereço configurado é uma âncora conhecida e deve ser testado
  // mesmo quando o Android devolve outros dispositivos pareados.
  const preferredDevice: BluetoothDeviceInfo | undefined = preferredAddress
    ? devices.find((device) => sameAddress(device.address, preferredAddress))
    : undefined;

  const namedCandidates = devices.filter(looksLikeElm327);
  const candidates: BluetoothDeviceInfo[] = [];

  if (preferredDevice) candidates.push(preferredDevice);

  // Se o endereço conhecido não apareceu na lista do Android, ainda assim
  // tentamos a conexão direta. Isso evita depender do nome retornado pelo SO.
  if (preferredAddress && !preferredDevice) {
    candidates.push({
      address: preferredAddress.toUpperCase(),
      name: 'ELM327 (ENDEREÇO CONFIGURADO)',
      bonded: true,
    });
  }

  for (const device of namedCandidates) {
    if (!candidates.some((candidate) => sameAddress(candidate.address, device.address))) {
      candidates.push(device);
    }
  }

  if (!candidates.length) {
    throw new Error('NENHUM DISPOSITIVO ELM327 DISPONÍVEL. PAREIE O ADAPTADOR NO ANDROID.');
  }

  let lastError: unknown = null;

  for (const device of candidates) {
    try {
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
    } catch (cause) {
      lastError = cause;
      setConnectionError(cause);
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError ?? 'ERRO DESCONHECIDO');
  throw new Error(
    'ELM327 NÃO CONECTOU. ÚLTIMO ERRO: ' + detail,
  );
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
        setConnectionError(cause);
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
