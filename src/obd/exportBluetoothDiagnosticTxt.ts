import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getLastBluetoothDiagnosticText } from '../obd/bluetoothManager';
import { getSharedObdConnection, getSharedObdLastError, getSharedObdDiagnosticContext } from '../obd/sharedConnection';
import { readLearningProfile, type MerivaLearningProfile } from '../database/learningProfile';

async function readCurrentLearningProfile(): Promise<MerivaLearningProfile | null> {
  const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
  return readLearningProfile(basePath);
}

function extractLastTraceError(trace: string): string | null {
  const lines = trace.split('\n');
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line.includes('BLUETOOTH_ATTEMPT_RESULT') && line.includes('"result":"FAILURE"')) {
      const match = line.match(/"error":"((?:\\.|[^"\\])*)"/);
      if (match?.[1]) {
        try { return JSON.parse('"' + match[1] + '"'); } catch { return match[1]; }
      }
    }
    if (line.includes('ELM_SESSION_FAILURE') || line.includes('CONNECT_FAILURE')) {
      const match = line.match(/"error":"((?:\\.|[^"\\])*)"/);
      if (match?.[1]) {
        try { return JSON.parse('"' + match[1] + '"'); } catch { return match[1]; }
      }
    }
  }
  return null;
}

function learningReportLines(profile: MerivaLearningProfile | null): string[] {
  if (!profile) return ['APRENDIZADO: PERFIL NÃO DISPONÍVEL.'];
  const lines = [
    '--- O QUE O APLICATIVO APRENDEU ---',
    `STATUS: ${profile.learningStatus}`,
    `FONTE: ${profile.source}`,
    `SEED CARSCANNER: ${profile.seedVersion}`,
    `AMOSTRAS SEED: ${profile.globalSampleCounts.seedSamples}`,
    `AMOSTRAS REAIS: ${profile.globalSampleCounts.realSamples}`,
    `AMOSTRAS TOTAIS: ${profile.globalSampleCounts.totalSamples}`,
    `ÚLTIMA ATUALIZAÇÃO: ${profile.lastUpdated}`,
    `PESO DO SEED: ${profile.seedWeight}`,
    `SIMULAÇÕES DETECTADAS: ${profile.dataContamination.simulationDetected}`,
    `SIMULAÇÕES FILTRADAS: ${profile.dataContamination.simulationFiltered}`,
  ];

  for (const context of profile.contextualData) {
    lines.push(`CONDIÇÃO: ${context.condition} | AMOSTRAS: ${context.sampleCount} | ATUALIZAÇÃO: ${context.lastUpdate}`);
    for (const [pid, stats] of Object.entries(context.statistics)) {
      lines.push(
        `  PID ${pid} | MÉDIA: ${stats.mean} | MIN: ${stats.min} | MAX: ${stats.max} | ` +
        `DESVIO: ${stats.stddev} | AMOSTRAS: ${stats.samples} | REAIS: ${stats.realSamples} | ` +
        `SEED: ${stats.seedSamples} | CONFIANÇA: ${stats.confidence} | FONTE: ${stats.source.join(',')}`,
      );
    }
  }
  if (profile.contextualData.length === 0) lines.push('NENHUM DADO APRENDIDO AINDA.');
  return lines;
}

export interface BluetoothReportResult {
  ok: boolean;
  fileName?: string;
  reason?: 'CANCELADO' | 'ERRO';
  message?: string;
}

async function buildReport(): Promise<string> {
  const connection = getSharedObdConnection();
  const context = getSharedObdDiagnosticContext();
  const trace = connection?.getDiagnosticsText() || context.trace || getLastBluetoothDiagnosticText();
  const learningProfile = await readCurrentLearningProfile();
  const lines = [
    'MERIVA SMART',
    'BLUETOOTH CLASSIC / ELM327 DIAGNOSTIC REPORT',
    '',
    `DATA: ${new Date().toISOString()}`,
    `APP VERSION: ${Constants.expoConfig?.version ?? 'N/D'}`,
    `PLATFORM: ${Platform.OS} ${Platform.Version}`,
    `DEVICE: ${Constants.deviceName ?? 'N/D'}`,
    `ELM DEVICE: ${connection ? `${connection.device.name} | ${connection.device.address}` : 'NÃO CONECTADO'}`,
    `PROTOCOL: ${connection?.protocol ?? 'N/D'}`,
    `LAST ERROR: ${getSharedObdLastError() ?? extractLastTraceError(trace) ?? 'NENHUM'}`,
    `PAIRED DEVICES: ${context.devices.length}`,
    ...context.devices.map((device, index) => `PAIRED ${index + 1}: ${device.name} | ${device.address}`),
    '',
    ...learningReportLines(learningProfile),
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
    await FileSystem.writeAsStringAsync(uri, await buildReport(), {
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
