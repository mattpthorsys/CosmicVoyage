import { CONFIG } from '../config';
import { PRNG } from '../utils/prng';

export type GalacticPopulation = 'thin-disk' | 'thick-disk' | 'bulge' | 'halo';
export type GalacticClusterKind = 'open' | 'globular';

export interface SystemAddress {
  readonly cellX: number;
  readonly cellY: number;
  readonly slot: number;
}

export interface GalacticClusterContext {
  readonly kind: GalacticClusterKind;
  readonly name: string;
  readonly influence: number;
  readonly ageGyr: number;
  readonly metallicityFeH: number;
}

export interface HumanPresenceContext {
  readonly distanceFromSolLy: number;
  readonly settlementIntensity: number;
  readonly region: 'core' | 'settled' | 'frontier' | 'uninhabited';
  readonly depotIntensity: number;
}

export interface GalacticCellContext {
  readonly worldX: number;
  readonly worldY: number;
  readonly localXpc: number;
  readonly localYpc: number;
  readonly galactocentricXpc: number;
  readonly galactocentricYpc: number;
  readonly galactocentricRadiusPc: number;
  readonly azimuthRad: number;
  readonly relativeStellarDensity: number;
  readonly expectedResolvedSystems: number;
  readonly populationWeights: Readonly<Record<GalacticPopulation, number>>;
  readonly armName: string | null;
  readonly armInfluence: number;
  readonly gasDensity: number;
  readonly dustDensity: number;
  readonly meanMetallicityFeH: number;
  readonly cluster: GalacticClusterContext | null;
  readonly human: HumanPresenceContext;
}

export interface StellarPopulationSample {
  readonly population: GalacticPopulation;
  readonly ageGyr: number;
  readonly metallicityFeH: number;
}

export interface GalaxyFieldSample {
  readonly density: number;
  readonly armInfluence: number;
  readonly gasDensity: number;
  readonly dustDensity: number;
  readonly insideMainDisk: boolean;
}

interface MacroGalacticSample {
  thinDisk: number;
  thickDisk: number;
  bulge: number;
  halo: number;
  armName: string | null;
  armInfluence: number;
  gasDensity: number;
  dustDensity: number;
  relativeStellarDensity: number;
  radiusPc: number;
  azimuthRad: number;
}

interface SpiralArmDefinition {
  name: string;
  phaseRad: number;
  widthPc: number;
}

interface GalacticClusterDefinition {
  readonly kind: GalacticClusterKind;
  readonly name: string;
  readonly centerX: number;
  readonly centerY: number;
  readonly radius: number;
  readonly ageGyr: number;
  readonly metallicityFeH: number;
}

const SPIRAL_PITCH_RAD = (12.8 * Math.PI) / 180;
const SPIRAL_REFERENCE_RADIUS_PC = 5000;
const SPIRAL_ARMS: readonly SpiralArmDefinition[] = [
  { name: 'Norma Arm', phaseRad: -0.18, widthPc: 330 },
  { name: 'Scutum-Centaurus Arm', phaseRad: Math.PI / 2 - 0.18, widthPc: 390 },
  { name: 'Sagittarius-Carina Arm', phaseRad: Math.PI - 0.18, widthPc: 360 },
  { name: 'Perseus Arm', phaseRad: (Math.PI * 3) / 2 - 0.18, widthPc: 420 },
] as const;

const MILKY_WAY_AGE_GYR = 13.2;

/** Models the deterministic large-scale Milky Way environment behind procedural generation. */
export class MilkyWayModel {
  private readonly seed: string;
  private readonly clusterSectorCache = new Map<string, GalacticClusterDefinition | null>();
  private readonly maxClusterSectorCacheSize = 8192;

  /** Initializes a fixed Galactic macro model with seed-dependent fine structure. */
  constructor(seed: string | number) {
    this.seed = String(seed);
  }

