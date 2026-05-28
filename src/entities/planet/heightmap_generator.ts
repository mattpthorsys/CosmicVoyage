// src/entities/planet/heightmap_generator.ts
import { HeightmapGenerator as BaseHeightmapGenerator } from '../../generation/heightmap';
import { CONFIG } from '../../config';
import { logger } from '../../utils/logger';
import { Atmosphere } from '../../entities/planet'; // Import type for crater check
import { PRNG } from '../../utils/prng';

/**
 * Generates a planetary heightmap, potentially adding craters based on type/atmosphere.
 *
 * @param mapSeed - The seed string for the heightmap PRNG.
 * @param planetType - The type of the planet (e.g., 'Rock', 'Lunar').
 * @param atmosphere - The planet's atmosphere object (for crater determination).
 * @returns The generated 2D heightmap array, or null on error.
 */
export function generateHeightmap(
  mapSeed: string,
  planetType: string,
  atmosphere: Atmosphere
): number[][] | null {
  logger.info(
    `[HeightmapGenFunc] Generating heightmap for ${planetType} (Seed: ${mapSeed})...`
  );
  const mapSizeTarget = CONFIG.PLANET_MAP_BASE_SIZE;
  try {
    const generator = new BaseHeightmapGenerator(
      mapSizeTarget,
      CONFIG.PLANET_SURFACE_ROUGHNESS,
      mapSeed // Use the specific map seed
    );
    let generatedMap = generator.generate(); // Generate the base map

    if (
      !generatedMap ||
      generatedMap.length < 1 ||
      generatedMap[0].length !== generatedMap.length
    ) {
      throw new Error('BaseHeightmapGenerator returned invalid map dimensions.');
    }

    // Add craters for specific types after base generation
    if (
      planetType === 'Lunar' ||
      (planetType === 'Rock' && (!atmosphere || atmosphere.density === 'None'))
    ) {
      generatedMap = addCratersToHeightmap(
        generatedMap,
        generator['prng'] // Access the PRNG from the generator instance
      ); // Modifies map in place
    }

    generatedMap = applyPlanetarySurfaceProcesses(generatedMap, planetType, atmosphere, generator['prng']);

    logger.info(
      `[HeightmapGenFunc] Generated ${generatedMap.length}x${generatedMap.length} heightmap for ${planetType}.`
    );
    return generatedMap;
  } catch (error) {
    logger.error(
      `[HeightmapGenFunc] Heightmap generation failed for ${planetType}: ${error}`
    );
    return null;
  }
}

/**
 * Adds impact craters to a given heightmap.
 * (Internal helper function, copied and adapted from the original SurfaceGenerator)
 *
 * @param heightmap - The 2D heightmap array to modify.
 * @param craterPRNG - The PRNG instance to use for crater generation.
 * @returns The modified heightmap array.
 */
function addCratersToHeightmap(
  heightmap: number[][],
  craterPRNG: PRNG
): number[][] {
  if (!heightmap) return heightmap;
  const mapSize = heightmap.length;
  if (mapSize <= 0) return heightmap;

  logger.info(`[CraterFunc] Adding impact craters...`);
  const numCraters = craterPRNG.randomInt(
    Math.floor(mapSize / 15),
    Math.floor(mapSize / 5)
  );
  logger.debug(`[CraterFunc] Generating ${numCraters} craters.`);

  for (let i = 0; i < numCraters; i++) {
    const r = craterPRNG.randomInt(3, Math.max(5, Math.floor(mapSize / 10)));
    const cx = craterPRNG.randomInt(0, mapSize - 1);
    const cy = craterPRNG.randomInt(0, mapSize - 1);
    const depthFactor = craterPRNG.random(0.5, 2.0);
    const rimFactor = craterPRNG.random(0.1, 0.3);
    const maxDepth = r * depthFactor;
    const rimHeight = maxDepth * rimFactor;
    const startY = Math.max(0, cy - r - 2);
    const endY = Math.min(mapSize - 1, cy + r + 2);
    const startX = Math.max(0, cx - r - 2);
    const endX = Math.min(mapSize - 1, cx + r + 2);

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const distSq = dx * dx + dy * dy;
        if (distSq <= (r + 1) ** 2) {
          const dist = Math.sqrt(distSq);
          const currentH = heightmap[y]?.[x] ?? 0; // Add nullish coalescing for safety
          let deltaH = 0;
          if (dist < r)
            deltaH -= maxDepth * ((Math.cos((dist / r) * Math.PI) + 1) / 2); // Depression
          const rimPeakDist = r * 0.85;
          const rimWidth = r * 0.3;
          if (dist > rimPeakDist - rimWidth && dist < rimPeakDist + rimWidth) {
            deltaH +=
              rimHeight *
              ((Math.cos(((dist - rimPeakDist) / rimWidth) * Math.PI) + 1) /
                2); // Rim
          }
          // Ensure heightmap access is valid before writing
          if (heightmap[y] !== undefined) {
              heightmap[y][x] = Math.max(
                  0,
                  Math.min(
                      CONFIG.PLANET_HEIGHT_LEVELS - 1,
                      Math.round(currentH + deltaH)
                  )
              );
          } else {
               logger.warn(`[CraterFunc] Invalid heightmap access at y=${y}`);
          }
        }
      }
    }
  }
  logger.info(`[CraterFunc] Finished adding ${numCraters} craters.`);
  return heightmap;
}

