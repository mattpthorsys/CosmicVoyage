import { Player } from '../../core/player';
import { createSurveyDataSnapshot } from '../../core/survey_data_types';
import { createCommunicationsSnapshot } from '../../core/communications_types';
import { CargoSystem } from '../../systems/cargo_systems';
import { StarbaseCommerceService } from '../../core/starbase_commerce';
import { DepotService } from '../../core/depot_service';
import { DepotContracts, DEPOT_SUPPLY_TARGETS } from '../../core/depot_contracts';
import { MissionProgressService } from '../../core/mission_progress';
import { haulSystemFixture } from './heavy_haul_journeys';
import { CONFIG } from '../../config';
import { SAVE_GAME_VERSION, type GameSave } from '../../core/save_game';
import { createHeavyHaulSnapshot } from '../../core/heavy_haul_types';
import { createObservatorySnapshot } from '../../core/observatory_types';
import { createXenobiologySnapshot } from '../../entities/biology/biology_types';

/** Creates real catalogue bodies and shared owners, with controlled supply shortages but no prepared terrain. */
export function depotContractFixture() {
  const seed = 'robot-contracts';
  const address = { worldX: 0, worldY: 0, systemSlot: 0 };
  const system = haulSystemFixture(address);
  const station = system.starbase!;
  const player = new Player(0, 0, '@', seed);
  const cargo = new CargoSystem();
  const commerce = new StarbaseCommerceService(player, cargo, 12345);
  const depots = new DepotService(commerce, seed, player, cargo);
  const progress = new MissionProgressService(() => player.cargoHold.items);
  const contracts = new DepotContracts(depots, commerce, progress, player, cargo, seed);
  depots.ensureStation(station, address, 0, 0, system);
  commerce.consumeStock(
    station.id,
    Object.fromEntries(
      Object.keys(DEPOT_SUPPLY_TARGETS).map((key) => [key, commerce.getStock(station.id, key)])
    )
  );
  contracts.refreshStation(station, system, 0);
  return { seed, address, system, station, player, cargo, commerce, depots, progress, contracts };
}

/** Captures the owners into a portable valid save without tying persistence tests to a generated destination. */
export function depotContractSave(fixture: ReturnType<typeof depotContractFixture>): GameSave {
  const { player, seed, depots, commerce, progress } = fixture;
  return {
    version: SAVE_GAME_VERSION,
    generationVersion: CONFIG.GALAXY_MODEL_VERSION,
    seed,
    savedAt: '2026-10-07T00:00:00Z',
    gameClockElapsedSeconds: depots.getRecord(fixture.station.id)!.lastUpdatedSeconds,
    bulkAdvanceSeconds: 0,
    heavyHaul: createHeavyHaulSnapshot(),
    infrastructure: [],
    location: { kind: 'hyperspace', worldX: 0, worldY: 0, systemSlot: 0 },
    systemOrbit: null,
    systemOrbitHistory: [],
    planetMutations: [],
    player: structuredClone({
      position: player.position,
      render: player.render,
      resources: player.resources,
      cargoHold: player.cargoHold,
      terrainVehicle: player.terrainVehicle,
      crew: player.crew,
      ship: player.ship,
    }),
    ...progress.createSnapshot(),
    catalogueDiscoveries: {},
    observatory: createObservatorySnapshot(),
    economy: commerce.createSnapshot(),
    depots: depots.createSnapshot(),
    surveyData: createSurveyDataSnapshot(),
    communications: createCommunicationsSnapshot(),
    xenobiology: createXenobiologySnapshot(),
    tutorialHintsShown: [],
  };
}
