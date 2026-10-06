import { CONFIG } from '../config';
import {
  HAUL_APPROACH_RESERVE_UNITS,
  HAUL_AWAKE_LIMIT_SECONDS,
  HAUL_DRIVE_PROFILES,
  HAUL_MAX_CERTIFIED_DAMAGE,
  HAUL_MAX_DURATION_SECONDS,
  HAUL_MIN_HULL_PERCENT,
} from '../constants/heavy_haul';
import { GLYPHS } from '../constants/visual';
import type { SolarSystem } from '../entities/solar_system';
import { commitHaulChange } from './heavy_haul_commissioning';
import { isSafeJourneyPosition, type HaulJourneyWorld } from './heavy_haul_journey';
import { sameHaulAddress, type HaulHomeboundRoute, type HomeboundJourneyReceipt } from './heavy_haul_types';
import { InfrastructureRegistry } from './infrastructure_registry';
import { materializeHaulSites } from './haul_sites';
import { getOperationalCapabilities } from './operational_capabilities';
import { parseGameSave, type GameSave } from './save_game';
import {
  getEngineFuelUseMultiplier,
  getFunctionalHypersleepBerths,
  getSubsystemDamage,
} from './ship_modifications';
import { prepareBulkTimeAdvance } from './simulation_time';
import {
  capturePlanetMutations,
  captureSystemOrbit,
  restorePlanetProgress,
  restoreSystemOrbits,
  systemAddress,
  systemAddressKey,
} from './system_orbit_state';

export interface HomeboundQuote {
  readonly distanceLy: number;
  readonly durationSeconds: number;
  readonly fuelUnits: number;
  readonly requiredBerths: number;
  readonly functionalBerths: number;
}

export type HomeboundQuoteResult =
  | { readonly ok: true; readonly quote: HomeboundQuote; readonly reasons: readonly [] }
  | { readonly ok: false; readonly quote: HomeboundQuote | null; readonly reasons: readonly string[] };

export interface PreparedHomeboundJourney {
  readonly save: GameSave;
  readonly system: SolarSystem;
  readonly position: { readonly x: number; readonly y: number };
  readonly quote: HomeboundQuote;
  readonly receipt: HomeboundJourneyReceipt;
  readonly route: HaulHomeboundRoute;
  readonly stationId: string;
}

export type HomeboundPreparation =
  | { readonly ok: false; readonly message: string }
  | { readonly ok: true; readonly journey: PreparedHomeboundJourney };

/** Uses ordinary drive/crew fuel economy and unloaded drive speed, never the departed contractor tank. */
export function quoteHomeboundJourney(save: GameSave, assetId: string): HomeboundQuoteResult {
  const asset = save.infrastructure.find((entry) => entry.assetId === assetId);
  const route = asset?.homeboundRoute;
  if (!asset || !route)
    return { ok: false, quote: null, reasons: ['No delivered haul has a saved return port.'] };
  if (asset.homeboundReceipt)
    return { ok: false, quote: null, reasons: ['This automatic return is already completed.'] };
  const ship = save.player.ship;
  const drive = HAUL_DRIVE_PROFILES.find((entry) => entry.engineClass === ship.engineClass);
  if (!drive) return { ok: false, quote: null, reasons: ['No usable drive profile.'] };
  const distanceLy =
    Math.hypot(
      route.systemAddress.worldX - save.player.position.worldX,
      route.systemAddress.worldY - save.player.position.worldY
    ) * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS;
  const durationSeconds = Math.max(60, distanceLy * drive.secondsPerLy);
  const fuelUnits =
    distanceLy *
      (CONFIG.HYPERSPACE_MOVE_FUEL_COST / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS) *
      getEngineFuelUseMultiplier(ship.engineClass) *
      getOperationalCapabilities(save.player.crew, ship).hyperspaceFuelMultiplier +
    CONFIG.HYPERSPACE_FUEL_COST;
  const quote: HomeboundQuote = {
    distanceLy,
    durationSeconds,
    fuelUnits,
    requiredBerths:
      durationSeconds > HAUL_AWAKE_LIMIT_SECONDS
        ? save.player.crew.filter((member) => member.hitPoints > 0).length
        : 0,
    functionalBerths: getFunctionalHypersleepBerths(ship),
  };
  const reasons: string[] = [];
  if (save.heavyHaul.activeTow && save.heavyHaul.activeTow.stage !== 'awaiting-pickup')
    reasons.push('Deploy or release the external tow before returning home.');
  if (!['system', 'hyperspace'].includes(save.location.kind))
    reasons.push('Launch or undock into system travel before starting the automatic return.');
  if (save.location.kind === 'system' && sameHaulAddress(save.location, route.systemAddress))
    reasons.push('Already in the home system. Select the issuing port for local approach.');
  if (ship.superstructure.engineMounts < 1 || getSubsystemDamage(ship, 'drive') > HAUL_MAX_CERTIFIED_DAMAGE)
    reasons.push('Repair the drive before automatic travel.');
  if ((ship.damage.hullIntegrity / ship.damage.maxHullIntegrity) * 100 < HAUL_MIN_HULL_PERCENT)
    reasons.push(`Hull integrity must be at least ${HAUL_MIN_HULL_PERCENT}%.`);
  if (quote.requiredBerths > quote.functionalBerths)
    reasons.push(
      `${quote.requiredBerths} functional hypersleep berths required; ${quote.functionalBerths} available.`
    );
  if (!Object.values(quote).every(Number.isFinite) || durationSeconds > HAUL_MAX_DURATION_SECONDS)
    reasons.push('Return exceeds the supported travel range.');
  if (save.player.resources.fuel < fuelUnits + HAUL_APPROACH_RESERVE_UNITS)
    reasons.push(
      `Return needs ${fuelUnits.toFixed(1)} fuel units plus a ${HAUL_APPROACH_RESERVE_UNITS}-unit manoeuvring reserve. Refuel before departure.`
    );
  return reasons.length ? { ok: false, quote, reasons } : { ok: true, quote, reasons: [] };
}

