// MERIVA SMART DIAGNOSTIC — Exportação manual do salvamento (.TXT)
// Arquivo para copiar em: <repo>/src/meriva/exportAutoSaveTxt.ts
//
// Autosave é interno e automático; a exportação TXT é a ÚNICA ação manual.
// Usa StorageAccessFramework (expo-file-system) — sem dependência nova.

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import type { MerivaPersistedState } from './autosaveState';
import { formatAutoSaveTxt } from './autosaveTxtFormatter';
import { appendAutoSaveHistory, AUTOSAVE_HISTORY_FILE, readAutoSaveHistory } from './autosaveHistoryTxt';

export { ND } from './autosaveTxtFormatter';

export interface ExportTxtResult {
  ok: boolean;
  fileName?: string;
  uri?: string;
  reason?: 'CANCELADO' | 'ERRO' | 'INDISPONIVEL';
  message?: string;
}

/** Exportação manual: o usuário escolhe a pasta; o app cria o .txt lá. */
export async function exportAutoSaveTxt(
  state: MerivaPersistedState,
  appVersion: string,
): Promise<ExportTxtResult> {
  if (Platform.OS !== 'android') {
    return { ok: false, reason: 'INDISPONIVEL', message: 'EXPORTACAO DISPONIVEL SOMENTE NO ANDROID' };
  }
  try {
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) return { ok: false, reason: 'CANCELADO' };

    const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
    let content = await readAutoSaveHistory(basePath);
    if (!content.includes('=== SALVAMENTO_BEGIN ===')) {
      await appendAutoSaveHistory(basePath, state, appVersion, 'manual');
      content = await readAutoSaveHistory(basePath);
    }

    const fileName = AUTOSAVE_HISTORY_FILE;
    const existing = (await FileSystem.StorageAccessFramework.readDirectoryAsync(permissions.directoryUri))
      .find((uri) => uri.endsWith('/' + fileName) || uri.endsWith('%2F' + fileName));
    const uri = existing ?? await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      fileName,
      'text/plain',
    );
    await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
    return { ok: true, fileName, uri };
  } catch (cause) {
    return {
      ok: false,
      reason: 'ERRO',
      message: cause instanceof Error ? cause.message : 'DESCONHECIDO',
    };
  }
}

/** Exporta o diário por data sem misturá-lo aos snapshots de autosave. */
export async function exportDailyObdHistoryTxt(): Promise<ExportTxtResult> {
  if (Platform.OS !== 'android') {
    return { ok: false, reason: 'INDISPONIVEL', message: 'EXPORTAÇÃO DISPONÍVEL SOMENTE NO ANDROID' };
  }
  try {
    const basePath = \`\${FileSystem.documentDirectory}MERIVA_SMART\`;
    const dailyPath = \`\${basePath}/VIAGENS/meriva_smart_daily_obd_history.txt\`;
    const info = await FileSystem.getInfoAsync(dailyPath);
    if (!info.exists || info.isDirectory) {
      return { ok: false, reason: 'ERRO', message: 'AINDA NÃO HÁ SESSÕES ECU NO HISTÓRICO DIÁRIO' };
    }
    const content = await FileSystem.readAsStringAsync(dailyPath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) return { ok: false, reason: 'CANCELADO' };

    const fileName = 'meriva_smart_daily_obd_history.txt';
    const existing = (await FileSystem.StorageAccessFramework.readDirectoryAsync(permissions.directoryUri))
      .find((uri) => uri.endsWith('/' + fileName) || uri.endsWith('%2F' + fileName));
    const uri = existing ?? await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      fileName,
      'text/plain',
    );
    await FileSystem.writeAsStringAsync(uri, content, { encoding: FileSystem.EncodingType.UTF8 });
    return { ok: true, fileName, uri };
  } catch (cause) {
    return {
      ok: false,
      reason: 'ERRO',
      message: cause instanceof Error ? cause.message : 'DESCONHECIDO',
    };
  }
}
