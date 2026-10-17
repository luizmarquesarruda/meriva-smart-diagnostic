/**
 * Late-bound access to the native SQLite repository.
 *
 * The app layout injects the actual module before screens/events are used. This
 * avoids importing Expo's native SQLite implementation when Node-only tests
 * load autosave or trip modules, while Metro still bundles a single repository.
 */
type DiagnosticDatabaseApi = typeof import('./diagnosticDatabase');

let configuredApi: DiagnosticDatabaseApi | null = null;

export function configureDiagnosticDatabaseAccess(api: DiagnosticDatabaseApi): void {
  configuredApi = api;
}

function getApi(): DiagnosticDatabaseApi {
  if (!configuredApi) {
    throw new Error('SQLITE_ACCESS_NOT_CONFIGURED');
  }
  return configuredApi;
}

function invoke<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return Promise.resolve(operation());
  } catch (error) {
    return Promise.reject(error);
  }
}

export function recordPidSampleLazy(
  ...args: Parameters<DiagnosticDatabaseApi['recordPidSample']>
): ReturnType<DiagnosticDatabaseApi['recordPidSample']> {
  return invoke(() => getApi().recordPidSample(...args));
}

export function recordTelemetryQueryLazy(
  ...args: Parameters<DiagnosticDatabaseApi['recordTelemetryQuery']>
): ReturnType<DiagnosticDatabaseApi['recordTelemetryQuery']> {
  return invoke(() => getApi().recordTelemetryQuery(...args));
}

export function persistDtcHistoryLazy(
  ...args: Parameters<DiagnosticDatabaseApi['persistDtcHistory']>
): ReturnType<DiagnosticDatabaseApi['persistDtcHistory']> {
  return invoke(() => getApi().persistDtcHistory(...args));
}

export function upsertDriveCycleLazy(
  ...args: Parameters<DiagnosticDatabaseApi['upsertDriveCycle']>
): ReturnType<DiagnosticDatabaseApi['upsertDriveCycle']> {
  return invoke(() => getApi().upsertDriveCycle(...args));
}

export function saveSensorTestRunLazy(
  ...args: Parameters<DiagnosticDatabaseApi['saveSensorTestRun']>
): ReturnType<DiagnosticDatabaseApi['saveSensorTestRun']> {
  return invoke(() => getApi().saveSensorTestRun(...args));
}

export function getDiagnosticDatabaseHealthLazy(
): ReturnType<DiagnosticDatabaseApi['getDiagnosticDatabaseHealth']> {
  return invoke(() => getApi().getDiagnosticDatabaseHealth());
}
