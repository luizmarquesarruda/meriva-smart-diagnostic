import * as FileSystem from 'expo-file-system';
import { appendTxtEntry, parseTxtEntries } from '../database/txtDatabase';

export interface SeedImportState {
  seedVersion: string;
  seedImported: boolean;
  seedImportDate: string;
  pidsImported: number;
  observationsImported: number;
  dtcHistoricalImported: number;
  consumptionReferencesImported: number;
}

const SEED_STATE_FILE = 'MERIVA_SMART_SEED_STATE.json';
const SEED_VERSION = '1.0';

export async function getSeedImportState(basePath: string): Promise<SeedImportState | null> {
  try {
    const stateFile = `${basePath}/CONFIG/${SEED_STATE_FILE}`;
    const info = await FileSystem.getInfoAsync(stateFile);
    if (!info.exists || info.isDirectory) return null;
    const content = await FileSystem.readAsStringAsync(stateFile);
    const state = JSON.parse(content) as Partial<SeedImportState>;
    if (typeof state.seedVersion !== 'string' || typeof state.seedImported !== 'boolean') return null;
    return {
      seedVersion: state.seedVersion,
      seedImported: state.seedImported,
      seedImportDate: typeof state.seedImportDate === 'string' ? state.seedImportDate : '',
      pidsImported: Number(state.pidsImported) || 0,
      observationsImported: Number(state.observationsImported) || 0,
      dtcHistoricalImported: Number(state.dtcHistoricalImported) || 0,
      consumptionReferencesImported: Number(state.consumptionReferencesImported) || 0,
    };
  } catch {
    return null;
  }
}

export async function markSeedAsImported(basePath: string, state: SeedImportState): Promise<void> {
  await FileSystem.makeDirectoryAsync(`${basePath}/CONFIG`, { intermediates: true });
  const stateFile = `${basePath}/CONFIG/${SEED_STATE_FILE}`;
  await FileSystem.writeAsStringAsync(stateFile, JSON.stringify(state, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
}

export async function importCarScannerBaseline(basePath: string, seedContent: string): Promise<SeedImportState> {
  const existingState = await getSeedImportState(basePath);
  if (existingState?.seedImported && existingState.seedVersion === SEED_VERSION) {
    return existingState;
  }

  const entries = parseTxtEntries(seedContent);
  let pidsImported = 0;
  let observationsImported = 0;
  let dtcHistoricalImported = 0;
  let consumptionReferencesImported = 0;

  for (const entry of entries) {
    if (entry.section === 'PID') {
      await appendTxtEntry(basePath, 'carscanner_baseline_pids.txt', entry);
      pidsImported++;
    } else if (entry.section === 'OBSERVATION') {
      await appendTxtEntry(basePath, 'carscanner_baseline_observations.txt', entry);
      observationsImported++;
    } else if (entry.section === 'DTC_HISTORICAL') {
      await appendTxtEntry(basePath, 'dtc_historical.txt', entry);
      dtcHistoricalImported++;
    } else if (entry.section === 'CONSUMPTION_REFERENCE' || entry.section === 'CONSUMPTION_EVENT') {
      await appendTxtEntry(basePath, 'consumption_reference.txt', entry);
      consumptionReferencesImported++;
    }
  }

  const state: SeedImportState = {
    seedVersion: SEED_VERSION,
    seedImported: true,
    seedImportDate: new Date().toISOString(),
    pidsImported,
    observationsImported,
    dtcHistoricalImported,
    consumptionReferencesImported,
  };

  await markSeedAsImported(basePath, state);
  return state;
}

/**
 * O warm start recebe o conteúdo do seed explicitamente.
 * Não depende de um caminho dentro de documentDirectory, que não é uma
 * garantia de acesso ao código-fonte empacotado no Android.
 */
export async function initializeWarmStart(
  basePath: string,
  seedContent?: string,
): Promise<SeedImportState | null> {
  const state = await getSeedImportState(basePath);
  if (state?.seedImported) return state;
  if (!seedContent) return null;
  return importCarScannerBaseline(basePath, seedContent);
}

export async function hasValidSeed(basePath: string): Promise<boolean> {
  const state = await getSeedImportState(basePath);
  return state?.seedImported ?? false;
}
