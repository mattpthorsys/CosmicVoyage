import {
  ATMOSPHERE_DENSITIES,
  ATMOSPHERE_GASES,
  MineralRichness,
  PLANET_TYPES,
} from '../constants';

export type PlanetTypeInfo = (typeof PLANET_TYPES)[string];

export { ATMOSPHERE_DENSITIES, ATMOSPHERE_GASES, MineralRichness, PLANET_TYPES };
