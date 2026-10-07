import type { SolarSystem } from '../entities/solar_system';
import type { Starbase } from '../entities/starbase';
import { getHostLabel } from '../entities/stellar_body';
import { getSystemPlanetPaths } from './save_game';
import type { DepotExtractionOutput } from './depot_types';

export const DEPOT_MONTH_SECONDS = 30 * 86400;
const MAX_SOURCE_SEPARATION_M = 0.75 * 1.496e11;

/** Finds low-throughput mining sources using static catalogue facts, never live phases or terrain getters. */
export function deriveDepotExtraction(station: Starbase, system: SolarSystem): DepotExtractionOutput[] {
  const sources = getSystemPlanetPaths(system).filter(({ planet, path }) => {
    // Moon radii are relative to their planet; compare the parent system orbit instead.
    const parentIndex = Number(path.split('/')[0].slice('planet:'.length));
    const parent = system.planets[parentIndex];
    return (
      parent &&
      getHostLabel(parent.orbitHost) === getHostLabel(station.orbitHost) &&
      Math.abs(parent.orbitDistance - station.orbitDistance) <= MAX_SOURCE_SEPARATION_M &&
      !['GasGiant', 'IceGiant', 'Molten'].includes(planet.type) &&
      planet.surfaceTemp < 650 &&
      planet.gravity <= 1.5 &&
      planet.effectiveAtmosphere.pressure <= 10
    );
  });
  const outputs: DepotExtractionOutput[] = [];
  for (const itemKey of ['IRON', 'WATER_ICE'] as const) {
    const source = sources.find(
      ({ planet }) =>
        (planet.elementAbundance[itemKey] ?? 0) >= 0.03 &&
        (itemKey !== 'WATER_ICE' || planet.surfaceTemp < 260)
    );
    if (!source) continue;
    outputs.push({
      itemKey,
      sourceBodyPath: source.path,
      sourceBodyName: source.planet.name,
      unitsPerMonth: itemKey === 'IRON' ? 2 : 3,
      capacity: 24,
      carry: 0,
    });
  }
  return outputs;
}

/** Advances one output analytically; saturated storage discards all surplus and fractional banked work. */
export function catchUpDepotOutput(
  output: DepotExtractionOutput,
  stock: number,
  elapsedSeconds: number
): { added: number; carry: number } {
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds < 0) throw new Error('Invalid extraction interval.');
  if (elapsedSeconds === 0) return { added: 0, carry: output.carry };
  const room = Math.max(0, Math.floor(output.capacity - stock + 1e-9));
  // Compare before multiplication to keep multi-century (and extreme imported) intervals bounded.
  if (!room || elapsedSeconds >= ((room - output.carry) / output.unitsPerMonth) * DEPOT_MONTH_SECONDS)
    return { added: room, carry: 0 };
  const work = output.carry + (elapsedSeconds / DEPOT_MONTH_SECONDS) * output.unitsPerMonth;
  const added = Math.floor(work + 1e-9);
  return { added, carry: Math.max(0, work - added) };
}
