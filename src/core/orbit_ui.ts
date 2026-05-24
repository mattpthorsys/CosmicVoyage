import { CONFIG } from '../config';
import { AU_IN_METERS, ELEMENTS } from '../constants';
import { describePlanetType, Planet } from '../entities/planet';
import { formatDistanceAu, formatLightTimeFromMeters } from '../utils/space_scale';

export type OrbitInteractionMode = 'overview' | 'landing';

export interface OrbitBodyOption {
  label: string;
  planet: Planet;
  selected: boolean;
}

export interface OrbitScreenModel {
  title: string;
  subtitle: string;
  parentPlanet: Planet;
  selectedBody: Planet;
  bodies: OrbitBodyOption[];
  mode: OrbitInteractionMode;
  rotationPhase: number;
  landingCursorX: number;
  landingCursorY: number;
  mapSize: number;
  description: string[];
  telemetry: string[];
  footer: string[];
  alert?: string;
}

export function createOrbitScreenModel(args: {
  parentPlanet: Planet;
  selectedBody: Planet;
  selectedIndex: number;
  mode: OrbitInteractionMode;
  landingCursorX: number;
  landingCursorY: number;
  rotationPhase: number;
  alert?: string;
}): OrbitScreenModel {
  const selected = args.selectedBody;
  const mapSize = getPlanetMapSize(selected);
  const topElements = Object.entries(selected.elementAbundance)
    .filter(([, abundance]) => abundance > 0.1)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([key, abundance]) => `${ELEMENTS[key]?.name || key} ${abundance.toFixed(1)}%`);

  const pressure = selected.atmosphere.pressure < 0.001 ? '~0' : selected.atmosphere.pressure.toFixed(3);
  const parentSeparation = selected === args.parentPlanet ? selected.orbitDistance : args.parentPlanet.orbitDistance + selected.orbitDistance;
  const orbitText = selected.orbitDistance <= 0 ? 'none' : formatDistanceAu(parentSeparation);
  const signalText = selected.orbitDistance <= 0 ? 'none' : formatLightTimeFromMeters(parentSeparation);
  const classText = describePlanetType(selected.type);
  const description = [
    `${selected.name} is a ${classText} with ${selected.gravity.toFixed(2)}g gravity and a mean surface temperature of ${selected.surfaceTemp}K.`,
    selected.orbitDistance <= 0
      ? 'Orbit none; free planetary-mass object in interstellar space.'
      : `Orbital scale ${orbitText} from the system primary; one-way signal delay ${signalText}.`,
    `Atmosphere ${selected.atmosphere.density.toLowerCase()} at ${pressure} bar; hydrosphere ${selected.hydrosphere.toLowerCase()}, lithosphere ${selected.lithosphere.toLowerCase()}.`,
    selected.type === 'GasGiant' || selected.type === 'IceGiant'
      ? `Atmospheric resources: ${topElements.join(', ') || 'trace signatures only'}. Surface landing is hazardous; orbital survey recommended.`
      : selected.scanned
        ? `Mineral scan ${selected.mineralRichness}; primary resource ${selected.primaryResource || 'N/A'}. Deposits: ${topElements.join(', ') || 'none significant'}.`
        : `Mineral scan pending. Potential richness ${selected.mineralRichness}; orbital survey can select a safe landing zone.`,
  ];

  const bodies = [args.parentPlanet, ...args.parentPlanet.moons].map((planet, index) => ({
    label: index === 0 ? 'Primary' : `Moon ${index}`,
    planet,
    selected: index === args.selectedIndex,
  }));

  return {
    title: 'Orbital Operations',
    subtitle: `${args.parentPlanet.name} local space`,
    parentPlanet: args.parentPlanet,
    selectedBody: selected,
    bodies,
    mode: args.mode,
    rotationPhase: args.rotationPhase,
    landingCursorX: ((Math.floor(args.landingCursorX) % mapSize) + mapSize) % mapSize,
    landingCursorY: Math.max(0, Math.min(mapSize - 1, Math.floor(args.landingCursorY))),
    mapSize,
    description,
    telemetry: [
      `Body ${selected.name}`,
      `Class ${classText} | Diameter ${selected.diameter.toLocaleString()} km | Density ${selected.density.toFixed(2)} g/cm3`,
      selected.orbitDistance <= 0
        ? 'Orbit none | Light time none'
        : `Orbit ${(selected.orbitDistance / AU_IN_METERS).toFixed(3)} AU | Light time ${formatLightTimeFromMeters(selected.orbitDistance)}`,
      `Tilt ${(selected.axialTilt * 180 / Math.PI).toFixed(1)} deg | Incl ${(selected.orbitalInclination * 180 / Math.PI).toFixed(1)} deg | ${selected.tidallyLocked ? 'Locked' : 'Free rotation'}`,
      `Temp now ${selected.getCurrentTemperature()}K | Moons ${selected.moons.length}`,
    ],
    footer: [
      args.mode === 'landing'
        ? 'Landing site: arrows move cursor, Enter/Space confirms, Esc cancels.'
        : 'Left/Right select body, Enter/Space chooses landing site, Esc/Backspace breaks orbit.',
      `Site X ${Math.floor(args.landingCursorX)}  Y ${Math.floor(args.landingCursorY)}  Map ${mapSize}x${mapSize}`,
    ],
    alert: args.alert,
  };
}

export function getPlanetMapSize(planet: Planet): number {
  if (planet.type === 'GasGiant' || planet.type === 'IceGiant') return CONFIG.PLANET_MAP_BASE_SIZE;
  return planet.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
}
