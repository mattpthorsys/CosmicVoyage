import { describe, expect, it } from 'vitest';
import { OrbitDossier } from '../../../core/orbit_dossier';
import { getPlanetSettlementCatalog, OrbitSettlements } from '../../../core/orbit_settlements';
import { Planet } from '../../../entities/planet';
import {
  getSettlementCatalog,
  getSurfaceSettlementIdentity,
} from '../../../entities/planet/settlement_identity';
import type { SurfaceSettlementLayer } from '../../../entities/planet/surface_settlements';
import { settlementLayerFixture } from '../../fixtures/settlements';

/** Supplies a ready colony map using the same legacy adapter as rendering fixtures. */
function directoryBody(count = 12): { body: Planet; layer: SurfaceSettlementLayer } {
  const base = settlementLayerFixture([{ x: 2, y: 3, coverage: 0.1, emission: 0.01, siteIndex: 0 }]);
  const archetypes = ['urban', 'sealed', 'industrial'] as const;
  const layer: SurfaceSettlementLayer = {
    ...base,
    sites: Array.from({ length: count }, (_, index) => ({
      ...base.sites[0],
      id: `colony-${index}`,
      x: index + 2.5,
      y: 3.5,
      archetype: archetypes[index % 3],
    })),
  };
  const body = Object.assign(Object.create(Planet.prototype), {
    name: 'Atlas I',
    type: 'Rock',
    moons: [],
    settlements: layer,
    isSurfaceReady: () => true,
  }) as Planet;
  Object.defineProperty(body, 'heightmap', { value: Array.from({ length: 65 }, () => Array(65).fill(108)) });
  return { body, layer };
}

/** Returns visible terminal text without coupling content tests to a canvas implementation. */
function text(model: ReturnType<OrbitSettlements['createModel']>): string {
  return model
    .dashboard!.slice(model.viewOffset, model.viewOffset + model.visibleRowCount)
    .map((line) => line.segments.map((segment) => segment.text).join(''))
    .join('\n');
}

describe('settlement identities and orbital atlas', () => {
  it('caches immutable layer identities without mutating placements or depending on body names', () => {
    const { body, layer } = directoryBody();
    const before = JSON.stringify(layer);
    const catalog = getPlanetSettlementCatalog(body);
    expect(getSettlementCatalog(layer)).toBe(catalog);
    expect(new Set(catalog.map((entry) => entry.name)).size).toBe(12);
    body.name = 'Renamed I';
    expect(getPlanetSettlementCatalog(body)).toBe(catalog);
    const restored = JSON.parse(before) as SurfaceSettlementLayer;
    expect(getSettlementCatalog(restored)).toEqual(catalog);
    expect(JSON.stringify(layer)).toBe(before);
    expect(getSettlementCatalog({ ...layer, sites: [] })).toEqual([]);
    expect(getSettlementCatalog(null)).toEqual([]);
  });

  it('identifies fractional regional coverage and aliases the duplicated longitude seam', () => {
    const layer = settlementLayerFixture([{ x: 0, y: 3, coverage: 0.001, emission: 0, siteIndex: 0 }]);
    expect(getSurfaceSettlementIdentity(layer, 0, 3)).toBe(getSettlementCatalog(layer)[0]);
    expect(getSurfaceSettlementIdentity(layer, 64, 3)).toBe(getSettlementCatalog(layer)[0]);
    expect(getSurfaceSettlementIdentity(layer, 2, 3)).toBeUndefined();
    expect(getSurfaceSettlementIdentity(layer, 0, -1)).toBeUndefined();
  });

  it.each([
    [24, 24],
    [40, 24],
    [120, 45],
  ])('keeps the selected site visible and every text span wrapped at %sx%s', (cols, rows) => {
    const { body } = directoryBody();
    const atlas = new OrbitSettlements();
    for (let index = 0; index < 12; index++) {
      const model = atlas.createModel(body, false, cols, rows, 0, 1);
      expect(text(model)).toContain('>');
      expect(text(model)).toContain(`X ${index + 2} / Y 3`);
      const width = cols - (model.dashboardFullWidth ? 8 : 12);
      for (const line of model.dashboard!)
        expect(line.segments.reduce((sum, span) => sum + span.text.length, 0)).toBeLessThanOrEqual(width);
      atlas.move(body, 1);
    }
    atlas.move(body, -100);
    expect(atlas.selectedIndex).toBe(0);
    expect(atlas.createModel(body, false, cols, rows, 0, 1).viewOffset).toBe(0);
  });

  it('distinguishes mapped archetypes without promising shops, population or street-scale coordinates', () => {
    const { body } = directoryBody(3);
    const atlas = new OrbitSettlements();
    for (const kind of ['Open-air urban', 'Sealed habitat', 'Industrial']) {
      const model = atlas.createModel(body, true, 100, 100, 0, 1);
      expect(text(model)).toContain(kind);
      expect(text(model)).toContain('Population and surface services are not catalogued.');
      expect(text(model)).toContain('Latitude');
      expect(text(model)).toContain('Regional coverage is fractional');
      atlas.move(body, 1);
    }
  });

  it('uses the existing modal lifecycle and reports an empty directory without fabricating colonies', () => {
    const { body } = directoryBody(0);
    const dossier = new OrbitDossier();
    dossier.openSettlements();
    expect(dossier.isOpen).toBe(true);
    expect(dossier.reveal.progress).toBe(1);
    expect(text(dossier.createModel(body, body, [], 80, 45))).toContain('No mapped surface settlements');
    dossier.showSettlementDetail(true);
    expect(dossier.reveal.isActive).toBe(true);
    dossier.showSettlementDetail(false);
    expect(dossier.reveal.progress).toBe(1);
    dossier.close();
    expect(dossier.isOpen).toBe(false);
  });
});
