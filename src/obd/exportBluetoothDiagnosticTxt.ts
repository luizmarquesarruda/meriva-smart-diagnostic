import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getLastBluetoothDiagnosticText } from '../obd/bluetoothManager';
import { getSharedObdConnection, getSharedObdLastError, getSharedObdDiagnosticContext } from '../obd/sharedConnection';

export interface BluetoothReportResult {
  ok: boolean;
  fileName?: string;
  reason?: 'CANCELADO' | 'ERRO';
  message?: string;
}

function buildReport(): string {
  const connection = getSharedObdConnection();
  const context = getSharedObdDiagnosticContext();
  const trace = connection?.getDiagnosticsText() || context.trace || getLastBluetoothDiagnosticText();
  const lines = [
    'MERIVA SMART DIAGNOSTIC',
    'BLUETOOTH CLASSIC / ELM327 DIAGNOSTIC REPORT',
    '',
    `DATA: ${new Date().toISOString()}`,
    `APP VERSION: ${Constants.expoConfig?.version ?? 'N/D'}`,
    `PLATFORM: ${Platform.OS} ${Platform.Version}`,
    `DEVICE: ${Constants.deviceName ?? 'N/D'}`,
    `ELM DEVICE: ${connection ? `${connection.device.name} | ${connection.device.address}` : 'NÃO CONECTADO'}`,
    `PROTOCOL: ${connection?.protocol ?? 'N/D'}`,
    `LAST ERROR: ${getSharedObdLastError() ?? 'NENHUM'}`,
    `PAIRED DEVICES: ${context.devices.length}`,
    ...context.devices.map((device, index) => `PAIRED ${index + 1}: ${device.name} | ${device.address}`),
    '',
    '--- RAW BLUETOOTH TRACE ---',
    trace || 'NENHUM EVENTO REGISTRADO.',
    '',
    '--- FIM DO RELATÓRIO ---',
  ];
  return lines.join('\n');
}

export async function exportBluetoothDiagnosticTxt(): Promise<BluetoothReportResult> {
  try {
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) return { ok: false, reason: 'CANCELADO' };

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `meriva_bluetooth_diagnostic_${stamp}.txt`;
    const uri = await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      fileName,
      'text/plain',
    );
    await FileSystem.writeAsStringAsync(uri, buildReport(), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return { ok: true, fileName };
  } catch (cause) {
    return {
      ok: false,
      reason: 'ERRO',
      message: cause instanceof Error ? cause.message : String(cause ?? 'DESCONHECIDO'),
    };
  }
}
