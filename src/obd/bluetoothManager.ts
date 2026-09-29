import { BluetoothClassicTransport, BluetoothDeviceInfo, listBondedBluetoothDevices } from './bluetoothClassicTransport';
import { Elm327Session } from './elm327';

export type BluetoothConnectionStatus =
  | 'BLUETOOTH DESLIGADO'
  | 'BLUETOOTH CONECTANDO'
  | 'BLUETOOTH CONECTADO'
  | 'ELM RESPONDENDO'
  | 'ELM NÃO RESPONDE'
  | 'ECU RESPONDENDO'
  | 'ECU NÃO RESPONDE'
  | 'PROTOCOLO IDENTIFICADO'
  | 'PROTOCOLO NÃO IDENTIFICADO'
  | 'ERRO';

export interface BluetoothConnectionState {
  status: BluetoothConnectionStatus;
  device?: BluetoothDeviceInfo;
  error?: string;
}

export async function discoverPairedDevices(): Promise<BluetoothDeviceInfo[]> {
  return listBondedBluetoothDevices();
}

export async function createRealElmSession(device: BluetoothDeviceInfo): Promise<Elm327Session> {
  const transport = new BluetoothClassicTransport(device.address);
  const session = new Elm327Session(transport);
  await session.initialize();
  return session;
}
