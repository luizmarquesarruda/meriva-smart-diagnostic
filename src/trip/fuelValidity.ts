/**
 * Shared validity rules for trip fuel reporting and aggregation.
 * Invalid/missing fuel telemetry is not a measured consumption value.
 */
export interface TripFuelValidityInput {
  source: string;
  distanceTotalKm: number;
  fuelUsedL: number;
  avgFuelConsumptionKml: number;
  fuelDataValid?: boolean;
}

import { MAX_PLAUSIBLE_CONSUMPTION_KML } from '../obd/fuelConsumption';

export const MIN_RELIABLE_TRIP_FUEL_L = 0.05;
export const MAX_RELIABLE_CONSUMPTION_KML = MAX_PLAUSIBLE_CONSUMPTION_KML;

export function isReliableTripFuelConsumption(cycle: TripFuelValidityInput): boolean {
  return cycle.source === 'REAL_OBD'
    && cycle.fuelDataValid === true
    && Number.isFinite(cycle.distanceTotalKm)
    && cycle.distanceTotalKm >= 0.1
    && Number.isFinite(cycle.fuelUsedL)
    && cycle.fuelUsedL >= MIN_RELIABLE_TRIP_FUEL_L
    && Number.isFinite(cycle.avgFuelConsumptionKml)
    && cycle.avgFuelConsumptionKml > 0
    && cycle.avgFuelConsumptionKml <= MAX_RELIABLE_CONSUMPTION_KML;
}
