import { NativeEventEmitter, NativeModules, Platform } from 'react-native';
import { ObdTransport } from './elm327';

export interface BluetoothDeviceInfo {
  address: string;
  name: string;
  bonded?: boolean;
}

type BluetoothClassicModule = {
  getBondedDevices?: () => Promise<BluetoothDeviceInfo[]>;
  startDiscovery?: () => Promise<BluetoothDeviceInfo[]>;
  cancelDiscovery?: () => Promise<void>;
  connect?: (address: string) => Promise<boolean | void>;
  connectToDevice?: (address: string) => Promise<boolean | void>;
  disconnect?: () => Promise<void>;
  disconnectFromDevice?: () => Promise<void>;
  write?: (data: string) => Promise<void>;
  writeToDevice?: (data: string) => Promise<void>;
  read?: () => Promise<string>;
  readFromDevice?: () => Promise<string>;
};

function getNativeBluetooth(): BluetoothClassicModule {
  if (Platform.OS !== 'android') {
    throw new Error('BLUETOOTH CLASSIC DISPONÍVEL SOMENTE NO ANDROID');
  }

  const nativeModule = (NativeModules as Record<string, unknown>).RNBluetoothClassic as BluetoothClassicModule | undefined;
  if (!nativeModule) {
    throw new Error('MÓDULO BLUETOOTH CLASSIC AUSENTE. USE UM DEVELOPMENT BUILD ANDROID.');
  }

  return nativeModule;
}

export class BluetoothClassicTransport implements ObdTransport {
  private native: BluetoothClassicModule | null = null;
  private connected = false;
  private readonly emitter = new NativeEventEmitter();
  private received = '';
  private subscription?: { remove: () => void };

  constructor(private readonly deviceAddress: string) {}

  async open(): Promise<void> {
    this.native = getNativeBluetooth();
    const connect = this.native.connectToDevice ?? this.native.connect;
    if (!connect) throw new Error('API DE CONEXÃO BLUETOOTH NÃO DISPONÍVEL');

    await connect.call(this.native, this.deviceAddress);
    this.connected = true;
    this.received = '';

    // Some versions expose data through events; polling read() is used when available.
    this.subscription = this.emitter.addListener('dataReceived', (event: { data?: string }) => {
      if (event?.data) this.received += event.data;
    });
  }

  async close(): Promise<void> {
    this.subscription?.remove();
    this.subscription = undefined;
    if (this.native) {
      const disconnect = this.native.disconnectFromDevice ?? this.native.disconnect;
      if (disconnect && this.connected) await disconnect.call(this.native);
    }
    this.connected = false;
    this.received = '';
  }

  async write(data: string): Promise<void> {
    if (!this.native || !this.connected) throw new Error('BLUETOOTH NÃO CONECTADO');
    const write = this.native.writeToDevice ?? this.native.write;
    if (!write) throw new Error('API DE ESCRITA BLUETOOTH NÃO DISPONÍVEL');
    await write.call(this.native, data);
  }

  async readUntilPrompt(timeoutMs = 3000): Promise<string> {
    if (!this.native || !this.connected) throw new Error('BLUETOOTH NÃO CONECTADO');
    const started = Date.now();
    const read = this.native.readFromDevice ?? this.native.read;

    while (Date.now() - started < timeoutMs) {
      if (this.received.includes('>')) {
        const response = this.received;
        this.received = '';
        return response.replace(/>/g, '').trim();
      }

      if (read) {
        try {
          const chunk = await read.call(this.native);
          if (chunk) this.received += chunk;
        } catch {
          // Continue until timeout; the caller receives a clear timeout state.
        }
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
  const native = getNativeBluetooth();
  if (!native.getBondedDevices) throw new Error('API DE DISPOSITIVOS PAREADOS NÃO DISPONÍVEL');
  return native.getBondedDevices();
}