  /** Converts a navigable one-parsec world cell into projected galactocentric coordinates. */
  worldToGalactocentric(worldX: number, worldY: number): { xPc: number; yPc: number } {
    const cellPc = CONFIG.HYPERSPACE_CELL_LIGHT_YEARS / 3.26156;
    const localXpc = worldX * cellPc;
    const localYpc = worldY * cellPc;

    // Positive local X points toward the Galactic centre; positive Y follows rotation.
    return {
      xPc: CONFIG.GALACTIC_SOLAR_RADIUS_PC - localXpc,
      yPc: localYpc,
    };
  }

  /** Converts projected galactocentric coordinates back into navigable world cells. */
  galactocentricToWorld(xPc: number, yPc: number): { worldX: number; worldY: number } {
    const cellPc = CONFIG.HYPERSPACE_CELL_LIGHT_YEARS / 3.26156;
    return {
      worldX: (CONFIG.GALACTIC_SOLAR_RADIUS_PC - xPc) / cellPc,
      worldY: yPc / cellPc,
    };
  }

  /** Returns all Galactic inputs needed to generate one hyperspace cell. */
  getCellContext(worldX: number, worldY: number): GalacticCellContext {
    const coordinates = this.worldToGalactocentric(worldX, worldY);
    const macro = this.sampleMacro(coordinates.xPc, coordinates.yPc);
    const cluster = this.findCluster(worldX, worldY);
    const clusterDensityBoost = cluster ? 1 + cluster.influence * (cluster.kind === 'open' ? 2.2 : 3.5) : 1;
    const expectedResolvedSystems = this.clamp(
      CONFIG.STAR_DENSITY * macro.relativeStellarDensity * clusterDensityBoost,
      0.0004,
      3.2
    );
    const totalPopulation = Math.max(1e-8, macro.thinDisk + macro.thickDisk + macro.bulge + macro.halo);
    const cellPc = CONFIG.HYPERSPACE_CELL_LIGHT_YEARS / 3.26156;

    return {
      worldX,
      worldY,
      localXpc: worldX * cellPc,
      localYpc: worldY * cellPc,
      galactocentricXpc: coordinates.xPc,
      galactocentricYpc: coordinates.yPc,
      galactocentricRadiusPc: macro.radiusPc,
      azimuthRad: macro.azimuthRad,
      relativeStellarDensity: macro.relativeStellarDensity * clusterDensityBoost,
      expectedResolvedSystems,
      populationWeights: {
        'thin-disk': macro.thinDisk / totalPopulation,
        'thick-disk': macro.thickDisk / totalPopulation,
        bulge: macro.bulge / totalPopulation,
        halo: macro.halo / totalPopulation,
      },
      armName: macro.armName,
      armInfluence: macro.armInfluence,
      gasDensity: macro.gasDensity,
      dustDensity: macro.dustDensity,
      meanMetallicityFeH: this.getMeanMetallicity(macro.radiusPc, macro),
      cluster,
      human: this.getHumanPresence(worldX, worldY),
    };
  }

  /** Samples age and metallicity jointly from the local Galactic population. */
  sampleStellarPopulation(context: GalacticCellContext, prng: PRNG): StellarPopulationSample {
    const population = this.weightedChoice(prng, context.populationWeights);
    let ageGyr: number;

    if (context.cluster) {
      ageGyr = this.clamp(context.cluster.ageGyr + prng.random(-0.04, 0.04), 0.002, MILKY_WAY_AGE_GYR);
    } else if (population === 'thin-disk') {
      // A continuous history with a modest young-arm enhancement avoids making arms solid ribbons.
      const youngChance = 0.08 + context.armInfluence * 0.22;
      ageGyr =
        prng.random() < youngChance ? prng.random(0.003, 1.2) : 0.25 + Math.pow(prng.random(), 0.82) * 9.75;
    } else if (population === 'thick-disk') {
      ageGyr = prng.random(8, 12.2);
    } else if (population === 'bulge') {
      ageGyr = prng.random() < 0.12 ? prng.random(0.2, 3.5) : prng.random(7.5, 12.8);
    } else {
      ageGyr = prng.random(10.2, MILKY_WAY_AGE_GYR);
    }

    const populationOffset: Record<GalacticPopulation, number> = {
      'thin-disk': 0,
      'thick-disk': -0.48,
      bulge: -0.08,
      halo: -1.28,
    };
    const agePenalty = Math.max(0, ageGyr - 4.5) * 0.025;
    const clusterMetallicity = context.cluster?.metallicityFeH;
    const meanMetallicity =
      clusterMetallicity ?? context.meanMetallicityFeH + populationOffset[population] - agePenalty;
    const metallicityFeH = this.clamp(
      meanMetallicity + prng.random(-0.16, 0.16) + prng.random(-0.08, 0.08),
      -2.35,
      0.62
    );

    return {
      population,
      ageGyr: Number(ageGyr.toFixed(ageGyr < 0.1 ? 3 : 2)),
      metallicityFeH: Number(metallicityFeH.toFixed(2)),
    };
  }

