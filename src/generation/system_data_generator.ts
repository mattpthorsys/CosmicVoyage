// src/generation/system_data_generator.ts

import { PRNG } from '../utils/prng';
import { fastHash } from '../utils/hash';
import { CONFIG } from '../config';
import { SPECTRAL_TYPES } from '../constants/stellar';
import { GLYPHS } from '../constants/visual';
import { logger } from '../utils/logger';
import { PerlinNoise } from './perlin';
import {
  estimateEvolutionaryLuminosityFactor,
  estimateMainSequenceLifetimeGyr,
} from '../entities/stellar_environment';
import {
  calculateStellarLuminosityW,
  StellarArchitecture,
  StellarBody,
  StellarSystemKind,
} from '../entities/stellar_body';
import {
  GalacticCellContext,
  GalacticPopulation,
  MilkyWayModel,
  StellarPopulationSample,
} from './milky_way_model';
import type { StationKind } from '../entities/starbase';

export type SettlementStage = 'none' | 'partial' | 'complete';

export interface SystemBasicProperties {
  exists: boolean;
  starType: string | null;
  name: string | null;
  hasStarbase: boolean;
  ageGyr: number | null;
  metallicityFeH: number | null;
  architecture: StellarArchitecture | null;
  objectKind: 'stellar' | 'brown-dwarf' | 'rogue-planet' | null;
  systemSlot?: number;
  stationKind?: StationKind | null;
  settlementStage?: SettlementStage;
  galacticContext?: GalacticCellContext | null;
  galacticPopulation?: GalacticPopulation | null;
}

export interface SystemMapProperties {
  exists: boolean;
  starType: string | null;
  name: string | null;
  hasStarbase: boolean;
  objectKind: 'stellar' | 'brown-dwarf' | null;
  systemSlot?: number;
  resolvedSystemCount?: number;
  unresolvedSystemCount?: number;
  stationKind?: StationKind | null;
  settlementStage?: SettlementStage;
  armName?: string | null;
  clusterName?: string | null;
}

export type DeepSpacePhenomenonType =
  | 'rogue-planet'
  | 'dark-nebula'
  | 'ancient-signal'
  | 'debris-field'
  | 'neutron-star'
  | 'black-hole';

export interface DeepSpacePhenomenonProperties {
  exists: boolean;
  type: DeepSpacePhenomenonType | null;
  name: string | null;
  classification: string | null;
  signal: string | null;
  char: string | null;
  colour: string | null;
  rarity: 'uncommon' | 'rare' | 'very-rare' | 'exceedingly-rare' | null;
}

export type InterstellarMediumKind =
  | 'cold-void'
  | 'diffuse-hydrogen'
  | 'molecular-dust'
  | 'ionised-plasma'
  | 'radiation-front'
  | 'gravitational-shear';

export interface InterstellarMediumProperties {
  kind: InterstellarMediumKind;
  label: string;
  summary: string;
  density: number;
  electronDensity: number;
  dustExtinction: number;
  radiation: number;
  gravitationalShear: number;
  sensorRangeMultiplier: number;
  driftBiasX: number;
  driftBiasY: number;
}

const SYSTEM_NAME_PREFIXES = [
  'Alpha',
  'Beta',
  'Gamma',
  'Delta',
  'Epsilon',
  'Zeta',
  'Eta',
  'Theta',
  'Iota',
  'Kappa',
  'Lambda',
  'Mu',
  'Nu',
  'Xi',
  'Omicron',
  'Pi',
  'Rho',
  'Sigma',
  'Tau',
  'Upsilon',
  'Phi',
  'Chi',
  'Psi',
  'Omega',
  'Proxima',
  'Cygnus',
  'Kepler',
  'Gliese',
  'HD',
  'Trappist',
  'Luyten',
  'Wolf',
  'Ross',
  'Barnard',
  'Benfblunk',
  'Harwoe',
  'Smerg',
  'Hiss',
];

export class SystemDataGenerator {
  private gameSeedPRNG: PRNG;
  private systemMapPropertiesCache: Map<string, SystemMapProperties> = new Map();
  private systemPropertiesCache: Map<string, SystemBasicProperties> = new Map();
  private phenomenonPropertiesCache: Map<string, DeepSpacePhenomenonProperties> = new Map();
  private interstellarMediumCache: Map<string, InterstellarMediumProperties> = new Map();
  private interstellarMediumNoise: PerlinNoise;
  private readonly milkyWayModel: MilkyWayModel;
  private readonly maxSystemPropertiesCacheSize = 50000;

  /** Initializes SystemDataGenerator. */
  constructor(gameSeedPRNG: PRNG) {
    this.gameSeedPRNG = gameSeedPRNG;
    this.milkyWayModel = new MilkyWayModel(gameSeedPRNG.getInitialSeed());
    this.interstellarMediumNoise = new PerlinNoise(`${gameSeedPRNG.getInitialSeed()}_interstellar_medium`);
    logger.debug('[SystemDataGenerator] Initialized.');
  }

