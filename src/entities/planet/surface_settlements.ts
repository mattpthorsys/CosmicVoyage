import { PRNG } from '../../utils/prng';
import { surfaceLongitudeDelta } from '../../utils/surface_coordinates';
import { isLiquidCovered, type SurfaceLiquidOverlay } from './surface_liquid';

export type SettlementArchetype = 'urban' | 'sealed' | 'industrial';

/** Explicit human-colony input; life, survey status and orbital depots are not settlement evidence. */
export interface SurfaceSettlementProfile {
  readonly stage: 'partial' | 'complete';
  readonly diameterKm: number;
  readonly breathable: boolean;
}

/** A body-fixed urban patch, with centres in fractional native map cells and physical radii in km. */
export interface SurfaceSettlementPatch {
  readonly x: number;
  readonly y: number;
  readonly radiusXKm: number;
  readonly radiusYKm: number;
  readonly lightStrength: number;
}

export interface SurfaceSettlementSite {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly archetype: SettlementArchetype;
  readonly layoutSeed: string;
  readonly patches: readonly SurfaceSettlementPatch[];
}

/** Sparse cell averages, not binary urban tiles; emission is a bounded linear radiance proxy. */
export interface SurfaceSettlementCell {
  readonly x: number;
  readonly y: number;
  readonly coverage: number;
  readonly emission: number;
  readonly siteIndex: number;
}

export interface SurfaceSettlementLayer {
  readonly version: number;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly longitudePeriod: number;
  readonly sites: readonly SurfaceSettlementSite[];
  /** Sorted by y * longitudePeriod + x, so consumers need no mutable worker-owned index. */
  readonly cells: readonly SurfaceSettlementCell[];
}

export const SURFACE_SETTLEMENT_VERSION = 1;
export const SURFACE_SETTLEMENT_LIMITS = {
  sites: 12,
  patchesPerSite: 7,
  candidates: 512,
  patchCells: 256,
  layerCells: 4096,
  shrinkAttempts: 6,
  // These are differences in the existing 0..255 terrain classes, not measured slope angles.
  urbanRelief: 18,
  sealedRelief: 24,
} as const;

// Albedo tints and artificial light colours stay independent of stellar colour.
// Actual emission/exposure and glyph composition belong to the rendering milestones.
export const SETTLEMENT_APPEARANCES = {
  urban: { albedoColour: '#696D69', lightColour: '#F1C98B' },
  sealed: { albedoColour: '#769396', lightColour: '#BCE5DF' },
  industrial: { albedoColour: '#6C6862', lightColour: '#D9B477' },
} as const;

interface TerrainContext {
  readonly heights: readonly (readonly number[])[];
  readonly liquid: SurfaceLiquidOverlay | null;
  readonly width: number;
  readonly height: number;
  readonly period: number;
  readonly profile: SurfaceSettlementProfile;
}

interface Candidate {
  readonly x: number;
  readonly y: number;
  readonly score: number;
}

interface FootprintCell {
  readonly x: number;
  readonly y: number;
  readonly coverage: number;
  readonly emission: number;
}

interface PreparedSite {
  readonly site: SurfaceSettlementSite;
  readonly cells: readonly FootprintCell[];
}

interface AccumulatedCell {
  x: number;
  y: number;
  coverage: number;
  emission: number;
  siteIndex: number;
  dominantCoverage: number;
}

/** Wraps native longitude while treating the generated duplicate endpoint as the first column. */
function longitude(x: number, period: number): number {
  return ((x % period) + period) % period;
}

/** Returns dry, locally gentle ground; water is excluded from the relief comparison. */
function assessGround(
  context: TerrainContext,
  x: number,
  y: number
): { height: number; relief: number } | null {
  if (y < 0 || y >= context.height) return null;
  const centre = context.heights[y][longitude(x, context.period)];
  if (!Number.isFinite(centre) || centre < 0 || centre > 255 || isLiquidCovered(centre, context.liquid))
    return null;
  let low = centre;
  let high = centre;
  for (let dy = -1; dy <= 1; dy++) {
    const row = context.heights[y + dy];
    if (!row) continue;
    for (let dx = -1; dx <= 1; dx++) {
      const value = row[longitude(x + dx, context.period)];
      if (!Number.isFinite(value) || value < 0 || value > 255) return null;
      if (isLiquidCovered(value, context.liquid)) continue;
      low = Math.min(low, value);
      high = Math.max(high, value);
    }
  }
  const limit =
    context.profile.stage === 'complete' && context.profile.breathable
      ? SURFACE_SETTLEMENT_LIMITS.urbanRelief
      : SURFACE_SETTLEMENT_LIMITS.sealedRelief;
  return high - low <= limit ? { height: centre, relief: high - low } : null;
}