  /** Returns the human settlement and automated-logistics envelopes around Sol. */
  getHumanPresence(worldX: number, worldY: number): HumanPresenceContext {
    const distanceFromSolLy = Math.hypot(worldX, worldY) * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS;
    const core = CONFIG.HUMAN_CORE_RADIUS_LY;
    const settled = CONFIG.HUMAN_SETTLED_RADIUS_LY;
    const frontier = CONFIG.HUMAN_FRONTIER_RADIUS_LY;
    let settlementIntensity = 0;
    let region: HumanPresenceContext['region'] = 'uninhabited';

    if (distanceFromSolLy <= core) {
      settlementIntensity = 1 - 0.15 * (distanceFromSolLy / Math.max(1, core));
      region = 'core';
    } else if (distanceFromSolLy <= settled) {
      settlementIntensity = this.lerp(0.85, 0.34, (distanceFromSolLy - core) / (settled - core));
      region = 'settled';
    } else if (distanceFromSolLy <= frontier) {
      settlementIntensity = this.smoothstep(frontier, settled, distanceFromSolLy) * 0.34;
      region = 'frontier';
    }

    const depotStart = CONFIG.AUTOMATED_DEPOT_INNER_RADIUS_LY;
    const depotEnd = CONFIG.AUTOMATED_DEPOT_OUTER_RADIUS_LY;
    const depotIntensity =
      distanceFromSolLy > depotEnd
        ? 0
        : distanceFromSolLy <= depotStart
          ? 0.18
          : this.smoothstep(depotEnd, depotStart, distanceFromSolLy);

    return {
      distanceFromSolLy,
      settlementIntensity: this.clamp(settlementIntensity, 0, 1),
      region,
      depotIntensity: this.clamp(depotIntensity, 0, 1),
    };
  }

  /** Samples the cheap analytical field used by the whole-Galaxy raster. */
  sampleGalaxyField(galactocentricXpc: number, galactocentricYpc: number): GalaxyFieldSample {
    const macro = this.sampleMacro(galactocentricXpc, galactocentricYpc);
    return {
      density: macro.relativeStellarDensity,
      armInfluence: macro.armInfluence,
      gasDensity: macro.gasDensity,
      dustDensity: macro.dustDensity,
      insideMainDisk: macro.radiusPc <= CONFIG.GALACTIC_DISK_RADIUS_PC,
    };
  }

