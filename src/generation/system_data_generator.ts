// src/generation/system_data_generator.ts

import { PRNG } from '../utils/prng';
import { fastHash } from '../utils/hash';
import { CONFIG } from '../config';
import { SPECTRAL_DISTRIBUTION, SPECTRAL_TYPES } from '../constants/stellar';
import { GLYPHS } from '../constants/visual';
import { logger } from '../utils/logger';
import { PerlinNoise } from './perlin';
import {
    estimateEvolutionaryLuminosityFactor,
    generateMilkyWayMetallicityFeH,
    generateStellarAgeGyr,
} from '../entities/stellar_environment';
import {
    calculateStellarLuminosityW,
    StellarArchitecture,
    StellarBody,
    StellarSystemKind,
} from '../entities/stellar_body';

export interface SystemBasicProperties {
    exists: boolean;
    starType: string | null;
    name: string | null;
    hasStarbase: boolean;
    ageGyr: number | null;
    metallicityFeH: number | null;
    architecture: StellarArchitecture | null;
    objectKind: 'stellar' | 'brown-dwarf' | 'rogue-planet' | null;
}

export interface SystemMapProperties {
    exists: boolean;
    starType: string | null;
    name: string | null;
    hasStarbase: boolean;
    objectKind: 'stellar' | 'brown-dwarf' | null;
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
    'Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta',
    'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi',
    'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega',
    'Proxima', 'Cygnus', 'Kepler', 'Gliese', 'HD', 'Trappist', 'Luyten',
    'Wolf', 'Ross', 'Barnard', 'Benfblunk', 'Harwoe', 'Smerg', 'Hiss',
];

export class SystemDataGenerator {
    private gameSeedPRNG: PRNG;
    private systemMapPropertiesCache: Map<string, SystemMapProperties> = new Map();
    private systemPropertiesCache: Map<string, SystemBasicProperties> = new Map();
    private phenomenonPropertiesCache: Map<string, DeepSpacePhenomenonProperties> = new Map();
    private interstellarMediumCache: Map<string, InterstellarMediumProperties> = new Map();
    private interstellarMediumNoise: PerlinNoise;
    private readonly maxSystemPropertiesCacheSize = 50000;

    constructor(gameSeedPRNG: PRNG) {
        this.gameSeedPRNG = gameSeedPRNG;
        this.interstellarMediumNoise = new PerlinNoise(`${gameSeedPRNG.getInitialSeed()}_interstellar_medium`);
        logger.debug('[SystemDataGenerator] Initialized.');
    }

