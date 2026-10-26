import type { FuelingRecord } from '../database/maintenanceStorage';
import type { DriveCycle } from '../data/driveCycles';
import { TANK_CAPACITY_L } from './fuelLevel';
import { MIN_TRIP_FUEL_L } from './tripRecorder';

export interface ActiveFuelBalanceTrip {
  active: boolean;
  startedAtMs: number | null;
  distanceKm: number;
  fuelUsedL: number;
  fuelDataValid: boolean;
}

export interface FuelBalanceEstimate {
  remainingFuelL: number;
  fuelUsedSinceFullTankL: number;
  baselineAt: string;
  baselineOdometerKm: number;
  tripsCount: number;
  partialFuelingsCount: number;
}

export interface FuelBalanceInput {
  fuelings: readonly FuelingRecord[];
  trips: readonly DriveCycle[];
  activeTrip?: ActiveFuelBalanceTrip;
  currentOdometerKm?: number | null;
  tankCapacityL?: number;
}

/**
 * Estimate remaining fuel from the last driver-confirmed full tank.
 * This fallback is only trustworthy if every drive since that baseline was
 * recorded with valid fuel integration. It never invents a baseline from a
 * partial fill or an invalid trip.
 */
export function estimateFuelRemainingFromFullTank(input: FuelBalanceInput): FuelBalanceEstimate | null {
  const capacity = input.tankCapacityL ?? TANK_CAPACITY_L;
  if (!Number.isFinite(capacity) || capacity <= 0 || capacity > 200) return null;

  const fullTankRecords = input.fuelings
    .filter((item) => item.fullTank === true
      && Number.isFinite(Date.parse(item.occurredAt))
      && Number.isFinite(item.odometerKm) && item.odometerKm >= 0
      && Number.isFinite(item.liters) && item.liters > 0)
    .slice()
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  const baseline = fullTankRecords[fullTankRecords.length - 1];
  if (!baseline || baseline.liters > capacity + 1) return null;
  const baselineAtMs = Date.parse(baseline.occurredAt);

  if (input.currentOdometerKm != null &&
      (!Number.isFinite(input.currentOdometerKm) || input.currentOdometerKm < 0)) return null;

  const partialFuelings = input.fuelings
    .filter((item) => Date.parse(item.occurredAt) > baselineAtMs && item.fullTank !== true)
    .slice()
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
  let previousFuelingOdometer = baseline.odometerKm;
  for (const fueling of partialFuelings) {
    if (!Number.isFinite(Date.parse(fueling.occurredAt))
        || !Number.isFinite(fueling.liters) || fueling.liters <= 0
        || !Number.isFinite(fueling.odometerKm) || fueling.odometerKm < previousFuelingOdometer) return null;
    previousFuelingOdometer = fueling.odometerKm;
  }

  const latestOdometerReference = partialFuelings[partialFuelings.length - 1] ?? baseline;
  if (input.currentOdometerKm != null &&
      input.currentOdometerKm < latestOdometerReference.odometerKm) return null;

  const tripEvents: Array<{
    kind: 'trip';
    atMs: number;
    startedAtMs: number;
    distanceKm: number;
    fuelUsedL: number;
  }> = [];
  for (const trip of input.trips) {
    if (trip.source !== 'REAL_OBD') continue;
    const startedAtMs = Date.parse(trip.startedAt);
    const finishedAtMs = Date.parse(trip.finishedAt);
    if (!Number.isFinite(startedAtMs) || !Number.isFinite(finishedAtMs) || finishedAtMs < startedAtMs) return null;
    if (finishedAtMs <= baselineAtMs) continue;
    if (startedAtMs < baselineAtMs && finishedAtMs > baselineAtMs) return null;
    if (trip.fuelDataValid === false
        || !Number.isFinite(trip.distanceTotalKm) || trip.distanceTotalKm < 0.1
        || !Number.isFinite(trip.fuelUsedL) || trip.fuelUsedL < MIN_TRIP_FUEL_L
        || !(Number.isFinite(trip.avgFuelConsumptionKml) && trip.avgFuelConsumptionKml > 0)) return null;
    const calculatedConsumptionKml = trip.distanceTotalKm / trip.fuelUsedL;
    const allowedConsumptionDifference = Math.max(0.005, calculatedConsumptionKml * 0.05);
    if (!Number.isFinite(calculatedConsumptionKml) ||
        Math.abs(trip.avgFuelConsumptionKml - calculatedConsumptionKml) > allowedConsumptionDifference) return null;
    tripEvents.push({
      kind: 'trip',
      atMs: finishedAtMs,
      startedAtMs,
      distanceKm: trip.distanceTotalKm,
      fuelUsedL: trip.fuelUsedL,
    });
  }

  tripEvents.sort((a, b) => a.startedAtMs - b.startedAtMs || a.atMs - b.atMs);
  for (let index = 1; index < tripEvents.length; index += 1) {
    if (tripEvents[index].startedAtMs < tripEvents[index - 1].atMs) return null;
  }

  for (const trip of tripEvents) {
    if (partialFuelings.some((fueling) => {
      const atMs = Date.parse(fueling.occurredAt);
      return atMs > trip.startedAtMs && atMs < trip.atMs;
    })) return null;
  }

  // At each later partial fill, compare the recorded odometer with the distance
  // accounted for by real trips. This catches missed/untracked drives at refill.
  for (const fueling of partialFuelings) {
    const atMs = Date.parse(fueling.occurredAt);
    const trackedDistanceKm = tripEvents
      .filter((trip) => trip.atMs <= atMs)
      .reduce((sum, trip) => sum + trip.distanceKm, 0);
    const observedDistanceKm = fueling.odometerKm - baseline.odometerKm;
    const toleranceKm = Math.max(2, observedDistanceKm * 0.05);
    if (observedDistanceKm < 0 || Math.abs(observedDistanceKm - trackedDistanceKm) > toleranceKm) return null;
  }

  const events: Array<
    { kind: 'trip'; atMs: number; fuelUsedL: number } |
    { kind: 'fueling'; atMs: number; liters: number }
  > = [
    ...tripEvents.map((trip) => ({ kind: 'trip' as const, atMs: trip.atMs, fuelUsedL: trip.fuelUsedL })),
    ...partialFuelings.map((fueling) => ({ kind: 'fueling' as const, atMs: Date.parse(fueling.occurredAt), liters: fueling.liters })),
  ];
  events.sort((a, b) => a.atMs - b.atMs || (a.kind === 'trip' ? -1 : 1));

  let remainingFuelL = capacity;
  let fuelUsedSinceFullTankL = 0;
  for (const event of events) {
    if (event.kind === 'trip') {
      if (event.fuelUsedL > remainingFuelL + 0.25) return null;
      remainingFuelL = Math.max(0, remainingFuelL - event.fuelUsedL);
      fuelUsedSinceFullTankL += event.fuelUsedL;
    } else {
      if (remainingFuelL + event.liters > capacity + 1) return null;
      remainingFuelL = Math.min(capacity, remainingFuelL + event.liters);
    }
  }

  const activeTrip = input.activeTrip;
  if (activeTrip?.active) {
    if (!Number.isFinite(activeTrip.startedAtMs) || activeTrip.startedAtMs == null || activeTrip.startedAtMs < baselineAtMs) return null;
    if (tripEvents.some((trip) => trip.atMs > activeTrip.startedAtMs!)) return null;
    if (partialFuelings.some((fueling) => Date.parse(fueling.occurredAt) > activeTrip.startedAtMs!)) return null;
    if (!Number.isFinite(activeTrip.distanceKm) || activeTrip.distanceKm < 0
        || !Number.isFinite(activeTrip.fuelUsedL) || activeTrip.fuelUsedL < 0) return null;
    if (activeTrip.distanceKm >= 0.1 && (!activeTrip.fuelDataValid || activeTrip.fuelUsedL < 0.02)) return null;
    if (activeTrip.fuelUsedL > remainingFuelL + 0.25) return null;
    remainingFuelL = Math.max(0, remainingFuelL - activeTrip.fuelUsedL);
    fuelUsedSinceFullTankL += activeTrip.fuelUsedL;
  }

  // Cross-check the driver's latest odometer against all tracked distance since
  // the latest fueling reference. A mismatch means an untracked trip or stale
  // odometer could make the estimated range dangerously optimistic.
  if (input.currentOdometerKm != null) {
    const referenceAtMs = Date.parse(latestOdometerReference.occurredAt);
    const trackedDistanceKm = tripEvents
      .filter((trip) => trip.startedAtMs >= referenceAtMs)
      .reduce((sum, trip) => sum + trip.distanceKm, 0)
      + (activeTrip?.active && activeTrip.startedAtMs != null && activeTrip.startedAtMs >= referenceAtMs
        ? activeTrip.distanceKm
        : 0);
    const observedDistanceKm = input.currentOdometerKm - latestOdometerReference.odometerKm;
    const toleranceKm = Math.max(2, observedDistanceKm * 0.05);
    if (!Number.isFinite(trackedDistanceKm) || trackedDistanceKm < 0 ||
        Math.abs(observedDistanceKm - trackedDistanceKm) > toleranceKm) return null;
  }

  return {
    remainingFuelL: Number(remainingFuelL.toFixed(2)),
    fuelUsedSinceFullTankL: Number(fuelUsedSinceFullTankL.toFixed(3)),
    baselineAt: baseline.occurredAt,
    baselineOdometerKm: baseline.odometerKm,
    tripsCount: tripEvents.length + (activeTrip?.active ? 1 : 0),
    partialFuelingsCount: partialFuelings.length,
  };
}
