import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { hexToRgb } from './colour';
import { NebulaRenderer } from './nebula_renderer';

function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  return rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722;
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

    const visible = samples.filter((colour) => colour !== CONFIG.DEFAULT_BG_COLOUR);
    const visibleRatio = visible.length / samples.length;
    expect(visibleRatio).toBeGreaterThan(0.015);
    expect(visibleRatio).toBeLessThan(0.3);
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
});
