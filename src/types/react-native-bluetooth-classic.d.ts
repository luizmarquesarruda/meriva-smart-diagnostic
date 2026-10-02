declare module 'react-native-bluetooth-classic' {
  export interface BluetoothDevice {
    address: string; name: string; bonded?: boolean;
    isConnected?: () => Promise<boolean>; disconnect?: () => Promise<boolean | void>;
    write: (data: string) => Promise<void>; read?: () => Promise<string>;
    onDataReceived?: (listener: (event: { data?: string }) => void) => { remove: () => void };
  }
  export interface BluetoothEventSubscription { remove: () => void; }
  export interface BluetoothStateEvent { enabled: boolean; }
  const BluetoothClassic: {
    isBluetoothAvailable: () => Promise<boolean>; isBluetoothEnabled: () => Promise<boolean>;
    requestBluetoothEnabled: () => Promise<boolean>; getBondedDevices: () => Promise<BluetoothDevice[]>;
    startDiscovery: () => Promise<BluetoothDevice[]>; cancelDiscovery: () => Promise<boolean | void>;
    connectToDevice: (address: string) => Promise<BluetoothDevice>;
    onStateChanged: (listener: (event: BluetoothStateEvent) => void) => BluetoothEventSubscription;
    onDeviceDisconnected: (listener: (event: { device?: BluetoothDevice }) => void) => BluetoothEventSubscription;
  };
  export default BluetoothClassic;
}
