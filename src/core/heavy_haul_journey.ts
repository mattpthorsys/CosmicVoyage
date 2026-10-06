import { CONFIG } from '../config';
import { HAUL_RENDEZVOUS_RANGE_M } from '../constants/heavy_haul';
import { GLYPHS } from '../constants/visual';
import { getStableOrbitRange } from '../entities/orbital_stability';
import type { SolarSystem } from '../entities/solar_system';
import { HeavyHaulService, type HaulActionResult } from './heavy_haul_service';
import {
  sameHaulAddress,
  type HaulEndpoint,
  type HaulJourneyReceipt,
  type HaulQuote,
  type HaulResupplyTarget,
} from './heavy_haul_types';
import { getHeavyHaulObjective, type MissionSystemAddress } from './mission_board';
import { MissionProgressService } from './mission_progress';
import { parseGameSave, type GameSave } from './save_game';
import { prepareBulkTimeAdvance } from './simulation_time';
import {
  capturePlanetMutations,
  captureSystemOrbit,
  restorePlanetProgress,
  restoreSystemOrbits,
  systemAddress,
  systemAddressKey,
} from './system_orbit_state';
import { quoteHeavyHaul, type HaulQuoteContext } from './tow_performance';
import { InfrastructureRegistry } from './infrastructure_registry';
import { materializeHaulSites } from './haul_sites';
import type { HeavyHaulObjective } from './heavy_haul_types';

export interface HaulJourneyRequest {
  readonly resupply: HaulResupplyTarget;
  /** A displayed manifest may supply its quote; changed performance requires a fresh confirmation. */
  readonly expectedQuote?: HaulQuote;
}

export interface HaulJourneyWorld {
  /** Must return a new, enterable slot-zero stellar system, never a live/cached mutable instance. */
  createSystem(address: MissionSystemAddress): SolarSystem | null;
}

export interface PreparedHaulJourney {
  readonly save: GameSave;
  readonly system: SolarSystem;
  readonly position: { readonly x: number; readonly y: number };
  readonly receipt: HaulJourneyReceipt;
  readonly quote: HaulQuote;
}

export type HaulJourneyPreparation =
  | { readonly ok: false; readonly message: string }
  | { readonly ok: true; readonly journey: PreparedHaulJourney };

/** Resolves a concrete operational fuel station; callers cannot assert safety with a made-up boolean. */
export function resolveHaulQuoteContext(
  save: GameSave,
  destination: MissionSystemAddress,
  resupply: HaulResupplyTarget,
  world: HaulJourneyWorld,
  objective?: HeavyHaulObjective
): HaulQuoteContext {
  const supplySystem = world.createSystem(resupply.systemAddress);
  if (supplySystem) {
    const registry = new InfrastructureRegistry();
    registry.restore(save.infrastructure);
    registry.materialize(supplySystem, save.bulkAdvanceSeconds);
  }
  const station = supplySystem?.stations.find(
    (entry) => entry.id === resupply.stationId && entry.capabilities.fuel
  );
  if (!supplySystem || !sameHaulAddress(systemAddress(supplySystem), resupply.systemAddress) || !station)
    throw new Error('Onward route must reach a verified operational fuel station.');
  return {
    ship: save.player.ship,
    crew: save.player.crew,
    normalFuelUnits: save.player.resources.fuel,
    maximumNormalFuelUnits: save.player.resources.maxFuel,
    onward: {
      verified: true,
      resupplyStationId: station.id,
      distanceLy:
        Math.hypot(
          destination.worldX - resupply.systemAddress.worldX,
          destination.worldY - resupply.systemAddress.worldY
        ) * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS,
      commissioningFuelUnits:
        objective?.package.installationKind === 'automated-depot'
          ? objective.package.commissioningFuelAllowanceUnits
          : 0,
    },
  };
}

