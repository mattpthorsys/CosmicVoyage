import { describe, expect, it } from 'vitest';
import type { GalaxyFieldSample } from '../../generation/milky_way_model';
import { getGalaxyFieldColour } from '../../rendering/galaxy_map_renderer';

const BASE_FIELD: GalaxyFieldSample = {
  density: 1,
  oldStellarDensity: 1,
  youngStellarDensity: 0,
  bulgeDensity: 0,
  barDensity: 0,
  stellarArmInfluence: 0,
  armInfluence: 0,
  gasDensity: 0,
  dustDensity: 0,
  dustLaneDensity: 0,
  texture: 0.5,
  insideMainDisk: true,
};

/** Converts a rendered hexadecimal colour into numeric RGB channels. */
function parseHex(colour: string): readonly [number, number, number] {
  return [
    Number.parseInt(colour.slice(1, 3), 16),
    Number.parseInt(colour.slice(3, 5), 16),
    Number.parseInt(colour.slice(5, 7), 16),
  ];
}

describe('Galaxy map palette', () => {
  it('keeps old stellar light warm while giving young arm complexes a cooler signal', () => {
    const oldColour = getGalaxyFieldColour(BASE_FIELD);
    const youngColour = getGalaxyFieldColour({
      ...BASE_FIELD,
      youngStellarDensity: 0.85,
      stellarArmInfluence: 0.4,
      armInfluence: 1,
    });

    expect(oldColour).not.toBeNull();
    expect(youngColour).not.toBeNull();
    const [oldRed, , oldBlue] = parseHex(oldColour!);
    const [youngRed, , youngBlue] = parseHex(youngColour!);
    expect(oldRed).toBeGreaterThan(oldBlue);
    expect(youngBlue - youngRed).toBeGreaterThan(oldBlue - oldRed);
  });

  it('attenuates dusty arm lanes without turning their pixels into hard black contours', () => {
    const clearColour = getGalaxyFieldColour({
      ...BASE_FIELD,
      youngStellarDensity: 0.7,
      armInfluence: 1,
    });
    const dustyColour = getGalaxyFieldColour({
      ...BASE_FIELD,
      youngStellarDensity: 0.7,
      armInfluence: 1,
      dustDensity: 1,
      dustLaneDensity: 1,
    });

    expect(clearColour).not.toBeNull();
    expect(dustyColour).not.toBeNull();
    const clearBrightness = parseHex(clearColour!).reduce((sum, channel) => sum + channel, 0);
    const dustyBrightness = parseHex(dustyColour!).reduce((sum, channel) => sum + channel, 0);
    expect(dustyBrightness).toBeLessThan(clearBrightness);
    expect(dustyBrightness).toBeGreaterThan(0);
  });
});
