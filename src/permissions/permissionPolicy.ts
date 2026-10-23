export type RuntimePermissionState = 'GRANTED' | 'DENIED' | 'BLOCKED' | 'UNAVAILABLE';

export interface StartupPermissionStatus {
  bluetooth: RuntimePermissionState;
  location: RuntimePermissionState;
}

/** O Bluetooth é pré-requisito para OBD; a localização é capacidade opcional de GPS/viagens. */
export function canStartObdStartup(status: Pick<StartupPermissionStatus, 'bluetooth'>): boolean {
  return status.bluetooth === 'GRANTED';
}

export function canUseGps(status: Pick<StartupPermissionStatus, 'location'>): boolean {
  return status.location === 'GRANTED';
}
