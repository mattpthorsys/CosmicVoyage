import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../../config';
import {
  DEFAULT_SYSTEM_ZOOM_INDEX,
  getSystemSimulationSpeedMultiplier,
  getSystemViewScale,
  getSystemZoomFactor,
  SYSTEM_ZOOM_LEVELS,
} from '../../../core/system_zoom';

describe('system zoom', () => {
  it('defines one canonical default zoom level', () => {
    expect(DEFAULT_SYSTEM_ZOOM_INDEX).toBe(3);
    expect(SYSTEM_ZOOM_LEVELS[DEFAULT_SYSTEM_ZOOM_INDEX]).toBe(CONFIG.SYSTEM_VIEW_SCALE);
    expect(getSystemViewScale(DEFAULT_SYSTEM_ZOOM_INDEX)).toBe(CONFIG.SYSTEM_VIEW_SCALE);
    expect(getSystemZoomFactor(DEFAULT_SYSTEM_ZOOM_INDEX)).toBe(1);
  });

  it('reports magnification consistently with view scale', () => {
    expect(getSystemViewScale(DEFAULT_SYSTEM_ZOOM_INDEX + 1)).toBe(CONFIG.SYSTEM_VIEW_SCALE / 4);
    expect(getSystemZoomFactor(DEFAULT_SYSTEM_ZOOM_INDEX + 1)).toBe(4);
    expect(getSystemViewScale(DEFAULT_SYSTEM_ZOOM_INDEX - 1)).toBe(CONFIG.SYSTEM_VIEW_SCALE * 4);
    expect(getSystemZoomFactor(DEFAULT_SYSTEM_ZOOM_INDEX - 1)).toBe(0.25);
  });

  it('slows simulation and cursor travel as the view zooms in', () => {
    expect(getSystemSimulationSpeedMultiplier(DEFAULT_SYSTEM_ZOOM_INDEX)).toBe(1);
    expect(getSystemSimulationSpeedMultiplier(DEFAULT_SYSTEM_ZOOM_INDEX + 1)).toBe(0.5);
    expect(getSystemSimulationSpeedMultiplier(DEFAULT_SYSTEM_ZOOM_INDEX - 1)).toBe(2);
  });

  it('clamps invalid zoom indexes to supported levels', () => {
    expect(getSystemViewScale(-100)).toBe(SYSTEM_ZOOM_LEVELS[0]);
    expect(getSystemViewScale(100)).toBe(SYSTEM_ZOOM_LEVELS[SYSTEM_ZOOM_LEVELS.length - 1]);
  });
});