  /** Returns the immutable analytical Galaxy model shared by generation and map rendering. */
  getGalaxyModel(): MilkyWayModel {
    return this.milkyWayModel;
  }

  /** Returns the Galactic environment at one navigable world coordinate. */
  getGalacticContext(worldX: number, worldY: number): GalacticCellContext {
    return this.milkyWayModel.getCellContext(worldX, worldY);
  }

  /** Returns every individually navigable stellar slot represented by one projected map cell. */
  getResolvedSystemMapProperties(worldX: number, worldY: number): SystemMapProperties[] {
    const primary = this.getSystemMapProperties(worldX, worldY, 0);
    const count = primary.objectKind === 'brown-dwarf' ? 1 : (primary.resolvedSystemCount ?? 0);
    if (count === 0) return [];
    const systems: SystemMapProperties[] = [primary];
    for (let slot = 1; slot < count; slot++) {
      systems.push(this.getSystemMapProperties(worldX, worldY, slot));
    }
    return systems;
  }

  /**
   * Gets the basic, deterministic properties of a potential system at world coordinates.
   * This method performs minimal generation needed for quick checks (like hyperspace view).
   */
  getSystemMapProperties(worldX: number, worldY: number, systemSlot = 0): SystemMapProperties {
    const cacheKey = `${worldX},${worldY},${systemSlot}`;
    const cached = this.systemMapPropertiesCache.get(cacheKey);
    if (cached) return cached;

    const context = this.milkyWayModel.getCellContext(worldX, worldY);
    const isStartingHubCell = this.isStartingHubCell(worldX, worldY);
    const isInsideStartingClearance = this.isInsideStartingHubClearance(worldX, worldY);
    const countPRNG = this.gameSeedPRNG.seedNew(
      `mw${CONFIG.GALAXY_MODEL_VERSION}_system_count_${worldX},${worldY}`
    );
    const physicalSystemCount = isStartingHubCell
      ? 1
      : isInsideStartingClearance
        ? 0
        : this.samplePoisson(context.expectedResolvedSystems, countPRNG);
    const resolvedSystemCount = Math.min(CONFIG.GALACTIC_MAX_RESOLVED_SYSTEMS_PER_CELL, physicalSystemCount);
    const unresolvedSystemCount = Math.max(0, physicalSystemCount - resolvedSystemCount);

    const result: SystemMapProperties = {
      exists: false,
      starType: null,
      name: null,
      hasStarbase: false,
      objectKind: null,
      systemSlot,
      resolvedSystemCount,
      unresolvedSystemCount,
      stationKind: null,
      settlementStage: 'none',
      armName: context.armName,
      clusterName: context.cluster?.name ?? null,
    };

    const hasNormalStar = systemSlot >= 0 && systemSlot < resolvedSystemCount;
    const brownDwarfDensity = this.clamp(
      CONFIG.BROWN_DWARF_DENSITY * Math.sqrt(context.relativeStellarDensity),
      0.002,
      0.16
    );
    const brownDwarfPresenceThreshold = Math.floor(brownDwarfDensity * CONFIG.STAR_CHECK_HASH_SCALE);
    const brownDwarfHash = fastHash(worldX, worldY, this.gameSeedPRNG.seed + 32003);
    const hasBrownDwarf =
      systemSlot === 0 &&
      !isInsideStartingClearance &&
      resolvedSystemCount === 0 &&
      brownDwarfHash % CONFIG.STAR_CHECK_HASH_SCALE < brownDwarfPresenceThreshold;
    result.exists = hasNormalStar || hasBrownDwarf;

    if (!result.exists) {
      this.cacheSystemMapProperties(cacheKey, result);
      return result;
    }

    const populationPRNG = this.gameSeedPRNG.seedNew(
      `mw${CONFIG.GALAXY_MODEL_VERSION}_population_${worldX},${worldY},${systemSlot}`
    );
    const population = this.milkyWayModel.sampleStellarPopulation(context, populationPRNG);
    const typePRNG = this.gameSeedPRNG.seedNew(
      `mw${CONFIG.GALAXY_MODEL_VERSION}_star_type_${worldX},${worldY},${systemSlot}`
    );
    result.objectKind = hasBrownDwarf ? 'brown-dwarf' : 'stellar';
    result.starType = isStartingHubCell
      ? 'G2V'
      : hasBrownDwarf
        ? this.generateBrownDwarfType(typePRNG)
        : this.generateStarType(typePRNG, population, context);
    const nameSeed = `mw${CONFIG.GALAXY_MODEL_VERSION}_star_name_${worldX},${worldY},${systemSlot}`;
    const namePRNG = this.gameSeedPRNG.seedNew(nameSeed);
    result.name = this.generateSystemNameInternal(namePRNG);
    if (result.objectKind === 'stellar' && result.starType && systemSlot === 0) {
      const settlement = isStartingHubCell
        ? { stationKind: 'starbase' as const, stage: 'complete' as const }
        : this.generateSettlementDisposition(
            context,
            result.starType,
            population.ageGyr,
            worldX,
            worldY,
            this.predictArchitectureKind(worldX, worldY, systemSlot, result.starType) === 'single'
          );
      result.stationKind = settlement.stationKind;
      result.settlementStage = settlement.stage;
      result.hasStarbase = settlement.stationKind !== null;
    }

    this.cacheSystemMapProperties(cacheKey, result);
    return result;
  }