function applyPlanetarySurfaceProcesses(
  heightmap: number[][],
  planetType: string,
  atmosphere: Atmosphere,
  prng: PRNG
): number[][] {
  let processed = heightmap;
  const pressure = atmosphere?.pressure ?? 0;
  const density = atmosphere?.density ?? 'None';

  if (planetType === 'Oceanic' || planetType === 'Hycean') {
    processed = compressToOceanWorld(processed);
    processed = smoothHeightmap(processed, planetType === 'Hycean' ? 3 : pressure > 0.5 ? 2 : 1, planetType === 'Hycean' ? 0.55 : 0.42);
    processed = addSubmarineRidges(processed, prng, planetType === 'Hycean' ? 5 : 3);
    if (planetType === 'Hycean') processed = addIslandArcs(processed, prng, 3);
  } else if (planetType === 'Frozen' || planetType === 'Cryovolcanic' || planetType === 'DwarfIce') {
    processed = smoothHeightmap(processed, density === 'Thick' ? 2 : 1, planetType === 'DwarfIce' ? 0.18 : 0.28);
    processed = addIceFractures(processed, prng, planetType === 'Cryovolcanic' ? 11 : density === 'None' ? 8 : 5);
    if (planetType === 'Cryovolcanic') processed = addCryovolcanicDomes(processed, prng, 9);
    if (planetType === 'DwarfIce') {
      processed = addCratersToHeightmap(processed, prng);
      processed = addVolatileFrostBasins(processed, prng, 7);
    }
  } else if (planetType === 'Molten' || planetType === 'Chthonian') {
    processed = addVolcanicRifts(processed, prng, planetType === 'Chthonian' ? 7 : 5);
    if (planetType === 'Chthonian') {
      processed = sharpenAirlessRelief(processed, 0.2);
      processed = addAblationScarps(processed, prng, 8);
    }
  } else if (planetType === 'Rock' || planetType === 'Greenhouse' || planetType === 'CarbonRich') {
    const erosionPasses = density === 'Thick' ? 3 : density === 'Earth-like' ? 2 : density === 'Thin' ? 1 : 0;
    if (erosionPasses > 0) {
      processed = smoothHeightmap(processed, erosionPasses, Math.min(0.55, 0.18 + pressure * 0.08));
      processed = addSedimentaryPlains(processed, 0.12 + Math.min(0.18, pressure * 0.03));
    }
    if (planetType === 'Greenhouse') {
      processed = addSedimentaryPlains(processed, 0.26);
      processed = addTesseraTerrain(processed, prng, 7);
    }
    if (planetType === 'CarbonRich') {
      processed = addCarbonDuneFields(processed, prng, 6);
      processed = sharpenAirlessRelief(processed, 0.08);
    }
  } else if (planetType === 'Lunar') {
    processed = sharpenAirlessRelief(processed, 0.12);
  }

  return processed;
}

function smoothHeightmap(heightmap: number[][], passes: number, strength: number): number[][] {
  let result = heightmap;
  const size = result.length;
  for (let pass = 0; pass < passes; pass++) {
    const next = result.map((row) => [...row]);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const avg =
          (result[y][x] * 4 +
            result[(y - 1 + size) % size][x] +
            result[(y + 1) % size][x] +
            result[y][(x - 1 + size) % size] +
            result[y][(x + 1) % size]) /
          8;
        next[y][x] = clampHeight(result[y][x] * (1 - strength) + avg * strength);
      }
    }
    result = next;
  }
  return result;
}

function compressToOceanWorld(heightmap: number[][]): number[][] {
  return heightmap.map((row) =>
    row.map((height) => {
      const normalized = height / (CONFIG.PLANET_HEIGHT_LEVELS - 1);
      const oceanBiased = Math.pow(normalized, 1.65) * 220 + 18;
      return clampHeight(oceanBiased);
    })
  );
}