/** Returns the physical scale of a Mercator cell at a fractional regional latitude. */
function cellScale(context: TerrainContext, y: number): { xKm: number; yKm: number; cosine: number } {
  const cosine = 1 / Math.cosh((0.5 - y / (context.height - 1)) * Math.PI * 2);
  const circumferenceKm = Math.PI * context.profile.diameterKm;
  return {
    xKm: (circumferenceKm * cosine) / context.period,
    yKm: (circumferenceKm * cosine) / (context.height - 1),
    cosine,
  };
}

/** Prefers flat lowlands and genuine water margins, with seeded variation between suitable sites. */
function candidateAt(context: TerrainContext, x: number, y: number, prng: PRNG): Candidate | null {
  const ground = assessGround(context, x, y);
  if (!ground) return null;
  let coastal = false;
  if (context.liquid?.kind === 'water') {
    for (const distance of [1, 2, 4]) {
      for (const [dx, dy] of [
        [distance, 0],
        [-distance, 0],
        [0, distance],
        [0, -distance],
      ]) {
        const value = context.heights[y + dy]?.[longitude(x + dx, context.period)];
        if (value !== undefined && isLiquidCovered(value, context.liquid)) coastal = true;
      }
    }
  }
  const cosine = cellScale(context, y + 0.5).cosine;
  const elevation = Math.max(0, ground.height - (context.liquid?.seaLevel ?? 0)) / 255;
  return {
    x,
    y,
    score:
      (coastal ? 0.35 : 0) +
      cosine * cosine * 0.3 +
      (1 - ground.relief / 24) * 0.2 +
      (1 - elevation) * 0.15 +
      prng.random(0, 0.35),
  };
}

/** Samples a bounded candidate set and scans for one valid fallback only if sampling finds no land. */
function collectCandidates(context: TerrainContext, prng: PRNG): Candidate[] {
  const candidates: Candidate[] = [];
  const visited = new Set<number>();
  for (let attempt = 0; attempt < SURFACE_SETTLEMENT_LIMITS.candidates; attempt++) {
    const x = prng.randomInt(0, context.period - 1);
    const y = prng.randomInt(1, context.height - 2);
    const key = y * context.period + x;
    if (visited.has(key)) continue;
    visited.add(key);
    const candidate = candidateAt(context, x, y, prng);
    if (candidate) candidates.push(candidate);
  }
  if (!candidates.length) {
    let fallback: Candidate | null = null;
    for (let y = 1; y < context.height - 1; y++) {
      for (let x = 0; x < context.period; x++) {
        const candidate = candidateAt(context, x, y, prng);
        if (candidate && (!fallback || candidate.score > fallback.score)) fallback = candidate;
      }
    }
    if (fallback) candidates.push(fallback);
  }
  return candidates.sort((a, b) => b.score - a.score || a.y - b.y || a.x - b.x);
}

/** Measures angular separation on the same Mercator sphere, including the longitude seam. */
function distanceKm(context: TerrainContext, x: number, y: number, site: SurfaceSettlementSite): number {
  const a = Math.atan(Math.sinh((0.5 - y / (context.height - 1)) * Math.PI * 2));
  const b = Math.atan(Math.sinh((0.5 - site.y / (context.height - 1)) * Math.PI * 2));
  const dLongitude = (surfaceLongitudeDelta(x, site.x, context.period) * Math.PI * 2) / context.period;
  const haversine = Math.sin((a - b) / 2) ** 2 + Math.cos(a) * Math.cos(b) * Math.sin(dLongitude / 2) ** 2;
  return context.profile.diameterKm * Math.asin(Math.sqrt(Math.max(0, Math.min(1, haversine))));
}

