import { CONFIG } from '../config';
import { describePlanetType, Planet } from '../entities/planet';
import { readReadySurfaceData } from '../entities/planet/surface_data';
import { formatDistanceAu } from '../utils/space_scale';

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
  /** Bearing relative to the primary light, in the system orbital plane (radians). */
  longitudeOffset?: number;
  /** Irradiance relative to the dominant source, including inverse-square distance. */
  relativeFlux?: number;
  /** Bolometric irradiance at the selected body in W/m^2. */
  irradianceWm2?: number;
  /** Effective blackbody temperature inferred from stellar luminosity and radius. */
  temperatureK?: number;
  /** Apparent stellar radius at the selected body, in radians. */
  angularRadius?: number;
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
  summary: string[];
  footer: string[];
  alert?: string;
}

/** Names the centre of the selected body's orbital radius, including a moon's actual parent. */
export function getOrbitReferenceLabel(selected: Planet, parent: Planet): string {
  if (selected !== parent) return `planet ${parent.name}`;
  if (selected.orbitHost.kind === 'circumstellar') return `star ${selected.orbitHost.starId ?? 'A'}`;
  return selected.orbitHost.kind === 'circumbinary' ? 'AB barycentre' : 'system barycentre';
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
  const atmosphere = selected.effectiveAtmosphere;
  const orbitText = selected.orbitDistance <= 0 ? 'none' : formatDistanceAu(selected.orbitDistance);
  const hostLabel = getOrbitReferenceLabel(selected, args.parentPlanet);
  const classText = describePlanetType(selected.type);

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
    summary: [
      classText.toUpperCase(),
      selected.orbitDistance <= 0 ? 'Free-floating world' : `${orbitText} / ${hostLabel}`,
      `${selected.gravity.toFixed(2)} g  |  ${selected.effectiveSurfaceTemp} K mean`,
      `${atmosphere.density} atmosphere  |  ${selected.moons.length} moon${selected.moons.length === 1 ? '' : 's'}`,
      selected.scanned ? 'Orbital survey complete' : 'Orbital survey pending',
      '',
      '[D] PLANETARY DOSSIER',
      '[U] SETTLEMENT DIRECTORY',
    ],
    footer:
      args.mode === 'landing'
        ? [
            'Arrows site  Enter land  D dossier  U sites  Esc back',
            `Site X ${Math.floor(args.landingCursorX)}  Y ${Math.floor(args.landingCursorY)}  Map ${mapSize}x${mapSize}`,
          ]
        : ['Left/Right body  D dossier  U sites  Enter land  Esc leave'],
    alert: args.alert,
  };
}

/** Returns planet map size. */
export function getPlanetMapSize(planet: Planet): number {
  if (planet.type === 'GasGiant' || planet.type === 'IceGiant') return CONFIG.PLANET_MAP_BASE_SIZE;
  return readReadySurfaceData(planet)?.heightmap?.length ?? CONFIG.PLANET_MAP_BASE_SIZE;
}
