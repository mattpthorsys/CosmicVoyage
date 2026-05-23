// src/generation/system_data_generator.ts

import { PRNG } from '../utils/prng';
import { fastHash } from '../utils/hash';
import { CONFIG } from '../config';
import { SPECTRAL_TYPES, SPECTRAL_DISTRIBUTION } from '../constants';
import { logger } from '../utils/logger';
import { generateMilkyWayMetallicityFeH, generateStellarAgeGyr } from '../entities/stellar_environment';

export interface SystemBasicProperties {
    exists: boolean;
    starType: string | null;
    name: string | null;
    hasStarbase: boolean;
    ageGyr: number | null;
    metallicityFeH: number | null;
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
        };

        const existenceSeedInt = this.gameSeedPRNG.seed;
        const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
        const hash = fastHash(worldX, worldY, existenceSeedInt);
        result.exists = (hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold;

        if (!result.exists) {
            return result;
        }

        const typeSeed = `star_type_${worldX},${worldY}`;
        const typePRNG = this.gameSeedPRNG.seedNew(typeSeed);
        const broadStarType = typePRNG.choice(SPECTRAL_DISTRIBUTION)!;
        const availableSubtypes = Object.keys(SPECTRAL_TYPES).filter(
            (key) => key.startsWith(broadStarType) && key.endsWith('V')
        );
        if (availableSubtypes.length > 0) {
            result.starType = typePRNG.choice(availableSubtypes)!;
        } else {
            result.starType = broadStarType;
        }

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

        return result;
    }

    private generateSystemNameInternal(prng: PRNG): string {
        const number = prng.randomInt(1, 999);
        const suffix = String.fromCharCode(65 + prng.randomInt(0, 25));
        return `${prng.choice(SYSTEM_NAME_PREFIXES)}-${number}${suffix}`;
    }
}