/** Area-integrates an ellipse within one cell, preserving even much-smaller-than-cell footprints. */
function ellipseCoverage(cx: number, cy: number, rx: number, ry: number, x: number, y: number): number {
  const nearestX = Math.max(x, Math.min(x + 1, cx)) - cx;
  if (Math.abs(nearestX) >= rx) return 0;
  const extentY = ry * Math.sqrt(1 - (nearestX / rx) ** 2);
  const top = Math.max(y, cy - extentY);
  const bottom = Math.min(y + 1, cy + extentY);
  if (bottom <= top) return 0;
  // Integrate over the actual overlap, not a fixed cell-wide point grid which
  // could entirely miss a small city. Midpoint strips approximate ellipse area.
  const steps = 16;
  const step = (bottom - top) / steps;
  let area = 0;
  for (let strip = 0; strip < steps; strip++) {
    const dy = (top + (strip + 0.5) * step - cy) / ry;
    const extentX = rx * Math.sqrt(Math.max(0, 1 - dy * dy));
    const span = Math.min(x + 1, cx + extentX) - Math.max(x, cx - extentX);
    area += Math.max(0, span) * step;
  }
  return Math.min(1, area);
}

/** Rejects a whole patch if any occupied ground is submerged, rough or outside the bounded latitude. */
function preparePatch(context: TerrainContext, patch: SurfaceSettlementPatch): FootprintCell[] | null {
  const scale = cellScale(context, patch.y);
  const rx = patch.radiusXKm / scale.xKm;
  const ry = patch.radiusYKm / scale.yKm;
  const left = Math.floor(patch.x - rx);
  const right = Math.ceil(patch.x + rx) - 1;
  const top = Math.floor(patch.y - ry);
  const bottom = Math.ceil(patch.y + ry) - 1;
  if (
    top < 0 ||
    bottom >= context.height ||
    rx >= context.period / 2 ||
    (right - left + 1) * (bottom - top + 1) > SURFACE_SETTLEMENT_LIMITS.patchCells
  )
    return null;
  const cells: FootprintCell[] = [];
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const coverage = ellipseCoverage(patch.x, patch.y, rx, ry, x, y);
      if (coverage <= 1e-12) continue;
      const wrappedX = longitude(x, context.period);
      if (!assessGround(context, wrappedX, y)) return null;
      cells.push({ x: wrappedX, y, coverage, emission: coverage * patch.lightStrength });
    }
  }
  return cells.length ? cells : null;
}

/** Builds an irregular region from one shrinking-to-fit core and optional smaller satellite patches. */
function prepareSite(
  context: TerrainContext,
  mapSeed: string,
  candidate: Candidate,
  index: number
): PreparedSite | null {
  const layoutSeed = `${mapSeed}:surface-settlements-v${SURFACE_SETTLEMENT_VERSION}:${candidate.x},${candidate.y}`;
  const prng = new PRNG(layoutSeed);
  const openAir = context.profile.stage === 'complete' && context.profile.breathable;
  const archetype: SettlementArchetype =
    index > 0 && prng.next() < 0.2 ? 'industrial' : openAir ? 'urban' : 'sealed';
  const x = longitude(candidate.x + prng.random(0.3, 0.7), context.period);
  const y = candidate.y + prng.random(0.3, 0.7);
  let radiusKm = Math.min(
    archetype === 'urban' ? prng.random(12, 42) : prng.random(2, 8),
    context.profile.diameterKm * 0.006
  );
  let core: SurfaceSettlementPatch | null = null;
  let cells: FootprintCell[] | null = null;
  for (let attempt = 0; attempt < SURFACE_SETTLEMENT_LIMITS.shrinkAttempts; attempt++) {
    const patch = { x, y, radiusXKm: radiusKm, radiusYKm: radiusKm * 0.7, lightStrength: 0.85 };
    cells = preparePatch(context, patch);
    if (cells) {
      core = patch;
      break;
    }
    radiusKm *= 0.5;
  }
  if (!core || !cells) return null;
  const patches: SurfaceSettlementPatch[] = [core];
  const scale = cellScale(context, y);
  const count = Math.min(
    SURFACE_SETTLEMENT_LIMITS.patchesPerSite - 1,
    archetype === 'urban' ? prng.randomInt(3, 6) : prng.randomInt(1, 3)
  );
  for (let satellite = 0; satellite < count; satellite++) {
    const bearing = prng.random(0, Math.PI * 2);
    const offsetKm = radiusKm * prng.random(0.7, 1.8);
    const radius = radiusKm * prng.random(0.2, 0.55);
    const patch: SurfaceSettlementPatch = {
      x: longitude(x + (Math.cos(bearing) * offsetKm) / scale.xKm, context.period),
      y: y + (Math.sin(bearing) * offsetKm) / scale.yKm,
      radiusXKm: radius,
      radiusYKm: radius * prng.random(0.5, 1),
      lightStrength: prng.random(0.25, 0.65),
    };
    const footprint = preparePatch(context, patch);
    if (!footprint) continue;
    patches.push(patch);
    cells.push(...footprint);
  }
  return { site: { id: layoutSeed, layoutSeed, x, y, archetype, patches }, cells };
}

