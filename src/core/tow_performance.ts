import { CONFIG } from '../config';
import { AU_IN_METERS } from '../constants/physics';
import {
  HAUL_APPROACH_RESERVE_UNITS,
  HAUL_AWAKE_LIMIT_SECONDS,
  HAUL_DRIVE_PROFILES,
  HAUL_LOCAL_SPEED_M_PER_SECOND,
  HAUL_MAX_CERTIFIED_DAMAGE,
  HAUL_MAX_DURATION_SECONDS,
  HAUL_MIN_HULL_PERCENT,
  HAUL_MIN_LOCAL_STEP_FACTOR,
  TOW_COUPLERS,
} from '../constants/heavy_haul';
import type { CrewMember } from './crew';
import { getOperationalCapabilities } from './operational_capabilities';
import {
  getEngineFuelUseMultiplier,
  getFunctionalHypersleepBerths,
  getSubsystemDamage,
  type ShipModificationState,
} from './ship_modifications';
import type { HeavyHaulObjective, HaulOnwardPlan, HaulQuote, HaulQuoteResult } from './heavy_haul_types';
import { validateHeavyHaulObjective } from './heavy_haul_validation';

export interface HaulQuoteContext {
  readonly ship: ShipModificationState;
  readonly crew: readonly CrewMember[];
  readonly normalFuelUnits: number;
  readonly maximumNormalFuelUnits: number;
  readonly onward: HaulOnwardPlan;
}

/** Returns schematic local handling; missing tow mass preserves ordinary movement exactly. */
export function getTowLocalStepFactor(wetMassKg: number, engineClass: number): number {
  if (wetMassKg === 0) return 1;
  const drive = HAUL_DRIVE_PROFILES.find((entry) => entry.engineClass === engineClass);
  if (!drive || !Number.isFinite(wetMassKg) || wetMassKg < 0) return HAUL_MIN_LOCAL_STEP_FACTOR;
  return Math.max(HAUL_MIN_LOCAL_STEP_FACTOR, 1 / Math.sqrt(1 + wetMassKg / drive.referenceMassKg));
}

