import RNBluetoothClassic, { BluetoothDevice } from 'react-native-bluetooth-classic';
import { Platform } from 'react-native';
import { ObdTransport } from './elm327';

export interface BluetoothDeviceInfo {
  address: string;
  name: string;
  bonded?: boolean;
}

export class BluetoothClassicTransport implements ObdTransport {
  private device: BluetoothDevice | null = null;
  private connected = false;
  private received = '';
  private subscription?: { remove: () => void };

  constructor(private readonly deviceAddress: string) {}

  async open(): Promise<void> {
    if (Platform.OS !== 'android') throw new Error('BLUETOOTH CLASSIC DISPONÍVEL SOMENTE NO ANDROID');
    if (!(await RNBluetoothClassic.isBluetoothAvailable())) throw new Error('BLUETOOTH NÃO DISPONÍVEL NESTE APARELHO');
    if (!(await RNBluetoothClassic.isBluetoothEnabled())) throw new Error('BLUETOOTH DESLIGADO');

    this.device = await RNBluetoothClassic.connectToDevice(this.deviceAddress, {
      connectionType: 'delimited',
      delimiter: '\r',
      charset: 'ascii',
      secureSocket: false,
    });

    this.connected = true;
    this.received = '';
    this.subscription = this.device.onDataReceived((event) => {
      if (event?.data) this.received += String(event.data);
    });
  }

  async close(): Promise<void> {
    this.subscription?.remove();
    this.subscription = undefined;
    if (this.device && this.connected) {
      try { await this.device.disconnect(); } catch { /* já desconectado */ }
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
      const promptIndex = this.received.indexOf('>');
      if (promptIndex >= 0) {
        const response = this.received.slice(0, promptIndex);
        this.received = this.received.slice(promptIndex + 1);
        return response.trim();
      }

      try {
        if (await this.device.available()) {
          const chunk = await this.device.read();
          if (chunk) this.received += String(chunk);
        }
      } catch {
        // O evento pode já ter entregue os dados.
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const partial = this.received;
    this.received = '';
    if (partial.trim()) return partial.trim();
    throw new Error('TIMEOUT');
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
