import * as FileSystem from 'expo-file-system';
import { getAutoSaveState } from '../meriva/autosaveManager';
import { readDtcs } from '../database/dtcManager';
import { readDriveCycles } from './driveCycleStorage';
import { flushCsvRows } from '../database/csvLogger';
import { redactSensitiveIdentifiers } from './privacyRedaction';
import { isCycleConsumptionValid } from '../data/driveCycles';

function csv(value: unknown): string {
  const text = String(value ?? '');
  return '"' + text.replace(/"/g, '""') + '"';
}

async function ensureExportDir(basePath: string): Promise<string> {
  const dir = `${basePath}/BACKUP/EXPORTS`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  return dir;
}

export async function exportDiagnosticsJson(basePath: string): Promise<string> {
  await flushCsvRows();
  const state = getAutoSaveState();
  const dtcs = await readDtcs(basePath);
  const driveCycles = await readDriveCycles(basePath);
  const dir = await ensureExportDir(basePath);
  const path = `${dir}/diagnostic_${Date.now()}.json`;
  const exportPayload = {
    exportedAt: new Date().toISOString(),
    // O perfil local mantém os dados originais; os identificadores não são necessários no relatório padrão.
    vehicle: state.vehicle ? { ...state.vehicle, vin: undefined } : null,
    obd: {
      ...state.obd,
      adapterName: undefined,
      ecuIdentification: undefined,
      ecuName: undefined,
    },
    lastReadings: state.lastReadings,
    dtcs,
    driveCycles: driveCycles.map((cycle) => {
      const consumptionValid = isCycleConsumptionValid(cycle);
      return {
        ...cycle,
        // Não exportar o sentinela zero nem valores legados como consumo verificado.
        avgFuelConsumptionKml: consumptionValid ? cycle.avgFuelConsumptionKml : null,
        consumptionQuality: consumptionValid
          ? 'VALIDATED'
          : cycle.dataQuality === 'INCOMPLETE'
            ? 'INCOMPLETE'
            : cycle.dataQuality === 'COMPLETE'
              ? 'INCONSISTENT'
              : 'LEGACY_UNVERIFIED',
      };
    }),
    autonomy: state.autonomy,
    sourcePolicy: {
      realObd: 'REAL_OBD',
      importedReference: 'CARSCANNER_SEED',
    },
  };
  const exportedJson = redactSensitiveIdentifiers(JSON.stringify(exportPayload, null, 2));
  await FileSystem.writeAsStringAsync(path, exportedJson, { encoding: FileSystem.EncodingType.UTF8 });
  return path;
}

export async function exportDriveCyclesCsv(basePath: string): Promise<string> {
  await flushCsvRows();
  const cycles = await readDriveCycles(basePath);
  const dir = await ensureExportDir(basePath);
  const path = `${dir}/drive_cycles_${Date.now()}.csv`;
  const header = ['startedAt','finishedAt','distanceKm','fuelUsedL','consumptionKml','source','fuelRateSource','dataQuality','consumptionQuality','incompleteReason'];
  const lines = [
    header.join(','),
    ...cycles.map((cycle) => [
      csv(cycle.startedAt),
      csv(cycle.finishedAt),
      csv(cycle.distanceTotalKm),
      csv(cycle.fuelUsedL),
      csv(isCycleConsumptionValid(cycle) ? cycle.avgFuelConsumptionKml : 'N/D'),
      csv(cycle.source),
      csv(cycle.fuelRateSource),
      csv(cycle.dataQuality ?? 'LEGACY_UNVERIFIED'),
      csv(isCycleConsumptionValid(cycle)
        ? 'VALIDATED'
        : cycle.dataQuality === 'INCOMPLETE'
          ? 'INCOMPLETE'
          : cycle.dataQuality === 'COMPLETE'
            ? 'INCONSISTENT'
            : 'LEGACY_UNVERIFIED'),
      csv(cycle.incompleteReason ?? ''),
    ].join(',')),
  ];
  await FileSystem.writeAsStringAsync(path, lines.join('\n') + '\n', { encoding: FileSystem.EncodingType.UTF8 });
  return path;
}
