import type { SharedObdConnection, SharedObdStatus } from '../obd/sharedConnection';

/**
 * Preserve a GPS session during transient ECU health probes, but only while
 * the validated connection and Bluetooth link still exist.
 */
export function shouldKeepGpsHistorySession(
  serviceRunning: boolean,
  connection: Pick<SharedObdConnection, 'ecuValidated'> | null,
  status: Pick<SharedObdStatus, 'bluetoothConnected' | 'ecuResponseState'>,
): boolean {
  return Boolean(
    serviceRunning &&
    connection?.ecuValidated &&
    status.bluetoothConnected &&
    status.ecuResponseState !== 'NOT_VALIDATED'
  );
}
