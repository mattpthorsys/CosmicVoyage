// src/constants.ts (Added mass property to SPECTRAL_TYPES)

// --- Glyphs ---
// Using const assertion to make these string literal types
export const GLYPHS = {
    BOX: { H: '\u2500', V: '\u2502', TL: '\u250C', TR: '\u2510', BL: '\u2514', BR: '\u2518' },
    BLOCK: '\u2588',
    SHADE_LIGHT: '\u2591',
    SHADE_MEDIUM: '\u2592',
    SHADE_DARK: '\u2593',
    STAR_DIM: '.',
    STAR_MEDIUM: 'o',
    STAR_BRIGHT: '*',
    PLANET_ICON: 'O', // Used? Maybe for minimap? Keep for now.
    SHIP_NORTH: '^',
    SHIP_SOUTH: 'v',
    SHIP_EAST: '>',
    SHIP_WEST: '<',
    ORBIT_CHAR: '.',
    STARBASE_ICON: '#'
} as const; // Make properties readonly and literal types

// --- Mineral Richness ---
// Using a string enum for type safety and readability
export enum MineralRichness {
    NONE = 'None',
    ULTRA_POOR = 'Ultra Poor',
    POOR = 'Poor',
    AVERAGE = 'Average',
    RICH = 'Rich',
    ULTRA_RICH = 'Ultra Rich',
}

// --- Star Data ---
// Define an interface for the structure of star type data
// *** ADDED mass property ***
interface SpectralTypeInfo {
    temp: number;
    colour: string;
    char: string; // Explicitly allow any of the star glyphs
    brightness: number;
    mass: number; // Mass in solar masses (relative to Sol=1.0)
}

// Use Record<string, T> for dictionary-like objects with string keys
// *** ADDED mass values (examples) ***
export const SPECTRAL_TYPES: Record<string, SpectralTypeInfo> = {
    'O': { temp: 40000, colour: '#6A8DFF', char: GLYPHS.STAR_BRIGHT, brightness: 1.5, mass: 60.0 }, // Example mass
    'B': { temp: 20000, colour: '#8FABFF', char: GLYPHS.STAR_BRIGHT, brightness: 1.3, mass: 10.0 }, // Example mass
    'A': { temp: 8500,  colour: '#DDE5FF', char: GLYPHS.STAR_MEDIUM, brightness: 1.1, mass: 2.0 },  // Example mass
    'F': { temp: 6500,  colour: '#FFFFFF', char: GLYPHS.STAR_MEDIUM, brightness: 1.0, mass: 1.3 },  // Example mass
    'G': { temp: 5500,  colour: '#FFFACD', char: GLYPHS.STAR_MEDIUM, brightness: 0.9, mass: 1.0 },  // Example mass (like Sol)
    'K': { temp: 4500,  colour: '#FFC864', char: GLYPHS.STAR_DIM,   brightness: 0.7, mass: 0.7 },  // Example mass
    'M': { temp: 3000,  colour: '#FF9A5A', char: GLYPHS.STAR_DIM,   brightness: 0.5, mass: 0.3 },  // Example mass
};
// Define the keys explicitly for type safety if needed, though string[] works fine.
export const SPECTRAL_DISTRIBUTION: string[] = [
    'M', 'M', 'M', 'M', 'M', 'M', 'M', 'M', 'K', 'K', 'K', 'G', 'G', 'F', 'A', 'B', 'O'
];

// --- Planet Data ---
interface PlanetTypeInfo {
    terrainColours: string[]; // Array of hex colour strings
    baseTemp: number;
}

