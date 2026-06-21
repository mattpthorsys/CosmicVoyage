import { CONFIG } from '../config';
import { AU_IN_METERS } from '../constants/physics';
import { ELEMENTS } from '../constants/resources';
import { describePlanetType, Planet } from '../entities/planet';
import { readReadySurfaceData } from '../entities/planet/surface_data';
import { formatDistanceAu, formatLightTimeFromMeters } from '../utils/space_scale';
import { hasDiscoveryLevel } from './discovery';

export type OrbitInteractionMode = 'overview' | 'landing';

export interface OrbitBodyOption {
  label: string;
  planet: Planet;
  selected: boolean;
}

export interface OrbitStellarSource {
  id: string;
  primary: boolean;
  brightness: number;
  colour: string;
}

export interface OrbitScreenModel {
  title: string;
  subtitle: string;
  parentPlanet: Planet;
  selectedBody: Planet;
  bodies: OrbitBodyOption[];
  mode: OrbitInteractionMode;
  stellarSources: OrbitStellarSource[];
  rotationPhase: number;
  illuminationPhase: number;
  landingCursorX: number;
  landingCursorY: number;
  mapSize: number;
  description: string[];
  telemetry: string[];
  footer: string[];
  alert?: string;
}

/** Creates orbit screen model. */
export function createOrbitScreenModel(args: {
  parentPlanet: Planet;
  selectedBody: Planet;
  selectedIndex: number;
  mode: OrbitInteractionMode;
  landingCursorX: number;
  landingCursorY: number;
  rotationPhase: number;
  illuminationPhase: number;
  stellarSources?: OrbitStellarSource[];
  alert?: string;
}): OrbitScreenModel {
  const selected = args.selectedBody;
  const mapSize = getPlanetMapSize(selected);
  const topElements = Object.entries(selected.elementAbundance)
    .filter(([, abundance]) => abundance > 0.1)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([key, abundance]) =>
      hasDiscoveryLevel(selected.discovery.level, 'sampled')
        ? `${ELEMENTS[key]?.name || key} ${abundance.toFixed(1)}%`
        : ELEMENTS[key]?.name || key
    );

  const pressure = selected.atmosphere.pressure < 0.001 ? '~0' : selected.atmosphere.pressure.toFixed(3);
  const parentSeparation =
    selected === args.parentPlanet
      ? selected.orbitDistance
      : args.parentPlanet.orbitDistance + selected.orbitDistance;
  const orbitText = selected.orbitDistance <= 0 ? 'none' : formatDistanceAu(parentSeparation);
  const signalText = selected.orbitDistance <= 0 ? 'none' : formatLightTimeFromMeters(parentSeparation);
  const classText = describePlanetType(selected.type);
  const temperatureRange = `${selected.surfaceTempMin}-${selected.surfaceTempMax}K`;
  const description = [
    `Profile: ${selected.name} is a ${classText}. Gravity ${selected.gravity.toFixed(2)}g. Temperature ${selected.surfaceTemp}K average, range ${temperatureRange}.`,
    selected.orbitDistance <= 0
      ? 'Orbit: none. Free planetary-mass object in interstellar space.'
      : `Orbit: ${orbitText} from the system primary. One-way signal delay ${signalText}.`,
    `Atmosphere: ${selected.atmosphere.density.toLowerCase()}, ${pressure} bar. Hydrosphere: ${selected.hydrosphere.toLowerCase()}. Lithosphere: ${selected.lithosphere.toLowerCase()}.`,
    selected.type === 'GasGiant' || selected.type === 'IceGiant'
      ? `Resources: atmospheric signatures ${topElements.join(', ') || 'trace signatures only'}. Surface landing is hazardous; orbital survey recommended.`
      : selected.scanned
        ? `Minerals: scan ${selected.mineralRichness}. Primary resource ${selected.primaryResource || 'N/A'}. Deposits ${topElements.join(', ') || 'none significant'}.`
        : `Minerals: scan pending. Potential richness ${selected.mineralRichness}. Orbital survey can select a safe landing zone.`,
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
    stellarSources: args.stellarSources ?? [],
    rotationPhase: args.rotationPhase,
    illuminationPhase: args.illuminationPhase,
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
      `Tilt ${((selected.axialTilt * 180) / Math.PI).toFixed(1)} deg | Rot ${selected.getRotationPeriodLabel()} | ${selected.tidallyLocked ? 'Locked' : 'Free rotation'}`,
      `Incl ${((selected.orbitalInclination * 180) / Math.PI).toFixed(1)} deg`,
      `Temp now ${selected.getCurrentTemperature()}K | Avg ${selected.surfaceTemp}K | Range ${selected.surfaceTempMin}-${selected.surfaceTempMax}K`,
      `Moons ${selected.moons.length}`,
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

/** Returns planet map size. */
export function getPlanetMapSize(planet: Planet): number {
  if (planet.type === 'GasGiant' || planet.type === 'IceGiant') return CONFIG.PLANET_MAP_BASE_SIZE;
  return readReadySurfaceData(planet)?.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
}