  /** Returns system properties. */
  getSystemProperties(worldX: number, worldY: number, systemSlot = 0): SystemBasicProperties {
    const cacheKey = `${worldX},${worldY},${systemSlot}`;
    const cached = this.systemPropertiesCache.get(cacheKey);
    if (cached) return cached;

    const mapProps = this.getSystemMapProperties(worldX, worldY, systemSlot);
    const galacticContext = this.milkyWayModel.getCellContext(worldX, worldY);
    const result: SystemBasicProperties = {
      ...mapProps,
      ageGyr: null,
      metallicityFeH: null,
      architecture: null,
      galacticContext,
      galacticPopulation: null,
    };

    if (!result.exists || !result.starType || !result.name) {
      this.cacheSystemProperties(cacheKey, result);
      return result;
    }

    const populationPRNG = this.gameSeedPRNG.seedNew(
      `mw${CONFIG.GALAXY_MODEL_VERSION}_population_${worldX},${worldY},${systemSlot}`
    );
    const population = this.milkyWayModel.sampleStellarPopulation(galacticContext, populationPRNG);
    const isStartingHub = this.isStartingHubCell(worldX, worldY) && systemSlot === 0;
    result.ageGyr = isStartingHub ? 4.6 : this.limitAgeToMainSequence(population.ageGyr, result.starType);
    result.metallicityFeH = isStartingHub ? 0.04 : population.metallicityFeH;
    result.galacticPopulation = isStartingHub ? 'thin-disk' : population.population;
    result.architecture = this.generateArchitecture(
      result.name,
      result.starType,
      result.ageGyr,
      result.metallicityFeH,
      worldX,
      worldY,
      systemSlot
    );

    this.cacheSystemProperties(cacheKey, result);
    return result;
  }

  /** Returns rogue planet system properties. */
  getRoguePlanetSystemProperties(worldX: number, worldY: number): SystemBasicProperties | null {
    const phenomenon = this.getDeepSpacePhenomenonProperties(worldX, worldY);
    if (!phenomenon.exists || phenomenon.type !== 'rogue-planet' || !phenomenon.name) {
      return null;
    }

    const prng = this.gameSeedPRNG.seedNew(`rogue_system_${worldX},${worldY}`);
    const ageGyr = Number(prng.random(0.3, 12.8).toFixed(2));
    const metallicityFeH = Number(prng.random(-0.9, 0.35).toFixed(2));
    return {
      exists: true,
      starType: null,
      name: phenomenon.name,
      hasStarbase: false,
      ageGyr,
      metallicityFeH,
      architecture: {
        kind: 'starless',
        stars: [],
        primaryStarId: 'A',
        binarySeparation: 0,
        outerSeparation: 0,
        habitableLabel: 'none',
      },
      objectKind: 'rogue-planet',
    };
  }

  /** Returns deep space phenomenon properties. */
  getDeepSpacePhenomenonProperties(worldX: number, worldY: number): DeepSpacePhenomenonProperties {
    const cacheKey = `${worldX},${worldY}`;
    const cached = this.phenomenonPropertiesCache.get(cacheKey);
    if (cached) return cached;

    const empty: DeepSpacePhenomenonProperties = {
      exists: false,
      type: null,
      name: null,
      classification: null,
      signal: null,
      char: null,
      colour: null,
      rarity: null,
    };

    const roll = fastHash(worldX, worldY, this.gameSeedPRNG.seed + 99173) % CONFIG.DEEP_SPACE_PHENOMENA_SCALE;
    const type = this.getPhenomenonTypeFromRoll(roll);
    if (!type) {
      // Reject the overwhelming majority of cells before paying for Galactic context or star generation.
      this.cachePhenomenonProperties(cacheKey, empty);
      return empty;
    }

    if (this.getSystemMapProperties(worldX, worldY).exists) {
      this.cachePhenomenonProperties(cacheKey, empty);
      return empty;
    }

    const prng = this.gameSeedPRNG.seedNew(`deep_space_${worldX},${worldY}`);
    const result = this.createPhenomenon(type, prng);
    this.cachePhenomenonProperties(cacheKey, result);
    return result;
  }

