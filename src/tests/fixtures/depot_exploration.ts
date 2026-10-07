import { DepotCommunications } from '../../core/depot_communications';
import { FrontierCatalogue } from '../../core/frontier_catalogue';
import { InfrastructureRegistry } from '../../core/infrastructure_registry';
import { ScanService } from '../../core/scan_service';
import { parseGameSave, type GameSave } from '../../core/save_game';
import { SurveyDataService } from '../../core/survey_data_service';
import { capturePlanetMutations, restorePlanetProgress } from '../../core/system_orbit_state';
import { SystemDataGenerator } from '../../generation/system_data_generator';
import { PRNG } from '../../utils/prng';
import { depotContractFixture, depotContractSave } from './depot_contracts';
import { haulSystemFixture } from './heavy_haul_journeys';

/** Shares real transaction owners between a supply-dependent depot, a miner and a staffed supplier. */
export function depotExplorationFixture() {
  const fixture = depotContractFixture();
  const miningAddress = { worldX: 25, worldY: 0, systemSlot: 0 };
  const miningSystem = haulSystemFixture(miningAddress, null, true);
  const miningStation = miningSystem.starbase!;
  const source = miningSystem.planets[0];
  if (!source) throw new Error('Expected a catalogue mining body.');
  // Control source eligibility, not the extraction profile: production assessment must derive both outputs.
  Object.assign(source, {
    type: 'Frozen',
    surfaceTemp: 180,
    gravity: 0.2,
    atmosphere: { ...source.atmosphere, pressure: 0 },
    elementAbundance: { IRON: 8, WATER_ICE: 20 },
  });
  miningStation.orbitHost = source.orbitHost;
  miningStation.orbitDistance = source.orbitDistance;
  // Keep the other depot deliberately supply-dependent even if its catalogue happens to support extraction.
  const records = fixture.depots.createSnapshot();
  records[fixture.station.id].extraction = [];
  fixture.depots.restoreSnapshot(records);
  fixture.depots.ensureStation(miningStation, miningAddress, 0, 0, miningSystem);
  fixture.contracts.refreshStation(miningStation, miningSystem, 0);
  const science = new SurveyDataService();
  science.ensureBuyer(fixture.station.id, fixture.address);
  science.ensureBuyer(miningStation.id, miningAddress);
  const scan = new ScanService();
  const prng = new PRNG(fixture.seed);
  const communications = new DepotCommunications(
    new FrontierCatalogue(new SystemDataGenerator(prng), prng),
    new InfrastructureRegistry(),
    fixture.depots,
    fixture.commerce,
    fixture.progress
  );
  const supplierId = 'depot-playthrough-supplier';
  fixture.commerce.registerStation(supplierId, 'starbase');
  return {
    ...fixture,
    miningAddress,
    miningSystem,
    miningStation,
    science,
    scan,
    communications,
    supplierId,
  };
}

/** Captures both visited catalogues and all depot owners through the normal strict save boundary. */
export function depotExplorationSave(
  fixture: ReturnType<typeof depotExplorationFixture>,
  seconds = 0,
  bulkAdvanceSeconds = 0
): GameSave {
  return parseGameSave({
    ...depotContractSave(fixture),
    gameClockElapsedSeconds: seconds,
    bulkAdvanceSeconds,
    surveyData: fixture.science.createSnapshot(),
    communications: fixture.communications.createSnapshot(),
    catalogueDiscoveries: fixture.scan.createSnapshot(),
    planetMutations: [
      ...capturePlanetMutations(fixture.system),
      ...capturePlanetMutations(fixture.miningSystem),
    ],
  });
}

/** Rehydrates the captured owners and discoveries without executing work, payments or time catch-up. */
export function restoreDepotExploration(
  fixture: ReturnType<typeof depotExplorationFixture>,
  saved: GameSave
): void {
  const save = parseGameSave(JSON.stringify(saved));
  Object.assign(fixture.player, structuredClone(save.player));
  fixture.commerce.restoreSnapshot(save.economy);
  fixture.depots.restoreSnapshot(save.depots);
  fixture.progress.restoreSnapshot(save);
  fixture.science.restoreSnapshot(save.surveyData);
  fixture.communications.restoreSnapshot(save.communications);
  fixture.scan.restoreSnapshot(save.catalogueDiscoveries);
  restorePlanetProgress(fixture.system, save.planetMutations);
  restorePlanetProgress(fixture.miningSystem, save.planetMutations);
}
