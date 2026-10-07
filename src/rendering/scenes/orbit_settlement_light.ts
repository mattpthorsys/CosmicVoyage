// Display budgets for unresolved built regions, not calibrated lamp photometry.
// Emission stays in the compositor's solar-relative linear radiance units.
export const ORBIT_SETTLEMENT_ALBEDO_STRENGTH = 0.35;
export const ORBIT_SETTLEMENT_RADIANCE = 0.35;

const TWILIGHT_VISIBLE_FLUX = 0.002;

/** Smoothly brings lights on as combined local visible irradiance falls below twilight levels. */
export function getOrbitSettlementNightFactor(incidentVisibleFlux: number): number {
  if (!(incidentVisibleFlux > 0)) return 1;
  const daylight = incidentVisibleFlux / TWILIGHT_VISIBLE_FLUX;
  return 1 / (1 + daylight * daylight);
}
