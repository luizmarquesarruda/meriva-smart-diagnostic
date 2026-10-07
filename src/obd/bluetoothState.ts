export type BluetoothLifecycleState =
  | 'UNSUPPORTED'
  | 'BLUETOOTH_OFF'
  | 'BLUETOOTH_ON'
  | 'DEVICE_SELECTED'
  | 'BLUETOOTH_CONNECTING'
  | 'BLUETOOTH_CONNECTED'
  | 'ELM_RESPONDING'
  | 'ELM_INITIALIZED'
  | 'ECU_RESPONDING'
  | 'READY'
  | 'DISCONNECTED'
  | 'ERROR';

const BLUETOOTH_LINK_STATES = new Set<BluetoothLifecycleState>([
  'BLUETOOTH_CONNECTED',
  'ELM_RESPONDING',
  'ELM_INITIALIZED',
  'ECU_RESPONDING',
  'READY',
]);

export function isBluetoothLinkUp(state: BluetoothLifecycleState): boolean {
  return BLUETOOTH_LINK_STATES.has(state);
}

/** Consultas OBD reais só são liberadas depois da validação da ECU por 010C. */
export function canPollObd(state: BluetoothLifecycleState): boolean {
  return state === 'READY';
}
