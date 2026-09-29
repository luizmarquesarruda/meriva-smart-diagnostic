import * as FileSystem from 'expo-file-system';
import { appendTxtEntry, TxtEntry, parseTxtEntries } from '../database/txtDatabase';

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
    if (!info.exists) return null;
    const content = await FileSystem.readAsStringAsync(stateFile);
    return JSON.parse(content) as SeedImportState;
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

export async function initializeWarmStart(basePath: string): Promise<void> {
  const state = await getSeedImportState(basePath);
  if (state?.seedImported) return;

  try {
    const seedPath = `${FileSystem.documentDirectory}../src/data/meriva_carscanner_baseline.txt`;
    const info = await FileSystem.getInfoAsync(seedPath);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(seedPath);
      await importCarScannerBaseline(basePath, content);
    }
  } catch (error) {
    console.warn('Could not auto-import baseline seed:', error instanceof Error ? error.message : 'unknown error');
  }
}

export async function hasValidSeed(basePath: string): Promise<boolean> {
  const state = await getSeedImportState(basePath);
  return state?.seedImported ?? false;
}
