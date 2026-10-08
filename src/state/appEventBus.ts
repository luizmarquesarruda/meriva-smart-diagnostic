export type AppEventType =
  | 'AUTOSAVE_UPDATED'
  | 'BLUETOOTH_STATUS_CHANGED'
  | 'OBD_TELEMETRY_UPDATED'
  | 'DTC_UPDATED'
  | 'TRIP_UPDATED'
  | 'LEARNING_UPDATED'
  | 'VEHICLE_UPDATED';

export interface AppEvent {
  type: AppEventType;
  pid?: string;
  timestamp: string;
}

type Listener = (event: AppEvent) => void;
const listeners = new Set<Listener>();

export function emitAppEvent(type: AppEventType, details: Omit<AppEvent, 'type' | 'timestamp'> = {}): void {
  const event: AppEvent = { type, timestamp: new Date().toISOString(), ...details };
  for (const listener of listeners) listener(event);
}

export function subscribeAppEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
