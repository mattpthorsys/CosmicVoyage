import { PRNG } from '../../utils/prng';
import { getManagedSurfaceWaterPhase } from '../planet/surface_liquid';
import type { BiologyEnvironment } from './biosphere_generator';
import type { SpeciesDefinition } from './biology_types';
import { generateMicrobialCommunity } from './microbial_biosphere';

/** Screens a narrow microbial analogue using phase, carbon inventory and reference stellar energy. */
export function supportsPressureCommunity(e: BiologyEnvironment): boolean {
  return (
    e.origin === 'native' &&
    e.landable &&
    e.waterCoverage > 0 &&
    e.temperatureK >= 280 &&
    e.temperatureK <= 330 &&
    e.pressureBar >= 8 &&
    e.pressureBar <= 30 &&
    getManagedSurfaceWaterPhase(e.temperatureK, e.pressureBar) === 'liquid' &&
    (e.stellarFluxWm2 ?? 0) >= 20 &&
    (e.stellarFluxWm2 ?? 0) <= 3000 &&
    (e.carbonDioxideBar ?? 0) >= 0.000001 &&
    (e.carbonDioxideBar ?? 0) <= 0.1
  );
}

/** Generates attached colonial material rather than large high-energy fauna in a speculative pressure habitat. */
export function generatePressureCommunity(e: BiologyEnvironment, root: PRNG): SpeciesDefinition[] {
  return generateMicrobialCommunity(e, root, true);
}
