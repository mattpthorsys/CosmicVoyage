// src/constants.ts

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
    POOR = 'Poor',
    AVERAGE = 'Average',
    RICH = 'Rich',
    EXCEPTIONAL = 'Exceptional',
}

// --- Star Data ---
// Define an interface for the structure of star type data
interface SpectralTypeInfo {
    temp: number;
    colour: string;
    char: string; // Explicitly allow any of the star glyphs
    brightness: number;
}

// Use Record<string, T> for dictionary-like objects with string keys
export const SPECTRAL_TYPES: Record<string, SpectralTypeInfo> = {
    'O': { temp: 40000, colour: '#6A8DFF', char: GLYPHS.STAR_BRIGHT, brightness: 1.5 },
    'B': { temp: 20000, colour: '#8FABFF', char: GLYPHS.STAR_BRIGHT, brightness: 1.3 },
    'A': { temp: 8500,  colour: '#DDE5FF', char: GLYPHS.STAR_MEDIUM, brightness: 1.1 },
    'F': { temp: 6500,  colour: '#FFFFFF', char: GLYPHS.STAR_MEDIUM, brightness: 1.0 },
    'G': { temp: 5500,  colour: '#FFFACD', char: GLYPHS.STAR_MEDIUM, brightness: 0.9 },
    'K': { temp: 4500,  colour: '#FFC864', char: GLYPHS.STAR_DIM,   brightness: 0.7 },
    'M': { temp: 3000,  colour: '#FF9A5A', char: GLYPHS.STAR_DIM,   brightness: 0.5 },
};

// Define the keys explicitly for type safety if needed, though string[] works fine.
export const SPECTRAL_DISTRIBUTION: string[] = [
    'M', 'M', 'M', 'M', 'M', 'M', 'M', 'M', 'K', 'K', 'K', 'G', 'G', 'F', 'A', 'B', 'O'
];


// --- Planet Data ---
interface PlanetTypeInfo {
    colours: string[]; // Array of hex colour strings
    baseTemp: number;
}

export const PLANET_TYPES: Record<string, PlanetTypeInfo> = {
    'Molten':   { colours: ['#200000', '#401000', '#662000', '#993000', '#CC5000', '#FF8010', '#FFB030', '#FFE060', '#FFFF99'], baseTemp: 1500 },
    'Rock':     { colours: ['#2b2b2b', '#404040', '#555555', '#6f6f6f', '#8a8a8a', '#a5a5a5', '#c0c0c0', '#dbdbdb', '#f6f6f6'], baseTemp: 300 },
    'Oceanic':  { colours: ['#000020', '#001040', '#002060', '#003399', '#0050B2', '#3380CC', '#66B0FF', '#99D0FF', '#CCF0FF'], baseTemp: 280 },
    'Lunar':    { colours: ['#303030', '#404040', '#505050', '#656565', '#7f7f7f', '#9a9a9a', '#b5b5b5', '#d0d0d0', '#ebebeb'], baseTemp: 250 },
    'GasGiant': { colours: ['#6f3f1f', '#8B4513', '#A0522D', '#B86B42', '#CD853F', '#D2B48C', '#E8D8B8', '#F5EDE0', '#FFFFF0'], baseTemp: 150 },
    'IceGiant': { colours: ['#003060', '#004080', '#0050A0', '#0060C0', '#3377D0', '#6699E0', '#99BBF0', '#CCE6FF', '#E6F2FF'], baseTemp: 100 },
    'Frozen':   { colours: ['#A0C0C0', '#C0D0D0', '#E0E8E8', '#F0F4F4', '#FFFFFF', '#F8F8F8', '#E8E8E8', '#D8D8D8', '#C8C8C8'], baseTemp: 50 }
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
    symbol: string; // Short symbol (e.g., Fe, Si, H2O)
    description: string; // Brief description
    baseValue: number; // Base credits per unit
    baseFrequency: number; // General rarity (e.g., 1.0 = common, 0.1 = rare, 0.01 = very rare)
    // Optional: Add typeAffinity later: Record<string, number> // e.g., { Rock: 1.5, Molten: 0.8 } - Multiplier for frequency based on planet type
}

