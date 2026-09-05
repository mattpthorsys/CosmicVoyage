import { describe, expect, it } from 'vitest';
import { Game } from '../../../core/game';
import { OrbitStellarSource } from '../../../core/orbit_ui';

describe('orbital stellar references', () => {
  it('uses inverse-square irradiance and real relative bearings for companion stars', () => {
    const stars = [
      { id: 'A', starType: 'M', luminosityW: 1e24, systemX: 1e11, systemY: 0 },
      { id: 'B', starType: 'G', luminosityW: 8e24, systemX: 0, systemY: 2e11 },
    ];
    const game = Object.assign(Object.create(Game.prototype), {
      stateManager: { currentSystem: { stars } },
    }) as { getOrbitStellarSources: (body: { systemX: number; systemY: number }) => OrbitStellarSource[] };
    const sources = game.getOrbitStellarSources({ systemX: 0, systemY: 0 });
    expect(sources[0]).toMatchObject({ id: 'B', primary: true, relativeFlux: 1, longitudeOffset: 0 });
    expect(sources[1].relativeFlux).toBeCloseTo(0.5);
    expect(sources[1].longitudeOffset).toBeCloseTo(-Math.PI / 2);
    stars[1].systemY *= 2;
    expect(game.getOrbitStellarSources({ systemX: 0, systemY: 0 })[0].id).toBe('A');
  });

  it('does not invent a host star in a starless system', () => {
    const game = Object.assign(Object.create(Game.prototype), {
      stateManager: { currentSystem: { stars: [] } },
    }) as { getOrbitStellarSources: (body: object) => OrbitStellarSource[] };
    expect(game.getOrbitStellarSources({})).toEqual([]);
  });
});
