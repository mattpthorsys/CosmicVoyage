import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { hexToRgb } from './colour';
import { NebulaRenderer } from './nebula_renderer';

function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  return rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722;
}

function colourDistance(first: string, second: string): number {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  return Math.sqrt(
    (a.r - b.r) ** 2 +
    (a.g - b.g) ** 2 +
    (a.b - b.b) ** 2
  );
}

describe('NebulaRenderer', () => {
  it('renders deterministic, sparse nebula fields', () => {
    const first = new NebulaRenderer();
    const second = new NebulaRenderer();
    const samples: string[] = [];

    for (let y = -80; y <= 80; y += 2) {
      for (let x = -80; x <= 80; x += 2) {
        const colour = first.getBackgroundColor(x, y);
        expect(second.getBackgroundColor(x, y)).toBe(colour);
        samples.push(colour);
      }
    }

    const visible = samples.filter((colour) => colour !== CONFIG.DEFAULT_BG_COLOUR && luminance(colour) > 1.5);
    const visibleRatio = visible.length / samples.length;
    expect(visibleRatio).toBeGreaterThan(0.015);
    expect(visibleRatio).toBeLessThan(0.3);
  });

  it('keeps representative nebula patches visibly above black space', () => {
    const renderer = new NebulaRenderer();
    let brightest = 0;
    let perceptibleCount = 0;

    for (let y = -260; y <= 260; y += 4) {
      for (let x = -260; x <= 260; x += 4) {
        const sampleLuminance = luminance(renderer.getBackgroundColor(x, y));
        if (sampleLuminance > 1.5) perceptibleCount++;
        brightest = Math.max(brightest, sampleLuminance);
      }
    }

    expect(perceptibleCount).toBeGreaterThan(80);
    expect(brightest).toBeGreaterThan(8);
  });

  it('blends nebula edges without abrupt local colour jumps', () => {
    const renderer = new NebulaRenderer();
    let comparisons = 0;
    let harshTransitions = 0;

    for (let y = -180; y <= 180; y += 3) {
      for (let x = -180; x <= 180; x += 3) {
        const here = renderer.getBackgroundColor(x, y);
        const right = renderer.getBackgroundColor(x + 3, y);
        const down = renderer.getBackgroundColor(x, y + 3);

        const localMaxLuminance = Math.max(luminance(here), luminance(right), luminance(down));
        if (localMaxLuminance <= 1.5) continue;

        comparisons += 2;
        if (colourDistance(here, right) > 18) harshTransitions++;
        if (colourDistance(here, down) > 18) harshTransitions++;
      }
    }

    expect(comparisons).toBeGreaterThan(100);
    expect(harshTransitions / comparisons).toBeLessThan(0.035);
  });

  it('keeps nebula colours restrained and astronomically plausible', () => {
    const renderer = new NebulaRenderer();
    const visible: string[] = [];

    for (let y = -120; y <= 120; y += 3) {
      for (let x = -120; x <= 120; x += 3) {
        const colour = renderer.getBackgroundColor(x, y);
        if (colour !== CONFIG.DEFAULT_BG_COLOUR) visible.push(colour);
      }
    }

    expect(visible.length).toBeGreaterThan(0);
    const brightest = Math.max(...visible.map(luminance));
    expect(brightest).toBeLessThan(55);
    expect(visible.some((colour) => {
      const rgb = hexToRgb(colour);
      return rgb.r >= rgb.g && rgb.r > rgb.b;
    })).toBe(true);
    expect(visible.some((colour) => {
      const rgb = hexToRgb(colour);
      return rgb.b >= rgb.r && rgb.g >= rgb.r;
    })).toBe(true);
  });

  it('returns stable colours from cache and after cache clearing', () => {
    const renderer = new NebulaRenderer();
    const coordinates = [
      [-120.25, -48.75],
      [-32.5, 84.125],
      [0, 0],
      [73.25, -91.5],
      [156.875, 210.25],
    ];

    const firstPass = coordinates.map(([x, y]) => renderer.getBackgroundColor(x, y));
    const cachedPass = coordinates.map(([x, y]) => renderer.getBackgroundColor(x, y));
    renderer.clearCache();
    const afterClear = coordinates.map(([x, y]) => renderer.getBackgroundColor(x, y));

    expect(cachedPass).toEqual(firstPass);
    expect(afterClear).toEqual(firstPass);
  });
});
