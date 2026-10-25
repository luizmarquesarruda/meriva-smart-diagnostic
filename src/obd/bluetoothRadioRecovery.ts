export type BluetoothRadioRecoveryDecision =
  | 'CONTINUE'
  | 'STOP_RADIO_OFF'
  | 'STOP_RADIO_STATE_UNKNOWN';

export type BluetoothRadioRecoveryStopReason = 'RADIO_OFF' | 'RADIO_STATE_UNKNOWN';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return error == null ? '' : String(error);
}

export function getBluetoothRadioRecoveryStopReason(
  error: unknown,
): BluetoothRadioRecoveryStopReason | null {
  const message = errorMessage(error);
  if (/(?:BLUETOOTH[\s\S]{0,100}DESLIGADO|DESLIGADO[\s\S]{0,100}BLUETOOTH|mAdapter\s+is\s+not\s+enabled|Bluetooth(?:\s+adapter)?\s+is\s+not\s+enabled)/i.test(message)) {
    return 'RADIO_OFF';
  }
  if (/ESTADO DO BLUETOOTH NÃO PÔDE SER CONFIRMADO|BLUETOOTH.*ESTADO.*INDETERMINADO|RADIO_STATE_UNKNOWN/i.test(message)) {
    return 'RADIO_STATE_UNKNOWN';
  }
  return null;
}

/** Pure policy for deciding whether it is safe to open another RFCOMM socket. */
export function decideBluetoothRadioRecovery(
  radioEnabled: boolean | null | undefined,
  error?: unknown,
): BluetoothRadioRecoveryDecision {
  const errorReason = getBluetoothRadioRecoveryStopReason(error);
  if (radioEnabled === false || errorReason === 'RADIO_OFF') return 'STOP_RADIO_OFF';
  if (radioEnabled !== true || errorReason === 'RADIO_STATE_UNKNOWN') return 'STOP_RADIO_STATE_UNKNOWN';
  return 'CONTINUE';
}
