import { describe, expect, it } from 'vitest';
import {
  calculateIlluminatedFraction,
  calculateSunwardScreenX,
  projectPanoramaX,
} from '../../rendering/title_cinematic_renderer';

describe('title cinematic sphere lighting', () => {
  it('shows a new phase when body and sun have the same panorama direction', () => {
    const fraction = calculateIlluminatedFraction(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 1 }
    );

    expect(fraction).toBeCloseTo(0);
  });

  it('shows a full phase when body and sun are opposite in the panorama', () => {
    const fraction = calculateIlluminatedFraction(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 }
    );

    expect(fraction).toBeCloseTo(1);
  });

  it('shows a half phase at ninety degrees of panorama separation', () => {
    const fraction = calculateIlluminatedFraction(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 1, y: 0, z: 0 }
    );

    expect(fraction).toBeCloseTo(0.5);
  });

  it('places the illuminated limb on the same screen side as the sun', () => {
    const body = { x: 0, y: 0, z: 1 };
    const sunToLeft = { x: -0.5, y: 0, z: Math.sqrt(0.75) };
    const sunToRight = { x: 0.5, y: 0, z: Math.sqrt(0.75) };

    expect(calculateSunwardScreenX(body, sunToLeft)).toBeLessThan(0);
    expect(calculateSunwardScreenX(body, sunToRight)).toBeGreaterThan(0);
  });
});

describe('title cinematic panorama projection', () => {
  it('moves every fixed azimuth by the same number of pixels for a camera rotation', () => {
    const width = 1200;
    const fov = Math.PI / 2;
    const rotation = 0.1;
    const firstShift = projectPanoramaX(0.2, rotation, width, fov) - projectPanoramaX(0.2, 0, width, fov);
    const secondShift = projectPanoramaX(0.6, rotation, width, fov) - projectPanoramaX(0.6, 0, width, fov);

    expect(firstShift).toBeCloseTo(secondShift);
  });
});
