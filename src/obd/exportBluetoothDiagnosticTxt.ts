import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getLastBluetoothDiagnosticText } from '../obd/bluetoothManager';
import { getSharedObdConnection, getSharedObdLastError, getSharedObdDiagnosticContext } from '../obd/sharedConnection';
import { readLearningProfile, type MerivaLearningProfile } from '../database/learningProfile';
import { getAutoSaveState } from '../meriva/autosaveManager';
import { normalizeDiagnosticSource, runLocalDiagnostic, type DiagnosticResult } from '../diagnostics/diagnosticEngine';
import type { PidObservation } from '../types/sourceTypes';
import { extractLastTraceFailure, redactBluetoothAddresses, resolveAndroidModel } from './diagnosticReportUtils';

async function readCurrentLearningProfile(): Promise<MerivaLearningProfile | null> {
  const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
  return readLearningProfile(basePath);
}

function diagnosticReportLines(result: DiagnosticResult): string[] {
  const lines = [
    '--- DIAGNÓSTICO LOCAL / MOTOR DE EVIDÊNCIAS ---',
    `MOTOR: ${result.engine}`,
    `VERSÃO: ${result.version}`,
    `AMOSTRAS REAIS ACEITAS (FINITAS, PLAUSÍVEIS E RECENTES): ${result.acceptedLiveSamples}`,
    `AMOSTRAS DE SIMULAÇÃO BLOQUEADAS: ${result.blockedSimulationSamples}`,
    `AMOSTRAS DE ORIGEM NÃO AO VIVO BLOQUEADAS: ${result.blockedNonLiveSamples}`,
    `AMOSTRAS ANTIGAS/FUTURAS BLOQUEADAS: ${result.blockedStaleSamples}`,
    `AMOSTRAS INVÁLIDAS/IMPLAUSÍVEIS BLOQUEADAS: ${result.blockedInvalidSamples}`,
  ];
  if (result.hypotheses.length === 0) {
    lines.push('NENHUMA HIPÓTESE DIAGNÓSTICA GERADA COM AS EVIDÊNCIAS DISPONÍVEIS.');
  }
  for (const hypothesis of result.hypotheses) {
    lines.push(`HIPÓTESE: ${hypothesis.label}`);
    lines.push(`NÍVEL QUALITATIVO: ${hypothesis.confidence} | PONTUAÇÃO HEURÍSTICA: ${Math.round(hypothesis.score * 100)}/100 (NÃO É PROBABILIDADE)`);
    for (const evidence of hypothesis.evidence) {
      lines.push(`  EVIDÊNCIA: ${evidence.text}`);
    }
    for (const nextTest of hypothesis.nextTests) {
      lines.push(`  PRÓXIMO TESTE: ${nextTest}`);
    }
  }
  lines.push(`NOTA: ${result.disclaimer}`);
  return lines;
}

function buildLocalDiagnostic(): DiagnosticResult {
  const state = getAutoSaveState();
  const observations: PidObservation[] = state.lastReadings.map((reading) => ({
    pid: reading.pid,
    name: reading.name,
    value: reading.value,
    unit: reading.unit,
    source: normalizeDiagnosticSource(reading.source),
    timestamp: reading.timestamp,
    confidence: reading.source === 'SIMULACAO' ? 'LOW' : 'GOOD',
  }));
  return runLocalDiagnostic({ observations, dtcs: state.dtcs, condition: 'UNKNOWN' });
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

export type BluetoothDiagnosticReportMode = 'TECHNICAL' | 'SHAREABLE';

function platformConstant(name: string): string {
  const constants = (Platform as unknown as { constants?: Record<string, unknown> }).constants;
  const value = constants?.[name];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : 'N/D';
}

export async function buildBluetoothDiagnosticReport(
  mode: BluetoothDiagnosticReportMode = 'TECHNICAL',
): Promise<string> {
  const connection = getSharedObdConnection();
  const context = getSharedObdDiagnosticContext();
  const trace = connection?.getDiagnosticsText() || context.trace || getLastBluetoothDiagnosticText();
  const traceFailure = extractLastTraceFailure(trace);
  const sharedError = getSharedObdLastError();
  const learningProfile = await readCurrentLearningProfile();
  const localDiagnostic = buildLocalDiagnostic();
  const manufacturer = platformConstant('Manufacturer');
  const model = resolveAndroidModel(
    (Platform as unknown as { constants?: Record<string, unknown> }).constants?.Model,
  ) ?? 'N/D';
  const androidRelease = platformConstant('Release');
  const lines = [
    'MERIVA SMART',
    'BLUETOOTH CLASSIC / ELM327 DIAGNOSTIC REPORT',
    'REPORT SCHEMA: 2',
    `EXPORT MODE: ${mode === 'TECHNICAL' ? 'TECHNICAL_FULL' : 'SHAREABLE_REDACTED'}`,
    '',
    `DATA: ${new Date().toISOString()}`,
    `APP VERSION: ${Constants.expoConfig?.version ?? 'N/D'}`,
    `PLATFORM: ${Platform.OS}`,
    `DEVICE MANUFACTURER: ${manufacturer}`,
    `DEVICE MODEL: ${model}`,
    `ANDROID RELEASE: ${androidRelease}`,
    `ANDROID API: ${Platform.OS === 'android' ? Platform.Version : 'N/D'}`,
    `ELM DEVICE: ${connection ? `${connection.device.name} | ${connection.device.address}` : 'NÃO CONECTADO'}`,
    `PROTOCOL: ${connection?.protocol ?? 'N/D'}`,
    `LAST ERROR: ${traceFailure?.error ?? sharedError ?? 'NENHUM'}`,
    `LAST ERROR SOURCE: ${traceFailure ? 'RAW_BLUETOOTH_TRACE' : sharedError ? 'SHARED_CONNECTION_STATE' : 'NONE'}`,
    `LAST ERROR EVENT: ${traceFailure?.event ?? 'N/D'}`,
    `LAST ERROR AT: ${traceFailure?.timestamp ?? 'N/D'}`,
    `SHARED CONNECTION ERROR: ${sharedError ?? 'NENHUM'}`,
    `PAIRED DEVICES: ${context.devices.length}`,
    ...context.devices.map((device, index) => `PAIRED ${index + 1}: ${device.name} | ${device.address}`),
    '',
    ...learningReportLines(learningProfile),
    '',
    ...diagnosticReportLines(localDiagnostic),
    '',
    '--- RAW BLUETOOTH TRACE ---',
    trace || 'NENHUM EVENTO REGISTRADO.',
    '',
    '--- FIM DO RELATÓRIO ---',
  ];
  const report = lines.join('\n');
  return mode === 'SHAREABLE' ? redactBluetoothAddresses(report) : report;
}

export async function exportBluetoothDiagnosticTxt(
  mode: BluetoothDiagnosticReportMode = 'TECHNICAL',
): Promise<BluetoothReportResult> {
  try {
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) return { ok: false, reason: 'CANCELADO' };

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const suffix = mode === 'TECHNICAL' ? 'technical' : 'shareable';
    const fileName = `meriva_bluetooth_diagnostic_${suffix}_${stamp}.txt`;
    const uri = await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      fileName,
      'text/plain',
    );
    await FileSystem.writeAsStringAsync(uri, await buildBluetoothDiagnosticReport(mode), {
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
