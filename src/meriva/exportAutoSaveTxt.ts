// MERIVA SMART DIAGNOSTIC — Exportação manual do salvamento (.TXT)
// Arquivo para copiar em: <repo>/src/meriva/exportAutoSaveTxt.ts
//
// Autosave é interno e automático; a exportação TXT é a ÚNICA ação manual.
// Usa StorageAccessFramework (expo-file-system) — sem dependência nova.

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import type { MerivaPersistedState } from './autosaveState';
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
  selectedDate?: string,
): Promise<ExportTxtResult> {
  if (Platform.OS !== 'android') {
    return { ok: false, reason: 'INDISPONIVEL', message: 'EXPORTACAO DISPONIVEL SOMENTE NO ANDROID' };
  }
  try {
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) return { ok: false, reason: 'CANCELADO' };

    const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
    let content = await readAutoSaveHistory(basePath, selectedDate);
    if (!content.includes('========== DIA:')) {
      if (selectedDate) {
        return { ok: false, reason: 'ERRO', message: 'NÃO HÁ RELATÓRIO SALVO PARA A DATA SELECIONADA' };
      }
      await appendAutoSaveHistory(basePath, state, appVersion, 'manual');
      content = await readAutoSaveHistory(basePath);
    }

    const fileName = selectedDate ? `meriva_diagnostico_${selectedDate}.txt` : AUTOSAVE_HISTORY_FILE;
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