    /**
     * Gets the basic, deterministic properties of a potential system at world coordinates.
     * This method performs minimal generation needed for quick checks (like hyperspace view).
     */
    getSystemMapProperties(worldX: number, worldY: number): SystemMapProperties {
        const cacheKey = `${worldX},${worldY}`;
        const cached = this.systemMapPropertiesCache.get(cacheKey);
        if (cached) return cached;

        const result: SystemMapProperties = {
            exists: false,
            starType: null,
            name: null,
            hasStarbase: false,
            objectKind: null,
        };

        const existenceSeedInt = this.gameSeedPRNG.seed;
        const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
        const hash = fastHash(worldX, worldY, existenceSeedInt);
        const hasNormalStar = (hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold;
        const brownDwarfPresenceThreshold = Math.floor(CONFIG.BROWN_DWARF_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
        const brownDwarfHash = fastHash(worldX, worldY, existenceSeedInt + 32003);
        const hasBrownDwarf = !hasNormalStar && (brownDwarfHash % CONFIG.STAR_CHECK_HASH_SCALE) < brownDwarfPresenceThreshold;
        result.exists = hasNormalStar || hasBrownDwarf;

        if (!result.exists) {
            this.cacheSystemMapProperties(cacheKey, result);
            return result;
        }

        const typePRNG = this.gameSeedPRNG.seedNew(`star_type_${worldX},${worldY}`);
        result.objectKind = hasBrownDwarf ? 'brown-dwarf' : 'stellar';
        result.starType = hasBrownDwarf ? this.generateBrownDwarfType(typePRNG) : this.generateStarType(typePRNG);
        const nameSeed = `star_name_${worldX},${worldY}`;
        const namePRNG = this.gameSeedPRNG.seedNew(nameSeed);
        result.name = this.generateSystemNameInternal(namePRNG);
        const starbaseSeed = `star_starbase_${worldX},${worldY}`;
        const starbasePRNG = this.gameSeedPRNG.seedNew(starbaseSeed);
        result.hasStarbase = result.objectKind === 'stellar' && starbasePRNG.random() < CONFIG.STARBASE_PROBABILITY;

        this.cacheSystemMapProperties(cacheKey, result);
        return result;
    }

    getSystemProperties(worldX: number, worldY: number): SystemBasicProperties {
        const cacheKey = `${worldX},${worldY}`;
        const cached = this.systemPropertiesCache.get(cacheKey);
        if (cached) return cached;

        const mapProps = this.getSystemMapProperties(worldX, worldY);
        const result: SystemBasicProperties = {
            ...mapProps,
            ageGyr: null,
            metallicityFeH: null,
            architecture: null,
        };

        if (!result.exists || !result.starType || !result.name) {
            this.cacheSystemProperties(cacheKey, result);
            return result;
        }

        const agePRNG = this.gameSeedPRNG.seedNew(`star_age_${worldX},${worldY}`);
        result.ageGyr = generateStellarAgeGyr(result.starType, agePRNG);
        const metallicityPRNG = this.gameSeedPRNG.seedNew(`star_metallicity_${worldX},${worldY}`);
        result.metallicityFeH = generateMilkyWayMetallicityFeH(result.ageGyr, result.starType, metallicityPRNG);
        result.architecture = this.generateArchitecture(
            result.name,
            result.starType,
            result.ageGyr,
            result.metallicityFeH,
            worldX,
            worldY
        );

        this.cacheSystemProperties(cacheKey, result);
        return result;
    }

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

        if (this.getSystemMapProperties(worldX, worldY).exists) {
            this.cachePhenomenonProperties(cacheKey, empty);
            return empty;
        }

        const roll = fastHash(worldX, worldY, this.gameSeedPRNG.seed + 99173) % CONFIG.DEEP_SPACE_PHENOMENA_SCALE;
        const type = this.getPhenomenonTypeFromRoll(roll);
        if (!type) {
            this.cachePhenomenonProperties(cacheKey, empty);
            return empty;
        }

        const prng = this.gameSeedPRNG.seedNew(`deep_space_${worldX},${worldY}`);
        const result = this.createPhenomenon(type, prng);
        this.cachePhenomenonProperties(cacheKey, result);
        return result;
    }

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

        const density = this.clamp(0.02 + densityField * 1.8 + Math.max(0, filamentField - 0.68) * 3.2, 0.01, 4.5);
        const electronDensity = this.clamp(0.005 + ionField * 0.18 + remnantInfluence.neutron * 0.12, 0.001, 0.7);
        const dustExtinction = this.clamp(Math.max(0, densityField - 0.55) * 1.6 + Math.max(0, filamentField - 0.62) * 2.1, 0, 1.8);
        const radiation = this.clamp(0.04 + remnantInfluence.neutron * 1.4 + Math.max(0, ionField - 0.76) * 0.7, 0.02, 2.2);
        const gravitationalShear = this.clamp(remnantInfluence.blackHole * 1.25 + Math.max(0, shearField - 0.86) * 0.45, 0, 1.5);

        let kind: InterstellarMediumKind = 'diffuse-hydrogen';
        if (gravitationalShear > 0.55) kind = 'gravitational-shear';
        else if (radiation > 0.7) kind = 'radiation-front';
        else if (dustExtinction > 0.85) kind = 'molecular-dust';
        else if (electronDensity > 0.12) kind = 'ionised-plasma';
        else if (density < 0.35 && dustExtinction < 0.12) kind = 'cold-void';

        const sensorRangeMultiplier = this.clamp(
            1.08 - dustExtinction * 0.22 - electronDensity * 0.35 - radiation * 0.08 - gravitationalShear * 0.16 + (kind === 'cold-void' ? 0.08 : 0),
            0.58,
            1.18
        );
        const driftBiasX = this.clamp((this.normalizedNoise(worldX * scale * 3.1 + 4.4, worldY * scale * 3.1) - 0.5) * gravitationalShear, -0.35, 0.35);
        const driftBiasY = this.clamp((this.normalizedNoise(worldX * scale * 3.1, worldY * scale * 3.1 - 5.7) - 0.5) * gravitationalShear, -0.35, 0.35);

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

    clearCache(): void {
        this.systemMapPropertiesCache.clear();
        this.systemPropertiesCache.clear();
        this.phenomenonPropertiesCache.clear();
        this.interstellarMediumCache.clear();
        this.interstellarMediumNoise.clearCache();
    }

    private cacheSystemMapProperties(cacheKey: string, properties: SystemMapProperties): void {
        if (this.systemMapPropertiesCache.size >= this.maxSystemPropertiesCacheSize) {
            const firstKey = this.systemMapPropertiesCache.keys().next().value;
            if (firstKey !== undefined) this.systemMapPropertiesCache.delete(firstKey);
        }
        this.systemMapPropertiesCache.set(cacheKey, properties);
    }

    private cacheSystemProperties(cacheKey: string, properties: SystemBasicProperties): void {
        if (this.systemPropertiesCache.size >= this.maxSystemPropertiesCacheSize) {
            const firstKey = this.systemPropertiesCache.keys().next().value;
            if (firstKey !== undefined) this.systemPropertiesCache.delete(firstKey);
        }
        this.systemPropertiesCache.set(cacheKey, properties);
    }

    private cachePhenomenonProperties(cacheKey: string, properties: DeepSpacePhenomenonProperties): void {
        if (this.phenomenonPropertiesCache.size >= this.maxSystemPropertiesCacheSize) {
            const firstKey = this.phenomenonPropertiesCache.keys().next().value;
            if (firstKey !== undefined) this.phenomenonPropertiesCache.delete(firstKey);
        }
        this.phenomenonPropertiesCache.set(cacheKey, properties);
    }

    private cacheInterstellarMediumProperties(cacheKey: string, properties: InterstellarMediumProperties): void {
        if (this.interstellarMediumCache.size >= this.maxSystemPropertiesCacheSize) {
            const firstKey = this.interstellarMediumCache.keys().next().value;
            if (firstKey !== undefined) this.interstellarMediumCache.delete(firstKey);
        }
        this.interstellarMediumCache.set(cacheKey, properties);
    }

    private normalizedNoise(x: number, y: number): number {
        return this.clamp(this.interstellarMediumNoise.get(x, y) + 0.5, 0, 1);
    }

    private getCompactRemnantInfluence(worldX: number, worldY: number): { neutron: number; blackHole: number } {
        let neutron = 0;
        let blackHole = 0;
        for (let dy = -8; dy <= 8; dy++) {
            for (let dx = -8; dx <= 8; dx++) {
                const distance = Math.hypot(dx, dy);
                if (distance > 8) continue;
                const phenomenon = this.getDeepSpacePhenomenonProperties(worldX + dx, worldY + dy);
                if (!phenomenon.exists) continue;
                const influence = Math.max(0, 1 - distance / 8);
                if (phenomenon.type === 'neutron-star') neutron = Math.max(neutron, influence);
                if (phenomenon.type === 'black-hole') blackHole = Math.max(blackHole, influence);
            }
        }
        return { neutron, blackHole };
    }

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

    private generateStarType(prng: PRNG): string {
        const broadStarType = prng.choice(SPECTRAL_DISTRIBUTION)!;
        const availableSubtypes = Object.keys(SPECTRAL_TYPES).filter(
            (key) => key.startsWith(broadStarType) && key.endsWith('V')
        );
        return availableSubtypes.length > 0 ? prng.choice(availableSubtypes)! : broadStarType;
    }

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

    private getPhenomenonTypeFromRoll(roll: number): DeepSpacePhenomenonType | null {
        // About 4.6 per 10,000 empty cells. Artificial and extinct-civilisation traces stay rare.
        if (roll < 180) return 'rogue-planet';
        if (roll < 330) return 'dark-nebula';
        if (roll < 385) return 'ancient-signal';
        if (roll < 420) return 'neutron-star';
        if (roll < 438) return 'black-hole';
        if (roll < 448) return 'debris-field';
        return null;
    }

    private createPhenomenon(type: DeepSpacePhenomenonType, prng: PRNG): DeepSpacePhenomenonProperties {
        const number = prng.randomInt(100, 9999);
        const fragment = prng.choice(['Acheron', 'Null', 'Kite', 'Mira', 'Ash', 'Vela', 'Cinder', 'Orison'])!;
        const common = { exists: true as const, type };
        switch (type) {
            case 'rogue-planet':
                return { ...common, name: `Rogue ${fragment}-${number}`, classification: 'FREE PLANETARY MASS', signal: 'thermal remnant only', char: 'o', colour: '#395052', rarity: 'uncommon' };
            case 'dark-nebula':
                return { ...common, name: `${fragment} Absorption Field`, classification: 'DARK MOLECULAR CLOUDLET', signal: 'background occlusion', char: GLYPHS.SHADE_LIGHT, colour: '#101812', rarity: 'uncommon' };
            case 'ancient-signal':
                return { ...common, name: `Signal ${fragment}-${number}`, classification: 'NON-NATURAL NARROWBAND SOURCE', signal: `${prng.random(8, 80).toFixed(1)} hour repeat; no local beacon registry`, char: '?', colour: '#3A8F83', rarity: 'rare' };
            case 'neutron-star':
                return { ...common, name: `PSR ${number}-${fragment.charAt(0)}`, classification: 'COMPACT STELLAR REMNANT', signal: `${prng.random(0.01, 3).toFixed(3)}s pulse train`, char: '*', colour: '#AFC8FF', rarity: 'very-rare' };
            case 'black-hole':
                return { ...common, name: `Collapsed Source ${number}`, classification: 'GRAVITATIONAL LENS CANDIDATE', signal: 'no optical primary; distorted background field', char: ' ', colour: '#050505', rarity: 'very-rare' };
            case 'debris-field':
                return { ...common, name: `${fragment} Silent Debris`, classification: 'ARTIFICIAL DEBRIS FIELD', signal: 'cold metal returns; no active transponders', char: ':', colour: '#5E6F68', rarity: 'exceedingly-rare' };
        }
    }

    private weightedChoice<T>(prng: PRNG, choices: Array<{ item: T; weight: number }>): T {
        const totalWeight = choices.reduce((sum, choice) => sum + Math.max(0, choice.weight), 0);
        let roll = prng.random(0, totalWeight);
        for (const choice of choices) {
            roll -= Math.max(0, choice.weight);
            if (roll <= 0) return choice.item;
        }
        return choices[choices.length - 1].item;
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    private generateArchitecture(
        systemName: string,
        primaryStarType: string,
        ageGyr: number,
        metallicityFeH: number,
        worldX: number,
        worldY: number
    ): StellarArchitecture {
        const architecturePRNG = this.gameSeedPRNG.seedNew(`star_architecture_${worldX},${worldY}`);
        const multiplicityRoll = architecturePRNG.random();
        const isBrownDwarf = /^[LTY]/.test(primaryStarType);
        const kind: StellarSystemKind = isBrownDwarf
            ? (multiplicityRoll < 0.18 ? 'binary' : 'single')
            : multiplicityRoll < 0.14 ? 'triple' : multiplicityRoll < 0.48 ? 'binary' : 'single';
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

    private generateSystemNameInternal(prng: PRNG): string {
        const number = prng.randomInt(1, 999);
        const suffix = String.fromCharCode(65 + prng.randomInt(0, 25));
        return `${prng.choice(SYSTEM_NAME_PREFIXES)}-${number}${suffix}`;
    }
}