function addSubmarineRidges(heightmap: number[][], prng: PRNG, ridgeCount: number): number[][] {
  const size = heightmap.length;
  for (let ridge = 0; ridge < ridgeCount; ridge++) {
    const baseY = prng.random(0, size);
    const phase = prng.random(0, Math.PI * 2);
    const amplitude = prng.random(size * 0.03, size * 0.09);
    for (let x = 0; x < size; x++) {
      const centerY = baseY + Math.sin(x * 0.045 + phase) * amplitude;
      for (let offset = -2; offset <= 2; offset++) {
        const y = (Math.round(centerY + offset) + size) % size;
        const lift = (3 - Math.abs(offset)) * prng.random(1.4, 3.8);
        heightmap[y][x] = clampHeight(heightmap[y][x] + lift);
      }
    }
  }
  return heightmap;
}

function addIslandArcs(heightmap: number[][], prng: PRNG, arcCount: number): number[][] {
  const size = heightmap.length;
  for (let arc = 0; arc < arcCount; arc++) {
    const centerX = prng.random(0, size);
    const centerY = prng.random(0, size);
    const radius = prng.random(size * 0.18, size * 0.42);
    const start = prng.random(0, Math.PI * 2);
    const sweep = prng.random(Math.PI * 0.45, Math.PI * 1.15);
    for (let step = 0; step < size * 2; step++) {
      const t = start + (step / Math.max(1, size * 2 - 1)) * sweep;
      const wobble = Math.sin(step * 0.21 + arc) * radius * 0.08;
      const x = (Math.round(centerX + Math.cos(t) * (radius + wobble)) + size) % size;
      const y = (Math.round(centerY + Math.sin(t) * (radius + wobble * 0.6)) + size) % size;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const px = (x + dx + size) % size;
          const py = (y + dy + size) % size;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const lift = Math.max(0, 3 - distance) * prng.random(2.5, 6.5);
          heightmap[py][px] = clampHeight(heightmap[py][px] + lift);
        }
      }
    }
  }
  return heightmap;
}

function addIceFractures(heightmap: number[][], prng: PRNG, fractureCount: number): number[][] {
  const size = heightmap.length;
  for (let fracture = 0; fracture < fractureCount; fracture++) {
    const angle = prng.random(-0.35, 0.35);
    const intercept = prng.random(0, size);
    const length = prng.random(size * 0.35, size * 0.95);
    const startX = prng.randomInt(0, size - 1);
    for (let step = 0; step < length; step++) {
      const x = (Math.round(startX + step) + size) % size;
      const y = (Math.round(intercept + step * angle + Math.sin(step * 0.08) * 3) + size) % size;
      heightmap[y][x] = clampHeight(heightmap[y][x] - prng.random(6, 18));
      if (heightmap[y + 1]) heightmap[y + 1][x] = clampHeight(heightmap[y + 1][x] + prng.random(1, 5));
    }
  }
  return heightmap;
}

function addCryovolcanicDomes(heightmap: number[][], prng: PRNG, domeCount: number): number[][] {
  const size = heightmap.length;
  for (let dome = 0; dome < domeCount; dome++) {
    const cx = prng.randomInt(0, size - 1);
    const cy = prng.randomInt(0, size - 1);
    const radius = prng.randomInt(3, Math.max(5, Math.floor(size / 11)));
    for (let y = cy - radius - 2; y <= cy + radius + 2; y++) {
      for (let x = cx - radius - 2; x <= cx + radius + 2; x++) {
        const px = (x + size) % size;
        const py = (y + size) % size;
        const dx = x - cx;
        const dy = y - cy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > radius + 1) continue;
        const domeLift = Math.max(0, 1 - distance / Math.max(1, radius)) * prng.random(12, 26);
        const caldera = distance < radius * 0.28 ? prng.random(4, 11) : 0;
        heightmap[py][px] = clampHeight(heightmap[py][px] + domeLift - caldera);
      }
    }
  }
  return heightmap;
}

function addVolatileFrostBasins(heightmap: number[][], prng: PRNG, basinCount: number): number[][] {
  const size = heightmap.length;
  for (let basin = 0; basin < basinCount; basin++) {
    const cx = prng.randomInt(0, size - 1);
    const cy = prng.randomInt(0, size - 1);
    const radius = prng.randomInt(4, Math.max(6, Math.floor(size / 7)));
    for (let y = cy - radius; y <= cy + radius; y++) {
      for (let x = cx - radius; x <= cx + radius; x++) {
        const px = (x + size) % size;
        const py = (y + size) % size;
        const dx = x - cx;
        const dy = y - cy;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance > radius) continue;
        const basinDepth = Math.cos((distance / radius) * Math.PI * 0.5) * prng.random(5, 15);
        heightmap[py][px] = clampHeight(heightmap[py][px] - basinDepth);
      }
    }
  }
  return smoothHeightmap(heightmap, 1, 0.12);
}

