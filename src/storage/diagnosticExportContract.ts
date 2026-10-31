export const DIAGNOSTIC_EXPORT_SCHEMA_VERSION = 1;
export const DIAGNOSTIC_EXPORT_DATA_TYPE = 'MERIVA_DIAGNOSTIC_EXPORT';

export interface DiagnosticExportPlatform {
  os: string;
  androidRelease?: string;
  apiLevel?: string | number;
  manufacturer?: string;
  model?: string;
}

export interface DiagnosticExportInput {
  exportedAt: string;
  appVersion: string;
  platform: DiagnosticExportPlatform;
  stateSnapshotAt: string;
  vehicle: unknown;
  obd: unknown;
  lastReadings: unknown[];
  dtcs: unknown[];
  driveCycles: unknown[];
  autonomy: unknown;
  maintenance: unknown;
}

/**
 * Stable, explicitly versioned JSON contract for diagnostic exports.
 * Source labels are part of the contract so imported/demo data cannot be
 * mistaken for live ECU evidence by a downstream reader.
 */
export function buildDiagnosticExportDocument(input: DiagnosticExportInput) {
  return {
    schemaVersion: DIAGNOSTIC_EXPORT_SCHEMA_VERSION,
    dataType: DIAGNOSTIC_EXPORT_DATA_TYPE,
    exportedAt: input.exportedAt,
    stateSnapshotAt: input.stateSnapshotAt,
    app: {
      version: input.appVersion,
    },
    platform: input.platform,
    vehicle: input.vehicle,
    obd: input.obd,
    lastReadings: input.lastReadings,
    dtcs: input.dtcs,
    driveCycles: input.driveCycles,
    autonomy: input.autonomy,
    maintenance: input.maintenance,
    sourcePolicy: {
      realObd: 'REAL_OBD',
      importedReference: 'CARSCANNER_SEED',
      baselineReference: 'CARSCANNER_BASELINE',
      simulation: 'SIMULACAO',
      unknownOrExternal: 'IMPORTADO',
      rule: 'Sources must not be promoted or reclassified during export.',
    },
  };
}
