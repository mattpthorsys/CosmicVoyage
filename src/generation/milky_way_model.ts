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
  readonly oldStellarDensity: number;
  readonly youngStellarDensity: number;
  readonly bulgeDensity: number;
  readonly barDensity: number;
  readonly stellarArmInfluence: number;
  readonly armInfluence: number;
  readonly gasDensity: number;
  readonly dustDensity: number;
  readonly dustLaneDensity: number;
  readonly texture: number;
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
  dustLaneDensity: number;
  youngStellarDensity: number;
  barDensity: number;
  bulgeDensity: number;
  stellarArmInfluence: number;
  texture: number;
  relativeStellarDensity: number;
  radiusPc: number;
  azimuthRad: number;
}

interface SpiralArmDefinition {
  name: string;
  betaKinkRad: number;
  radiusKinkPc: number;
  pitchBeforeRad: number;
  pitchAfterRad: number;
  widthAtKinkPc: number;
  widthGrowthPerKpc: number;
  minRadiusPc: number;
  maxRadiusPc: number;
  observedBetaMinRad: number;
  observedBetaMaxRad: number;
  trackBetaMinRad: number;
  trackBetaMaxRad: number;
  outerExtrapolationPitchRad: number;
  innerExtrapolationPitchRad: number;
  endpointTaperRad: number;
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

/** Converts published angular measurements to radians for model evaluation. */
function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

// Reid et al. (2019), Table 2: parallax-fitted arm ranges, kink radii, pitches, and widths.
// Major-arm extrapolations are deliberately bounded to one physical track. Treating every
// 2π-equivalent beta as another valid fit repeats low-pitch segments into concentric rings.
const SPIRAL_ARMS: readonly SpiralArmDefinition[] = [
  {
    name: 'Norma-Outer Arm',
    betaKinkRad: degreesToRadians(18),
    radiusKinkPc: 4460,
    pitchBeforeRad: degreesToRadians(-1),
    pitchAfterRad: degreesToRadians(19.5),
    widthAtKinkPc: 140,
    // The steeper growth joins the measured 0.65 kpc Outer-arm width one winding out.
    widthGrowthPerKpc: 66,
    minRadiusPc: 2600,
    maxRadiusPc: 16000,
    observedBetaMinRad: degreesToRadians(5),
    observedBetaMaxRad: degreesToRadians(54),
    trackBetaMinRad: degreesToRadians(-390),
    trackBetaMaxRad: degreesToRadians(90),
    // A 9.5-degree outer continuation passes through the measured Outer-arm kink at
    // beta=18 degrees on the preceding winding, connecting the two observed segments.
    outerExtrapolationPitchRad: degreesToRadians(9.5),
    innerExtrapolationPitchRad: degreesToRadians(19.5),
    endpointTaperRad: degreesToRadians(18),
  },
  {
    name: 'Scutum-Centaurus Arm',
    betaKinkRad: degreesToRadians(23),
    radiusKinkPc: 4910,
    pitchBeforeRad: degreesToRadians(14.1),
    pitchAfterRad: degreesToRadians(12.1),
    widthAtKinkPc: 230,
    widthGrowthPerKpc: 36,
    minRadiusPc: 2800,
    maxRadiusPc: 15500,
    observedBetaMinRad: degreesToRadians(0),
    observedBetaMaxRad: degreesToRadians(104),
    trackBetaMinRad: degreesToRadians(-205),
    trackBetaMaxRad: degreesToRadians(155),
    outerExtrapolationPitchRad: degreesToRadians(12.5),
    innerExtrapolationPitchRad: degreesToRadians(12.1),
    endpointTaperRad: degreesToRadians(18),
  },
  {
    name: 'Sagittarius-Carina Arm',
    betaKinkRad: degreesToRadians(24),
    radiusKinkPc: 6040,
    pitchBeforeRad: degreesToRadians(17.1),
    pitchAfterRad: degreesToRadians(1),
    widthAtKinkPc: 270,
    widthGrowthPerKpc: 36,
    minRadiusPc: 3200,
    maxRadiusPc: 14500,
    observedBetaMinRad: degreesToRadians(2),
    observedBetaMaxRad: degreesToRadians(97),
    trackBetaMinRad: degreesToRadians(-170),
    trackBetaMaxRad: degreesToRadians(190),
    // Reid et al. use roughly ten degrees to continue the Carina side beyond the fitted
    // near-circular segment; carrying the one-degree local pitch around the Galaxy is invalid.
    outerExtrapolationPitchRad: degreesToRadians(10),
    innerExtrapolationPitchRad: degreesToRadians(10),
    endpointTaperRad: degreesToRadians(18),
  },
  {
    name: 'Local Arm',
    betaKinkRad: degreesToRadians(9),
    radiusKinkPc: 8260,
    pitchBeforeRad: degreesToRadians(11.4),
    pitchAfterRad: degreesToRadians(11.4),
    widthAtKinkPc: 310,
    widthGrowthPerKpc: 36,
    minRadiusPc: 6900,
    maxRadiusPc: 9700,
    observedBetaMinRad: degreesToRadians(-8),
    observedBetaMaxRad: degreesToRadians(34),
    trackBetaMinRad: degreesToRadians(-35),
    trackBetaMaxRad: degreesToRadians(55),
    outerExtrapolationPitchRad: degreesToRadians(11.4),
    innerExtrapolationPitchRad: degreesToRadians(11.4),
    endpointTaperRad: degreesToRadians(10),
  },
  {
    name: 'Perseus Arm',
    betaKinkRad: degreesToRadians(40),
    radiusKinkPc: 8870,
    pitchBeforeRad: degreesToRadians(10.3),
    pitchAfterRad: degreesToRadians(8.7),
    widthAtKinkPc: 350,
    widthGrowthPerKpc: 36,
    minRadiusPc: 4200,
    maxRadiusPc: 15200,
    observedBetaMinRad: degreesToRadians(-23),
    observedBetaMaxRad: degreesToRadians(115),
    trackBetaMinRad: degreesToRadians(-95),
    trackBetaMaxRad: degreesToRadians(265),
    outerExtrapolationPitchRad: degreesToRadians(10.3),
    innerExtrapolationPitchRad: degreesToRadians(8.7),
    endpointTaperRad: degreesToRadians(18),
  },
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

  /** Converts a configurable navigable world cell into display-oriented galactocentric coordinates. */
  worldToGalactocentric(worldX: number, worldY: number): { xPc: number; yPc: number } {
    const cellPc = CONFIG.HYPERSPACE_CELL_LIGHT_YEARS / 3.26156;
    // The Sun is drawn below the core. Screen-right follows Galactic rotation and screen-up
    // (decreasing world Y) points toward the Galactic centre.
    return {
      xPc: worldX * cellPc,
      yPc: -CONFIG.GALACTIC_SOLAR_RADIUS_PC - worldY * cellPc,
    };
  }

  /** Converts projected galactocentric coordinates back into navigable world cells. */
  galactocentricToWorld(xPc: number, yPc: number): { worldX: number; worldY: number } {
    const cellPc = CONFIG.HYPERSPACE_CELL_LIGHT_YEARS / 3.26156;
    return {
      worldX: xPc / cellPc,
      worldY: -(yPc + CONFIG.GALACTIC_SOLAR_RADIUS_PC) / cellPc,
    };
  }

  /** Returns all Galactic inputs needed to generate one hyperspace cell. */
  getCellContext(worldX: number, worldY: number): GalacticCellContext {
    const cellPc = CONFIG.HYPERSPACE_CELL_LIGHT_YEARS / 3.26156;
    const coordinates = this.worldToGalactocentric(worldX, worldY);
    const macro = this.sampleMacro(coordinates.xPc, coordinates.yPc);
    const cluster = this.findCluster(worldX * cellPc, -worldY * cellPc);
    const clusterDensityBoost = cluster ? 1 + cluster.influence * (cluster.kind === 'open' ? 2.2 : 3.5) : 1;
    const expectedResolvedSystems = this.clamp(
      CONFIG.STAR_DENSITY * macro.relativeStellarDensity * clusterDensityBoost,
      CONFIG.STAR_DENSITY * 0.004,
      3.2
    );
    const totalPopulation = Math.max(1e-8, macro.thinDisk + macro.thickDisk + macro.bulge + macro.halo);
    return {
      worldX,
      worldY,
      localXpc: worldX * cellPc,
      localYpc: -worldY * cellPc,
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
      oldStellarDensity: macro.thinDisk + macro.thickDisk + macro.bulge + macro.halo,
      youngStellarDensity: macro.youngStellarDensity,
      bulgeDensity: macro.bulgeDensity,
      barDensity: macro.barDensity,
      stellarArmInfluence: macro.stellarArmInfluence,
      armInfluence: macro.armInfluence,
      gasDensity: macro.gasDensity,
      dustDensity: macro.dustDensity,
      dustLaneDensity: macro.dustLaneDensity,
      texture: macro.texture,
      insideMainDisk: macro.radiusPc <= CONFIG.GALACTIC_DISK_RADIUS_PC,
    };
  }

  /** Evaluates smooth disk, bar, halo, arm, gas, and dust fields without cell-level allocations. */
  private sampleMacro(galactocentricXpc: number, galactocentricYpc: number): MacroGalacticSample {
    const radiusPc = Math.hypot(galactocentricXpc, galactocentricYpc);
    // Reid et al. define beta=0 from the core toward the Sun and increase it with rotation.
    const azimuthRad = Math.atan2(galactocentricXpc, -galactocentricYpc);
    const edgeNoise = this.coordinateNoise(galactocentricXpc / 1100, galactocentricYpc / 1100, 'disk-edge');
    const localDiskEdgePc = CONFIG.GALACTIC_DISK_RADIUS_PC + (edgeNoise - 0.5) * 900;
    // The outer disk fades over kiloparsecs; it is not a sharply bounded luminous plate.
    const diskEdge = 1 - this.smoothstep(localDiskEdgePc - 4000, localDiskEdgePc + 1500, radiusPc);
    // Smooth central depletion of the axisymmetric disk leaves the bar/bulge dominant,
    // without a hollow centre or an artificial bright ring at the depletion boundary.
    const innerHole = 0.06 + 0.94 * this.smoothstep(0, 5500, radiusPc);
    const stellarArmInfluence = this.getStellarArmInfluence(radiusPc, azimuthRad);
    const thinDisk =
      Math.exp((CONFIG.GALACTIC_SOLAR_RADIUS_PC - radiusPc) / 2700) *
      diskEdge *
      innerHole *
      (1 + stellarArmInfluence * 0.22);
    const thickDisk =
      0.11 *
      Math.exp((CONFIG.GALACTIC_SOLAR_RADIUS_PC - radiusPc) / 2200) *
      (1 - this.smoothstep(15000, 18500, radiusPc));

    const barAngle = (CONFIG.GALACTIC_BAR_ANGLE_DEG * Math.PI) / 180;
    const canonicalX = galactocentricXpc;
    const canonicalY = -galactocentricYpc;
    const barAlong = canonicalX * Math.sin(barAngle) + canonicalY * Math.cos(barAngle);
    const barAcross = canonicalX * Math.cos(barAngle) - canonicalY * Math.sin(barAngle);
    const barHalfLengthPc = CONFIG.GALACTIC_BAR_HALF_LENGTH_PC;
    const barEllipticalRadius = Math.sqrt((barAlong / barHalfLengthPc) ** 2 + (barAcross / 1150) ** 2);
    const barEnd = 1 - this.smoothstep(0.82, 1.08, Math.abs(barAlong) / barHalfLengthPc);
    const barDensity = 9 * Math.exp(-barEllipticalRadius * 1.8) * barEnd;
    const bulgeDensity = 8.6 * Math.exp(-radiusPc / 760);
    const bulge = bulgeDensity + barDensity * 0.72;
    const halo = 0.0015 * Math.pow(CONFIG.GALACTIC_SOLAR_RADIUS_PC / Math.max(650, radiusPc), 2.65);
    const arm = this.getSpiralArmSample(radiusPc, azimuthRad);
    const fineNoise = this.structureNoise(galactocentricXpc / 230, galactocentricYpc / 230, 'macro');
    const clumpNoise = this.structureNoise(galactocentricXpc / 780, galactocentricYpc / 780, 'arms');
    // Gas follows the observed arm envelope, but turbulence displaces its filaments locally.
    // Measured arm centres remain fixed, independent of these seeded cloud details.
    const filamentOffsetPc = (clumpNoise - 0.5) * arm.widthPc * 1.8;
    const filament =
      arm.widthPc > 0
        ? Math.exp(-0.5 * ((arm.signedDistancePc + filamentOffsetPc) / (arm.widthPc * 0.64)) ** 2)
        : 0;
    const complexes = this.smoothstep(0.28, 0.78, clumpNoise);
    const molecularRing = Math.exp(-0.5 * ((radiusPc - 4500) / 1350) ** 2);
    const gasRadial = Math.exp(-Math.abs(radiusPc - 6200) / 5800) * diskEdge;
    const gasDensity = this.clamp(
      gasRadial *
        (0.1 + molecularRing * 0.14 + arm.influence * (0.32 + filament * 0.75)) *
        (0.45 + complexes * 0.85 + fineNoise * 0.25),
      0,
      1.4
    );
    const dustNoise = this.structureNoise(galactocentricXpc / 360, galactocentricYpc / 360, 'dust');
    const dustLaneDensity =
      arm.widthPc > 0
        ? arm.influence *
          Math.exp(
            -0.5 *
              ((arm.signedDistancePc + filamentOffsetPc + arm.widthPc * 0.48) / (arm.widthPc * 0.34)) ** 2
          ) *
          gasRadial *
          (0.2 + dustNoise * 0.8)
        : 0;
    const dustDensity = this.clamp(gasDensity * (0.24 + dustNoise * 0.36) + dustLaneDensity * 0.42, 0, 1.5);
    const youngStellarDensity = this.clamp(
      arm.influence *
        gasRadial *
        Math.exp(-Math.max(0, radiusPc - 7000) / 6000) *
        (0.12 + filament * (0.12 + complexes * 1.5)) *
        (0.55 + fineNoise * 0.9) +
        molecularRing * 0.018,
      0,
      1.6
    );
    const localNormalization = 1.112;
    const relativeStellarDensity = this.clamp(
      ((thinDisk + thickDisk + bulge + halo) / localNormalization) *
        (1 + arm.influence * 0.12) *
        (0.97 + fineNoise * 0.06),
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
      dustLaneDensity,
      youngStellarDensity,
      barDensity,
      bulgeDensity,
      stellarArmInfluence,
      texture: fineNoise * 0.42 + clumpNoise * 0.58,
      relativeStellarDensity,
      radiusPc,
      azimuthRad,
    };
  }

  /** Returns the nearest bounded Reid-anchored logarithmic arm at one Galactic radius and beta. */
  private getSpiralArmSample(
    radiusPc: number,
    azimuthRad: number
  ): { name: string | null; influence: number; signedDistancePc: number; widthPc: number } {
    if (radiusPc < 2200 || radiusPc > CONFIG.GALACTIC_DISK_RADIUS_PC) {
      return { name: null, influence: 0, signedDistancePc: 0, widthPc: 0 };
    }

    let nearestName: string | null = null;
    let strongestInfluence = 0;
    let strongestSignedDistancePc = 0;
    let strongestWidthPc = 0;
    for (const arm of SPIRAL_ARMS) {
      for (let turn = -2; turn <= 2; turn++) {
        const beta = azimuthRad + turn * Math.PI * 2;
        if (beta < arm.trackBetaMinRad || beta > arm.trackBetaMaxRad) continue;
        const armRadiusPc = this.getArmRadiusAtBeta(arm, beta);
        if (armRadiusPc < arm.minRadiusPc || armRadiusPc > arm.maxRadiusPc) continue;
        const widthPc = this.clamp(
          arm.widthAtKinkPc + arm.widthGrowthPerKpc * (armRadiusPc / 1000 - arm.radiusKinkPc / 1000),
          120,
          850
        );
        const signedDistancePc = radiusPc - armRadiusPc;
        const endpointWeight =
          this.smoothstep(arm.trackBetaMinRad, arm.trackBetaMinRad + arm.endpointTaperRad, beta) *
          (1 - this.smoothstep(arm.trackBetaMaxRad - arm.endpointTaperRad, arm.trackBetaMaxRad, beta));
        const radialWeight =
          this.smoothstep(arm.minRadiusPc, arm.minRadiusPc + 600, armRadiusPc) *
          (1 - this.smoothstep(arm.maxRadiusPc - 800, arm.maxRadiusPc, armRadiusPc));
        const influence = Math.exp(-0.5 * (signedDistancePc / widthPc) ** 2) * endpointWeight * radialWeight;
        if (influence > strongestInfluence) {
          strongestInfluence = influence;
          strongestSignedDistancePc = signedDistancePc;
          strongestWidthPc = widthPc;
          nearestName = arm.name;
        }
      }
    }

    return {
      name: strongestInfluence >= 0.08 ? nearestName : null,
      influence: this.clamp(strongestInfluence, 0, 1),
      signedDistancePc: strongestSignedDistancePc,
      widthPc: strongestWidthPc,
    };
  }

  /** Evaluates one arm continuously across its measured segment and bounded extrapolations. */
  private getArmRadiusAtBeta(arm: SpiralArmDefinition, beta: number): number {
    if (beta < arm.observedBetaMinRad) {
      const boundaryRadiusPc = this.getMeasuredArmRadiusAtBeta(arm, arm.observedBetaMinRad);
      return (
        boundaryRadiusPc *
        Math.exp(-(beta - arm.observedBetaMinRad) * Math.tan(arm.outerExtrapolationPitchRad))
      );
    }
    if (beta > arm.observedBetaMaxRad) {
      const boundaryRadiusPc = this.getMeasuredArmRadiusAtBeta(arm, arm.observedBetaMaxRad);
      return (
        boundaryRadiusPc *
        Math.exp(-(beta - arm.observedBetaMaxRad) * Math.tan(arm.innerExtrapolationPitchRad))
      );
    }
    return this.getMeasuredArmRadiusAtBeta(arm, beta);
  }

  /** Applies the published piecewise logarithmic fit inside one arm's observed beta range. */
  private getMeasuredArmRadiusAtBeta(arm: SpiralArmDefinition, beta: number): number {
    const pitch = beta <= arm.betaKinkRad ? arm.pitchBeforeRad : arm.pitchAfterRad;
    return arm.radiusKinkPc * Math.exp(-(beta - arm.betaKinkRad) * Math.tan(pitch));
  }

  /** Returns the broad two-armed old-stellar response that grows from the central bar. */
  private getStellarArmInfluence(radiusPc: number, azimuthRad: number): number {
    if (radiusPc < 3200 || radiusPc > CONFIG.GALACTIC_DISK_RADIUS_PC) return 0;

    // Infrared light traces two dominant old-stellar arms even though gas and young stars
    // delineate four arms. Their broad response begins at opposite ends of the long bar.
    const barAngleRad = degreesToRadians(CONFIG.GALACTIC_BAR_ANGLE_DEG);
    const pitchRad = degreesToRadians(12.5);
    const referenceRadiusPc = CONFIG.GALACTIC_BAR_HALF_LENGTH_PC * 0.92;
    const ridgeBeta = barAngleRad - Math.log(radiusPc / referenceRadiusPc) / Math.tan(pitchRad);
    const wrappedSeparation = Math.abs(
      Math.atan2(Math.sin(azimuthRad - ridgeBeta), Math.cos(azimuthRad - ridgeBeta))
    );
    const nearestArmSeparation = Math.min(wrappedSeparation, Math.PI - wrappedSeparation);
    const widthPc = this.lerp(820, 1450, this.clamp((radiusPc - 3500) / 10500, 0, 1));
    // Arc length is almost along an arm, not across it: project onto the spiral normal.
    const normalDistancePc = radiusPc * nearestArmSeparation * Math.sin(pitchRad);
    const transverseInfluence = Math.exp(-0.5 * (normalDistancePc / widthPc) ** 2);
    const radialTaper =
      this.smoothstep(3200, 4700, radiusPc) *
      (1 - this.smoothstep(13200, CONFIG.GALACTIC_DISK_RADIUS_PC, radiusPc));
    return transverseInfluence * radialTaper;
  }

  /** Finds a deterministic open or globular cluster covering one Solar-relative parsec position. */
  private findCluster(localXpc: number, localYpc: number): GalacticClusterContext | null {
    const openCluster = this.findSectorCluster(localXpc, localYpc, 96, 'open');
    if (openCluster) return openCluster;

    // Globulars are far rarer and use larger ownership sectors to remain order-independent.
    return this.findSectorCluster(localXpc, localYpc, 720, 'globular');
  }

  /** Searches neighbouring ownership sectors for one deterministic cluster influence. */
  private findSectorCluster(
    localXpc: number,
    localYpc: number,
    sectorSize: number,
    kind: GalacticClusterKind
  ): GalacticClusterContext | null {
    const sectorX = Math.floor(localXpc / sectorSize);
    const sectorY = Math.floor(localYpc / sectorSize);
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
        const distance = Math.hypot(localXpc - definition.centerX, localYpc - definition.centerY);
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
    const galactocentric = {
      xPc: centerX,
      yPc: -CONFIG.GALACTIC_SOLAR_RADIUS_PC + centerY,
    };
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

  /** Combines rotated scales so cloud complexes have no preferred Cartesian grid direction. */
  private structureNoise(x: number, y: number, label: string): number {
    return (
      this.coordinateNoise(x * 0.8 - y * 0.6, x * 0.6 + y * 0.8, label) * 0.65 +
      this.coordinateNoise(x * 1.92 + y * 1.44 + 17.3, -x * 1.44 + y * 1.92 - 9.1, label) * 0.35
    );
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
    // FNV alone leaves adjacent decimal coordinates correlated, drawing vertical stripes.
    // Avalanche all bits before converting to noise, including the low-entropy last digit.
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 0x85ebca6b);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 0xc2b2ae35);
    hash ^= hash >>> 16;
    return (hash >>> 0) / 0x100000000;
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
