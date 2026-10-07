import { describe, expect, it } from 'vitest';
import { catchUpDepotOutput, DEPOT_MONTH_SECONDS, deriveDepotExtraction } from '../../core/depot_extraction';
import { DepotService } from '../../core/depot_service';
import type { DepotExtractionOutput } from '../../core/depot_types';
import { validateDepotSnapshot } from '../../core/depot_types';
import { StarbaseCommerceService } from '../../core/starbase_commerce';
import { Player } from '../../core/player';
import { CargoSystem } from '../../systems/cargo_systems';
import { Starbase } from '../../entities/starbase';
import { Planet } from '../../entities/planet';
import type { SolarSystem } from '../../entities/solar_system';
import { PRNG } from '../../utils/prng';
import { createDepotResourceDialog } from '../../core/depot_service_console';
import { TerminalDialog } from '../../core/terminal_dialog';

/** Defines a small verified raw-material output in the same units as depot inventories. */
function outputFixture(): DepotExtractionOutput {
  return {
    itemKey: 'IRON',
    sourceBodyPath: 'planet:0',
    sourceBodyName: 'Cold rock',
    unitsPerMonth: 2,
    capacity: 24,
    carry: 0,
  };
}

/** Uses catalogue-only planet fields; the surface getter deliberately fails if extraction tries to use it. */
function extractionFixture() {
  const player = new Player();
  const cargo = new CargoSystem();
  const commerce = new StarbaseCommerceService(player, cargo, 123);
  const service = new DepotService(commerce, 'extraction', player, cargo);
  const station = new Starbase('miner', new PRNG('miner'), 'Frontier', 'automated-depot');
  const planet = Object.assign(Object.create(Planet.prototype), {
    name: 'Cold rock',
    type: 'Frozen',
    orbitHost: station.orbitHost,
    orbitDistance: station.orbitDistance,
    surfaceTemp: 180,
    gravity: 0.2,
    atmosphere: { pressure: 0 },
    elementAbundance: { IRON: 8, WATER_ICE: 20 },
    moons: [],
    getSurfaceData: () => {
      throw new Error('Terrain must not be prepared');
    },
  }) as Planet;
  // Only generated catalogue fields are needed by the source assessor.
  const system = { planets: [planet] } as unknown as SolarSystem;
  const address = { worldX: 1, worldY: 2, systemSlot: 0 };
  service.ensureStation(station, address, 0, 0, system);
  return { service, commerce, station, system, address, planet };
}

