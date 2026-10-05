import RNBluetoothClassic, { BluetoothDevice } from 'react-native-bluetooth-classic';
import { Platform } from 'react-native';
import { ObdTransport } from './elm327';

export interface BluetoothDeviceInfo {
  address: string;
  name: string;
  bonded?: boolean;
}

type RemovableSubscription = { remove: () => void };

export class BluetoothClassicTransport implements ObdTransport {
  private device: BluetoothDevice | null = null;
  private connected = false;
  private receivedMessages: string[] = [];
  private dataSubscription?: RemovableSubscription;
  private disconnectSubscription?: RemovableSubscription;

  constructor(private readonly deviceAddress: string) {}

  async open(): Promise<void> {
    if (Platform.OS !== 'android') throw new Error('BLUETOOTH CLASSIC DISPONÍVEL SOMENTE NO ANDROID');
    if (!(await RNBluetoothClassic.isBluetoothAvailable())) throw new Error('BLUETOOTH NÃO DISPONÍVEL NESTE APARELHO');
    if (!(await RNBluetoothClassic.isBluetoothEnabled())) throw new Error('BLUETOOTH DESLIGADO');

    this.receivedMessages = [];
    this.connected = false;
    this.removeSubscriptions();

    // RFCOMM/SPP fica mais confiável quando uma descoberta Bluetooth em
    // andamento é encerrada antes de abrir o socket. Isso é especialmente
    // importante em Android quando o usuário ou outro app iniciou uma busca.
    if (RNBluetoothClassic.cancelDiscovery) {
      try {
        await RNBluetoothClassic.cancelDiscovery();
      } catch {
        // Se não houver descoberta ativa, algumas versões da biblioteca podem
        // rejeitar a chamada. A conexão direta continua sendo tentada.
      }
    }

    let device: BluetoothDevice | null = null;
    let lastCause: unknown = null;

    // ELM327 clones variam no uso do RFCOMM seguro. Tentamos primeiro o
    // socket seguro e depois o inseguro, porque alguns telefones/Androids
    // negociam melhor o SPP seguro e alguns clones exigem fallback inseguro.
    // Conecta diretamente pelo endereço MAC. A API instalada não expõe
    // getters para sockets já conectados, portanto o retry é feito no próprio
    // connectToDevice.
    for (const secureSocket of [true, false]) {
      try {
        device = await RNBluetoothClassic.connectToDevice(this.deviceAddress, {
          connectionType: 'delimited',
          delimiter: '>',
          charset: 'ascii',
          secureSocket,
        });
        break;
      } catch (cause) {
        lastCause = cause;
        // Alguns clones mantêm o socket anterior parcialmente aberto após uma
        // tentativa que falhou. Limpa antes de trocar secure/insecure.
        if (device) await this.safeDisconnect(device);
        device = null;
      }
    }

    if (!device) {
      const message = lastCause instanceof Error ? lastCause.message : String(lastCause ?? 'ERRO DESCONHECIDO');
      throw new Error('FALHA AO CONECTAR AO ELM327: ' + message);
    }

    this.device = device;

    if (typeof device.isConnected === 'function') {
      const confirmed = await device.isConnected();
      if (!confirmed) {
        await this.safeDisconnect(device);
        this.markDisconnected();
        throw new Error('ELM327 NÃO CONFIRMOU A CONEXÃO BLUETOOTH');
      }
    }

    this.connected = true;

    this.dataSubscription = device.onDataReceived((event) => {
      if (event?.data) this.receivedMessages.push(String(event.data));
    });

    if (RNBluetoothClassic.onDeviceDisconnected) {
      this.disconnectSubscription = RNBluetoothClassic.onDeviceDisconnected((event) => {
        const eventAddress = event?.address ?? event?.device?.address;
        if (eventAddress && eventAddress !== this.deviceAddress) return;
        this.markDisconnected();
      });
    }
  }

  async close(): Promise<void> {
    const device = this.device;
    const wasConnected = this.connected;
    this.removeSubscriptions();

    if (device && wasConnected) {
      await this.safeDisconnect(device);
    }

    this.device = null;
    this.connected = false;
    this.receivedMessages = [];
  }

  async write(data: string): Promise<void> {
    const device = this.device;
    if (!device || !this.connected) throw new Error('BLUETOOTH NÃO CONECTADO');

    if (typeof device.isConnected === 'function') {
      try {
        if (!(await device.isConnected())) {
          this.markDisconnected();
          throw new Error('BLUETOOTH DESCONECTADO');
        }
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : '';
        if (message === 'BLUETOOTH DESCONECTADO') throw cause;
      }
    }

    await device.write(data, 'ascii');
  }

  async readUntilPrompt(timeoutMs = 6000): Promise<string> {
    const device = this.device;
    if (!device || !this.connected) throw new Error('BLUETOOTH NÃO CONECTADO');

    const started = Date.now();
    let nextConnectionCheck = started;

    // Com connectionType=delimited, a biblioteca já remove o delimitador '>'
    // antes de disparar onDataReceived. Portanto, não devemos procurar '>' aqui.
    // Cada evento recebido representa uma mensagem completa delimitada.
    while (Date.now() - started < timeoutMs) {
      if (!this.connected || !this.device) throw new Error('BLUETOOTH DESCONECTADO');

      if (Date.now() >= nextConnectionCheck && typeof device.isConnected === 'function') {
        nextConnectionCheck = Date.now() + 250;
        try {
          if (!(await device.isConnected())) {
            this.markDisconnected();
            throw new Error('BLUETOOTH DESCONECTADO');
          }
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : '';
          if (message === 'BLUETOOTH DESCONECTADO') throw cause;
        }
      }

      const message = this.receivedMessages.shift();
      if (message != null) {
        return message.replace(/^\\s+|\\s+$/g, '');
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    this.receivedMessages = [];
    throw new Error('TIMEOUT: RESPOSTA ELM SEM MENSAGEM DELIMITADA');
  }

  private async safeDisconnect(device: BluetoothDevice): Promise<void> {
    try {
      await device.disconnect();
    } catch {
      // já desconectado
    }
  }

  private markDisconnected(): void {
    this.removeSubscriptions();
    this.device = null;
    this.connected = false;
    this.received = '';
  }

  private removeSubscriptions(): void {
    this.dataSubscription?.remove();
    this.dataSubscription = undefined;
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = undefined;
  }
}

export async function listBondedBluetoothDevices(): Promise<BluetoothDeviceInfo[]> {
  if (Platform.OS !== 'android') throw new Error('BLUETOOTH CLASSIC DISPONÍVEL SOMENTE NO ANDROID');
  const devices = await RNBluetoothClassic.getBondedDevices();
  return devices.map((device) => ({
    address: device.address,
    name: device.name || 'DISPOSITIVO SEM NOME',
    bonded: device.bonded ?? true,
  }));
}