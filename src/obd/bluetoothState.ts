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

export type EcuResponseState =
  | 'NOT_VALIDATED'
  | 'RESPONDING'
  | 'NO_RESPONSE'
  | 'RECOVERING';

/**
 * Consultas OBD reais só são liberadas quando o ciclo Bluetooth/ELM está pronto
 * e a última evidência da ECU continua válida.
 */
export function canPollObd(
  state: BluetoothLifecycleState,
  ecuResponseState: EcuResponseState,
): boolean {
  return state === 'READY' && ecuResponseState === 'RESPONDING';
}
