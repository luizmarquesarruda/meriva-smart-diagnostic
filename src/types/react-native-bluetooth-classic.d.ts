declare module 'react-native-bluetooth-classic' {
  export interface BluetoothDevice {
    address: string;
    name: string;
    bonded?: boolean;
    id?: string;
    type?: string;
  }

  export function requestBluetoothEnabled(): Promise<boolean>;

  const BluetoothClassic: {
    isBluetoothAvailable: () => Promise<boolean>;
    isBluetoothEnabled: () => Promise<boolean>;
    getBondedDevices: () => Promise<BluetoothDevice[]>;
    startDiscovery?: () => Promise<BluetoothDevice[]>;
    cancelDiscovery?: () => Promise<void>;
    connect?: (address: string) => Promise<boolean | void>;
    connectToDevice?: (
      address: string,
      options?: {
        connectionType?: 'delimited' | 'length' | 'raw';
        delimiter?: string;
        charset?: string;
        secureSocket?: boolean;
      },
    ) => Promise<BluetoothDevice>;
    disconnect?: () => Promise<void>;
    disconnectFromDevice?: (address: string) => Promise<void>;
    write?: (data: string) => Promise<void>;
    writeToDevice?: (data: string) => Promise<void>;
    read?: () => Promise<string>;
    readFromDevice?: () => Promise<string>;
  };

  export default BluetoothClassic;
}