export const PLANET_TYPES: Record<string, PlanetTypeInfo> = {
    'Molten':   { terrainColours: ['#200000', '#401000', '#662000', '#993000', '#CC5000', '#FF8010', '#FFB030', '#FFE060', '#FFFF99'], baseTemp: 1500 },
    'Rock':     { terrainColours: ['#2b2b2b', '#404040', '#555555', '#6f6f6f', '#8a8a8a', '#a5a5a5', '#c0c0c0', '#dbdbdb', '#f6f6f6'], baseTemp: 300 },
    'Oceanic':  { terrainColours: ['#000020', '#001040', '#002060', '#003399', '#0050B2', '#3380CC', '#66B0FF', '#99D0FF', '#CCF0FF'], baseTemp: 280 },
    'Lunar':    { terrainColours: ['#303030', '#404040', '#505050', '#656565', '#7f7f7f', '#9a9a9a', '#b5b5b5', '#d0d0d0', '#ebebeb'], baseTemp: 250 },
    'GasGiant': { terrainColours: ['#6f3f1f', '#8B4513', '#A0522D', '#B86B42', '#CD853F', '#D2B48C', '#E8D8B8', '#F5EDE0', '#FFFFF0'], baseTemp: 150 },
    'IceGiant': { terrainColours: ['#003060', '#004080', '#0050A0', '#0060C0', '#3377D0', '#6699E0', '#99BBF0', '#CCE6FF', '#E6F2FF'], baseTemp: 100 },
    'Frozen':   { terrainColours: ['#A0C0C0', '#C0D0D0', '#E0E8E8', '#F0F4F4', '#FFFFFF', '#F8F8F8', '#E8E8E8', '#D8D8D8', '#C8C8C8'], baseTemp: 50 }
};
// Could use an enum, but string array is simple enough for now.
export const ATMOSPHERE_DENSITIES: string[] = ['None', 'Thin', 'Earth-like', 'Thick'];

export const ATMOSPHERE_GASES: string[] = [
    'Hydrogen', 'Helium', 'Nitrogen', 'Oxygen', 'Carbon Dioxide', 'Argon',
    'Water Vapor', 'Methane', 'Ammonia', 'Neon', 'Xenon', 'Carbon Monoxide',
    'Ethane', 'Chlorine', 'Fluorine', 'Sulfur Dioxide'
];

// Interface for element properties
export interface ElementInfo {
    name: string;
    symbol: string;         // Short symbol (e.g., Fe, Si, H2O)
    description: string;    // Brief description
    baseValue: number;      // Base credits per unit
    baseFrequency: number;  // General rarity (higher = more common base chance)
    typeHints: string[];    // Planet types where it might be more common (e.g., ['Rock', 'Molten'])
    isGas: boolean;         // If the element is typically gaseous
    meltingPoint: number;   // Approximate melting point in Kelvin (Use low value like 0 or 1 for gases if specific MP irrelevant)
    group: string;          // General classification (e.g., 'Metal', 'Silicate', 'Gas', 'Noble', 'Nonmetal', 'Ice', 'Actinide', 'Lanthanide', 'Metalloid')
    atomicWeight: number;   // Relative atomic weight (for gravity effect)
}

