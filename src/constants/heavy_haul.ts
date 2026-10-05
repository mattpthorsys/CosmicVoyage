/** Fictional drive calibration; mass is kilograms and duration is simulated seconds. */
export const HAUL_DRIVE_PROFILES = [
  { engineClass: 1, maximumMassKg: 20000, referenceMassKg: 1000, secondsPerLy: 180 },
  { engineClass: 2, maximumMassKg: 250000, referenceMassKg: 4000, secondsPerLy: 120 },
  { engineClass: 3, maximumMassKg: 2000000, referenceMassKg: 16000, secondsPerLy: 90 },
  { engineClass: 4, maximumMassKg: 5000000, referenceMassKg: 64000, secondsPerLy: 75 },
  { engineClass: 5, maximumMassKg: 20000000, referenceMassKg: 256000, secondsPerLy: 60 },
] as const;

export const TOW_COUPLERS = [
  { equipmentClass: 1, maximumMassKg: 20000, cost: 600 },
  { equipmentClass: 2, maximumMassKg: 500000, cost: 2400 },
  { equipmentClass: 3, maximumMassKg: 5000000, cost: 7200 },
] as const;

export const HYPERSLEEP_MODULES = [
  { equipmentClass: 1, berths: 3, cost: 2800 },
  { equipmentClass: 2, berths: 6, cost: 6500 },
] as const;

export const HAUL_ENGINE_REFITS = [
  { engineClass: 2, cost: 2800 },
  { engineClass: 3, cost: 9200 },
] as const;

export const HAUL_AWAKE_LIMIT_SECONDS = 48 * 60 * 60;
export const HAUL_MAX_DURATION_SECONDS = 20 * 365.25 * 24 * 60 * 60;
export const HAUL_MAX_CERTIFIED_DAMAGE = 20;
export const HAUL_MIN_HULL_PERCENT = 75;
export const HAUL_MIN_LOCAL_STEP_FACTOR = 0.35;
export const HAUL_LOCAL_SPEED_M_PER_SECOND = 1e7;
export const HAUL_APPROACH_RESERVE_UNITS = 10;
export const HAUL_RENDEZVOUS_RANGE_M = 3e10;
