declare module 'react-native-bluetooth-classic' {
  export interface BluetoothDevice {
    address: string;
    name: string;
  }

  const BluetoothClassic: {
    getBondedDevices?: () => Promise<BluetoothDevice[]>;
    startDiscovery?: () => Promise<BluetoothDevice[]>;
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

  export default BluetoothClassic;
}