  /** Returns interstellar medium properties. */
  getInterstellarMediumProperties(worldX: number, worldY: number): InterstellarMediumProperties {
    const cacheKey = `${worldX},${worldY}`;
    const cached = this.interstellarMediumCache.get(cacheKey);
    if (cached) return cached;

    const scale = CONFIG.INTERSTELLAR_MEDIUM_SCALE;
    const densityField = this.normalizedNoise(worldX * scale, worldY * scale);
    const filamentField = this.normalizedNoise(worldX * scale * 2.7 + 91.3, worldY * scale * 2.7 - 17.8);
    const ionField = this.normalizedNoise(worldX * scale * 1.55 - 41.2, worldY * scale * 1.55 + 66.4);
    const shearField = this.normalizedNoise(worldX * scale * 0.85 + 13.9, worldY * scale * 0.85 + 102.1);
    const remnantInfluence = this.getCompactRemnantInfluence(worldX, worldY);
    const galactic = this.milkyWayModel.getCellContext(worldX, worldY);

    const density = this.clamp(
      0.02 + densityField * 1.15 + galactic.gasDensity * 0.92 + Math.max(0, filamentField - 0.68) * 2.4,
      0.01,
      4.5
    );
    const electronDensity = this.clamp(0.005 + ionField * 0.18 + remnantInfluence.neutron * 0.12, 0.001, 0.7);
    const dustExtinction = this.clamp(
      Math.max(0, densityField - 0.55) * 1.1 +
        galactic.dustDensity * 0.82 +
        Math.max(0, filamentField - 0.62) * 1.45,
      0,
      1.8
    );
    const radiation = this.clamp(
      0.04 + remnantInfluence.neutron * 1.4 + Math.max(0, ionField - 0.76) * 0.7,
      0.02,
      2.2
    );
    const gravitationalShear = this.clamp(
      remnantInfluence.blackHole * 1.25 + Math.max(0, shearField - 0.86) * 0.45,
      0,
      1.5
    );

    let kind: InterstellarMediumKind = 'diffuse-hydrogen';
    if (gravitationalShear > 0.55) kind = 'gravitational-shear';
    else if (radiation > 0.7) kind = 'radiation-front';
    else if (dustExtinction > 0.85) kind = 'molecular-dust';
    else if (electronDensity > 0.12) kind = 'ionised-plasma';
    else if (density < 0.35 && dustExtinction < 0.12) kind = 'cold-void';

    const sensorRangeMultiplier = this.clamp(
      1.08 -
        dustExtinction * 0.22 -
        electronDensity * 0.35 -
        radiation * 0.08 -
        gravitationalShear * 0.16 +
        (kind === 'cold-void' ? 0.08 : 0),
      0.58,
      1.18
    );
    const driftBiasX = this.clamp(
      (this.normalizedNoise(worldX * scale * 3.1 + 4.4, worldY * scale * 3.1) - 0.5) * gravitationalShear,
      -0.35,
      0.35
    );
    const driftBiasY = this.clamp(
      (this.normalizedNoise(worldX * scale * 3.1, worldY * scale * 3.1 - 5.7) - 0.5) * gravitationalShear,
      -0.35,
      0.35
    );

    const result: InterstellarMediumProperties = {
      kind,
      label: this.getMediumLabel(kind),
      summary: this.getMediumSummary(kind),
      density: Number(density.toFixed(3)),
      electronDensity: Number(electronDensity.toFixed(3)),
      dustExtinction: Number(dustExtinction.toFixed(3)),
      radiation: Number(radiation.toFixed(3)),
      gravitationalShear: Number(gravitationalShear.toFixed(3)),
      sensorRangeMultiplier: Number(sensorRangeMultiplier.toFixed(3)),
      driftBiasX: Number(driftBiasX.toFixed(3)),
      driftBiasY: Number(driftBiasY.toFixed(3)),
    };

    this.cacheInterstellarMediumProperties(cacheKey, result);
    return result;
  }

  /** Clears cache. */
  clearCache(): void {
    this.systemMapPropertiesCache.clear();
    this.systemPropertiesCache.clear();
    this.phenomenonPropertiesCache.clear();
    this.interstellarMediumCache.clear();
    this.interstellarMediumNoise.clearCache();
  }

  /** Stores deterministic map properties for a generated system. */
  private cacheSystemMapProperties(cacheKey: string, properties: SystemMapProperties): void {
    if (this.systemMapPropertiesCache.size >= this.maxSystemPropertiesCacheSize) {
      const firstKey = this.systemMapPropertiesCache.keys().next().value;
      if (firstKey !== undefined) this.systemMapPropertiesCache.delete(firstKey);
    }
    this.systemMapPropertiesCache.set(cacheKey, properties);
  }

  /** Stores deterministic high-level properties for a generated system. */
  private cacheSystemProperties(cacheKey: string, properties: SystemBasicProperties): void {
    if (this.systemPropertiesCache.size >= this.maxSystemPropertiesCacheSize) {
      const firstKey = this.systemPropertiesCache.keys().next().value;
      if (firstKey !== undefined) this.systemPropertiesCache.delete(firstKey);
    }
    this.systemPropertiesCache.set(cacheKey, properties);
  }