// Define elements relevant to mining
export const ELEMENTS: Record<string, ElementInfo> = {
    // --- Abundant Base & Industrial Metals ---
    'IRON': { name: 'Iron', symbol: 'Fe', description: 'Core industrial metal for steel production.', baseValue: 3, baseFrequency: 1.0 },
    'ALUMINIUM': { name: 'Aluminium', symbol: 'Al', description: 'Lightweight, corrosion-resistant metal (requires significant energy to refine).', baseValue: 4, baseFrequency: 0.8 },
    'SILICON': { name: 'Silicon', symbol: 'Si', description: 'Basis of rock (silicates) and crucial for semiconductors.', baseValue: 2, baseFrequency: 1.0 },
    'TITANIUM': { name: 'Titanium', symbol: 'Ti', description: 'Strong, light, corrosion-resistant metal for aerospace and high-tech.', baseValue: 10, baseFrequency: 0.3 },
    'MAGNESIUM': { name: 'Magnesium', symbol: 'Mg', description: 'Very lightweight structural metal, often alloyed.', baseValue: 5, baseFrequency: 0.6 },
    'COPPER': { name: 'Copper', symbol: 'Cu', description: 'Excellent electrical conductor.', baseValue: 7, baseFrequency: 0.5 },
    'ZINC': { name: 'Zinc', symbol: 'Zn', description: 'Used for galvanizing steel and in alloys like brass.', baseValue: 6, baseFrequency: 0.45 },
    'LEAD': { name: 'Lead', symbol: 'Pb', description: 'Dense metal used in batteries and radiation shielding.', baseValue: 5, baseFrequency: 0.4 },
    'NICKEL': { name: 'Nickel', symbol: 'Ni', description: 'Key component in stainless steel and batteries.', baseValue: 8, baseFrequency: 0.35 },
    'TIN': { name: 'Tin', symbol: 'Sn', description: 'Used in solder and corrosion-resistant coatings.', baseValue: 9, baseFrequency: 0.3 },

    // --- Precious & Noble Metals ---
    'GOLD': { name: 'Gold', symbol: 'Au', description: 'Highly valuable, inert precious metal.', baseValue: 100, baseFrequency: 0.01 },
    'SILVER': { name: 'Silver', symbol: 'Ag', description: 'Precious metal with excellent conductivity.', baseValue: 20, baseFrequency: 0.05 },
    'PLATINUM': { name: 'Platinum', symbol: 'Pt', description: 'Rare, valuable catalytic and jewelry metal.', baseValue: 80, baseFrequency: 0.008 },
    'PALLADIUM': { name: 'Palladium', symbol: 'Pd', description: 'Platinum-group metal used in catalysts and electronics.', baseValue: 70, baseFrequency: 0.007 },
    'RHODIUM': { name: 'Rhodium', symbol: 'Rh', description: 'Extremely rare, hard, silvery-white platinum-group metal.', baseValue: 150, baseFrequency: 0.001 },

    // --- Tech & Energy Metals ---
    'LITHIUM': { name: 'Lithium', symbol: 'Li', description: 'Light alkali metal crucial for modern batteries.', baseValue: 15, baseFrequency: 0.15 },
    'COBALT': { name: 'Cobalt', symbol: 'Co', description: 'Used in high-performance alloys and battery cathodes.', baseValue: 25, baseFrequency: 0.1 },
    'TUNGSTEN': { name: 'Tungsten', symbol: 'W', description: 'Metal with very high melting point, used in filaments and alloys.', baseValue: 18, baseFrequency: 0.12 },
    'URANIUM': { name: 'Uranium', symbol: 'U', description: 'Heavy radioactive metal used for nuclear fuel.', baseValue: 40, baseFrequency: 0.03 },
    'THORIUM': { name: 'Thorium', symbol: 'Th', description: 'Radioactive metal, potential alternative nuclear fuel.', baseValue: 30, baseFrequency: 0.04 },
    'NEODYMIUM': { name: 'Neodymium', symbol: 'Nd', description: 'Rare earth element vital for strong magnets.', baseValue: 50, baseFrequency: 0.02 },
    'DYSPROSIUM': { name: 'Dysprosium', symbol: 'Dy', description: 'Rare earth element used in high-performance magnets at high temps.', baseValue: 60, baseFrequency: 0.015 },
    'GALLIUM': { name: 'Gallium', symbol: 'Ga', description: 'Metal used in semiconductors and alloys with low melting points.', baseValue: 35, baseFrequency: 0.05 },
    'GERMANIUM': { name: 'Germanium', symbol: 'Ge', description: 'Metalloid used in fiber optics and infrared optics.', baseValue: 45, baseFrequency: 0.04 },
    'INDIUM': { name: 'Indium', symbol: 'In', description: 'Soft metal used for coatings and transparent electrodes (like in LCDs).', baseValue: 65, baseFrequency: 0.01 },

    // --- Non-Metals & Others ---
    'SULFUR': { name: 'Sulfur', symbol: 'S', description: 'Essential non-metal used in chemical production (e.g., sulfuric acid).', baseValue: 4, baseFrequency: 0.5 },
    'PHOSPHORUS': { name: 'Phosphorus', symbol: 'P', description: 'Non-metal essential for life (found in phosphates), used in fertilizers.', baseValue: 3, baseFrequency: 0.4 },
    'POTASSIUM': { name: 'Potassium', symbol: 'K', description: 'Alkali metal (often mined as potash) used in fertilizers.', baseValue: 3, baseFrequency: 0.7 },
    'HELIUM': { name: 'Helium', symbol: 'He', description: 'Inert gas found in natural gas deposits, used in cryogenics.', baseValue: 12, baseFrequency: 0.1 }, // Usually extracted, not mined directly
    'BORON': { name: 'Boron', symbol: 'B', description: 'Metalloid used in glass (borosilicate) and high-strength materials.', baseValue: 14, baseFrequency: 0.08 },

};