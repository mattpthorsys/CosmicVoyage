import { afterEach, describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../config';
import {
  CARGO_POD_COST,
  createShipyardUpgradeOptions,
  getStarbaseShipyardProfile,
} from '../../core/ship_modifications';
import { DEPOT_SUPPLY_TARGETS } from '../../core/depot_contracts';
import { recordLocalSurvey } from '../../core/survey_observations';
import { ScanService } from '../../core/scan_service';
import { getSystemPlanetPaths } from '../../core/save_game';
import { frameToSimulatedSeconds } from '../../core/simulation_time';
import { MovementSystem } from '../../systems/movement_system';
import { depotExplorationFixture } from '../fixtures/depot_exploration';

afterEach(() => vi.restoreAllMocks());

/** Measures representative round trips through production movement, markets, service quotes and science payments. */
function benchmarkRoute(oneWayLy: number, engineClass: number) {
  const f = depotExplorationFixture();
  f.player.resources.credits = 1000; // Compare with the intended balance, not the temporary 5,000 Cr playtest grant.
  f.player.ship.engineClass = engineClass;
  for (const [key, target] of Object.entries(DEPOT_SUPPLY_TARGETS)) {
    if (key !== 'REPAIR_SPARES') f.commerce.addStock(f.station.id, key, target);
  }
  const records = f.depots.createSnapshot();
  records[f.station.id].jobs = null;
  f.depots.restoreSnapshot(records);
  f.contracts.refreshStation(f.station, f.system, 0);
  const supply = f.contracts.list(f.station, f.system).find((offer) => offer.type === 'supply')!;
  const survey = f.contracts.list(f.station, f.system).find((offer) => offer.type === 'survey')!;
  const objective = supply.objectives[0];
  if (objective.kind !== 'delivery') throw new Error('Expected a logistics contract.');
  expect(f.contracts.accept(supply, f.station, f.system).ok).toBe(true);
  expect(f.contracts.accept(survey, f.station, f.system).ok).toBe(true);

  const initialFuel = f.player.resources.fuel;
  const cells = Math.round(oneWayLy / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS);
  let nowMs = 1000;
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
  const movement = new MovementSystem(f.player);
  let purchaseCost = 0;
  try {
    for (const dx of [1, -1]) {
      for (let step = 0; step < cells; step++) {
        nowMs += CONFIG.HYPERSPACE_MOVE_INTERVAL_MS + 1;
        movement.handleMoveRequest({
          dx,
          dy: 0,
          isFineControl: false,
          isBoost: false,
          context: 'hyperspace',
        });
      }
      if (dx === 1) {
        const purchase = f.commerce.buyItem(f.supplierId, objective.itemKey, objective.quantity);
        expect(purchase.effects.cargoAdded?.amount).toBe(objective.quantity);
        purchaseCost = -purchase.effects.creditsChanged!.amountChanged;
      }
    }
  } finally {
    movement.destroy();
  }
  expect(f.player.position.worldX).toBe(f.address.worldX);
  const fuelUsed = initialFuel - f.player.resources.fuel;
  expect(f.contracts.settle(supply.id, f.station).ok).toBe(true);

  const target = getSystemPlanetPaths(f.system).find(
    ({ path }) => path === survey.objectives[0].location?.bodyPath
  )!;
  const scan = new ScanService();
  const observation = scan.resolvePlanet(target.planet, 'surveyed', 100, 'orbital-survey');
  f.progress.recordDiscovery(target.planet, f.system.name, observation.current.level, f.system);
  recordLocalSurvey(f.science, target.planet, f.system, observation.current.level, 0);
  recordLocalSurvey(f.science, f.system, f.system, 'observed', 0);
  recordLocalSurvey(f.science, f.system.stars[0], f.system, 'observed', 0);
  expect(f.contracts.settle(survey.id, f.station).ok).toBe(true);
  let scienceIncome = 0;
  for (const { key } of f.science.listEvidence()) {
    const uploaded = f.science.upload(f.science.quote(f.station.id, key)!, f.player);
    expect(uploaded.ok).toBe(true);
    scienceIncome += uploaded.credits;
  }

  // Include a modest expedition's wear rather than treating fuel as its only expense.
  f.player.ship.damage.hullIntegrity -= 10;
  f.player.terrainVehicle.integrity = (f.player.terrainVehicle.integrity ?? 100) - 20;
  f.player.crew[0].hitPoints -= 10;
  let fieldServiceCost = 0;
  let refuelCost = 0;
  for (const [kind, targetId] of [
    ['repair', 'all'],
    ['medical', 'all'],
    ['fuel', 'fuel'],
  ] as const) {
    const quote = f.depots.quote(f.station.id, kind, targetId);
    expect(quote.completedUnits).toBeCloseTo(quote.requestedUnits);
    expect(f.depots.purchase(quote).ok).toBe(true);
    if (kind === 'fuel') refuelCost = quote.cost;
    else fieldServiceCost += quote.cost;
  }
  const upgrades = createShipyardUpgradeOptions(f.player.ship, getStarbaseShipyardProfile(f.supplierId));
  return {
    oneWayLy,
    engineClass,
    roundTripLy: cells * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS * 2,
    uninterruptedDriftDays:
      frameToSimulatedSeconds((cells * 2 * CONFIG.HYPERSPACE_MOVE_INTERVAL_MS) / 1000) / 86400,
    fuelUsed,
    refuelCost,
    purchaseCost,
    supplyIncome: supply.rewardCredits,
    surveyIncome: survey.rewardCredits,
    scienceIncome,
    fieldServiceCost,
    netCredits: f.player.resources.credits - 1000,
    cargoPodCost: CARGO_POD_COST,
    observatoryCost: upgrades.find((upgrade) => upgrade.id === 'shipyard:observatory:1')!.cost,
  };
}

describe('depot route economic guardrails', () => {
  it.each([
    [25, 1],
    [120, 1],
    [120, 3],
  ])(
    'keeps a %i ly one-way route with class %i useful without buying a major refit in one run',
    (oneWayLy, engineClass) => {
      const report = benchmarkRoute(oneWayLy, engineClass);
      expect(report.fuelUsed).toBeGreaterThan(0);
      expect(report.scienceIncome).toBe(185);
      expect(report.supplyIncome - report.purchaseCost).toBeGreaterThan(80);
      expect(report.netCredits).toBeGreaterThan(0);
      expect(report.netCredits).toBeLessThan(report.cargoPodCost);
      expect(report.cargoPodCost).toBeLessThan(report.observatoryCost);
      if (process.env.DEPOT_ROUTE_REPORT) console.info('DEPOT_ROUTE ' + JSON.stringify(report));
    }
  );
});