describe('bounded depot extraction', () => {
  it('handles zero, negative and huge elapsed intervals', () => {
    const output = { ...outputFixture(), carry: 0.25 };
    expect(catchUpDepotOutput(output, 0, 0)).toEqual({ added: 0, carry: 0.25 });
    expect(() => catchUpDepotOutput(output, 0, -1)).toThrow();
    expect(() => catchUpDepotOutput(output, 0, Infinity)).toThrow();
    expect(catchUpDepotOutput(output, 0, 1e300)).toEqual({ added: 24, carry: 0 });
  });

  it('accumulates fractional work and matches partitioned catch-up', () => {
    const output = outputFixture();
    let stock = 0;
    for (let i = 0; i < 100; i++) {
      const result = catchUpDepotOutput(output, stock, DEPOT_MONTH_SECONDS / 100);
      stock += result.added;
      output.carry = result.carry;
    }
    expect(stock).toBe(2);
    expect(output.carry).toBeCloseTo(0);
    expect(catchUpDepotOutput(outputFixture(), 0, DEPOT_MONTH_SECONDS)).toEqual({ added: 2, carry: 0 });
  });

  it('discards full-store overflow and does not instantly refill after depletion', () => {
    const { service, commerce, station, address, system } = extractionFixture();
    service.ensureStation(station, address, 20 * DEPOT_MONTH_SECONDS, 0, system);
    expect(commerce.getStock(station.id, 'IRON')).toBe(24);
    commerce.consumeStock(station.id, { IRON: 24 });
    service.ensureStation(station, address, 20 * DEPOT_MONTH_SECONDS, 0, system);
    expect(commerce.getStock(station.id, 'IRON')).toBe(0);
    service.ensureStation(station, address, 20.25 * DEPOT_MONTH_SECONDS, 0, system);
    expect(commerce.getStock(station.id, 'IRON')).toBe(0);
    expect(service.getRecord(station.id)?.extraction?.[0].carry).toBeCloseTo(0.5);
  });

  it('uses actual source chemistry, orbit host, accessibility and temperature', () => {
    const { station, system, planet } = extractionFixture();
    expect(deriveDepotExtraction(station, system).map((output) => output.itemKey)).toEqual([
      'IRON',
      'WATER_ICE',
    ]);
    Object.assign(planet, { surfaceTemp: 300 });
    expect(deriveDepotExtraction(station, system).map((output) => output.itemKey)).toEqual(['IRON']);
    Object.assign(planet, { elementAbundance: {} });
    expect(deriveDepotExtraction(station, system)).toEqual([]);
    Object.assign(planet, {
      elementAbundance: { IRON: 8 },
      orbitHost: { kind: 'circumstellar', starId: 'other' },
    });
    expect(deriveDepotExtraction(station, system)).toEqual([]);
  });

  it.each([{ gravity: 2 }, { surfaceTemp: 700 }, { type: 'GasGiant' }, { orbitDistance: 1e15 }])(
    'excludes inaccessible source %j',
    (change) => {
      const { station, system, planet } = extractionFixture();
      Object.assign(planet, change);
      expect(deriveDepotExtraction(station, system)).toEqual([]);
    }
  );

  it('preserves supply depletion and restores fractional carry without duplicate output', () => {
    const { service, commerce, station, address, system } = extractionFixture();
    const supplies = ['REPAIR_SPARES', 'MEDICAL_SUPPLIES', 'HELIUM_3', 'DEUTERIUM_PELLETS'];
    commerce.consumeStock(
      station.id,
      Object.fromEntries(supplies.map((key) => [key, commerce.getStock(station.id, key)]))
    );
    service.ensureStation(station, address, DEPOT_MONTH_SECONDS / 4, 0, system);
    const depots = service.createSnapshot();
    const economy = commerce.createSnapshot();
    validateDepotSnapshot(depots, DEPOT_MONTH_SECONDS / 4, economy);
    service.restoreSnapshot(depots);
    commerce.restoreSnapshot(economy);
    service.ensureStation(station, address, DEPOT_MONTH_SECONDS / 2, 0, system);
    expect(commerce.getStock(station.id, 'IRON')).toBe(1);
    expect(supplies.every((key) => commerce.getStock(station.id, key) === 0)).toBe(true);
    expect(() => service.ensureStation(station, address, 0, 0, system)).toThrow();
  });

  it('does not delete traded stock above production capacity', () => {
    const { service, commerce, station, address, system } = extractionFixture();
    commerce.addStock(station.id, 'IRON', 30);
    service.ensureStation(station, address, DEPOT_MONTH_SECONDS, 0, system);
    expect(commerce.getStock(station.id, 'IRON')).toBe(30);
  });

  it('assesses migrated profiles without generating historical output', () => {
    const { service, commerce, station, address, system } = extractionFixture();
    const snapshot = service.createSnapshot();
    snapshot[station.id].extraction = null;
    service.restoreSnapshot(snapshot);
    service.ensureStation(station, address, 100 * DEPOT_MONTH_SECONDS, 0, system);
    expect(commerce.getStock(station.id, 'IRON')).toBe(0);
  });

  it('wraps resource reports through the existing scrollable terminal on narrow grids', () => {
    const { service, commerce, station } = extractionFixture();
    const record = service.getRecord(station.id)!;
    const dialog = new TerminalDialog();
    dialog.open(
      createDepotResourceDialog(station.name, record, { IRON: commerce.getStock(station.id, 'IRON') })
    );
    const model = dialog.createModel(30, 18);
    expect(model.lineCount).toBeGreaterThan(model.visibleRows);
    expect(
      model.lines.every(
        (line) => line.segments.reduce((sum, span) => sum + span.text.length, 0) <= model.width - 6
      )
    ).toBe(true);
  });
});
