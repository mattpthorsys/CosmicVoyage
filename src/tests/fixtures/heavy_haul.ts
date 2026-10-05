/** Fixed route benchmarks, independent of production seeds and generated station availability. */
export const HAUL_BENCHMARKS = {
  localBuoy: { wetMassKg: 1200, engineClass: 1, distanceM: 149597870700 },
  mediumModule: { wetMassKg: 20000, engineClass: 2, distanceLy: 25 },
  heavyDepot: { wetMassKg: 80000, engineClass: 2, distanceLy: 100 },
  upgradedDepot: { wetMassKg: 80000, engineClass: 3, distanceLy: 100 },
} as const;

/** Development-only addresses; these do not assert that production generation contains stars there. */
export const HAUL_FIXTURE_ADDRESSES = {
  pickup: { worldX: 0, worldY: 0, systemSlot: 0 },
  destination: { worldX: 100, worldY: 0, systemSlot: 0 },
} as const;