/** Generates decoration only, with independent seeds and no mutation of terrain or resource state. */
export function createSurfaceSettlementLayer(
  mapSeed: string,
  heightmap: readonly (readonly number[])[],
  liquid: SurfaceLiquidOverlay | null,
  profile?: SurfaceSettlementProfile | null
): SurfaceSettlementLayer | null {
  if (
    !profile ||
    !Number.isFinite(profile.diameterKm) ||
    profile.diameterKm <= 0 ||
    !['partial', 'complete'].includes(profile.stage)
  )
    return null;
  const height = heightmap.length;
  const width = heightmap[0]?.length ?? 0;
  if (height < 3 || width < 3 || heightmap.some((row) => row.length !== width)) return null;
  const context: TerrainContext = { heights: heightmap, liquid, width, height, period: width - 1, profile };
  const prng = new PRNG(`${mapSeed}:surface-settlements-v${SURFACE_SETTLEMENT_VERSION}`);
  const density = prng.seedNew('density');
  const base =
    profile.stage === 'complete' && profile.breathable ? density.randomInt(6, 10) : density.randomInt(2, 4);
  const wanted = Math.max(
    1,
    Math.min(
      SURFACE_SETTLEMENT_LIMITS.sites,
      Math.round(base * Math.min(1.5, Math.sqrt(profile.diameterKm / 12800)))
    )
  );
  const candidates = collectCandidates(context, prng.seedNew('candidates'));
  const sites: SurfaceSettlementSite[] = [];
  const accumulated = new Map<number, AccumulatedCell>();
  const separationKm = (Math.PI * profile.diameterKm) / (wanted * 3);
  for (const candidate of candidates) {
    if (sites.length >= wanted) break;
    if (sites.some((site) => distanceKm(context, candidate.x + 0.5, candidate.y + 0.5, site) < separationKm))
      continue;
    const prepared = prepareSite(context, mapSeed, candidate, sites.length);
    if (!prepared) continue;
    const additions = new Set(prepared.cells.map((cell) => cell.y * context.period + cell.x));
    const addedCount = [...additions].filter((key) => !accumulated.has(key)).length;
    if (accumulated.size + addedCount > SURFACE_SETTLEMENT_LIMITS.layerCells) continue;
    const siteIndex = sites.length;
    sites.push(prepared.site);
    for (const cell of prepared.cells) {
      const key = cell.y * context.period + cell.x;
      const previous = accumulated.get(key);
      if (!previous) {
        accumulated.set(key, { ...cell, siteIndex, dominantCoverage: cell.coverage });
      } else {
        // Bounded additive area is an urban-density approximation, not a precise
        // building union. Never claim more than one cell of occupied surface.
        previous.coverage = Math.min(1, previous.coverage + cell.coverage);
        previous.emission = Math.min(previous.coverage, previous.emission + cell.emission);
        if (cell.coverage > previous.dominantCoverage) {
          previous.siteIndex = siteIndex;
          previous.dominantCoverage = cell.coverage;
        }
      }
    }
  }
  if (!sites.length) return null;
  const cells = [...accumulated.values()]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(({ x, y, coverage, emission, siteIndex }) => ({ x, y, coverage, emission, siteIndex }));
  return {
    version: SURFACE_SETTLEMENT_VERSION,
    sourceWidth: width,
    sourceHeight: height,
    longitudePeriod: context.period,
    sites,
    cells,
  };
}

/** Reads a prepared native cell without building indexes, wrapping longitude but never latitude. */
export function getSurfaceSettlementCell(
  layer: SurfaceSettlementLayer | null | undefined,
  x: number,
  y: number
): SurfaceSettlementCell | null {
  if (!layer || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const row = Math.floor(y);
  if (row < 0 || row >= layer.sourceHeight) return null;
  const target = row * layer.longitudePeriod + longitude(Math.floor(x), layer.longitudePeriod);
  let low = 0;
  let high = layer.cells.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    const cell = layer.cells[middle];
    const key = cell.y * layer.longitudePeriod + cell.x;
    if (key < target) low = middle + 1;
    else high = middle;
  }
  const cell = layer.cells[low];
  return cell && cell.y * layer.longitudePeriod + cell.x === target ? cell : null;
}