  /** Evaluates smooth disk, bar, halo, arm, gas, and dust fields without cell-level allocations. */
  private sampleMacro(galactocentricXpc: number, galactocentricYpc: number): MacroGalacticSample {
    const radiusPc = Math.hypot(galactocentricXpc, galactocentricYpc);
    const azimuthRad = Math.atan2(galactocentricYpc, galactocentricXpc);
    const diskEdge = 1 - this.smoothstep(14500, CONFIG.GALACTIC_DISK_RADIUS_PC, radiusPc);
    const innerHole = this.smoothstep(650, 2600, radiusPc);
    const thinDisk = Math.exp((CONFIG.GALACTIC_SOLAR_RADIUS_PC - radiusPc) / 2700) * diskEdge * innerHole;
    const thickDisk =
      0.11 *
      Math.exp((CONFIG.GALACTIC_SOLAR_RADIUS_PC - radiusPc) / 2200) *
      (1 - this.smoothstep(15000, 18500, radiusPc));

    const barAngle = (CONFIG.GALACTIC_BAR_ANGLE_DEG * Math.PI) / 180;
    const cosBar = Math.cos(barAngle);
    const sinBar = Math.sin(barAngle);
    const barX = galactocentricXpc * cosBar + galactocentricYpc * sinBar;
    const barY = -galactocentricXpc * sinBar + galactocentricYpc * cosBar;
    const barRadius = Math.sqrt((barX / 1.9) ** 2 + (barY / 0.72) ** 2);
    const bulge = 7.4 * Math.exp(-barRadius / 900) * (1 - this.smoothstep(4200, 5600, Math.abs(barX)));
    const halo = 0.0015 * Math.pow(CONFIG.GALACTIC_SOLAR_RADIUS_PC / Math.max(650, radiusPc), 2.65);
    const arm = this.getSpiralArmSample(radiusPc, azimuthRad, galactocentricXpc, galactocentricYpc);
    const fineNoise = this.coordinateNoise(galactocentricXpc / 180, galactocentricYpc / 180, 'macro');
    const gasRadial = Math.exp(-Math.abs(radiusPc - 6200) / 5800) * diskEdge;
    const gasDensity = this.clamp(
      gasRadial * (0.18 + arm.influence * 0.82) * (0.78 + fineNoise * 0.44),
      0,
      1.4
    );
    const dustNoise = this.coordinateNoise(galactocentricXpc / 95, galactocentricYpc / 95, 'dust');
    const dustDensity = this.clamp(gasDensity * (0.48 + dustNoise * 0.62), 0, 1.35);
    const localNormalization = 1.112;
    const relativeStellarDensity = this.clamp(
      ((thinDisk + thickDisk + bulge + halo) / localNormalization) *
        (1 + arm.influence * 0.22) *
        (0.94 + fineNoise * 0.12),
      0.0001,
      42
    );

    return {
      thinDisk,
      thickDisk,
      bulge,
      halo,
      armName: arm.name,
      armInfluence: arm.influence,
      gasDensity,
      dustDensity,
      relativeStellarDensity,
      radiusPc,
      azimuthRad,
    };
  }

  /** Returns the nearest logarithmic arm, including the shorter Local Spur near Sol. */
  private getSpiralArmSample(
    radiusPc: number,
    azimuthRad: number,
    galactocentricXpc: number,
    galactocentricYpc: number
  ): { name: string | null; influence: number } {
    if (radiusPc < 2200 || radiusPc > CONFIG.GALACTIC_DISK_RADIUS_PC) {
      return { name: null, influence: 0 };
    }

    let nearestName: string | null = null;
    let strongestInfluence = 0;
    const winding = Math.log(radiusPc / SPIRAL_REFERENCE_RADIUS_PC) / Math.tan(SPIRAL_PITCH_RAD);
    for (const arm of SPIRAL_ARMS) {
      const armAzimuth = arm.phaseRad + winding;
      const angularDistance = Math.abs(this.wrapAngle(azimuthRad - armAzimuth));
      const physicalDistancePc = angularDistance * radiusPc;
      const influence = Math.exp(-0.5 * (physicalDistancePc / arm.widthPc) ** 2);
      if (influence > strongestInfluence) {
        strongestInfluence = influence;
        nearestName = arm.name;
      }
    }

    // The Local Spur is represented as a short, broad structure around the Solar neighbourhood.
    const localDx = galactocentricXpc - CONFIG.GALACTIC_SOLAR_RADIUS_PC;
    const localDy = galactocentricYpc;
    const alongSpur = localDx * 0.91 + localDy * 0.41;
    const acrossSpur = -localDx * 0.41 + localDy * 0.91;
    const spurLength = 1 - this.smoothstep(1700, 2600, Math.abs(alongSpur));
    const spurInfluence = Math.exp(-0.5 * (acrossSpur / 310) ** 2) * spurLength * 0.94;
    if (spurInfluence > strongestInfluence) {
      strongestInfluence = spurInfluence;
      nearestName = 'Local Spur';
    }

    return {
      name: strongestInfluence >= 0.08 ? nearestName : null,
      influence: this.clamp(strongestInfluence, 0, 1),
    };
  }