function addVolcanicRifts(heightmap: number[][], prng: PRNG, riftCount: number): number[][] {
  const size = heightmap.length;
  for (let rift = 0; rift < riftCount; rift++) {
    const baseX = prng.random(0, size);
    const phase = prng.random(0, Math.PI * 2);
    for (let y = 0; y < size; y++) {
      const centerX = baseX + Math.sin(y * 0.035 + phase) * size * 0.08;
      for (let offset = -3; offset <= 3; offset++) {
        const x = (Math.round(centerX + offset) + size) % size;
        const heatLift = offset === 0 ? prng.random(14, 30) : prng.random(2, 10);
        heightmap[y][x] = clampHeight(heightmap[y][x] + heatLift);
      }
    }
  }
  return heightmap;
}

function addAblationScarps(heightmap: number[][], prng: PRNG, scarpCount: number): number[][] {
  const size = heightmap.length;
  for (let scarp = 0; scarp < scarpCount; scarp++) {
    const angle = prng.random(-0.8, 0.8);
    const intercept = prng.random(0, size);
    const drop = prng.random(10, 28);
    for (let x = 0; x < size; x++) {
      const y = (Math.round(intercept + x * angle + Math.sin(x * 0.11 + scarp) * 2) + size) % size;
      for (let offset = -2; offset <= 2; offset++) {
        const py = (y + offset + size) % size;
        const sign = offset < 0 ? 1 : -1;
        heightmap[py][x] = clampHeight(heightmap[py][x] + sign * drop * (1 - Math.abs(offset) / 3));
      }
    }
  }
  return heightmap;
}

function addTesseraTerrain(heightmap: number[][], prng: PRNG, blockCount: number): number[][] {
  const size = heightmap.length;
  for (let block = 0; block < blockCount; block++) {
    const x0 = prng.randomInt(0, size - 1);
    const y0 = prng.randomInt(0, size - 1);
    const width = prng.randomInt(Math.max(5, Math.floor(size / 9)), Math.max(7, Math.floor(size / 4)));
    const height = prng.randomInt(Math.max(5, Math.floor(size / 10)), Math.max(7, Math.floor(size / 5)));
    const uplift = prng.random(7, 18);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const px = (x0 + x + size) % size;
        const py = (y0 + y + size) % size;
        const ridge = (x % 4 === 0 || y % 5 === 0) ? prng.random(4, 10) : 0;
        const warped = Math.sin((x + block) * 0.7) * Math.cos((y - block) * 0.55) * 3;
        heightmap[py][px] = clampHeight(heightmap[py][px] + uplift + ridge + warped);
      }
    }
  }
  return smoothHeightmap(heightmap, 1, 0.08);
}

function addCarbonDuneFields(heightmap: number[][], prng: PRNG, fieldCount: number): number[][] {
  const size = heightmap.length;
  for (let field = 0; field < fieldCount; field++) {
    const y0 = prng.randomInt(0, size - 1);
    const bandHeight = prng.randomInt(Math.max(4, Math.floor(size / 12)), Math.max(6, Math.floor(size / 5)));
    const phase = prng.random(0, Math.PI * 2);
    for (let y = 0; y < bandHeight; y++) {
      const py = (y0 + y + size) % size;
      for (let x = 0; x < size; x++) {
        const wave = Math.sin(x * 0.42 + y * 0.18 + phase) + Math.sin(x * 0.13 + phase * 0.7) * 0.5;
        const lift = wave > 0.25 ? wave * prng.random(2, 7) : wave * prng.random(1, 3);
        heightmap[py][x] = clampHeight(heightmap[py][x] + lift);
      }
    }
  }
  return smoothHeightmap(heightmap, 1, 0.1);
}

function addSedimentaryPlains(heightmap: number[][], strength: number): number[][] {
  const mid = (CONFIG.PLANET_HEIGHT_LEVELS - 1) * 0.48;
  return heightmap.map((row) =>
    row.map((height) => {
      if (height < mid * 1.15 && height > mid * 0.35) {
        return clampHeight(height * (1 - strength) + mid * strength);
      }
      return height;
    })
  );
}

function sharpenAirlessRelief(heightmap: number[][], strength: number): number[][] {
  const mid = (CONFIG.PLANET_HEIGHT_LEVELS - 1) / 2;
  return heightmap.map((row) => row.map((height) => clampHeight(mid + (height - mid) * (1 + strength))));
}

function clampHeight(value: number): number {
  return Math.max(0, Math.min(CONFIG.PLANET_HEIGHT_LEVELS - 1, Math.round(value)));
}
