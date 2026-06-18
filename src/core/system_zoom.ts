import { CONFIG } from '../config';

export const DEFAULT_SYSTEM_ZOOM_INDEX = 3;

export const SYSTEM_ZOOM_LEVELS: readonly number[] = Object.freeze([
  CONFIG.SYSTEM_VIEW_SCALE * 32,
  CONFIG.SYSTEM_VIEW_SCALE * 8,
  CONFIG.SYSTEM_VIEW_SCALE * 4,
  CONFIG.SYSTEM_VIEW_SCALE,
  CONFIG.SYSTEM_VIEW_SCALE / 4,
  CONFIG.SYSTEM_VIEW_SCALE / 16,
  CONFIG.SYSTEM_VIEW_SCALE / 64,
  CONFIG.SYSTEM_VIEW_SCALE / 256,
  CONFIG.SYSTEM_VIEW_SCALE / 1024,
]);

export function clampSystemZoomIndex(index: number): number {
  return Math.max(0, Math.min(Math.trunc(index), SYSTEM_ZOOM_LEVELS.length - 1));
}

export function getSystemViewScale(index: number): number {
  return SYSTEM_ZOOM_LEVELS[clampSystemZoomIndex(index)];
}

export function getSystemZoomFactor(index: number): number {
  return Math.pow(4, clampSystemZoomIndex(index) - DEFAULT_SYSTEM_ZOOM_INDEX);
}

export function getSystemSimulationSpeedMultiplier(index: number): number {
  const zoomDifference = clampSystemZoomIndex(index) - DEFAULT_SYSTEM_ZOOM_INDEX;
  return Math.max(0.01, Math.min(Math.pow(0.5, zoomDifference), 10));
}