  /** Stores deterministic properties for a generated space phenomenon. */
  private cachePhenomenonProperties(cacheKey: string, properties: DeepSpacePhenomenonProperties): void {
    if (this.phenomenonPropertiesCache.size >= this.maxSystemPropertiesCacheSize) {
      const firstKey = this.phenomenonPropertiesCache.keys().next().value;
      if (firstKey !== undefined) this.phenomenonPropertiesCache.delete(firstKey);
    }
    this.phenomenonPropertiesCache.set(cacheKey, properties);
  }

  /** Stores deterministic interstellar-medium properties for a map cell. */
  private cacheInterstellarMediumProperties(
    cacheKey: string,
    properties: InterstellarMediumProperties
  ): void {
    if (this.interstellarMediumCache.size >= this.maxSystemPropertiesCacheSize) {
      const firstKey = this.interstellarMediumCache.keys().next().value;
      if (firstKey !== undefined) this.interstellarMediumCache.delete(firstKey);
    }
    this.interstellarMediumCache.set(cacheKey, properties);
  }

  /** Samples deterministic noise and normalizes it to the zero-to-one range. */
  private normalizedNoise(x: number, y: number): number {
    return this.clamp(this.interstellarMediumNoise.get(x, y) + 0.5, 0, 1);
  }

  /** Returns compact remnant influence. */
  private getCompactRemnantInfluence(worldX: number, worldY: number): { neutron: number; blackHole: number } {
    let neutron = 0;
    let blackHole = 0;
    const influenceRadius = CONFIG.COMPACT_REMNANT_INFLUENCE_RADIUS_CELLS;
    for (let dy = -influenceRadius; dy <= influenceRadius; dy++) {
      for (let dx = -influenceRadius; dx <= influenceRadius; dx++) {
        const distance = Math.hypot(dx, dy);
        if (distance > influenceRadius) continue;
        const phenomenon = this.getDeepSpacePhenomenonProperties(worldX + dx, worldY + dy);
        if (!phenomenon.exists) continue;
        const influence = Math.max(0, 1 - distance / influenceRadius);
        if (phenomenon.type === 'neutron-star') neutron = Math.max(neutron, influence);
        if (phenomenon.type === 'black-hole') blackHole = Math.max(blackHole, influence);
      }
    }
    return { neutron, blackHole };
  }

  /** Returns medium label. */
  private getMediumLabel(kind: InterstellarMediumKind): string {
    const labels: Record<InterstellarMediumKind, string> = {
      'cold-void': 'cold interstellar void',
      'diffuse-hydrogen': 'diffuse neutral hydrogen',
      'molecular-dust': 'molecular dust lane',
      'ionised-plasma': 'ionised plasma sheet',
      'radiation-front': 'remnant radiation front',
      'gravitational-shear': 'weak gravitational shear',
    };
    return labels[kind];
  }

  /** Returns medium summary. */
  private getMediumSummary(kind: InterstellarMediumKind): string {
    const summaries: Record<InterstellarMediumKind, string> = {
      'cold-void': 'very low gas and dust; optical returns are clean but sparse',
      'diffuse-hydrogen': 'ordinary low-density interstellar hydrogen',
      'molecular-dust': 'cold dust and molecules dim distant optical returns',
      'ionised-plasma': 'free electrons rotate and smear radio polarisation',
      'radiation-front': 'elevated particle background from compact-remnant activity',
      'gravitational-shear': 'background astrometry is weakly lensed by compact mass',
    };
    return summaries[kind];
  }

  /** Generates a present-day spectral class conditioned on age and Galactic environment. */
  private generateStarType(
    prng: PRNG,
    population: StellarPopulationSample,
    context: GalacticCellContext
  ): string {
    const youngArmBoost = population.ageGyr < 0.12 ? 1 + context.armInfluence * 7 : 1;
    const broadStarType = this.weightedChoice(prng, [
      { item: 'M', weight: 74 },
      { item: 'K', weight: 12.2 },
      { item: 'G', weight: 7.4 },
      { item: 'F', weight: population.ageGyr < 5.5 ? 3.0 : 0.25 },
      { item: 'A', weight: population.ageGyr < 1.4 ? 0.62 * youngArmBoost : 0 },
      { item: 'B', weight: population.ageGyr < 0.09 ? 0.075 * youngArmBoost : 0 },
      { item: 'O', weight: population.ageGyr < 0.007 ? 0.003 * youngArmBoost : 0 },
    ]);
    const availableSubtypes = Object.keys(SPECTRAL_TYPES).filter(
      (key) => key.startsWith(broadStarType) && key.endsWith('V')
    );
    return availableSubtypes.length > 0 ? prng.choice(availableSubtypes)! : broadStarType;
  }

