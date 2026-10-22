import { estimateRangeFromFuelLevel } from './fuelLevel';

export interface CurrentAutonomyInput {
  ecuConnected: boolean;
  tripConnected: boolean;
  fuelLevelSupported: boolean;
  fuelLevelPercent: number | null;
  tripConsumptionKml: number | null;
  averageConsumptionKml: number;
}

/**
 * Return the range supported by the current ECU session, or null when the
 * fuel-level evidence is unavailable. Persisted range history is not current range.
 */
export function getCurrentAutonomyRangeKm(input: CurrentAutonomyInput): number | null {
  if (!input.ecuConnected || !input.tripConnected || !input.fuelLevelSupported) return null;

  const consumptionKml = input.tripConsumptionKml != null
    && Number.isFinite(input.tripConsumptionKml)
    && input.tripConsumptionKml > 0
    ? input.tripConsumptionKml
    : input.averageConsumptionKml;

  return estimateRangeFromFuelLevel(input.fuelLevelPercent, consumptionKml);
}
