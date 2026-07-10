import { describe, expect, it } from 'vitest';
import { GalaxyMapController } from '../../../core/galaxy_map';
import { MilkyWayModel } from '../../../generation/milky_way_model';

describe('GalaxyMapController', () => {
  it('starts with a whole-Galaxy view and zooms around the player without changing world state', () => {
    const galaxy = new MilkyWayModel('galaxy-map-controls');
    const controller = new GalaxyMapController();
    const whole = controller.createModel(galaxy, 120, -45);

    controller.zoom(1, galaxy, 120, -45);
    const regional = controller.createModel(galaxy, 120, -45);

    expect(whole.zoomLabel).toBe('GALACTIC');
    expect(whole.spanPc).toBeGreaterThan(regional.spanPc);
    expect(regional.centerXpc).toBeCloseTo(regional.playerXpc, 6);
    expect(regional.centerYpc).toBeCloseTo(regional.playerYpc, 6);
    expect(regional.playerWorldX).toBe(120);
    expect(regional.playerWorldY).toBe(-45);

    controller.zoom(-1, galaxy, 120, -45);
    const restoredWhole = controller.createModel(galaxy, 120, -45);
    expect(restoredWhole.centerXpc).toBe(0);
    expect(restoredWhole.centerYpc).toBe(0);
  });

  it('supports deterministic pan and explicit player recentering', () => {
    const galaxy = new MilkyWayModel('galaxy-map-pan');
    const controller = new GalaxyMapController();
    controller.zoom(2, galaxy, 300, 100);
    const centred = controller.createModel(galaxy, 300, 100);

    controller.pan(1, -1);
    const panned = controller.createModel(galaxy, 300, 100);
    controller.recenterOnPlayer(galaxy, 300, 100);
    const restored = controller.createModel(galaxy, 300, 100);

    expect(panned.centerXpc).not.toBe(centred.centerXpc);
    expect(panned.centerYpc).not.toBe(centred.centerYpc);
    expect(restored.centerXpc).toBeCloseTo(restored.playerXpc, 6);
    expect(restored.centerYpc).toBeCloseTo(restored.playerYpc, 6);
  });
});
