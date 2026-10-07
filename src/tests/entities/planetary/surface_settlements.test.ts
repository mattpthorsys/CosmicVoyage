import { describe, expect, it } from 'vitest';
import {
  createSurfaceSettlementLayer,
  getSurfaceSettlementCell,
  SURFACE_SETTLEMENT_LIMITS,
  SURFACE_SETTLEMENT_VERSION,
  type SurfaceSettlementProfile,
} from '../../../entities/planet/surface_settlements';
import { isLiquidCovered } from '../../../entities/planet/surface_liquid';
import { settlementTerrainFixture, type SettlementTerrainFixture } from '../../fixtures/settlements';
import { PRNG } from '../../../utils/prng';

const COMPLETE: SurfaceSettlementProfile = { stage: 'complete', diameterKm: 12800, breathable: true };
const PARTIAL: SurfaceSettlementProfile = { stage: 'partial', diameterKm: 12800, breathable: false };

/** Generates a small prepared layer without planetary characteristic or resource generation. */
function layerFor(kind: SettlementTerrainFixture = 'coast', profile = COMPLETE, seed = 'city-fixture') {
  const terrain = settlementTerrainFixture(kind);
  return createSurfaceSettlementLayer(seed, terrain.heightmap, terrain.liquid, profile);
}

describe('decorative planetary settlements', () => {
  it('requires an explicit colony profile rather than dry land or a native biosphere', () => {
    const { heightmap, liquid } = settlementTerrainFixture();
    expect(createSurfaceSettlementLayer('uninhabited', heightmap, liquid)).toBeNull();
    expect(createSurfaceSettlementLayer('depot-only', heightmap, liquid, null)).toBeNull();
    expect(
      createSurfaceSettlementLayer('invalid-size', heightmap, liquid, { ...COMPLETE, diameterKm: NaN })
    ).toBeNull();
    expect(createSurfaceSettlementLayer('empty', [], null, COMPLETE)).toBeNull();
    expect(createSurfaceSettlementLayer('ragged', [[1, 2, 3], [1], [1, 2, 3]], null, COMPLETE)).toBeNull();
  });

  it('is independent of resource PRNG consumption and unrelated generation order', () => {
    const root = new PRNG('city-fixture');
    const first = layerFor('coast', COMPLETE, root.getInitialSeed());
    for (let n = 0; n < 100; n++) root.next();
    layerFor('island', PARTIAL, 'another-world');
    expect(layerFor('coast', COMPLETE, root.getInitialSeed())).toEqual(first);
    expect(first?.version).toBe(SURFACE_SETTLEMENT_VERSION);
    expect(layerFor('coast', COMPLETE, 'different-world')).not.toEqual(first);
  });

  it('prepares bounded, sorted fractional coverage on genuine dry ground without changing inputs', () => {
    const terrain = settlementTerrainFixture('coast');
    const original = structuredClone(terrain);
    const layer = createSurfaceSettlementLayer('bounded-coast', terrain.heightmap, terrain.liquid, COMPLETE)!;
    expect(layer).not.toBeNull();
    expect(terrain).toEqual(original);
    expect(layer.sites.length).toBeGreaterThan(0);
    expect(layer.sites.length).toBeLessThanOrEqual(SURFACE_SETTLEMENT_LIMITS.sites);
    expect(layer.cells.length).toBeLessThanOrEqual(SURFACE_SETTLEMENT_LIMITS.layerCells);
    expect(layer.cells.length).toBeGreaterThan(0);
    const keys = layer.cells.map((cell) => cell.y * layer.longitudePeriod + cell.x);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
    expect(new Set(keys).size).toBe(keys.length);
    for (const cell of layer.cells) {
      expect(isLiquidCovered(terrain.heightmap[cell.y][cell.x], terrain.liquid)).toBe(false);
      expect(cell.coverage).toBeGreaterThan(0);
      expect(cell.coverage).toBeLessThanOrEqual(1);
      expect(cell.emission).toBeGreaterThan(0);
      expect(cell.emission).toBeLessThanOrEqual(cell.coverage);
      expect(layer.sites[cell.siteIndex]).toBeDefined();
      expect(getSurfaceSettlementCell(layer, cell.x, cell.y)).toBe(cell);
    }
    for (const site of layer.sites) {
      expect(site.patches.length).toBeLessThanOrEqual(SURFACE_SETTLEMENT_LIMITS.patchesPerSite);
      expect(isLiquidCovered(terrain.heightmap[Math.floor(site.y)][Math.floor(site.x)], terrain.liquid)).toBe(
        false
      );
    }
  });

  it('uses open urban regions only for complete breathable colonies', () => {
    const complete = layerFor('dry', COMPLETE)!;
    const partial = layerFor('dry', PARTIAL)!;
    const sealedComplete = layerFor('dry', { ...COMPLETE, breathable: false })!;
    expect(complete.sites.some((site) => site.archetype === 'urban')).toBe(true);
    expect(partial.sites.some((site) => site.archetype === 'sealed')).toBe(true);
    expect(partial.sites.every((site) => site.archetype !== 'urban')).toBe(true);
    expect(sealedComplete.sites.every((site) => site.archetype !== 'urban')).toBe(true);
    expect(complete.sites.length).toBeGreaterThan(partial.sites.length);
  });

  it('fits small islands without claiming water or modifying the coast', () => {
    const terrain = settlementTerrainFixture('island');
    const layer = createSurfaceSettlementLayer('small-island', terrain.heightmap, terrain.liquid, COMPLETE)!;
    expect(layer).not.toBeNull();
    expect(layer.sites.length).toBeGreaterThan(0);
    expect(layer.cells.every((cell) => terrain.heightmap[cell.y][cell.x] > terrain.liquid!.seaLevel)).toBe(
      true
    );
  });

  it('has a dry-site fallback even if valid land is smaller than the candidate sample spacing', () => {
    const terrain = settlementTerrainFixture('flooded', 257);
    terrain.heightmap[128][128] = 105;
    const layer = createSurfaceSettlementLayer('tiny-land', terrain.heightmap, terrain.liquid, COMPLETE)!;
    expect(layer).not.toBeNull();
    expect(layer.sites).toHaveLength(1);
    expect(layer.cells.every((cell) => cell.x === 128 && cell.y === 128)).toBe(true);
  });

  it('refuses flooded or uniformly rough worlds rather than relaxing terrain constraints', () => {
    expect(layerFor('flooded')).toBeNull();
    expect(layerFor('rough')).toBeNull();
    expect(layerFor('rough', PARTIAL)).toBeNull();
  });

  it('preserves nonzero physical coverage for habitats far smaller than one regional cell', () => {
    const layer = layerFor('dry', { ...PARTIAL, diameterKm: 50000 })!;
    expect(layer.cells.length).toBeGreaterThan(0);
    expect(layer.cells.every((cell) => cell.coverage < 0.01)).toBe(true);
    expect(layer.cells.reduce((sum, cell) => sum + cell.emission, 0)).toBeGreaterThan(0);
  });

  it('aliases the duplicated longitude endpoint without wrapping out-of-range latitude', () => {
    const terrain = settlementTerrainFixture('seam');
    const generated = createSurfaceSettlementLayer(
      'seam-colony',
      terrain.heightmap,
      terrain.liquid,
      COMPLETE
    )!;
    expect(generated).not.toBeNull();
    expect(generated.cells.every((cell) => cell.x < generated.longitudePeriod)).toBe(true);
    const cell = { ...generated.cells[0], x: 0, y: 20 };
    const layer = { ...generated, cells: [cell] };
    expect(getSurfaceSettlementCell(layer, 0, 20)).toBe(cell);
    expect(getSurfaceSettlementCell(layer, layer.sourceWidth - 1, 20)).toBe(cell);
    expect(getSurfaceSettlementCell(layer, -layer.longitudePeriod, 20)).toBe(cell);
    expect(getSurfaceSettlementCell(layer, 0, -1)).toBeNull();
    expect(getSurfaceSettlementCell(layer, 0, layer.sourceHeight)).toBeNull();
    expect(getSurfaceSettlementCell(layer, NaN, 20)).toBeNull();
    expect(getSurfaceSettlementCell(undefined, 0, 20)).toBeNull();
  });

  it('survives structured worker transport and JSON regeneration metadata without losing fractional values', () => {
    const layer = layerFor()!;
    expect(structuredClone(layer)).toEqual(layer);
    expect(JSON.parse(JSON.stringify(layer))).toEqual(layer);
    expect(layerFor()).toEqual(layer);
  });
});