  /** Generates settlement and station state after applying host and distance eligibility. */
  private generateSettlementDisposition(
    context: GalacticCellContext,
    starType: string,
    ageGyr: number,
    worldX: number,
    worldY: number,
    allowsTerraforming: boolean
  ): { stage: SettlementStage; stationKind: StationKind | null } {
    const hostSuitability = this.getHostSettlementSuitability(starType, ageGyr);
    const human = context.human;
    const settlementPRNG = this.gameSeedPRNG.seedNew(
      `mw${CONFIG.GALAXY_MODEL_VERSION}_settlement_${worldX},${worldY}`
    );

    if (human.settlementIntensity > 0 && hostSuitability > 0 && allowsTerraforming) {
      const densityMultiplier = human.region === 'core' ? CONFIG.CORE_SETTLEMENT_DENSITY_MULTIPLIER : 1;
      const baseCompleteChance = human.settlementIntensity * hostSuitability * 0.13;
      const frontierBias = human.region === 'frontier' ? 1.8 : human.region === 'settled' ? 1.25 : 0.72;
      const basePartialChance = human.settlementIntensity * hostSuitability * 0.12 * frontierBias;
      const rawSettlementChance = (baseCompleteChance + basePartialChance) * densityMultiplier;
      const probabilityScale = rawSettlementChance > 0.98 ? 0.98 / rawSettlementChance : 1;
      const completeChance = baseCompleteChance * densityMultiplier * probabilityScale;
      const partialChance = basePartialChance * densityMultiplier * probabilityScale;
      const roll = settlementPRNG.random();
      if (roll < completeChance) {
        // Only a subset of mature colonies are regional hubs; the rest remain inhabited worlds.
        const stationKind = settlementPRNG.random() < 0.62 ? 'starbase' : null;
        return { stage: 'complete', stationKind };
      }
      if (roll < completeChance + partialChance) {
        return { stage: 'partial', stationKind: null };
      }
    }

    const isRemoteEnough = human.distanceFromSolLy >= CONFIG.AUTOMATED_DEPOT_INNER_RADIUS_LY * 0.72;
    const depotChance = human.depotIntensity * 0.0045;
    if (isRemoteEnough && settlementPRNG.random() < depotChance) {
      return { stage: 'none', stationKind: 'automated-depot' };
    }
    return { stage: 'none', stationKind: null };
  }

  /** Scores ordinary stable main-sequence hosts for human settlement placement. */
  private getHostSettlementSuitability(starType: string, ageGyr: number): number {
    const spectralClass = starType.charAt(0);
    const subtype = Number(starType.match(/^[OBAFGKM](\d)/)?.[1] ?? 5);
    if (ageGyr < 1.2) return 0;
    if (estimateMainSequenceLifetimeGyr(starType) - ageGyr < 2.5) return 0;
    if (spectralClass === 'K') return subtype <= 5 ? 1 : 0.9;
    if (spectralClass === 'G') return subtype >= 6 ? 1 : 0.88;
    if (spectralClass === 'F') return subtype >= 5 && ageGyr < 4.8 ? 0.42 : 0;
    if (spectralClass === 'M') return subtype <= 3 && ageGyr >= 3.5 ? 0.34 : 0;
    return 0;
  }

  /** Draws a bounded Poisson count without relying on exploration or cache order. */
  private samplePoisson(lambda: number, prng: PRNG): number {
    const safeLambda = this.clamp(lambda, 0, 12);
    if (safeLambda <= 0) return 0;
    if (safeLambda > 6) {
      // A normal approximation avoids a long loop in the dense Galactic centre.
      const u1 = Math.max(1e-9, prng.random());
      const u2 = prng.random();
      const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(Math.PI * 2 * u2);
      return Math.max(0, Math.round(safeLambda + Math.sqrt(safeLambda) * gaussian));
    }
    const limit = Math.exp(-safeLambda);
    let product = 1;
    let count = 0;
    do {
      count++;
      product *= prng.random();
    } while (product > limit && count < 24);
    return count - 1;
  }

  /** Keeps a sampled population age below the generated star's main-sequence lifetime. */
  private limitAgeToMainSequence(ageGyr: number, starType: string): number {
    const maximumAge = Math.max(0.001, estimateMainSequenceLifetimeGyr(starType) * 0.92);
    return Number(Math.min(ageGyr, maximumAge).toFixed(maximumAge < 0.1 ? 3 : 2));
  }

  /** Predicts multiplicity from the same stable first roll used by full architecture generation. */
  private predictArchitectureKind(
    worldX: number,
    worldY: number,
    systemSlot: number,
    primaryStarType: string
  ): StellarSystemKind {
    if (this.isStartingHubCell(worldX, worldY) && systemSlot === 0) return 'single';
    const prng = this.gameSeedPRNG.seedNew(
      `mw${CONFIG.GALAXY_MODEL_VERSION}_star_architecture_${worldX},${worldY},${systemSlot}`
    );
    const roll = prng.random();
    if (/^[LTY]/.test(primaryStarType)) return roll < 0.18 ? 'binary' : 'single';
    if (roll < 0.14) return 'triple';
    if (roll < 0.48) return 'binary';
    return 'single';
  }

