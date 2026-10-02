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
    this.removeSubscriptions();

    const device = await RNBluetoothClassic.connectToDevice(this.deviceAddress, {
      connectionType: 'raw',
      charset: 'ascii',
      secureSocket: false,
    });

    this.device = device;
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
      try {
        await device.disconnect();
      } catch {
        // já desconectado
      }
    }

    this.device = null;
    this.connected = false;
    this.received = '';
  }

  async write(data: string): Promise<void> {
    if (!this.device || !this.connected) throw new Error('BLUETOOTH NÃO CONECTADO');
    await this.device.write(data, 'ascii');
  }

  async readUntilPrompt(timeoutMs = 3000): Promise<string> {
    if (!this.device || !this.connected) throw new Error('BLUETOOTH NÃO CONECTADO');

    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (!this.connected) throw new Error('BLUETOOTH DESCONECTADO');

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
    if (partial) return partial;
    throw new Error('TIMEOUT');
  }

  private markDisconnected(): void {
    this.dataSubscription?.remove();
    this.dataSubscription = undefined;
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = undefined;
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