  /** Finds a deterministic open or globular cluster whose tidal extent covers the cell. */
  private findCluster(worldX: number, worldY: number): GalacticClusterContext | null {
    const openCluster = this.findSectorCluster(worldX, worldY, 96, 'open');
    if (openCluster) return openCluster;

    // Globulars are far rarer and use larger ownership sectors to remain order-independent.
    return this.findSectorCluster(worldX, worldY, 720, 'globular');
  }

  /** Searches neighbouring ownership sectors for one deterministic cluster influence. */
  private findSectorCluster(
    worldX: number,
    worldY: number,
    sectorSize: number,
    kind: GalacticClusterKind
  ): GalacticClusterContext | null {
    const sectorX = Math.floor(worldX / sectorSize);
    const sectorY = Math.floor(worldY / sectorSize);
    let strongest: GalacticClusterContext | null = null;

    for (let offsetY = -1; offsetY <= 1; offsetY++) {
      for (let offsetX = -1; offsetX <= 1; offsetX++) {
        const candidateSectorX = sectorX + offsetX;
        const candidateSectorY = sectorY + offsetY;
        const definition = this.getClusterSectorDefinition(
          candidateSectorX,
          candidateSectorY,
          sectorSize,
          kind
        );
        if (!definition) continue;
        const distance = Math.hypot(worldX - definition.centerX, worldY - definition.centerY);
        if (distance > definition.radius) continue;

        const influence = this.smoothstep(definition.radius, 0, distance);
        if (strongest && strongest.influence >= influence) continue;
        strongest = {
          kind: definition.kind,
          name: definition.name,
          influence,
          ageGyr: definition.ageGyr,
          metallicityFeH: definition.metallicityFeH,
        };
      }
    }

    return strongest;
  }

  /** Returns one cached cluster definition whose spawn environment belongs to its own sector. */
  private getClusterSectorDefinition(
    sectorX: number,
    sectorY: number,
    sectorSize: number,
    kind: GalacticClusterKind
  ): GalacticClusterDefinition | null {
    const cacheKey = `${kind}:${sectorSize}:${sectorX},${sectorY}`;
    if (this.clusterSectorCache.has(cacheKey)) {
      return this.clusterSectorCache.get(cacheKey) ?? null;
    }

    const centerX = (sectorX + 0.1 + this.hashUnit(`${kind}:x:${sectorX},${sectorY}`) * 0.8) * sectorSize;
    const centerY = (sectorY + 0.1 + this.hashUnit(`${kind}:y:${sectorX},${sectorY}`) * 0.8) * sectorSize;
    const galactocentric = this.worldToGalactocentric(centerX, centerY);
    const environment = this.sampleMacro(galactocentric.xPc, galactocentric.yPc);
    const spawnChance =
      kind === 'open'
        ? 0.012 + environment.armInfluence * 0.075
        : environment.radiusPc < 6000
          ? 0.018
          : 0.003;
    const roll = this.hashUnit(`${kind}:spawn:${sectorX},${sectorY}`);
    if (roll >= spawnChance) {
      this.cacheClusterSector(cacheKey, null);
      return null;
    }

    const radius =
      kind === 'open'
        ? 9 + this.hashUnit(`${kind}:r:${sectorX},${sectorY}`) * 22
        : 24 + this.hashUnit(`${kind}:r:${sectorX},${sectorY}`) * 52;
    const identity = Math.floor(this.hashUnit(`${kind}:name:${sectorX},${sectorY}`) * 8999 + 1000);
    const ageGyr =
      kind === 'open'
        ? 0.015 + this.hashUnit(`${kind}:age:${sectorX},${sectorY}`) * 4.2
        : 10.4 + this.hashUnit(`${kind}:age:${sectorX},${sectorY}`) * 2.5;
    const metallicityFeH =
      kind === 'open'
        ? -0.25 + this.hashUnit(`${kind}:metal:${sectorX},${sectorY}`) * 0.48
        : -2.05 + this.hashUnit(`${kind}:metal:${sectorX},${sectorY}`) * 1.0;
    const definition: GalacticClusterDefinition = {
      kind,
      name: `${kind === 'open' ? 'OC' : 'GC'}-${identity}`,
      centerX,
      centerY,
      radius,
      ageGyr,
      metallicityFeH,
    };
    this.cacheClusterSector(cacheKey, definition);
    return definition;
  }

