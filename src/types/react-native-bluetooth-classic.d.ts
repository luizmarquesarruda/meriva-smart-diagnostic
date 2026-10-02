declare module 'react-native-bluetooth-classic' {
  export interface BluetoothDataEvent { data?: string; }

  export interface BluetoothDevice {
    address: string;
    name: string;
    bonded?: boolean;
    id?: string;
    type?: string;
    onDataReceived: (listener: (event: BluetoothDataEvent) => void) => { remove: () => void };
    available: () => Promise<boolean>;
    read: () => Promise<string>;
    write: (data: string, charset?: string) => Promise<void>;
    disconnect: () => Promise<void>;
  }

  const BluetoothClassic: {
    isBluetoothAvailable: () => Promise<boolean>;
    isBluetoothEnabled: () => Promise<boolean>;
    getBondedDevices: () => Promise<BluetoothDevice[]>;
    requestBluetoothEnabled?: () => Promise<boolean>;
    startDiscovery?: () => Promise<BluetoothDevice[]>;
    cancelDiscovery?: () => Promise<void>;
    connectToDevice: (
      address: string,
      options?: {
        connectionType?: 'delimited' | 'length' | 'raw';
        delimiter?: string;
        charset?: string;
        secureSocket?: boolean;
      },
    ) => Promise<BluetoothDevice>;
  };

  export default BluetoothClassic;
}
