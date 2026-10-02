import RNBluetoothClassic, { type BluetoothDevice } from 'react-native-bluetooth-classic';
import { ObdTransport } from './elm327';
export interface BluetoothDeviceInfo { address: string; name: string; bonded?: boolean; }
export class BluetoothClassicTransport implements ObdTransport {
  private device: BluetoothDevice | null = null; private connected = false; private received = ''; private dataSubscription?: { remove: () => void };
  constructor(private readonly deviceAddress: string) {}
  async open(): Promise<void> {
    if (!(await RNBluetoothClassic.isBluetoothAvailable())) throw new Error('BLUETOOTH CLASSIC NÃO SUPORTADO');
    if (!(await RNBluetoothClassic.isBluetoothEnabled())) throw new Error('BLUETOOTH DESLIGADO');
    const device = await RNBluetoothClassic.connectToDevice(this.deviceAddress);
    if (!device) throw new Error('BLUETOOTH NÃO CONECTOU AO DISPOSITIVO');
    const isConnected = typeof device.isConnected === 'function' ? await device.isConnected() : true;
    if (!isConnected) throw new Error('BLUETOOTH CONECTADO NÃO CONFIRMADO');
    this.device = device; this.connected = true; this.received = '';
    if (typeof device.onDataReceived === 'function') this.dataSubscription = device.onDataReceived((event) => { if (event?.data) this.received += event.data; });
  }
  async close(): Promise<void> {
    this.dataSubscription?.remove(); this.dataSubscription = undefined;
    try { if (this.device?.disconnect) await this.device.disconnect(); } finally { this.device = null; this.connected = false; this.received = ''; }
  }
  async write(data: string): Promise<void> {
    if (!this.device || !this.connected) throw new Error('BLUETOOTH NÃO CONECTADO');
    if (!(await RNBluetoothClassic.isBluetoothEnabled())) { this.connected = false; throw new Error('BLUETOOTH DESLIGADO'); }
    await this.device.write(data);
  }
  async readUntilPrompt(timeoutMs = 3000): Promise<string> {
    if (!this.device || !this.connected) throw new Error('BLUETOOTH NÃO CONECTADO');
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      if (!(await RNBluetoothClassic.isBluetoothEnabled())) { this.connected = false; throw new Error('BLUETOOTH DESLIGADO'); }
      if (this.received.includes('>')) { const response = this.received; this.received = ''; return response.replace(/>/g, '').trim(); }
      if (this.device.read) { try { const chunk = await this.device.read(); if (chunk) this.received += chunk; } catch {} }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const partial = this.received; this.received = ''; if (partial.trim()) return partial.trim(); throw new Error('TIMEOUT');
  }
}
export async function listBondedBluetoothDevices(): Promise<BluetoothDeviceInfo[]> {
  if (!(await RNBluetoothClassic.isBluetoothEnabled())) throw new Error('BLUETOOTH DESLIGADO');
  const devices = await RNBluetoothClassic.getBondedDevices();
  return devices.map((d) => ({ address: d.address, name: d.name ?? '', bonded: true }));
}
export async function discoverBluetoothDevices(): Promise<BluetoothDeviceInfo[]> {
  if (!(await RNBluetoothClassic.isBluetoothEnabled())) throw new Error('BLUETOOTH DESLIGADO');
  const devices = await RNBluetoothClassic.startDiscovery();
  return devices.map((d) => ({ address: d.address, name: d.name ?? '', bonded: false }));
}
