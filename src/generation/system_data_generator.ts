// src/generation/system_data_generator.ts

import { PRNG } from '../utils/prng';
import { fastHash } from '../utils/hash';
import { CONFIG } from '../config';
import { SPECTRAL_TYPES, SPECTRAL_DISTRIBUTION } from '../constants';
import { logger } from '../utils/logger';

// Interface for the basic system properties generated deterministically
export interface SystemBasicProperties {
    exists: boolean;
    starType: string | null; // e.g., "G5V" or null if no star
    name: string | null;
    hasStarbase: boolean;
    // Add other basic, quickly needed properties here if necessary
}

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
        };

        // 1. Check Existence (using fastHash for speed)
        const existenceSeedInt = this.gameSeedPRNG.seed; // Or derive a specific seed if preferred
        const starPresenceThreshold = Math.floor(CONFIG.STAR_DENSITY * CONFIG.STAR_CHECK_HASH_SCALE);
        const hash = fastHash(worldX, worldY, existenceSeedInt);
        result.exists = (hash % CONFIG.STAR_CHECK_HASH_SCALE) < starPresenceThreshold;

        if (!result.exists) {
            return result; // No system here
        }

        // --- System Exists - Generate Core Deterministic Properties ---

        // 2. Determine Star Type (using dedicated type seed)
        const typeSeed = `star_type_${worldX},${worldY}`;
        const typePRNG = this.gameSeedPRNG.seedNew(typeSeed);
        const broadStarType = typePRNG.choice(SPECTRAL_DISTRIBUTION)!;
        const availableSubtypes = Object.keys(SPECTRAL_TYPES).filter(
            (key) => key.startsWith(broadStarType) && key.endsWith('V')
        );
        if (availableSubtypes.length > 0) {
            result.starType = typePRNG.choice(availableSubtypes)!;
        } else {
            result.starType = broadStarType; // Fallback
        }

        // 3. Generate Name (using dedicated name seed)
        const nameSeed = `star_name_${worldX},${worldY}`;
        const namePRNG = this.gameSeedPRNG.seedNew(nameSeed);
        result.name = this.generateSystemNameInternal(namePRNG); // Use internal helper

        // 4. Determine Starbase Presence (using dedicated starbase seed)
        const starbaseSeed = `star_starbase_${worldX},${worldY}`;
        const starbasePRNG = this.gameSeedPRNG.seedNew(starbaseSeed);
        result.hasStarbase = starbasePRNG.random() < CONFIG.STARBASE_PROBABILITY;

        // logger.debug(`[SystemDataGenerator] Properties for [${worldX},${worldY}]: Type=${result.starType}, Name=${result.name}, Starbase=${result.hasStarbase}`);
        return result;
    }

    // --- Internal Helper for Name Generation (copied from SolarSystem) ---
    private generateSystemNameInternal(prng: PRNG): string {
        const prefixes = ['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta','Iota','Kappa','Lambda','Mu','Nu','Xi','Omicron','Pi','Rho','Sigma','Tau','Upsilon','Phi','Chi','Psi','Omega','Proxima','Cygnus','Kepler','Gliese','HD','Trappist','Luyten','Wolf','Ross','Barnard','Benfblunk','Harwoe','Smerg','Hiss']; // Ensure full list is here
        const number = prng.randomInt(1, 999);
        const suffix = String.fromCharCode(65 + prng.randomInt(0, 25)); // A-Z
        return `${prng.choice(prefixes)}-${number}${suffix}`;
    }

    // --- Potential Future Method ---
    // getFullSystem(worldX: number, worldY: number): SolarSystem | null {
    //     const basicProps = this.getSystemProperties(worldX, worldY);
    //     if (!basicProps.exists || !basicProps.starType || !basicProps.name) {
    //         return null;
    //     }
    //     // Create PRNGs needed for full generation
    //     const planetPRNG = this.gameSeedPRNG.seedNew(`star_planets_${worldX},${worldY}`);
    //     const starbasePRNG = this.gameSeedPRNG.seedNew(`star_starbase_${worldX},${worldY}`); // Re-seed needed? Or pass hasStarbase
    //
    //     // *** Construct the SolarSystem, passing in the pre-determined props ***
    //     // The SolarSystem constructor would need modification to accept these.
    //     // It would then use the passed PRNGs for planet/starbase details.
    //     // return new SolarSystem(worldX, worldY, basicProps, planetPRNG, starbasePRNG); // Example signature
    //     return null; // Placeholder
    // }
}