/** Prepares one paid-fuel return, lazy world catch-up and a durable receipt on isolated state. */
export function prepareHomeboundJourney(
  original: GameSave,
  source: SolarSystem | null,
  assetId: string,
  world: HaulJourneyWorld,
  expectedQuote?: HomeboundQuote
): HomeboundPreparation {
  try {
    const save = structuredClone(parseGameSave(original));
    const result = quoteHomeboundJourney(save, assetId);
    if (!result.ok) throw new Error(result.reasons.join(' '));
    const quote = result.quote;
    if (
      expectedQuote &&
      (Object.keys(quote) as Array<keyof HomeboundQuote>).some((key) => quote[key] !== expectedQuote[key])
    )
      throw new Error('Return conditions changed. Review and confirm a fresh quote.');
    if (
      save.location.kind === 'system' &&
      (!source || !sameHaulAddress(systemAddress(source), save.location))
    )
      throw new Error('Departure system does not match the ship location.');
    const asset = save.infrastructure.find((entry) => entry.assetId === assetId)!;
    const route = asset.homeboundRoute!;
    const destination = world.createSystem(route.systemAddress);
    if (
      !destination ||
      destination === source ||
      destination.isStarless ||
      !sameHaulAddress(systemAddress(destination), route.systemAddress)
    )
      throw new Error('The home port system is unavailable.');
    const time = prepareBulkTimeAdvance(save, quote.durationSeconds);
    const history = new Map(save.systemOrbitHistory.map((entry) => [systemAddressKey(entry), entry]));
    if (source) {
      if (source.lastAppliedBulkSeconds !== save.bulkAdvanceSeconds)
        throw new Error('Departure system must finish orbital catch-up before travel.');
      history.set(systemAddressKey(systemAddress(source)), {
        ...systemAddress(source),
        orbit: captureSystemOrbit(source),
      });
      save.planetMutations = [
        ...save.planetMutations.filter((entry) => !sameHaulAddress(entry, systemAddress(source))),
        ...capturePlanetMutations(source),
      ];
    }
    const key = systemAddressKey(route.systemAddress);
    restorePlanetProgress(destination, save.planetMutations);
    restoreSystemOrbits(destination, history.get(key)?.orbit, save.planetMutations, time.bulkAdvanceSeconds);
    const registry = new InfrastructureRegistry();
    registry.restore(save.infrastructure);
    registry.materialize(destination, time.bulkAdvanceSeconds);
    const nextTow = save.heavyHaul.activeTow;
    materializeHaulSites(
      destination,
      nextTow ? save.activeMissions[nextTow.missionId] : undefined,
      history.get(key)?.orbit,
      time.bulkAdvanceSeconds,
      nextTow?.stage
    );
    const station = destination.stations.find(
      (entry) =>
        (route.stationId ? entry.id === route.stationId : entry.name === route.stationName) &&
        entry.capabilities.fuel
    );
    if (!station) throw new Error('The original operational port cannot be located.');
    let position: { x: number; y: number } | undefined;
    for (let index = 0; index < 64; index++) {
      const angle = ((index % 16) * Math.PI * 2) / 16;
      const radius = 2e9 * (1 + Math.floor(index / 16));
      const candidate = {
        x: station.systemX + Math.cos(angle) * radius,
        y: station.systemY + Math.sin(angle) * radius,
      };
      if (isSafeJourneyPosition(destination, candidate)) {
        position = candidate;
        break;
      }
    }
    if (!position) throw new Error('No safe arrival position near the home port.');
    registry.capture(destination);
    const receipt: HomeboundJourneyReceipt = {
      operationId: `${asset.assetId}:return`,
      departureSeconds: save.gameClockElapsedSeconds,
      arrivalSeconds: time.gameClockElapsedSeconds,
      durationSeconds: quote.durationSeconds,
      fuelConsumedUnits: quote.fuelUnits,
    };
    save.infrastructure = registry
      .createSnapshot()
      .map((entry) => (entry.assetId === assetId ? { ...entry, homeboundReceipt: receipt } : entry));
    const orbit = captureSystemOrbit(destination);
    history.set(key, { ...systemAddress(destination), orbit });
    save.planetMutations = [
      ...save.planetMutations.filter((entry) => !sameHaulAddress(entry, route.systemAddress)),
      ...capturePlanetMutations(destination),
    ];
    Object.assign(save, time, {
      location: { kind: 'system', ...route.systemAddress },
      systemOrbit: orbit,
      systemOrbitHistory: [...history.values()],
      savedAt: new Date().toISOString(),
    });
    save.player.resources.fuel -= quote.fuelUnits;
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
    if (save.observatory)
      save.observatory.destination = { ...route.systemAddress, name: route.stationName, kind: 'system' };
    parseGameSave(save);
    return {
      ok: true,
      journey: { save, system: destination, position, quote, receipt, route, stationId: station.id },
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Automatic return unavailable.' };
  }
}

/** Checkpoints time, fuel and the one-time receipt together before touching the live vessel. */
export function commitPreparedHomeboundJourney(
  journey: PreparedHomeboundJourney,
  checkpoint: ((save: GameSave) => void) | undefined,
  apply: (journey: PreparedHomeboundJourney) => void
): { readonly ok: boolean; readonly message: string } {
  return commitHaulChange(
    { ok: true, save: journey.save, message: `Returned to ${journey.route.stationName}.` },
    checkpoint,
    () => apply(journey)
  );
}