  /** Stores a bounded cluster-sector result so repeated adjacent cell queries remain inexpensive. */
  private cacheClusterSector(cacheKey: string, definition: GalacticClusterDefinition | null): void {
    if (this.clusterSectorCache.size >= this.maxClusterSectorCacheSize) {
      const firstKey = this.clusterSectorCache.keys().next().value;
      if (firstKey !== undefined) this.clusterSectorCache.delete(firstKey);
    }
    this.clusterSectorCache.set(cacheKey, definition);
  }

  /** Returns a radial metallicity baseline before population and age offsets. */
  private getMeanMetallicity(radiusPc: number, macro: MacroGalacticSample): number {
    const radialGradient = -0.06 * ((radiusPc - CONFIG.GALACTIC_SOLAR_RADIUS_PC) / 1000);
    const bulgeFraction = macro.bulge / Math.max(1e-8, macro.thinDisk + macro.thickDisk + macro.bulge);
    return this.clamp(0.02 + radialGradient - bulgeFraction * 0.08, -1.2, 0.5);
  }

  /** Selects a population from normalized relative weights. */
  private weightedChoice(
    prng: PRNG,
    weights: Readonly<Record<GalacticPopulation, number>>
  ): GalacticPopulation {
    let roll = prng.random();
    const populations: readonly GalacticPopulation[] = ['thin-disk', 'thick-disk', 'bulge', 'halo'];
    for (const population of populations) {
      roll -= weights[population];
      if (roll <= 0) return population;
    }
    return 'halo';
  }

  /** Returns deterministic low-frequency coordinate noise without mutable PRNG state. */
  private coordinateNoise(x: number, y: number, label: string): number {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = x - x0;
    const ty = y - y0;
    const a = this.hashUnit(`${label}:${x0},${y0}`);
    const b = this.hashUnit(`${label}:${x0 + 1},${y0}`);
    const c = this.hashUnit(`${label}:${x0},${y0 + 1}`);
    const d = this.hashUnit(`${label}:${x0 + 1},${y0 + 1}`);
    const smoothX = tx * tx * (3 - 2 * tx);
    const smoothY = ty * ty * (3 - 2 * ty);
    return this.lerp(this.lerp(a, b, smoothX), this.lerp(c, d, smoothX), smoothY);
  }

  /** Hashes a stable label and model seed into a zero-to-one scalar. */
  private hashUnit(label: string): number {
    const value = `${this.seed}|mw${CONFIG.GALAXY_MODEL_VERSION}|${label}`;
    let hash = 2166136261;
    for (let index = 0; index < value.length; index++) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 0xffffffff;
  }

  /** Wraps an angle onto the minus-pi to pi interval. */
  private wrapAngle(angle: number): number {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
  }

  /** Returns smooth Hermite interpolation between two scalar edges, including reversed edges. */
  private smoothstep(edge0: number, edge1: number, value: number): number {
    const denominator = edge1 - edge0;
    if (Math.abs(denominator) < 1e-9) return value >= edge1 ? 1 : 0;
    const t = this.clamp((value - edge0) / denominator, 0, 1);
    return t * t * (3 - 2 * t);
  }

  /** Linearly interpolates two scalar values. */
  private lerp(start: number, end: number, factor: number): number {
    return start + (end - start) * factor;
  }

  /** Clamps a scalar to inclusive bounds. */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }
}
