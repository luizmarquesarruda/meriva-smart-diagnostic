import { BluetoothClassicTransport, BluetoothDeviceInfo, listBondedBluetoothDevices } from './bluetoothClassicTransport';
import { ElmCommandResult, Elm327Session } from './elm327';

export type BluetoothConnectionStatus =
  | 'BLUETOOTH DESLIGADO' | 'BLUETOOTH CONECTANDO' | 'BLUETOOTH CONECTADO'
  | 'ELM RESPONDENDO' | 'ELM NÃO RESPONDE' | 'ECU RESPONDENDO' | 'ECU NÃO RESPONDE'
  | 'PROTOCOLO IDENTIFICADO' | 'PROTOCOLO NÃO IDENTIFICADO' | 'ERRO';

export interface BluetoothConnectionState { status: BluetoothConnectionStatus; device?: BluetoothDeviceInfo; error?: string; }
export interface RealElmConnection { session: Elm327Session; initialization: ElmCommandResult[]; }

export async function discoverPairedDevices(): Promise<BluetoothDeviceInfo[]> { return listBondedBluetoothDevices(); }

export async function createRealElmSession(device: BluetoothDeviceInfo): Promise<RealElmConnection> {
  const session = new Elm327Session(new BluetoothClassicTransport(device.address));
  const initialization = await session.initialize();
  return { session, initialization };
}