/** Quotes an approved route without changing normal fuel, crew, cargo, or elapsed time. */
export function quoteHeavyHaul(
  objective: HeavyHaulObjective,
  context: HaulQuoteContext,
  remainingSupportFuelUnits?: number
): HaulQuoteResult {
  try {
    validateHeavyHaulObjective(objective);
  } catch (error) {
    return {
      ok: false,
      quote: null,
      reasons: [error instanceof Error ? error.message : 'Invalid haul definition.'],
    };
  }
  const { ship, crew, onward } = context;
  const availableSupport = remainingSupportFuelUnits ?? objective.package.supportFuelCapacityUnits;
  const drive = HAUL_DRIVE_PROFILES.find((entry) => entry.engineClass === ship.engineClass);
  if (!drive || !validQuoteInputs(context, availableSupport))
    return { ok: false, quote: null, reasons: ['Invalid ship, fuel, crew, or onward-route data.'] };
  const payload = objective.package;
  const coupler = TOW_COUPLERS.find((entry) => entry.equipmentClass === (ship.towCouplerClass ?? 0));
  const maximumTowMassKg = Math.min(drive.maximumMassKg, coupler?.maximumMassKg ?? 0);
  const load = payload.wetMassKg / drive.referenceMassKg;
  const distance =
    objective.route.kind === 'local'
      ? objective.route.distanceM
      : Math.hypot(
          objective.destination.systemAddress.worldX - objective.pickup.systemAddress.worldX,
          objective.destination.systemAddress.worldY - objective.pickup.systemAddress.worldY
        ) * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS;
  // Hyperdrive is fictional. Keep the steep strategic load curve separate from playable cursor handling.
  const durationSeconds =
    objective.route.kind === 'local'
      ? (distance / HAUL_LOCAL_SPEED_M_PER_SECOND) * Math.sqrt(1 + load)
      : distance * drive.secondsPerLy * (1 + 25 * load * load);
  const planningFuelFactor =
    getEngineFuelUseMultiplier(ship.engineClass) *
    getOperationalCapabilities([...crew], ship).hyperspaceFuelMultiplier;
  const normalFuelPerLy =
    (CONFIG.HYPERSPACE_MOVE_FUEL_COST / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS) * planningFuelFactor;
  const transitFuelUnits =
    objective.route.kind === 'local'
      ? (distance / AU_IN_METERS) * (1 + load)
      : distance * normalFuelPerLy * (1 + 5 * load);
  const requiredBerths =
    durationSeconds > HAUL_AWAKE_LIMIT_SECONDS ? crew.filter((member) => member.hitPoints > 0).length : 0;
  const quote: HaulQuote = {
    routeKind: objective.route.kind,
    distance,
    durationSeconds,
    localStepFactor: getTowLocalStepFactor(payload.wetMassKg, ship.engineClass),
    maximumTowMassKg,
    requiredBerths,
    functionalBerths: getFunctionalHypersleepBerths(ship),
    transitFuelUnits,
    requiredSupportFuelUnits: transitFuelUnits + HAUL_APPROACH_RESERVE_UNITS,
    // Include a bounded route margin and an entry reserve; world queries still verify the station itself.
    onwardFuelRequiredUnits:
      onward.distanceLy * normalFuelPerLy * 1.15 + (onward.distanceLy > 0 ? CONFIG.HYPERSPACE_FUEL_COST : 0),
  };
  if (!Object.values(quote).every((value) => typeof value !== 'number' || Number.isFinite(value)))
    return { ok: false, quote: null, reasons: ['Haul quote exceeds supported numeric limits.'] };
  const reasons: string[] = [];
  if (ship.superstructure.engineMounts < 1) reasons.push('A functional engine mount is required.');
  if (!coupler) reasons.push('Fit an external tow coupler.');
  if ((ship.towCouplerClass ?? 0) < payload.minimumCouplerClass)
    reasons.push(`Tow coupler class ${payload.minimumCouplerClass} required.`);
  if (ship.engineClass < payload.minimumEngineClass)
    reasons.push(`Drive class ${payload.minimumEngineClass} required.`);
  if (payload.wetMassKg > maximumTowMassKg)
    reasons.push(`Wet tow mass exceeds the ${maximumTowMassKg.toLocaleString()} kg certified limit.`);
  if ((ship.damage.hullIntegrity / ship.damage.maxHullIntegrity) * 100 < HAUL_MIN_HULL_PERCENT)
    reasons.push(`Hull integrity must be at least ${HAUL_MIN_HULL_PERCENT}%.`);
  for (const subsystem of ['drive', 'towCoupler'] as const)
    if (getSubsystemDamage(ship, subsystem) > HAUL_MAX_CERTIFIED_DAMAGE)
      reasons.push(`Repair ${subsystem === 'drive' ? 'drive' : 'tow coupler'} before departure.`);
  if (requiredBerths > quote.functionalBerths)
    reasons.push(
      `${requiredBerths} functional hypersleep berths required; ${quote.functionalBerths} available.`
    );
  if (durationSeconds > HAUL_MAX_DURATION_SECONDS)
    reasons.push('Voyage exceeds the twenty-year contract limit.');
  if (
    availableSupport > payload.supportFuelCapacityUnits ||
    availableSupport < quote.requiredSupportFuelUnits
  )
    reasons.push('Contractor support fuel is insufficient or inconsistent.');
  const availableOnwardFuel = Math.min(
    context.maximumNormalFuelUnits,
    context.normalFuelUnits + onward.commissioningFuelUnits
  );
  if (!onward.verified || !onward.resupplyStationId || availableOnwardFuel < quote.onwardFuelRequiredUnits)
    reasons.push('No verified, fuel-safe onward resupply route.');
  if (onward.commissioningFuelUnits > payload.commissioningFuelAllowanceUnits)
    reasons.push('Onward plan exceeds the contracted commissioning refill allowance.');
  return reasons.length ? { ok: false, quote, reasons } : { ok: true, quote, reasons: [] };
}

/** Rejects corrupt capabilities instead of silently converting nonfinite data into a usable quote. */
function validQuoteInputs(context: HaulQuoteContext, remainingSupportFuelUnits: number): boolean {
  const { ship, onward } = context;
  return (
    [
      context.normalFuelUnits,
      context.maximumNormalFuelUnits,
      remainingSupportFuelUnits,
      onward.distanceLy,
      onward.commissioningFuelUnits,
      ship.damage.hullIntegrity,
    ].every((value) => Number.isFinite(value) && value >= 0) &&
    Number.isFinite(ship.damage.maxHullIntegrity) &&
    ship.damage.maxHullIntegrity > 0 &&
    ship.damage.hullIntegrity <= ship.damage.maxHullIntegrity &&
    context.maximumNormalFuelUnits > 0 &&
    context.normalFuelUnits <= context.maximumNormalFuelUnits &&
    Number.isInteger(ship.towCouplerClass ?? 0) &&
    (ship.towCouplerClass ?? 0) >= 0 &&
    (ship.towCouplerClass ?? 0) <= 3 &&
    Number.isInteger(ship.hypersleepClass ?? 0) &&
    (ship.hypersleepClass ?? 0) >= 0 &&
    (ship.hypersleepClass ?? 0) <= 2 &&
    (['drive', 'towCoupler', 'hypersleepBay'] as const).every((subsystem) => {
      const damage = ship.damage.subsystemDamage[subsystem] ?? 0;
      return Number.isFinite(damage) && damage >= 0 && damage <= 100;
    }) &&
    context.crew.every((member) => Number.isFinite(member.hitPoints) && member.hitPoints >= 0)
  );
}
