import { describe, expect, it } from 'vitest';
import {
  addCratersToHeightmap,
  blendLongitudeSeam,
  generateHeightmap,
  getMercatorCraterDistanceSq,
} from '../../../entities/planet/heightmap_generator';

const THIN_ATMOSPHERE = { density: 'Thin', pressure: 0.08, composition: { Nitrogen: 80, Methane: 20 } };
const THICK_ATMOSPHERE = { density: 'Thick', pressure: 8, composition: { 'Carbon Dioxide': 92, Nitrogen: 8 } };
const SUPERDENSE_ATMOSPHERE = { density: 'Superdense', pressure: 35, composition: { Hydrogen: 72, Helium: 18, 'Water Vapor': 10 } };

function stats(map: number[][]): { mean: number; roughness: number; lowFraction: number; highFraction: number } {
  const values = map.flat();
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  let edgeDelta = 0;
  let edgeCount = 0;
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map.length; x++) {
      edgeDelta += Math.abs(map[y][x] - map[y][(x + 1) % map.length]);
      edgeDelta += Math.abs(map[y][x] - map[(y + 1) % map.length][x]);
      edgeCount += 2;
    }
  }
  return {
    mean,
    roughness: edgeDelta / edgeCount,
    lowFraction: values.filter((value) => value < 70).length / values.length,
    highFraction: values.filter((value) => value > 175).length / values.length,
  };
}

describe('realistic specialised surface generation', () => {
  it('generates valid distinct terrain signatures for specialised planet classes', () => {
    const hycean = generateHeightmap('realism-hycean', 'Hycean', SUPERDENSE_ATMOSPHERE);
    const greenhouse = generateHeightmap('realism-greenhouse', 'Greenhouse', THICK_ATMOSPHERE);
    const chthonian = generateHeightmap('realism-chthonian', 'Chthonian', THIN_ATMOSPHERE);
    const dwarfIce = generateHeightmap('realism-dwarf-ice', 'DwarfIce', THIN_ATMOSPHERE);

    for (const map of [hycean, greenhouse, chthonian, dwarfIce]) {
      expect(map).not.toBeNull();
      expect(map?.length).toBeGreaterThan(8);
      expect(map?.every((row) => row.length === map.length)).toBe(true);
    }

    const hyceanStats = stats(hycean!);
    const greenhouseStats = stats(greenhouse!);
    const chthonianStats = stats(chthonian!);
    const dwarfIceStats = stats(dwarfIce!);

    expect(hyceanStats.mean).toBeLessThan(chthonianStats.mean);
    expect(chthonianStats.roughness).toBeGreaterThan(hyceanStats.roughness);
    expect(greenhouseStats.highFraction).toBeGreaterThan(hyceanStats.highFraction);
    expect(dwarfIceStats.lowFraction).toBeGreaterThan(greenhouseStats.lowFraction);
  });

  it('widens crater footprints toward map poles for projected surface maps', () => {
    const mapSize = 64;
    const flatMap = (value: number) => Array.from({ length: mapSize }, () => Array.from({ length: mapSize }, () => value));
    const fakePrng = (cy: number) => {
      const intValues = [1, 5, 32, cy];
      return {
        randomInt: () => intValues.shift() ?? 1,
        random: (min: number) => min,
      };
    };

    const equator = addCratersToHeightmap(flatMap(128), fakePrng(32) as any, {
      countMultiplier: 0.25,
      radiusMultiplier: 1,
      depthMultiplier: 1,
    });
    const polar = addCratersToHeightmap(flatMap(128), fakePrng(3) as any, {
      countMultiplier: 0.25,
      radiusMultiplier: 1,
      depthMultiplier: 1,
    });

    const equatorSpan = equator[32].filter((value) => value !== 128).length;
    const polarSpan = polar[3].filter((value) => value !== 128).length;

    expect(getMercatorCraterDistanceSq(6, 0, 3, mapSize)).toBeLessThan(getMercatorCraterDistanceSq(6, 0, 32, mapSize));
    expect(polarSpan).toBeGreaterThan(equatorSpan);
  });

  it('blends generated surface features across the longitude seam', () => {
    const map = Array.from({ length: 12 }, (_, y) =>
      Array.from({ length: 12 }, (_, x) => (x === 0 ? 20 + y : x === 11 ? 220 - y : 120))
    );

    const blended = blendLongitudeSeam(map, 3);

    for (let y = 0; y < blended.length; y++) {
      expect(blended[y][blended.length - 1]).toBe(blended[y][0]);
      expect(Math.abs(blended[y][1] - blended[y][10])).toBeLessThan(120);
    }
  });
});