  /** Generates brown dwarf type. */
  private generateBrownDwarfType(prng: PRNG): string {
    const broadType = this.weightedChoice(prng, [
      { item: 'L', weight: 5 },
      { item: 'T', weight: 4 },
      { item: 'Y', weight: 1.2 },
    ]);
    const availableSubtypes = Object.keys(SPECTRAL_TYPES).filter(
      (key) => key.startsWith(broadType) && /^\w\d$/.test(key)
    );
    return availableSubtypes.length > 0 ? prng.choice(availableSubtypes)! : broadType;
  }

  /** Returns phenomenon type from roll. */
  private getPhenomenonTypeFromRoll(roll: number): DeepSpacePhenomenonType | null {
    // Normalize to the reference tile area so changing light-years per cell preserves rarity.
    const referenceAreaRoll = roll / CONFIG.HYPERSPACE_CELL_AREA_RATIO;
    if (referenceAreaRoll < 180) return 'rogue-planet';
    if (referenceAreaRoll < 330) return 'dark-nebula';
    if (referenceAreaRoll < 385) return 'ancient-signal';
    if (referenceAreaRoll < 420) return 'neutron-star';
    if (referenceAreaRoll < 438) return 'black-hole';
    if (referenceAreaRoll < 448) return 'debris-field';
    return null;
  }

  /** Creates phenomenon. */
  private createPhenomenon(type: DeepSpacePhenomenonType, prng: PRNG): DeepSpacePhenomenonProperties {
    const number = prng.randomInt(100, 9999);
    const fragment = prng.choice(['Acheron', 'Null', 'Kite', 'Mira', 'Ash', 'Vela', 'Cinder', 'Orison'])!;
    const common = { exists: true as const, type };
    switch (type) {
      case 'rogue-planet':
        return {
          ...common,
          name: `Rogue ${fragment}-${number}`,
          classification: 'FREE PLANETARY MASS',
          signal: 'thermal remnant only',
          char: 'o',
          colour: '#395052',
          rarity: 'uncommon',
        };
      case 'dark-nebula':
        return {
          ...common,
          name: `${fragment} Absorption Field`,
          classification: 'DARK MOLECULAR CLOUDLET',
          signal: 'background occlusion',
          char: GLYPHS.SHADE_LIGHT,
          colour: '#101812',
          rarity: 'uncommon',
        };
      case 'ancient-signal':
        return {
          ...common,
          name: `Signal ${fragment}-${number}`,
          classification: 'NON-NATURAL NARROWBAND SOURCE',
          signal: `${prng.random(8, 80).toFixed(1)} hour repeat; no local beacon registry`,
          char: '?',
          colour: '#3A8F83',
          rarity: 'rare',
        };
      case 'neutron-star':
        return {
          ...common,
          name: `PSR ${number}-${fragment.charAt(0)}`,
          classification: 'COMPACT STELLAR REMNANT',
          signal: `${prng.random(0.01, 3).toFixed(3)}s pulse train`,
          char: '*',
          colour: '#AFC8FF',
          rarity: 'very-rare',
        };
      case 'black-hole':
        return {
          ...common,
          name: `Collapsed Source ${number}`,
          classification: 'GRAVITATIONAL LENS CANDIDATE',
          signal: 'no optical primary; distorted background field',
          char: ' ',
          colour: '#050505',
          rarity: 'very-rare',
        };
      case 'debris-field':
        return {
          ...common,
          name: `${fragment} Silent Debris`,
          classification: 'ARTIFICIAL DEBRIS FIELD',
          signal: 'cold metal returns; no active transponders',
          char: ':',
          colour: '#5E6F68',
          rarity: 'exceedingly-rare',
        };
    }
  }

  /** Selects a value according to the supplied relative weights. */
  private weightedChoice<T>(prng: PRNG, choices: Array<{ item: T; weight: number }>): T {
    const totalWeight = choices.reduce((sum, choice) => sum + Math.max(0, choice.weight), 0);
    let roll = prng.random(0, totalWeight);
    for (const choice of choices) {
      roll -= Math.max(0, choice.weight);
      if (roll <= 0) return choice.item;
    }
    return choices[choices.length - 1].item;
  }

