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
  private received = '';
  private dataSubscription?: RemovableSubscription;
  private disconnectSubscription?: RemovableSubscription;

  constructor(private readonly deviceAddress: string) {}

  async open(): Promise<void> {
    if (Platform.OS !== 'android') throw new Error('BLUETOOTH CLASSIC DISPONÍVEL SOMENTE NO ANDROID');
    if (!(await RNBluetoothClassic.isBluetoothAvailable())) throw new Error('BLUETOOTH NÃO DISPONÍVEL NESTE APARELHO');
    if (!(await RNBluetoothClassic.isBluetoothEnabled())) throw new Error('BLUETOOTH DESLIGADO');

    this.received = '';
    this.connected = false;
    this.removeSubscriptions();

    let device: BluetoothDevice;
    try {
      device = await RNBluetoothClassic.connectToDevice(this.deviceAddress, {
        connectionType: 'raw',
        charset: 'ascii',
        secureSocket: false,
      });
    } catch (cause) {
      this.markDisconnected();
      const message = cause instanceof Error ? cause.message : String(cause);
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
      if (event?.data) this.received += String(event.data);
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
    this.received = '';
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

      const promptIndex = this.received.indexOf('>');
      if (promptIndex >= 0) {
        const response = this.received.slice(0, promptIndex);
        this.received = this.received.slice(promptIndex + 1);
        return response.replace(/^\s+|\s+$/g, '');
      }

      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    const partial = this.received.replace(/^\s+|\s+$/g, '');
    this.received = '';
    throw new Error(partial ? 'TIMEOUT: RESPOSTA ELM SEM PROMPT FINAL' : 'TIMEOUT');
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