/** Prepares all world/time/ledger effects on disposable state, leaving the live vessel entirely untouched. */
export function prepareHaulJourney(
  original: GameSave,
  source: SolarSystem,
  request: HaulJourneyRequest,
  world: HaulJourneyWorld
): HaulJourneyPreparation {
  try {
    const save = structuredClone(parseGameSave(original));
    const active = save.heavyHaul.activeTow;
    const mission = active && save.activeMissions[active.missionId];
    const objective = mission && getHeavyHaulObjective(mission);
    if (!active || !mission || !objective || active.stage !== 'attached')
      throw new Error('Couple the package before departure; an arrived voyage cannot be repeated.');
    if (
      save.location.kind !== 'system' ||
      !sameHaulAddress(save.location, objective.pickup.systemAddress) ||
      !sameHaulAddress(systemAddress(source), objective.pickup.systemAddress)
    )
      throw new Error('Depart from the contracted source system, undocked.');
    if (source.lastAppliedBulkSeconds !== save.bulkAdvanceSeconds)
      throw new Error('Source orbital catch-up must complete before departure.');
    if (!isSafePosition(source, { x: save.player.position.systemX, y: save.player.position.systemY }))
      throw new Error('Move clear of stars and planetary bodies before departure.');
    const pickup = endpointPosition(source, objective.pickup);
    if (objective.route.kind === 'local') {
      if (
        Math.hypot(save.player.position.systemX - pickup.x, save.player.position.systemY - pickup.y) >
        HAUL_RENDEZVOUS_RANGE_M
      )
        throw new Error('Stage within range of the local pickup site.');
    } else if (!source.isAtEdge(save.player.position.systemX, save.player.position.systemY)) {
      throw new Error('Move the attached package to the system departure boundary.');
    }
    const destination = world.createSystem(objective.destination.systemAddress);
    if (
      !destination ||
      destination === source ||
      destination.isStarless ||
      !sameHaulAddress(systemAddress(destination), objective.destination.systemAddress)
    )
      throw new Error('Contract destination is not an enterable stellar system.');
    const context = resolveHaulQuoteContext(
      save,
      objective.destination.systemAddress,
      request.resupply,
      world,
      objective
    );
    const quoted = quoteHeavyHaul(objective, context, active.remainingSupportFuelUnits);
    if (!quoted.ok) throw new Error(quoted.reasons.join(' '));
    if (
      request.expectedQuote &&
      (Object.keys(quoted.quote) as Array<keyof HaulQuote>).some(
        (key) => request.expectedQuote![key] !== quoted.quote[key]
      )
    )
      throw new Error('Voyage conditions changed. Review and confirm a fresh manifest.');
    const time = prepareBulkTimeAdvance(save, quoted.quote.durationSeconds);
    const receipt: HaulJourneyReceipt = {
      missionId: mission.id,
      operationId: `${mission.id}:transit`,
      departureSeconds: save.gameClockElapsedSeconds,
      arrivalSeconds: time.gameClockElapsedSeconds,
      durationSeconds: quoted.quote.durationSeconds,
      supportFuelConsumedUnits: quoted.quote.transitFuelUnits,
    };
    // Reuse the domain transition on an isolated mission owner; preparation is not a partial arrival.
    const missions = new MissionProgressService();
    missions.restoreSnapshot(save);
    const haul = new HeavyHaulService(missions);
    haul.restoreSnapshot(save.heavyHaul, save.gameClockElapsedSeconds);
    const arrival = haul.recordArrival(receipt, context);
    if (!arrival.ok) throw new Error(arrival.message);
    const key = systemAddressKey(objective.destination.systemAddress);
    const history = new Map(save.systemOrbitHistory.map((entry) => [systemAddressKey(entry), entry]));
    restorePlanetProgress(destination, save.planetMutations);
    restoreSystemOrbits(destination, history.get(key)?.orbit, save.planetMutations, time.bulkAdvanceSeconds);
    const infrastructure = new InfrastructureRegistry();
    infrastructure.restore(save.infrastructure);
    infrastructure.materialize(destination, time.bulkAdvanceSeconds);
    materializeHaulSites(destination, mission, history.get(key)?.orbit, time.bulkAdvanceSeconds);
    infrastructure.capture(destination);
    save.infrastructure = infrastructure.createSnapshot();
    const position = findArrivalPosition(destination, objective.destination, objective.route.kind);
    const orbit = captureSystemOrbit(destination);
    history.set(key, { ...systemAddress(destination), orbit });
    const mutations = save.planetMutations.filter(
      (entry) => !sameHaulAddress(entry, objective.destination.systemAddress)
    );
    save.planetMutations = [...mutations, ...capturePlanetMutations(destination)];
    Object.assign(save, time, {
      heavyHaul: haul.createSnapshot(),
      systemOrbit: orbit,
      systemOrbitHistory: [...history.values()],
      location: { kind: 'system', ...objective.destination.systemAddress },
      savedAt: new Date().toISOString(),
    });
    Object.assign(save.player.position, {
      worldX: destination.starX,
      worldY: destination.starY,
      systemX: position.x,
      systemY: position.y,
      lastWorldMoveDx: 0,
      lastWorldMoveDy: 0,
    });
    save.player.render.char = GLYPHS.SHIP_NORTH;
    save.player.render.directionGlyph = GLYPHS.SHIP_NORTH;
    parseGameSave(save);
    return { ok: true, journey: { save, system: destination, position, receipt, quote: quoted.quote } };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Could not prepare voyage.' };
  }
}

