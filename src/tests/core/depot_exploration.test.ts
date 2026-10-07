import { describe, expect, it } from 'vitest';
import { DEPOT_MONTH_SECONDS } from '../../core/depot_extraction';
import { prepareHaulJourney } from '../../core/heavy_haul_journey';
import { parseGameSave, getSystemPlanetPaths } from '../../core/save_game';
import { recordLocalSurvey } from '../../core/survey_observations';
import { surveyObjectKey, type SurveyTarget } from '../../core/survey_data_types';
import { readReadySurfaceData } from '../../entities/planet/surface_data';
import {
  depotExplorationFixture,
  depotExplorationSave,
  restoreDepotExploration,
} from '../fixtures/depot_exploration';
import { haulJourneyFixture } from '../fixtures/heavy_haul_journeys';

describe('frontier depot exploration loop', () => {
  it('combines real supply purchases, service work, orbital contract and science payments across reloads', () => {
    const f = depotExplorationFixture();
    f.player.resources.credits = 1000;
    const contact = { stationId: f.station.id, name: f.station.name, address: f.address };
    const beforeReception = depotExplorationSave(f);
    expect(f.communications.receive([contact], 0)).toBe(1);
    expect(f.commerce.createSnapshot()).toEqual(beforeReception.economy);
    expect(f.progress.createSnapshot().activeMissions).toEqual({});
    f.communications.markRead(contact.stationId);

    const supply = f.contracts.list(f.station, f.system).find((mission) => mission.type === 'supply')!;
    const objective = supply.objectives[0];
    if (objective.kind !== 'delivery') throw new Error('Expected supply objective.');
    const survey = f.contracts.list(f.station, f.system).find((mission) => mission.type === 'survey')!;
    const body = getSystemPlanetPaths(f.system).find(
      ({ path }) => path === survey.objectives[0].location?.bodyPath
    )!;
    expect(f.contracts.accept(supply, f.station, f.system).ok).toBe(true);
    expect(f.contracts.accept(survey, f.station, f.system).ok).toBe(true);
    restoreDepotExploration(f, depotExplorationSave(f));
    expect(f.progress.getStatus(supply)).toBe('ACTIVE');
    expect(f.progress.getStatus(survey)).toBe('ACTIVE');

    // The player must actually buy and carry a complete lot from another market.
    const purchase = f.commerce.buyItem(f.supplierId, objective.itemKey, objective.quantity);
    expect(purchase.effects.cargoAdded?.amount).toBe(objective.quantity);
    expect(f.progress.getStatus(supply)).toBe('READY');
    const handoffStock = f.commerce.getStock(f.station.id, objective.itemKey);
    const beforeHandoff = f.player.resources.credits;
    expect(f.contracts.settle(supply.id, f.station).ok).toBe(true);
    expect(f.player.resources.credits).toBe(beforeHandoff + supply.rewardCredits);
    expect(f.commerce.getStock(f.station.id, objective.itemKey)).toBe(handoffStock + objective.quantity);
    expect(f.player.cargoHold.items[objective.itemKey]).toBeUndefined();

    // Buy missing service materials rather than replacing the depot's depleted ledger.
    for (const key of [
      'TITANIUM_TRUSS',
      'REPAIR_SPARES',
      'MEDICAL_SUPPLIES',
      'HELIUM_3',
      'DEUTERIUM_PELLETS',
    ]) {
      expect(f.commerce.buyItem(f.supplierId, key, 2).effects.cargoAdded?.amount).toBe(2);
    }
    f.player.ship.damage.hullIntegrity = 90;
    f.player.terrainVehicle.integrity = 80;
    f.player.crew[0].hitPoints -= 10;
    f.player.resources.fuel -= 40;
    for (const [kind, target] of [
      ['repair', 'all'],
      ['medical', 'all'],
      ['fuel', 'fuel'],
    ] as const) {
      const quote = f.depots.quote(f.station.id, kind, target, true);
      expect(quote.completedUnits).toBe(quote.requestedUnits);
      expect(f.depots.purchase(quote).ok).toBe(true);
    }
    expect(f.player.ship.damage.hullIntegrity).toBe(100);
    expect(f.player.terrainVehicle.integrity).toBe(100);
    expect(f.player.resources.fuel).toBe(f.player.resources.maxFuel);
    expect(f.player.crew[0].hitPoints).toBe(f.player.crew[0].maxHitPoints);

    expect(f.science.download(f.address, f.system.name, 0)).toBe(true);
    expect(f.progress.getStatus(survey)).toBe('ACTIVE');
    expect(f.science.listEvidence()).toEqual([]);
    const resolution = f.scan.resolvePlanet(body.planet, 'surveyed', 100, 'orbital-survey');
    f.progress.recordDiscovery(body.planet, f.system.name, resolution.current.level, f.system);
    recordLocalSurvey(f.science, body.planet, f.system, resolution.current.level, 0);
    expect(f.progress.getStatus(survey)).toBe('READY');
    expect(readReadySurfaceData(body.planet)).toBeNull();
    const key = surveyObjectKey(f.address, body.path as SurveyTarget);
    const sale = f.science.quote(f.station.id, key)!;
    expect(sale.reward).toBe(90);
    expect(f.science.upload(sale, f.player).ok).toBe(true);
    expect(f.contracts.settle(survey.id, f.station).credits).toBe(420);

    const paid = depotExplorationSave(f);
    restoreDepotExploration(f, paid);
    expect(depotExplorationSave(f)).toEqual(paid);
    expect(f.contracts.settle(supply.id, f.station).ok).toBe(false);
    expect(f.contracts.settle(survey.id, f.station).ok).toBe(false);
    expect(f.science.upload(f.science.quote(f.miningStation.id, key)!, f.player).ok).toBe(false);
    expect(depotExplorationSave(f)).toEqual(paid);
    expect(f.communications.list(0)[0].read).toBe(true);

    // A later, genuinely better observation can be sold elsewhere for the incremental value only.
    f.scan.resolvePlanet(body.planet, 'mapped', 100, 'surface-map');
    recordLocalSurvey(f.science, body.planet, f.system, 'mapped', 0);
    expect(f.science.upload(f.science.quote(f.miningStation.id, key)!, f.player).credits).toBe(45);
    expect(f.science.quote(f.station.id, key)!.reward).toBe(0);
    expect(f.science.availableCredits(f.station.id)).toBe(2400 - 90);
    expect(f.science.availableCredits(f.miningStation.id)).toBe(2400 - 45);
  });

  it('keeps deferred depot inventories and finite funding intact through a real hypersleep journey', () => {
    const f = depotExplorationFixture();
    const miningId = f.miningStation.id;
    expect(f.depots.getRecord(miningId)!.extraction!.map((output) => output.itemKey)).toEqual([
      'IRON',
      'WATER_ICE',
    ]);
    for (const station of [f.station, f.miningStation]) {
      f.commerce.consumeStock(station.id, {
        HELIUM_3: f.commerce.getStock(station.id, 'HELIUM_3'),
        DEUTERIUM_PELLETS: f.commerce.getStock(station.id, 'DEUTERIUM_PELLETS'),
      });
    }
    const supply = f.contracts.list(f.station, f.system).find((offer) => offer.type === 'supply')!;
    const delivery = supply.objectives[0];
    if (delivery.kind !== 'delivery') throw new Error('Expected supply objective.');
    expect(f.contracts.accept(supply, f.station, f.system).ok).toBe(true);
    expect(
      f.commerce.buyItem(f.supplierId, delivery.itemKey, delivery.quantity).effects.cargoAdded?.amount
    ).toBe(delivery.quantity);
    expect(f.contracts.settle(supply.id, f.station).ok).toBe(true);
    // Leave both reactors depleted even when this deterministic board selected a fuel delivery.
    for (const station of [f.station, f.miningStation]) {
      f.commerce.consumeStock(station.id, {
        HELIUM_3: f.commerce.getStock(station.id, 'HELIUM_3'),
        DEUTERIUM_PELLETS: f.commerce.getStock(station.id, 'DEUTERIUM_PELLETS'),
      });
    }
    const key = surveyObjectKey(f.address, 'stars');
    f.science.record(f.address, 'stars', f.system.name, 3, 'local-scan', 0);
    expect(f.science.upload(f.science.quote(f.station.id, key)!, f.player).ok).toBe(true);
    const depotSave = depotExplorationSave(f);
    const haul = haulJourneyFixture();
    const departure = parseGameSave({
      ...haul.save,
      economy: depotSave.economy,
      depots: depotSave.depots,
      surveyData: depotSave.surveyData,
      communications: depotSave.communications,
      completedMissionIds: [...haul.save.completedMissionIds, ...depotSave.completedMissionIds],
    });
    const prepared = prepareHaulJourney(departure, haul.source, haul.request, haul.world);
    if (!prepared.ok) throw new Error(prepared.message);
    const arrived = parseGameSave(JSON.stringify(prepared.journey.save));
    expect(prepared.journey.quote.requiredBerths).toBeGreaterThan(0);
    expect(prepared.journey.quote.durationSeconds).toBeGreaterThan(12 * DEPOT_MONTH_SECONDS);
    expect(arrived.depots).toEqual(departure.depots);
    expect(arrived.economy).toEqual(departure.economy);
    expect(arrived.surveyData).toEqual(departure.surveyData);
    expect(arrived.player.resources.fuel).toBe(departure.player.resources.fuel);

    f.commerce.restoreSnapshot(arrived.economy);
    f.depots.restoreSnapshot(arrived.depots);
    f.science.restoreSnapshot(arrived.surveyData);
    const seconds = arrived.gameClockElapsedSeconds;
    f.depots.ensureStation(f.station, f.address, seconds, 0, f.system);
    f.depots.ensureStation(f.miningStation, f.miningAddress, seconds, 0, f.miningSystem);
    f.contracts.refreshStation(f.station, f.system, seconds);
    f.contracts.refreshStation(f.miningStation, f.miningSystem, seconds);
    expect(f.commerce.getStock(miningId, 'IRON')).toBe(24);
    expect(f.commerce.getStock(miningId, 'WATER_ICE')).toBe(24);
    expect(f.depots.getRecord(f.station.id)!.extraction).toEqual([]);
    for (const station of [f.station, f.miningStation]) {
      expect(f.commerce.getStock(station.id, 'HELIUM_3')).toBe(0);
      expect(f.commerce.getStock(station.id, 'DEUTERIUM_PELLETS')).toBe(0);
      expect(f.depots.getRecord(station.id)!.jobs!.availableCredits).toBe(
        station.id === f.station.id ? 6000 - supply.rewardCredits : 6000
      );
      expect(f.depots.getRecord(station.id)!.jobs!.revision).toBe(2);
      for (const itemKey of ['REPAIR_SPARES', 'MEDICAL_SUPPLIES', 'TITANIUM_TRUSS']) {
        expect(f.commerce.getStock(station.id, itemKey)).toBe(
          departure.economy[station.id].items[itemKey].units
        );
      }
    }
    expect(f.commerce.getStock(f.station.id, 'IRON')).toBe(0);
    expect(f.commerce.getStock(f.station.id, 'WATER_ICE')).toBe(
      departure.economy[f.station.id].items.WATER_ICE.units
    );
    expect(f.science.availableCredits(f.station.id)).toBe(2360);
    expect(f.science.quote(miningId, key)!.reward).toBe(0);
    const revisited = depotExplorationSave(f, seconds, arrived.bulkAdvanceSeconds);
    restoreDepotExploration(f, revisited);
    // Revisiting the same epoch cannot replay the bulk journey or release overflow banked at capacity.
    expect(f.commerce.consumeStock(miningId, { IRON: 24 })).toBe(true);
    f.depots.ensureStation(f.miningStation, f.miningAddress, seconds, 0, f.miningSystem);
    expect(f.commerce.getStock(miningId, 'IRON')).toBe(0);
    f.depots.ensureStation(
      f.miningStation,
      f.miningAddress,
      seconds + DEPOT_MONTH_SECONDS / 2,
      0,
      f.miningSystem
    );
    expect(f.commerce.getStock(miningId, 'IRON')).toBe(1);
  });

  it('refuses a full-loop checkpoint failure without changing services, mission escrow or science receipts', () => {
    const f = depotExplorationFixture();
    f.player.ship.damage.hullIntegrity = 90;
    f.commerce.buyItem(f.supplierId, 'TITANIUM_TRUSS', 1);
    f.commerce.buyItem(f.supplierId, 'REPAIR_SPARES', 1);
    const before = depotExplorationSave(f);
    const quote = f.depots.quote(f.station.id, 'repair', 'hull', true);
    expect(quote.completedUnits).toBe(10);
    expect(
      f.depots.purchase(quote, (outcome) => {
        expect(
          parseGameSave({
            ...before,
            player: { ...before.player, ...outcome.player },
            economy: outcome.economy,
            depots: outcome.depots,
          }).player.ship.damage.hullIntegrity
        ).toBe(100);
        throw new Error('Checkpoint storage full');
      }).ok
    ).toBe(false);
    expect(depotExplorationSave(f)).toEqual(before);
  });
});
