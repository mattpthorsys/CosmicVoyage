import { describe, expect, it } from 'vitest';
import { Planet } from '../entities/planet';
import { Player } from '../core/player';
import { AstrometricOverlay } from './astrometric_overlay';

function createPlanet(name: string, systemX: number, systemY: number): Planet {
  const planet = Object.create(Planet.prototype) as Planet;
  Object.defineProperties(planet, {
    name: { value: name },
    type: { value: 'Rock' },
    systemX: { value: systemX },
    systemY: { value: systemY },
  });
  return planet;
}

describe('AstrometricOverlay starbase markers', () => {
  it('keeps nearby hyperspace starbase brackets brighter than distant ones', () => {
    const overlay = Object.create(AstrometricOverlay.prototype) as AstrometricOverlay;
    (overlay as any).hyperspaceStarbaseMarkers = [
      { x: 10, y: 10, distanceCells: 8 },
      { x: 30, y: 10, distanceCells: 64 },
    ];

    const alphas: number[] = [];
    const ctx = {
      globalAlpha: 1,
      fillStyle: '',
      shadowBlur: 0,
      save: () => undefined,
      restore: () => undefined,
      fillText: () => {
        alphas.push(ctx.globalAlpha);
      },
    } as unknown as CanvasRenderingContext2D;

    (overlay as any).drawHyperspaceStarbaseMarkers(ctx, 8, 16, 0);

    expect(alphas.length).toBe(4);
    expect(alphas[0]).toBeGreaterThan(alphas[2]);
    expect(alphas[2]).toBeCloseTo(0.185, 3);
  });

  it('cycles hyperspace popup contacts outward while the player is stationary and resets after movement', () => {
    const player = new Player();
    player.position.worldX = 0;
    player.position.worldY = 0;
    const overlay = Object.create(AstrometricOverlay.prototype) as AstrometricOverlay;
    Object.defineProperties(overlay, {
      popupCycleSignature: { value: '', writable: true },
      popupCycleIndex: { value: 0, writable: true },
      systemDataGenerator: {
        value: {
          getSystemProperties: (x: number, y: number) => {
            if (y === 0 && x === 1) return { exists: true, name: 'Near-1A', starType: 'G2V' };
            if (y === 0 && x === 3) return { exists: true, name: 'Far-3B', starType: 'K1V' };
            return { exists: false };
          },
        },
      },
    });

    const context = {
      state: 'hyperspace',
      player,
      system: null,
      planet: null,
      starbase: null,
      viewScale: 1,
    };

    const first = (overlay as any).createHyperspaceItem(context, 80, 40, 1000);
    const second = (overlay as any).createHyperspaceItem(context, 80, 40, 2000);
    player.position.worldX = 1;
    const afterMove = (overlay as any).createHyperspaceItem(context, 80, 40, 3000);

    expect(first.lines[1]).toBe('ID Near-1A');
    expect(second.lines[1]).toBe('ID Far-3B');
    expect(afterMove.lines[1]).toBe('ID Near-1A');
  });

  it('limits brown-dwarf overlay contacts to the short-range detection horizon', () => {
    const overlay = Object.create(AstrometricOverlay.prototype) as AstrometricOverlay;
    Object.defineProperties(overlay, {
      systemDataGenerator: {
        value: {
          getSystemProperties: (x: number, y: number) => {
            if (y === 0 && x === 29) return { exists: true, name: 'Lurker-29', starType: 'T4', objectKind: 'brown-dwarf', hasStarbase: false };
            if (y === 0 && x === 31) return { exists: true, name: 'Lurker-31', starType: 'T6', objectKind: 'brown-dwarf', hasStarbase: false };
            return { exists: false };
          },
          getDeepSpacePhenomenonProperties: () => ({ exists: false }),
        },
      },
    });

    const contacts = (overlay as any).findHyperspaceContacts(0, 0, 32);

    expect(contacts.map((contact: any) => contact.name)).toContain('Lurker-29');
    expect(contacts.map((contact: any) => contact.name)).not.toContain('Lurker-31');
  });

  it('lets interstellar medium reduce hyperspace contact detection range', () => {
    const overlay = Object.create(AstrometricOverlay.prototype) as AstrometricOverlay;
    Object.defineProperties(overlay, {
      systemDataGenerator: {
        value: {
          getSystemProperties: (x: number, y: number) => {
            if (y === 0 && x === 5) return { exists: true, name: 'Clear-5', starType: 'K2V', objectKind: 'stellar', hasStarbase: false };
            if (y === 0 && x === 8) return { exists: true, name: 'Lost-8', starType: 'G1V', objectKind: 'stellar', hasStarbase: false };
            return { exists: false };
          },
          getDeepSpacePhenomenonProperties: () => ({ exists: false }),
        },
      },
    });

    const contacts = (overlay as any).findHyperspaceContacts(0, 0, 10, 0.62);
    const names = contacts.map((contact: any) => contact.name);

    expect(names).toContain('Clear-5');
    expect(names).not.toContain('Lost-8');
  });

  it('cycles system overlay body locks outward from a stationary ship', () => {
    const player = new Player();
    player.position.systemX = 0;
    player.position.systemY = 0;
    const nearPlanet = createPlanet('Near I', 100, 0);
    const farPlanet = createPlanet('Far II', 200, 0);
    const overlay = Object.create(AstrometricOverlay.prototype) as AstrometricOverlay;
    Object.defineProperties(overlay, {
      popupCycleSignature: { value: '', writable: true },
      popupCycleIndex: { value: 0, writable: true },
    });
    const context = {
      state: 'system',
      player,
      system: {
        name: 'Overlay Test',
        planets: [farPlanet, nearPlanet],
        getNearestStar: () => ({ name: 'Primary', starType: 'G2V', systemX: 0, systemY: 0 }),
      },
      planet: null,
      starbase: null,
      viewScale: 10,
    };

    const first = (overlay as any).createSystemItem(context, 80, 40, 1000);
    const second = (overlay as any).createSystemItem(context, 80, 40, 2000);

    expect(first.lines[1]).toBe('Near I');
    expect(second.lines[1]).toBe('Far II');
  });
});