/** Requires a complete durable arrival checkpoint before applying any live effect. */
export function commitPreparedHaulJourney(
  prepared: PreparedHaulJourney,
  checkpoint: ((save: GameSave) => void) | undefined,
  apply: (journey: PreparedHaulJourney) => void
): HaulActionResult {
  if (!checkpoint) return { ok: false, message: 'Voyage requires a working session checkpoint.' };
  try {
    checkpoint(structuredClone(prepared.save));
  } catch (error) {
    return {
      ok: false,
      message: `Departure cancelled: checkpoint failed (${error instanceof Error ? error.message : 'storage unavailable'}).`,
    };
  }
  apply(prepared);
  return { ok: true, message: 'Haul arrived. Approach the contracted deployment site.' };
}

/** Validates the frozen orbit against the actual stellar hierarchy, not a display name. */
function endpointPosition(system: SolarSystem, endpoint: HaulEndpoint): { x: number; y: number } {
  const range = getStableOrbitRange(system.architecture, endpoint.orbit.host);
  if (!range || endpoint.orbit.radiusM < range.minRadius || endpoint.orbit.radiusM > range.maxRadius)
    throw new Error('Contract site has no stable orbit around its specified stellar host.');
  const marker = system.navigationMarkers?.find((entry) => entry.id === endpoint.siteId);
  if (marker) return { x: marker.systemX, y: marker.systemY };
  const center = system.getOrbitCenter(endpoint.orbit.host);
  return {
    x: center.x + Math.cos(endpoint.orbit.angleRad) * endpoint.orbit.radiusM,
    y: center.y + Math.sin(endpoint.orbit.angleRad) * endpoint.orbit.radiusM,
  };
}

/** Checks physical clearances; docking tolerance is intentionally much larger than an object's radius. */
function isSafePosition(system: SolarSystem, position: { x: number; y: number }): boolean {
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return false;
  const objects = [
    ...system.stars.map((star) => ({ x: star.systemX, y: star.systemY, radius: star.radiusM * 3 })),
    ...system.planets
      .flatMap((planet) => (planet ? [planet, ...planet.moons] : []))
      .map((body) => ({ x: body.systemX, y: body.systemY, radius: body.diameter * 500 + 1e9 })),
    ...system.stations.map((station) => ({ x: station.systemX, y: station.systemY, radius: 1e9 })),
  ];
  return objects.every((body) => Math.hypot(position.x - body.x, position.y - body.y) > body.radius);
}

/** Uses a bounded search for clear staging space; local arrival still requires a final approach. */
function findArrivalPosition(
  system: SolarSystem,
  endpoint: HaulEndpoint,
  kind: 'local' | 'interstellar'
): { x: number; y: number } {
  const site = endpointPosition(system, endpoint);
  for (let index = 0; index < 32; index++) {
    const angle = endpoint.orbit.angleRad + Math.PI + (index * Math.PI * 2) / 32;
    const radius = kind === 'local' ? HAUL_RENDEZVOUS_RANGE_M * 1.5 : system.edgeRadius * 0.85;
    const position = {
      x: (kind === 'local' ? site.x : 0) + Math.cos(angle) * radius,
      y: (kind === 'local' ? site.y : 0) + Math.sin(angle) * radius,
    };
    if (
      isSafePosition(system, position) &&
      Math.hypot(position.x - site.x, position.y - site.y) > HAUL_RENDEZVOUS_RANGE_M
    )
      return position;
  }
  throw new Error('No clear arrival staging location is available.');
}
