// MERIVA SMART DIAGNOSTIC — Formatador TXT do salvamento (módulo puro)
// Arquivo para copiar em: <repo>/src/meriva/autosaveTxtFormatter.ts
//
// Valores ausentes aparecem como N/D. Nunca são preenchidos com ficção.
// Seeds aparecem sempre com o rótulo da sua fonte (CARSCANNER_SEED etc.).

import type { MerivaPersistedState } from './autosaveState';
import { AUTOSAVE_SCHEMA_VERSION } from './autosaveTypes';
import { getDtcDefinition } from '../obd/dtcDefinition';
import { getAppBuildInfo } from './buildInfo';
import { redactSensitiveText } from './redaction';

export const ND = 'N/D';

function or(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === '') return ND;
  return String(value);
}

export interface ExportTxtOptions {
  appVersion: string;
  exportedAt: string;
  /** When set, include only the newest N REAL_OBD trips in a compact snapshot. */
  historyLimit?: number;
  /** Remove VIN, ECU ID, adapter name and MAC before sharing. */
  shared?: boolean;
}

export function formatAutoSaveTxt(state: MerivaPersistedState, options: ExportTxtOptions): string {
  const L: string[] = [];

  const build = state.metadata?.buildInfo ?? getAppBuildInfo();
  L.push('MERIVA SMART DIAGNOSTIC');
  L.push('SAVE EXPORT');
  L.push('========================');
  L.push(`Schema: ${AUTOSAVE_SCHEMA_VERSION}`);
  L.push('Export Version: 1');
  L.push(`App Version: ${or(options.appVersion || build.appVersion)}`);
  L.push(`Exported At: ${options.exportedAt}`);
  L.push(`Saved At: ${or(state.metadata?.savedAt)}`);
  L.push('[BUILD]');
  L.push(`SHA: ${or(build.gitSha)}`);
  L.push(`Branch: ${or(build.branch)}`);
  L.push(`Version Code: ${or(build.versionCode)}`);
  L.push(`Build Date: ${or(build.buildDate)}`);
  L.push(`Device Model: ${or(build.deviceModel)}`);
  L.push(`Android Version: ${or(build.androidVersion)}`);
  L.push('');

  L.push('[VEHICLE]');
  L.push(`Marca: ${or(state.vehicle?.make)}`);
  L.push(`Modelo: ${or(state.vehicle?.model)}`);
  L.push(`Motor: ${or(state.vehicle?.engine)}`);
  L.push(`Ano: ${or(state.vehicle?.year)}${state.vehicle?.yearConfirmed ? ' (CONFIRMADO)' : ' (PADRÃO NÃO CONFIRMADO)'}`);
  L.push(`Referência de ano: ${or(state.vehicle?.modelYearReference)}`);
  L.push(`Ano confirmado: ${state.vehicle?.yearConfirmed ? 'SIM' : 'NÃO'}`);
  L.push(`Combustível compatível: ${or(state.vehicle?.fuel)}`);
  L.push(`Tipo de injeção: ${or(state.vehicle?.injectionType)}`);
  L.push(`Capacidade do tanque: ${or(state.vehicle?.tankCapacityL)} L`);
  L.push(`Reserva aproximada: ${or(state.vehicle?.reserveCapacityL)} L`);
  L.push(`VIN: ${options.shared ? '[REDACTED]' : or(state.vehicle?.vin)}`);
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
  if (state.lastReadings.length) {
    for (const reading of state.lastReadings) {
      const value =
        reading.value === null || reading.value === undefined
          ? ND
          : `${reading.value} ${reading.unit}`;
      const timestampMs = Date.parse(reading.timestamp);
      const ageMs = Number.isFinite(timestampMs) ? Math.max(0, Date.now() - timestampMs) : null;
      const quality = reading.status !== 'RESPONDEU' || reading.value == null
        ? 'ERROR' : ageMs != null && ageMs <= 10_000 ? 'FRESH' : 'STALE';
      const dataSource = reading.dataSource ?? (reading.source === 'REAL' ? 'REAL' : 'SIMULADO');
      L.push(`${reading.pid} ${reading.name}: ${value} status=${reading.status} data_source=${dataSource} timestamp=${reading.timestamp} monotonic_ms=${or(reading.monotonicMs)} age_ms=${or(ageMs)} quality=${quality}`);
    }
  } else {
    L.push(ND);
  }
  L.push('');

  L.push('[DTC]');
  if (state.dtcs.length) {
    for (const dtc of state.dtcs) {
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
        `${cycle.startedAt} -> ${cycle.finishedAt} | ${cycle.distanceTotalKm} km | ${cycle.fuelUsedL} L | ${(cycle.fuelDataValid === false || cycle.fuelUsedL < 0.05 || cycle.avgFuelConsumptionKml <= 0) ? ND : `${cycle.avgFuelConsumptionKml} km/L`} | fonte=${cycle.source} | combustivel=${or(cycle.fuelRateSource)}`,
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
    if (state.learning.contextualData?.length) {
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
  const settings = Object.entries(state.settings ?? {});
  if (settings.length) {
    for (const [key, value] of settings) {
      L.push(`${key}: ${or(value)}`);
    }
  } else {
    L.push(ND);
  }

  const output = `${L.join('\n')}\n`;
  return options.shared ? redactSensitiveText(output) : output;
}