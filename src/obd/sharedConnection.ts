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

// ELM327 Bluetooth Classic do veículo de teste. O endereço só é usado para
// selecionar o adaptador pareado. A conexão real continua sendo validada pelo 010C.
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

export async function connectPreferredElm(preferredAddress: string | null = MERIVA_ELM327_ADDRESS): Promise<SharedObdConnection> {
  if (active) return active;
  if (connecting) return connecting;

  connecting = (async () => {
    const devices = await discoverPairedDevices();

    // O MAC conhecido é a âncora da conexão automática. Alguns Androids/ELM
    // podem não expor o dispositivo na lista imediatamente, mesmo já pareado.
    // Nesse caso ainda tentamos o endereço diretamente antes de desistir.
    const preferredKnown = preferredAddress
      ? devices.find((device) => device.address.toUpperCase() === preferredAddress.toUpperCase())
      : undefined;

    if (!devices.length && preferredAddress) {
      const directDevice: BluetoothDeviceInfo = {
        address: preferredAddress.toUpperCase(),
        name: 'ELM327 (ENDEREÇO CONFIGURADO)',
        bonded: true,
      };
      try {
        const connection = await createRealElmSession(directDevice);
        active = {
          session: connection.session,
          device: directDevice,
          protocol: connection.protocol,
          supportedPids: connection.supportedPids,
        };
        emit();
        return active;
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : String(cause);
        throw new Error(
          'ELM327 NÃO FOI LOCALIZADO NA LISTA DE PAREADOS E A TENTATIVA DIRETA FALHOU: ' + detail,
        );
      }
    }

    if (!devices.length) {
      throw new Error('NENHUM ELM327 PAREADO. PAREIE O ADAPTADOR NO ANDROID PRIMEIRO.');
    }

  // Nunca trate um Bluetooth desconhecido como ELM só porque é o único pareado.
  // O nome apenas seleciona candidatos. A prova real continua sendo o PID 010C.
    const preferred = preferredKnown;
    const namedCandidates = devices.filter(looksLikeElm327);
    const candidates = preferred
      ? [preferred, ...namedCandidates.filter((device) => device.address !== preferred.address)]
      : namedCandidates;

    if (!candidates.length) {
      const names = devices.map((device) => `${device.name} (${device.address})`).join(', ');
      throw new Error(
        'ELM327 NÃO ENCONTRADO ENTRE OS PAREADOS. ENDEREÇO ESPERADO: ' + MERIVA_ELM327_ADDRESS +
        '. PAREIE O ADAPTADOR NO ANDROID. PAREADOS: ' + names,
      );
    }

    let lastError: unknown = null;

    // O endereço conhecido é tentado primeiro. A prova final continua sendo
    // a inicialização do ELM e o PID 010C, nunca apenas o endereço/nome.
    for (const device of candidates) {
      try {
        const connection = await createRealElmSession(device);
        active = {
          session: connection.session,
          device,
          protocol: connection.protocol,
          supportedPids: connection.supportedPids,
        };
        emit();
        return active;
      } catch (cause) {
        lastError = cause;
      }
    }

    const detail = lastError instanceof Error ? lastError.message : String(lastError ?? '');
    throw new Error(
      'ELM327 PAREADO NÃO RESPONDEU AO PID 010C. ENDEREÇO TESTADO: ' +
      MERIVA_ELM327_ADDRESS + (detail ? '. ' + detail : ''),
    );
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