// MERIVA SMART DIAGNOSTIC — Formatador TXT do salvamento (módulo puro)
// Arquivo para copiar em: <repo>/src/meriva/autosaveTxtFormatter.ts
//
// Valores ausentes aparecem como N/D. Nunca são preenchidos com ficção.
// Seeds aparecem sempre com o rótulo da sua fonte (CARSCANNER_SEED etc.).

import type { MerivaPersistedState } from './autosaveState';
import { AUTOSAVE_SCHEMA_VERSION } from './autosaveTypes';
import { getDtcDefinition } from '../obd/dtcDefinition';
import { MAX_VALID_TRIP_CONSUMPTION_KML } from '../trip/tripRecorder';

export const ND = 'N/D';

function or(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return ND;
  return String(value);
}

function formatNumber(value: number, maxDecimals = 2): string {
  if (!Number.isFinite(value)) return ND;
  return Number(value.toFixed(maxDecimals)).toString();
}

export interface ExportTxtOptions {
  appVersion: string;
  exportedAt: string;
  /** When set, include only the newest N REAL_OBD trips. */
  historyLimit?: number;
  /** Reduce repeated autosave snapshots; the full state remains in autosave.json. */
  compact?: boolean;
}

export function formatAutoSaveTxt(state: MerivaPersistedState, options: ExportTxtOptions): string {
  const L: string[] = [];

  L.push('MERIVA SMART DIAGNOSTIC');
  L.push('SAVE EXPORT');
  L.push('========================');
  L.push(`Schema: ${AUTOSAVE_SCHEMA_VERSION}`);
  L.push(`App Version: ${or(options.appVersion)}`);
  L.push(`Exported At: ${options.exportedAt}`);
  L.push(`Saved At: ${or(state.metadata?.savedAt)}`);
  L.push('');

  L.push('[VEHICLE]');
  L.push(`Marca: ${or(state.vehicle?.make)}`);
  L.push(`Modelo: ${or(state.vehicle?.model)}`);
  L.push(`Motor: ${or(state.vehicle?.engine)}`);
  L.push(`Ano: ${or(state.vehicle?.year)}`);
  L.push(`VIN: ${or(state.vehicle?.vin)}`);
  L.push('');

  L.push('[OBD]');
  L.push(`Status: ${state.obd?.connected ? 'CONECTADO' : 'DESCONECTADO'}`);
  L.push(`Adaptador: ${or(state.obd?.adapterName)}`);
  L.push(`Protocolo: ${or(state.obd?.protocol)}`);
  L.push(`Último protocolo conhecido: ${or(state.obd?.lastKnownProtocol)}`);
  L.push(`ECU: ${or(state.obd?.ecuAddress)}`);
  L.push(`Identificação ECU: ${or(state.obd?.ecuIdentification)}`);
  L.push(`Nome ECU: ${or(state.obd?.ecuName)}`);
  L.push(`ECU validada em: ${or(state.obd?.ecuValidatedAt)}`);
  L.push(`Fonte da validação ECU: ${or(state.obd?.ecuValidationSource)}`);
  L.push(`Validações: ${or(state.obd?.ecuValidationChecks?.join(', '))}`);
  L.push('');

  L.push('[LAST READINGS]');
  const readings = options.compact ? state.lastReadings.slice(0, 10) : state.lastReadings;
  if (options.compact && state.lastReadings.length > readings.length) {
    L.push(`Exibindo as ${readings.length} leituras mais recentes; todas permanecem no autosave JSON.`);
  }
  if (readings.length) {
    for (const reading of readings) {
      const value =
        reading.value === null || reading.value === undefined
          ? ND
          : `${formatNumber(reading.value, 2)} ${reading.unit}`;
      L.push(`${reading.pid} ${reading.name}: ${value} [${reading.status}] fonte=${reading.source} ${reading.timestamp}`);
    }
  } else {
    L.push(ND);
  }
  L.push('');

  L.push('[DTC]');
  const dtcs = options.compact ? state.dtcs.slice(-8) : state.dtcs;
  if (options.compact && state.dtcs.length > dtcs.length) {
    L.push(`Exibindo os ${dtcs.length} DTCs mais recentes; histórico completo permanece no autosave JSON.`);
  }
  if (dtcs.length) {
    for (const dtc of dtcs) {
      const dtcDefinition = getDtcDefinition(dtc.code);
      L.push(
        `${dtc.code} status=${dtc.status} ocorrencias=${dtc.occurrences} fonte=${dtc.source} primeira=${dtc.firstSeen} ultima=${dtc.lastSeen} descricao=${or(dtcDefinition?.description)}`,
      );
      if (dtcDefinition?.likelyCauses?.length) L.push(`  Causas provaveis: ${dtcDefinition.likelyCauses.join('; ')}`);
      if (dtc.freezeFrame) {
        L.push(`  FreezeFrame frame=${dtc.freezeFrame.frame} rpm=${or(dtc.freezeFrame.rpm)} coolantC=${or(dtc.freezeFrame.coolantC)}`);
      }
    }
  } else {
    L.push(ND);
  }
  L.push('');

  L.push('[HISTORY]');
  const displayedCycles = options.historyLimit == null
    ? state.driveCycles.filter((cycle) => cycle.source !== 'CARSCANNER_SEED')
    : options.historyLimit <= 0
      ? []
      : state.driveCycles
          .filter((cycle) => cycle.source === 'REAL_OBD')
          .slice(-Math.floor(options.historyLimit));
  if (options.historyLimit != null) {
    L.push(`Exibindo até as últimas ${Math.max(0, Math.floor(options.historyLimit))} viagens reais; histórico completo preservado no autosave JSON.`);
  }
  if (displayedCycles.length) {
    for (const cycle of displayedCycles) {
      L.push(
        `${cycle.startedAt} -> ${cycle.finishedAt} | ${formatNumber(cycle.distanceTotalKm, 3)} km | ${formatNumber(cycle.fuelUsedL, 3)} L | ${(cycle.fuelDataValid === false || cycle.fuelUsedL < 0.05 || cycle.avgFuelConsumptionKml <= 0 || cycle.avgFuelConsumptionKml > MAX_VALID_TRIP_CONSUMPTION_KML) ? ND : `${formatNumber(cycle.avgFuelConsumptionKml, 2)} km/L`} | fonte=${cycle.source} | combustivel=${or(cycle.fuelRateSource)}`,
      );
    }
  } else {
    L.push(ND);
  }
  L.push('');

  L.push('[LEARNING]');
  if (state.learning) {
    L.push(`Status: ${or(state.learning.learningStatus)}`);
    L.push(`Atualizado: ${or(state.learning.lastUpdated)}`);
    L.push(
      `Amostras reais: ${or(state.learning.globalSampleCounts?.realSamples)} / seed: ${or(state.learning.globalSampleCounts?.seedSamples)}`,
    );
    if (options.compact) {
      L.push('Detalhes de estatísticas por contexto preservados no autosave JSON.');
    } else if (state.learning.contextualData?.length) {
      for (const context of state.learning.contextualData) {
        L.push(`Contexto ${context.condition} (amostras: ${context.sampleCount}):`);
        for (const [pidName, stat] of Object.entries(context.statistics)) {
          L.push(
            `  ${pidName}: media=${Number(stat.mean.toFixed(2))} min=${Number(stat.min.toFixed(2))} max=${Number(stat.max.toFixed(2))} confianca=${stat.confidence}`,
          );
        }
      }
    } else {
      L.push('Padroes por contexto: N/D');
    }
  } else {
    L.push(ND);
  }
  L.push('');

  L.push('[SETTINGS]');
  const allSettings = Object.entries(state.settings ?? {});
  const settings = options.compact ? allSettings.slice(0, 8) : allSettings;
  if (settings.length) {
    for (const [key, value] of settings) {
      L.push(`${key}: ${or(value)}`);
    }
    if (options.compact && allSettings.length > settings.length) {
      L.push(`Mais ${allSettings.length - settings.length} configurações preservadas no autosave JSON.`);
    }
  } else {
    L.push(ND);
  }

  return `${L.join('\n')}\n`;
}