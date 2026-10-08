import * as TaskManager from 'expo-task-manager';
import type * as Location from 'expo-location';
import { BACKGROUND_LOCATION_TASK_NAME } from './backgroundLocation';
import { gpsTracker } from './gpsTracker';

TaskManager.defineTask(BACKGROUND_LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) {
    gpsTracker.setBackgroundTaskError(error.message ?? 'ERRO NO SERVIÇO GPS EM SEGUNDO PLANO.');
    return;
  }

  const payload = data as { locations?: Location.LocationObject[] } | undefined;
  const locations = payload?.locations ?? [];
  for (const location of locations) {
    gpsTracker.handleLocation(location);
  }
});
