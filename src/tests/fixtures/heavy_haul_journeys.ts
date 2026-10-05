import { CONFIG } from '../../config';
import { Player } from '../../core/player';
import { MissionProgressService } from '../../core/mission_progress';
import { HeavyHaulService } from '../../core/heavy_haul_service';
import { getHeavyHaulObjective, type MissionSystemAddress } from '../../core/mission_board';
import { SAVE_GAME_VERSION, type GameSave } from '../../core/save_game';
import { createObservatorySnapshot } from '../../core/observatory_types';
import { capturePlanetMutations, captureSystemOrbit, systemAddress } from '../../core/system_orbit_state';
import { createXenobiologySnapshot } from '../../entities/biology/biology_types';
import { SolarSystem } from '../../entities/solar_system';
import type { StellarArchitecture } from '../../entities/stellar_body';
import { PRNG } from '../../utils/prng';
import {
  heavyHaulContextFixture,
  heavyHaulMissionFixture,
  haulRendezvousFixture,
} from './heavy_haul_contracts';

/** Creates a real, deterministic local world without assuming production stars exist at fixture coordinates. */
export function haulSystemFixture(
  address: MissionSystemAddress,
  architecture: StellarArchitecture | null = null
): SolarSystem {
  return new SolarSystem(
    {
      exists: true,
      starType: 'G',
      name: `Haul fixture ${address.worldX}`,
      hasStarbase: address.worldX === 0,
      stationKind: address.worldX === 0 ? 'automated-depot' : null,
      ageGyr: 5,
      metallicityFeH: 0,
      architecture,
      objectKind: 'stellar',
      systemSlot: address.systemSlot,
    },
    address.worldX,
    address.worldY,
    new PRNG('haul-journey-fixture')
  );
}

/** Builds a coupled vessel at a legal staging point, with frozen terms and a real existing resupply station. */
export function haulJourneyFixture(kind: 'local' | 'medium' | 'heavy' = 'heavy') {
  const mission = heavyHaulMissionFixture(kind);
  const objective = getHeavyHaulObjective(mission)!;
  const source = haulSystemFixture(objective.pickup.systemAddress);
  if (!source.starbase) throw new Error('Expected fixture resupply station.');
  mission.originStarbaseId = source.starbase.id;
  const context = {
    ...heavyHaulContextFixture(),
    onward: {
      verified: true,
      resupplyStationId: source.starbase.id,
      distanceLy: objective.destination.systemAddress.worldX * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS,
      commissioningFuelUnits: 0,
    },
  };
  const player = new Player(0, 0, '@', 'haul-journey-fixture');
  player.ship = structuredClone(context.ship);
  player.crew = structuredClone([...context.crew]);
  player.resources.fuel = context.normalFuelUnits;
  player.resources.maxFuel = context.maximumNormalFuelUnits;
  player.position.systemX = kind === 'local' ? objective.pickup.orbit.radiusM : source.edgeRadius * 0.9;
  player.position.systemY = kind === 'local' ? 1e10 : 0;
  const missions = new MissionProgressService();
  const haul = new HeavyHaulService(missions);
  if (!haul.accept(mission, context).ok || !haul.couple(haulRendezvousFixture(objective.pickup), context).ok)
    throw new Error('Expected ready fixture attachment.');
  const orbit = captureSystemOrbit(source);
  const save: GameSave = {
    version: SAVE_GAME_VERSION,
    generationVersion: CONFIG.GALAXY_MODEL_VERSION,
    seed: 'haul-journey-fixture',
    savedAt: '2026-10-05T00:00:00Z',
    gameClockElapsedSeconds: 100,
    bulkAdvanceSeconds: 0,
    heavyHaul: haul.createSnapshot(),
    infrastructure: [],
    player: structuredClone({
      position: player.position,
      render: player.render,
      resources: player.resources,
      cargoHold: player.cargoHold,
      terrainVehicle: player.terrainVehicle,
      ship: player.ship,
      crew: player.crew,
    }),
    location: { kind: 'system', ...systemAddress(source) },
    systemOrbit: orbit,
    systemOrbitHistory: [{ ...systemAddress(source), orbit }],
    planetMutations: capturePlanetMutations(source),
    ...missions.createSnapshot(),
    catalogueDiscoveries: {},
    economy: {},
    observatory: createObservatorySnapshot(),
    xenobiology: createXenobiologySnapshot(),
    tutorialHintsShown: [],
  };
  const world = {
    createSystem: (address: MissionSystemAddress) => {
      if (address.systemSlot !== 0 || address.worldY !== 0 || ![0, 25, 100].includes(address.worldX))
        return null;
      return haulSystemFixture(address);
    },
  };
  const request = { resupply: { systemAddress: systemAddress(source), stationId: source.starbase.id } };
  return { save, source, mission, objective, haul, missions, context, player, world, request };
}