  /** Clamps a numeric value to the supplied bounds. */
  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  /** Generates architecture. */
  private generateArchitecture(
    systemName: string,
    primaryStarType: string,
    ageGyr: number,
    metallicityFeH: number,
    worldX: number,
    worldY: number,
    systemSlot: number
  ): StellarArchitecture {
    const architecturePRNG = this.gameSeedPRNG.seedNew(
      `mw${CONFIG.GALAXY_MODEL_VERSION}_star_architecture_${worldX},${worldY},${systemSlot}`
    );
    const multiplicityRoll = architecturePRNG.random();
    const isBrownDwarf = /^[LTY]/.test(primaryStarType);
    const kind: StellarSystemKind =
      this.isStartingHubCell(worldX, worldY) && systemSlot === 0
        ? 'single'
        : isBrownDwarf
          ? multiplicityRoll < 0.18
            ? 'binary'
            : 'single'
          : multiplicityRoll < 0.14
            ? 'triple'
            : multiplicityRoll < 0.48
              ? 'binary'
              : 'single';
    const binarySeparation = architecturePRNG.random(0.08, 0.75) * 1.495978707e11;
    const outerSeparation = architecturePRNG.random(18, 70) * 1.495978707e11;
    const stars: StellarBody[] = [
      this.createStarBody('A', systemName, primaryStarType, ageGyr, metallicityFeH, null),
    ];

    if (kind === 'binary' || kind === 'triple') {
      const companionType = this.generateCompanionStarType(primaryStarType, architecturePRNG);
      stars.push(
        this.createStarBody('B', systemName, companionType, ageGyr, metallicityFeH, {
          center: 'barycenter',
          radius: binarySeparation,
          angle: architecturePRNG.random(0, Math.PI * 2),
          periodSeconds: architecturePRNG.random(80, 240) * 60,
        })
      );
    }

    if (kind === 'triple') {
      const companionType = this.generateCompanionStarType(primaryStarType, architecturePRNG);
      stars.push(
        this.createStarBody('C', systemName, companionType, ageGyr, metallicityFeH, {
          center: 'barycenter',
          radius: outerSeparation,
          angle: architecturePRNG.random(0, Math.PI * 2),
          periodSeconds: architecturePRNG.random(28, 90) * 60,
        })
      );
    }

    return {
      kind,
      stars,
      primaryStarId: 'A',
      binarySeparation,
      outerSeparation: kind === 'triple' ? outerSeparation : 0,
      habitableLabel: kind === 'single' ? 'A' : kind === 'binary' ? 'AB' : 'AB+C',
    };
  }

  /** Generates companion star type. */
  private generateCompanionStarType(primaryStarType: string, prng: PRNG): string {
    const primaryClass = primaryStarType.charAt(0);
    const coolBias: Record<string, string[]> = {
      O: ['B', 'A', 'F', 'G'],
      B: ['A', 'F', 'G', 'K'],
      A: ['F', 'G', 'K', 'M'],
      F: ['G', 'K', 'M', 'M'],
      G: ['K', 'M', 'M', 'G'],
      K: ['M', 'M', 'K'],
      M: ['M', 'M', 'K'],
      L: ['L', 'T', 'M'],
      T: ['T', 'Y', 'L'],
      Y: ['Y', 'T'],
    };
    const broadType = prng.choice(coolBias[primaryClass] ?? ['M', 'K', 'G'])!;
    const availableSubtypes = Object.keys(SPECTRAL_TYPES).filter(
      (key) => key.startsWith(broadType) && (key.endsWith('V') || /^[LTY]\d$/.test(key))
    );
    return availableSubtypes.length > 0 ? prng.choice(availableSubtypes)! : broadType;
  }

  /** Creates star body. */
  private createStarBody(
    id: 'A' | 'B' | 'C',
    systemName: string,
    starType: string,
    ageGyr: number,
    metallicityFeH: number,
    orbit: StellarBody['orbit']
  ): StellarBody {
    const starInfo = SPECTRAL_TYPES[starType] ?? SPECTRAL_TYPES.G;
    const environment = { starType, ageGyr, metallicityFeH };
    return {
      id,
      name: `${systemName} ${id}`,
      starType,
      massKg: starInfo.mass,
      radiusM: starInfo.radius,
      luminosityW: calculateStellarLuminosityW(starType, estimateEvolutionaryLuminosityFactor(environment)),
      systemX: 0,
      systemY: 0,
      orbit,
      environment,
    };
  }

  /** Generates system name internal. */
  private generateSystemNameInternal(prng: PRNG): string {
    const number = prng.randomInt(1, 999);
    const suffix = String.fromCharCode(65 + prng.randomInt(0, 25));
    return `${prng.choice(SYSTEM_NAME_PREFIXES)}-${number}${suffix}`;
  }

  /** Returns whether coordinates identify the guaranteed first inhabited stellar hub. */
  private isStartingHubCell(worldX: number, worldY: number): boolean {
    return (
      worldX === CONFIG.PLAYER_START_X + CONFIG.STARTING_HUB_OFFSET_X &&
      worldY === CONFIG.PLAYER_START_Y + CONFIG.STARTING_HUB_OFFSET_Y
    );
  }

  /** Reserves the hub as the unique nearest stellar contact to the player's starting position. */
  private isInsideStartingHubClearance(worldX: number, worldY: number): boolean {
    const hubDistance = Math.hypot(CONFIG.STARTING_HUB_OFFSET_X, CONFIG.STARTING_HUB_OFFSET_Y);
    const distanceFromStart = Math.hypot(worldX - CONFIG.PLAYER_START_X, worldY - CONFIG.PLAYER_START_Y);
    return distanceFromStart <= hubDistance;
  }
}