// Define elements relevant to mining
export const ELEMENTS: Record<string, ElementInfo> = {
    // --- Abundant Base & Industrial Metals ---
    'IRON': {
        name: 'Iron', symbol: 'Fe', description: 'Core industrial metal for steel production.', baseValue: 3, baseFrequency: 1.0,
        typeHints: ['Rock', 'Molten', 'Lunar'], isGas: false, meltingPoint: 1811, group: 'Metal', atomicWeight: 55.8
    },
    'ALUMINIUM': {
        name: 'Aluminium', symbol: 'Al', description: 'Lightweight, corrosion-resistant metal.', baseValue: 4, baseFrequency: 0.8,
        typeHints: ['Rock', 'Lunar'], isGas: false, meltingPoint: 933, group: 'Metal', atomicWeight: 27.0
    },
    'SILICON': {
        name: 'Silicon', symbol: 'Si', description: 'Basis of rock and crucial for semiconductors.', baseValue: 2, baseFrequency: 1.0,
        typeHints: ['Rock', 'Lunar', 'Frozen'], isGas: false, meltingPoint: 1687, group: 'Silicate', atomicWeight: 28.1
    },
    'TITANIUM': {
        name: 'Titanium', symbol: 'Ti', description: 'Strong, light, corrosion-resistant metal.', baseValue: 10, baseFrequency: 0.3,
        typeHints: ['Rock', 'Molten', 'Lunar'], isGas: false, meltingPoint: 1941, group: 'Metal', atomicWeight: 47.9
    },
    'MAGNESIUM': {
        name: 'Magnesium', symbol: 'Mg', description: 'Very lightweight structural metal.', baseValue: 5, baseFrequency: 0.6,
        typeHints: ['Rock', 'Lunar', 'Oceanic'], isGas: false, meltingPoint: 923, group: 'Metal', atomicWeight: 24.3
    },
    'COPPER': {
        name: 'Copper', symbol: 'Cu', description: 'Excellent electrical conductor.', baseValue: 7, baseFrequency: 0.5,
        typeHints: ['Rock'], isGas: false, meltingPoint: 1358, group: 'Metal', atomicWeight: 63.5
    },
    'ZINC': {
        name: 'Zinc', symbol: 'Zn', description: 'Used for galvanizing steel and in alloys.', baseValue: 6, baseFrequency: 0.45,
        typeHints: ['Rock'], isGas: false, meltingPoint: 693, group: 'Metal', atomicWeight: 65.4
    },
    'LEAD': {
        name: 'Lead', symbol: 'Pb', description: 'Dense metal used in batteries and shielding.', baseValue: 5, baseFrequency: 0.4,
        typeHints: ['Rock'], isGas: false, meltingPoint: 601, group: 'Metal', atomicWeight: 207.2
    },
    'NICKEL': {
        name: 'Nickel', symbol: 'Ni', description: 'Key component in stainless steel and batteries.', baseValue: 8, baseFrequency: 0.35,
        typeHints: ['Rock', 'Molten'], isGas: false, meltingPoint: 1728, group: 'Metal', atomicWeight: 58.7
    },
    'TIN': {
        name: 'Tin', symbol: 'Sn', description: 'Used in solder and corrosion-resistant coatings.', baseValue: 9, baseFrequency: 0.3,
        typeHints: ['Rock'], isGas: false, meltingPoint: 505, group: 'Metal', atomicWeight: 118.7
    },

    // --- Precious & Noble Metals ---
    'GOLD': {
        name: 'Gold', symbol: 'Au', description: 'Highly valuable, inert precious metal.', baseValue: 100, baseFrequency: 0.01,
        typeHints: ['Rock', 'Molten'], isGas: false, meltingPoint: 1337, group: 'Metal', atomicWeight: 197.0
    },
    'SILVER': {
        name: 'Silver', symbol: 'Ag', description: 'Precious metal with excellent conductivity.', baseValue: 20, baseFrequency: 0.05,
        typeHints: ['Rock', 'Molten'], isGas: false, meltingPoint: 1235, group: 'Metal', atomicWeight: 107.9
    },
    'PLATINUM': {
        name: 'Platinum', symbol: 'Pt', description: 'Rare, valuable catalytic and jewelry metal.', baseValue: 80, baseFrequency: 0.008,
        typeHints: ['Molten', 'Rock'], isGas: false, meltingPoint: 2041, group: 'Metal', atomicWeight: 195.1
    },
    'PALLADIUM': {
        name: 'Palladium', symbol: 'Pd', description: 'Platinum-group metal used in catalysts.', baseValue: 70, baseFrequency: 0.007,
        typeHints: ['Molten', 'Rock'], isGas: false, meltingPoint: 1828, group: 'Metal', atomicWeight: 106.4
    },
    'RHODIUM': {
        name: 'Rhodium', symbol: 'Rh', description: 'Extremely rare platinum-group metal.', baseValue: 150, baseFrequency: 0.001,
        typeHints: ['Molten'], isGas: false, meltingPoint: 2237, group: 'Metal', atomicWeight: 102.9
    },

    // --- Tech & Energy Metals ---
    'LITHIUM': {
        name: 'Lithium', symbol: 'Li', description: 'Light alkali metal crucial for batteries.', baseValue: 15, baseFrequency: 0.15,
        typeHints: ['Rock', 'Oceanic'], isGas: false, meltingPoint: 454, group: 'Metal', atomicWeight: 6.9
    },
    'COBALT': {
        name: 'Cobalt', symbol: 'Co', description: 'Used in alloys and battery cathodes.', baseValue: 25, baseFrequency: 0.1,
        typeHints: ['Rock', 'Molten'], isGas: false, meltingPoint: 1768, group: 'Metal', atomicWeight: 58.9
    },
    'TUNGSTEN': {
        name: 'Tungsten', symbol: 'W', description: 'Metal with very high melting point.', baseValue: 18, baseFrequency: 0.12,
        typeHints: ['Molten', 'Rock'], isGas: false, meltingPoint: 3695, group: 'Metal', atomicWeight: 183.8
    },
    'URANIUM': {
        name: 'Uranium', symbol: 'U', description: 'Heavy radioactive metal for nuclear fuel.', baseValue: 40, baseFrequency: 0.03,
        typeHints: ['Rock', 'Molten'], isGas: false, meltingPoint: 1405, group: 'Actinide', atomicWeight: 238.0
    },
    'THORIUM': {
        name: 'Thorium', symbol: 'Th', description: 'Radioactive metal, potential nuclear fuel.', baseValue: 30, baseFrequency: 0.04,
        typeHints: ['Rock', 'Molten', 'Lunar'], isGas: false, meltingPoint: 2023, group: 'Actinide', atomicWeight: 232.0
    },
    'NEODYMIUM': {
        name: 'Neodymium', symbol: 'Nd', description: 'Rare earth element vital for strong magnets.', baseValue: 50, baseFrequency: 0.02,
        typeHints: ['Rock'], isGas: false, meltingPoint: 1297, group: 'Lanthanide', atomicWeight: 144.2
    },
    'DYSPROSIUM': {
        name: 'Dysprosium', symbol: 'Dy', description: 'Rare earth element for high-temp magnets.', baseValue: 60, baseFrequency: 0.015,
        typeHints: ['Rock'], isGas: false, meltingPoint: 1680, group: 'Lanthanide', atomicWeight: 162.5
    },
    'GALLIUM': {
        name: 'Gallium', symbol: 'Ga', description: 'Metal used in semiconductors and alloys.', baseValue: 35, baseFrequency: 0.05,
        typeHints: ['Rock'], isGas: false, meltingPoint: 303, group: 'Metal', atomicWeight: 69.7
    },
    'GERMANIUM': {
        name: 'Germanium', symbol: 'Ge', description: 'Metalloid used in fiber/infrared optics.', baseValue: 45, baseFrequency: 0.04,
        typeHints: ['Rock'], isGas: false, meltingPoint: 1211, group: 'Metalloid', atomicWeight: 72.6
    },
    'INDIUM': {
        name: 'Indium', symbol: 'In', description: 'Soft metal used for coatings and electrodes.', baseValue: 65, baseFrequency: 0.01,
        typeHints: ['Rock'], isGas: false, meltingPoint: 430, group: 'Metal', atomicWeight: 114.8
    },

    // --- Non-Metals & Others ---
    'CARBON': { // Added back based on previous examples
        name: 'Carbon', symbol: 'C', description: 'Basis of organic chemistry, found in rocks and ices.', baseValue: 5, baseFrequency: 0.6,
        typeHints: ['Rock', 'Frozen', 'Oceanic'], isGas: false, meltingPoint: 4000, group: 'Nonmetal', atomicWeight: 12.0 // Sublimates
    },
    'SULFUR': {
        name: 'Sulfur', symbol: 'S', description: 'Essential non-metal used in chemical production.', baseValue: 4, baseFrequency: 0.5,
        typeHints: ['Rock', 'Molten', 'Oceanic'], isGas: false, meltingPoint: 388, group: 'Nonmetal', atomicWeight: 32.1
    },
    'PHOSPHORUS': {
        name: 'Phosphorus', symbol: 'P', description: 'Non-metal essential for life, used in fertilizers.', baseValue: 3, baseFrequency: 0.4,
        typeHints: ['Rock', 'Oceanic'], isGas: false, meltingPoint: 317, group: 'Nonmetal', atomicWeight: 31.0
    },
    'POTASSIUM': {
        name: 'Potassium', symbol: 'K', description: 'Alkali metal (mined as potash) used in fertilizers.', baseValue: 3, baseFrequency: 0.7,
        typeHints: ['Rock', 'Oceanic'], isGas: false, meltingPoint: 337, group: 'Metal', atomicWeight: 39.1 // Alkali Metal
    },
    'BORON': {
        name: 'Boron', symbol: 'B', description: 'Metalloid used in glass and high-strength materials.', baseValue: 14, baseFrequency: 0.08,
        typeHints: ['Rock', 'Oceanic'], isGas: false, meltingPoint: 2349, group: 'Metalloid', atomicWeight: 10.8
    },

    // --- Gases & Ices ---
    'HYDROGEN': { // Added back for completeness
        name: 'Hydrogen', symbol: 'H', description: 'Lightest element, primary component of stars and gas giants.', baseValue: 1, baseFrequency: 0.9,
        typeHints: ['GasGiant'], isGas: true, meltingPoint: 14, group: 'Gas', atomicWeight: 1.0
    },
    'HELIUM': {
        name: 'Helium', symbol: 'He', description: 'Inert gas, found with Hydrogen, used in cryogenics.', baseValue: 12, baseFrequency: 0.7,
        typeHints: ['GasGiant', 'IceGiant', 'Lunar'], isGas: true, meltingPoint: 1, group: 'Noble', atomicWeight: 4.0 // Approx MP near 0K
    },
    'WATER_ICE': {
        name: 'Water Ice', symbol: 'H₂O', description: 'Frozen water, essential volatile.', baseValue: 1, baseFrequency: 0.6,
        typeHints: ['Frozen', 'IceGiant', 'Rock', 'Lunar'], isGas: false, meltingPoint: 273, group: 'Ice', atomicWeight: 18.0
    },
    'AMMONIA_ICE': {
        name: 'Ammonia Ice', symbol: 'NH₃', description: 'Frozen ammonia, common in outer systems.', baseValue: 2, baseFrequency: 0.3,
        typeHints: ['Frozen', 'IceGiant'], isGas: false, meltingPoint: 195, group: 'Ice', atomicWeight: 17.0
    },
    'METHANE_ICE': {
        name: 'Methane Ice', symbol: 'CH₄', description: 'Frozen methane, very volatile.', baseValue: 2, baseFrequency: 0.2,
        typeHints: ['Frozen', 'IceGiant'], isGas: false, meltingPoint: 91, group: 'Ice', atomicWeight: 16.0
    },
};

