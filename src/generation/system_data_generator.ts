// src/generation/system_data_generator.ts

import { PRNG } from '../utils/prng';
import { fastHash } from '../utils/hash';
import { CONFIG } from '../config';
import { SPECTRAL_TYPES, SPECTRAL_DISTRIBUTION } from '../constants';
import { logger } from '../utils/logger';
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

    constructor(gameSeedPRNG: PRNG) {
        this.gameSeedPRNG = gameSeedPRNG;
        logger.debug('[SystemDataGenerator] Initialized.');
    }

    /**
     * Gets the basic, deterministic properties of a potential system at world coordinates.
     * This method performs minimal generation needed for quick checks (like hyperspace view).
     */
    getSystemProperties(worldX: number, worldY: number): SystemBasicProperties {
        const result: SystemBasicProperties = {
            exists: false,
            starType: null,
            name: null,
            hasStarbase: false,
            ageGyr: null,
            metallicityFeH: null,
            architecture: null,
        };

        const existenceSeedInt = this.gameSeedPRNG.seed;
        const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
        const hash = fastHash(worldX, worldY, existenceSeedInt);
        result.exists = (hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold;

        if (!result.exists) {
            return result;
        }

        const typePRNG = this.gameSeedPRNG.seedNew(`star_type_${worldX},${worldY}`);
        result.starType = this.generateStarType(typePRNG);
        const agePRNG = this.gameSeedPRNG.seedNew(`star_age_${worldX},${worldY}`);
        result.ageGyr = generateStellarAgeGyr(result.starType, agePRNG);
        const metallicityPRNG = this.gameSeedPRNG.seedNew(`star_metallicity_${worldX},${worldY}`);
        result.metallicityFeH = generateMilkyWayMetallicityFeH(result.ageGyr, result.starType, metallicityPRNG);

        const nameSeed = `star_name_${worldX},${worldY}`;
        const namePRNG = this.gameSeedPRNG.seedNew(nameSeed);
        result.name = this.generateSystemNameInternal(namePRNG);

        const starbaseSeed = `star_starbase_${worldX},${worldY}`;
        const starbasePRNG = this.gameSeedPRNG.seedNew(starbaseSeed);
        result.hasStarbase = starbasePRNG.random() < CONFIG.STARBASE_PROBABILITY;
        result.architecture = this.generateArchitecture(
            result.name,
            result.starType,
            result.ageGyr,
            result.metallicityFeH,
            worldX,
            worldY
        );

        return result;
    }

    private generateStarType(prng: PRNG): string {
        const broadStarType = prng.choice(SPECTRAL_DISTRIBUTION)!;
        const availableSubtypes = Object.keys(SPECTRAL_TYPES).filter(
            (key) => key.startsWith(broadStarType) && key.endsWith('V')
        );
        return availableSubtypes.length > 0 ? prng.choice(availableSubtypes)! : broadStarType;
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
        const kind: StellarSystemKind = multiplicityRoll < 0.14 ? 'triple' : multiplicityRoll < 0.48 ? 'binary' : 'single';
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
        };
        const broadType = prng.choice(coolBias[primaryClass] ?? ['M', 'K', 'G'])!;
        const availableSubtypes = Object.keys(SPECTRAL_TYPES).filter(
            (key) => key.startsWith(broadType) && key.endsWith('V')
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