// --- User-Facing Messages ---
export const STATUS_MESSAGES = {
    // General
    ERROR_UNKNOWN_STATE: (state: string) => `[-E-]Error: Unknown game state ${state}[-e-]`,
    ERROR_DATA_MISSING: (dataType: string) => `[-E-]Error: ${dataType} data missing![-e-]`,
    ACTION_CANNOT_PERFORM: (action: string, context: string) => `[-W-]Cannot perform ${action} while ${context}.[-w-]`,
    
    // Hyperspace
    HYPERSPACE_NO_STAR: "[-W-]No star system detected at this location.[-w-]",
    HYPERSPACE_ENTERING: (systemName: string | undefined) => `[-H-]--- Entering system: ${systemName} ---[-h-]`,
    HYPERSPACE_SCANNING_SYSTEM: (systemName: string) => `[-H-]--- Scanning star system ${systemName} ---[-h-]`,
    HYPERSPACE_SCAN_FAIL: "[-W-]Nothing nearby to scan.[-w-]",
    
    // System
    SYSTEM_LEAVE_TOO_CLOSE: "[-W-]Must travel further from the star to leave the system.[-w-]",
    SYSTEM_LEAVING: "[-H-]Entered hyperspace.[-h-]",
    SYSTEM_LAND_APPROACHING: (targetName: string) => `[-H-]Approaching ${targetName}...[-h-]`,
    SYSTEM_LAND_FAIL_NO_TARGET: "[-W-]Nothing nearby to land on.[-w-]",
    SYSTEM_SCAN_STAR: (systemName: string) => `[-H-]--- Scanning local star (${systemName}) ---[-h-]`,
    SYSTEM_SCAN_OBJECT: (objectName: string) => `[-H-]--- Scanning ${objectName} ---[-h-]`,
    SYSTEM_SCAN_FAIL_NO_TARGET: "[-W-]Nothing close enough to scan.[-w-]",
    
    // Planet
    LIFTOFF_SUCCESS: (targetName: string) => `[-H-]Liftoff from ${targetName} successful.[-h-]`,
    LIFTOFF_FAIL: "[-W-]Liftoff failed.[-w-]",
    PLANET_SCAN_COMPLETE: (planetName: string, resource: string | null, richness: string) => `[-H-]${planetName} scan complete.[-h-] Primary: [-HL-]${resource || 'N/A'}.[-hl-] Richness: [-HL-]${richness}.[-hl-]`,
    PLANET_SCAN_ALREADY: (planetName: string, richness: string) => `${planetName} has already been scanned. (${richness})`,
    PLANET_SCAN_REQUIRED: (richness: string) => `[-W-]Scan required before mining. Richness potential: ${richness}.[-w-]`,
    PLANET_MINE_INVALID_TYPE: (planetType: string) => `[-W-]Cannot mine surface of ${planetType}.[-w-]`,
    PLANET_MINE_SUCCESS: (amount: number, unitName: string, current: number, capacity: number) => `Mined ${amount} units of ${unitName}. (${current}/${capacity})`,
    PLANET_MINE_CARGO_FULL: (current: number, capacity: number) => `[-W-]Mining failed: Cargo hold full. (${current}/${capacity})[-w-]`,
    PLANET_MINE_NO_ELEMENTS: "Found no mineable elements at this location.",
    PLANET_MINE_TRACE: (elementName: string) => `Trace amounts of ${elementName} found, but not enough to mine.`,
    PLANET_MINE_DEPLETED: "This location has already been mined.",
    
    // Starbase - Note that starbase does not use terminal overlay and hence doesn't have styling 'tags'
    STARBASE_TRADE_EMPTY: "Cargo hold is empty. Nothing to sell.",
    STARBASE_TRADE_SUCCESS: (itemsString: string, units: number, credits: number) => `Sold ${itemsString} (${units} units) for ${credits} Cr.`,
    STARBASE_REFUEL_FULL: "Fuel tank is already full.",
    STARBASE_REFUEL_SUCCESS: (amount: number, cost: number) => `Purchased ${amount} fuel for ${cost} Cr.`,
    STARBASE_REFUEL_FAIL_CREDITS: (costPerUnit: number, currentCredits: number) => `Not enough credits for fuel (Need ${costPerUnit.toFixed(1)} Cr/unit). Have ${currentCredits} Cr.`,
    
    // Errors
    ERROR_ACTION: (errorMessage: string) => `[-E-]ACTION ERROR: ${errorMessage}[-e-]`,
    ERROR_UPDATE: (errorMessage: string) => `[-E-]UPDATE ERROR: ${errorMessage}[-e-]`,
    ERROR_RENDER: (errorMessage: string) => `[-E-]RENDER ERROR: ${errorMessage}[-e-]`,
    ERROR_SURFACE_PREP: (errorMessage: string) => `[-E-]Surface Error: ${errorMessage}[-e-]`,
    ERROR_LANDING: (targetName: string, errorMessage: string) => `[-E-]Landing Error on ${targetName}: ${errorMessage}[-e-]`,
    ERROR_MINING: (errorMessage: string) => `[-E-]Mining Error: ${errorMessage}[-e-]`,

} as const;