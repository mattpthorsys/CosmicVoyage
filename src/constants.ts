// src/constants.ts (Complete File - April 2025 Version with Expanded Star Types)

import { RgbColour } from "./rendering/colour"; // Assuming colour utils are here

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
    PLANET_ICON: 'O', // Used? Maybe for minimap? Keep for now. [cite: 412]
    SHIP_NORTH: '^',
    SHIP_SOUTH: 'v',
    SHIP_EAST: '>',
    SHIP_WEST: '<',
    ORBIT_CHAR: '.',
    STARBASE_ICON: '#'
} as const; // Make properties readonly and literal types [cite: 413]

// --- Physical Constants (MKS Units) ---
export const GRAVITATIONAL_CONSTANT_G = 6.67430e-11; // m^3 kg^-1 s^-2 [cite: 414]
export const SOLAR_MASS_KG = 1.98847e30;            // kg
export const AU_IN_METERS = 1.495978707e11;         // meters
export const EARTH_RADIUS_KM = 6371;                // km (Reference) - Can be converted to meters if needed elsewhere [cite: 415]
export const SOLAR_RADIUS_M = 6.957e8;              // metres [cite: 416]
export const BOLTZMANN_CONSTANT_K = 1.380649e-23;   // J/K (Joules per Kelvin)

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
interface SpectralTypeInfo {
    temp: number;       // Kelvin [cite: 417]
    colour: string;     // Hex colour
    char: string;       // Glyph [cite: 418]
    brightness: number; // Relative visual brightness factor (simplified)
    mass: number;       // kg [cite: 419]
    radius: number;     // Radius in METERS (m)
}

// --- Interpolation Helper Functions ---
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// Helper function to interpolate RGB colors
const interpolateRgb = (color1: RgbColour, color2: RgbColour, factor: number): RgbColour => ({
  r: lerp(color1.r, color2.r, factor),
  g: lerp(color1.g, color2.g, factor),
  b: lerp(color1.b, color2.b, factor),
});

// Helper function to convert RGB to Hex (ensure you have this or similar)
// interface RgbColour { r: number; g: number; b: number; } // Assumed imported or defined above
const rgbToHex = (r: number, g: number, b: number): string => {
  r = Math.max(0, Math.min(255, Math.round(r)));
  g = Math.max(0, Math.min(255, Math.round(g)));
  b = Math.max(0, Math.min(255, Math.round(b)));
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
};
// Helper function to convert Hex to RGB (ensure you have this or similar)
const hexToRgb = (hex: string): RgbColour => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : { r: 255, g: 255, b: 255 }; // Default to white on error
};

// --- Anchor points for interpolation ---
const O_TYPE: Readonly<SpectralTypeInfo> = { temp: 35100, colour: '#6A8DFF', char: GLYPHS.STAR_BRIGHT, brightness: 1.5, mass: 23.00 * SOLAR_MASS_KG, radius: 8.50 * SOLAR_RADIUS_M }; // O8V values [cite: 417, 419, 420]
const B_TYPE: Readonly<SpectralTypeInfo> = { temp: 17000, colour: '#8FABFF', char: GLYPHS.STAR_BRIGHT, brightness: 1.3, mass: 5.40 * SOLAR_MASS_KG, radius: 3.61 * SOLAR_RADIUS_M };  // B3V values
const A_TYPE: Readonly<SpectralTypeInfo> = { temp: 8100,  colour: '#DDE5FF', char: GLYPHS.STAR_MEDIUM, brightness: 1.1, mass: 1.86 * SOLAR_MASS_KG, radius: 1.785 * SOLAR_RADIUS_M }; // A5V values [cite: 421]
const F_TYPE: Readonly<SpectralTypeInfo> = { temp: 6550,  colour: '#FFFFFF', char: GLYPHS.STAR_MEDIUM, brightness: 1.0, mass: 1.33 * SOLAR_MASS_KG, radius: 1.473 * SOLAR_RADIUS_M }; // F5V values [cite: 422]
const G_TYPE: Readonly<SpectralTypeInfo> = { temp: 5770,  colour: '#FFFACD', char: GLYPHS.STAR_MEDIUM, brightness: 0.9, mass: 1.00 * SOLAR_MASS_KG, radius: 1.00 * SOLAR_RADIUS_M }; // G2V values (Sun) [cite: 422]
const K_TYPE: Readonly<SpectralTypeInfo> = { temp: 4440,  colour: '#FFC864', char: GLYPHS.STAR_DIM, brightness: 0.7, mass: 0.70 * SOLAR_MASS_KG, radius: 0.701 * SOLAR_RADIUS_M }; // K5V values [cite: 423]
const M_TYPE: Readonly<SpectralTypeInfo> = { temp: 3560,  colour: '#FF9A5A', char: GLYPHS.STAR_DIM, brightness: 0.5, mass: 0.44 * SOLAR_MASS_KG, radius: 0.446 * SOLAR_RADIUS_M }; // M2V values [cite: 424]

// --- Generate Interpolated Star Types ---
const generateSubTypes = (
    startType: SpectralTypeInfo,
    endType: SpectralTypeInfo,
    count: number, // Number of steps (e.g., 10 for F0-F9)
    baseTypeCode: string // e.g., 'F'
): Record<string, SpectralTypeInfo> => {
    const types: Record<string, SpectralTypeInfo> = {};
    const startRgb = hexToRgb(startType.colour);
    const endRgb = hexToRgb(endType.colour);

    for (let i = 0; i < count; i++) {
        const factor = i / count; // Interpolation factor (0 for start, close to 1 for end)
        const temp = lerp(startType.temp, endType.temp, factor);
        const brightness = lerp(startType.brightness, endType.brightness, factor);
        const mass = lerp(startType.mass, endType.mass, factor);
        const radius = lerp(startType.radius, endType.radius, factor);
        const colourRgb = interpolateRgb(startRgb, endRgb, factor);
        const colourHex = rgbToHex(colourRgb.r, colourRgb.g, colourRgb.b);
        const char = brightness > 0.8 ? GLYPHS.STAR_MEDIUM : GLYPHS.STAR_DIM;

        types[`${baseTypeCode}${i}V`] = { temp, colour: colourHex, char, brightness, mass, radius };
    }
    return types;
};

// --- Main SPECTRAL_TYPES Object ---
export const SPECTRAL_TYPES: Record<string, SpectralTypeInfo> = {
    // Original broad types (can be kept as defaults or removed if only subtypes used)
    'O': O_TYPE,
    'B': B_TYPE,
    'A': A_TYPE,
    'F': F_TYPE, // Represents F5V average
    'G': G_TYPE, // Represents G2V average (Sun)
    'K': K_TYPE, // Represents K5V average
    'M': M_TYPE, // Represents M2V average

    // --- NEW F Subtypes (F0V to F9V) ---
    ...generateSubTypes(
        { temp: 7200, colour: '#F0F5FF', char: GLYPHS.STAR_MEDIUM, brightness: 1.05, mass: 1.58 * SOLAR_MASS_KG, radius: 1.51 * SOLAR_RADIUS_M }, // F0V approx
        { temp: 5930, colour: '#FFFFE0', char: GLYPHS.STAR_MEDIUM, brightness: 0.95, mass: 1.06 * SOLAR_MASS_KG, radius: 1.11 * SOLAR_RADIUS_M }, // G0V approx
        10, 'F'
    ),

    // --- NEW G Subtypes (G0V to G9V) ---
    ...generateSubTypes(
        { temp: 5930, colour: '#FFFFE0', char: GLYPHS.STAR_MEDIUM, brightness: 0.95, mass: 1.06 * SOLAR_MASS_KG, radius: 1.11 * SOLAR_RADIUS_M }, // G0V approx
        { temp: 5250, colour: '#FFE4B5', char: GLYPHS.STAR_MEDIUM, brightness: 0.8, mass: 0.80 * SOLAR_MASS_KG, radius: 0.85 * SOLAR_RADIUS_M },  // K0V approx
        10, 'G'
    ),

    // --- NEW K Subtypes (K0V to K9V) ---
    ...generateSubTypes(
        { temp: 5250, colour: '#FFE4B5', char: GLYPHS.STAR_MEDIUM, brightness: 0.8, mass: 0.80 * SOLAR_MASS_KG, radius: 0.85 * SOLAR_RADIUS_M },  // K0V approx
        { temp: 3850, colour: '#FFB070', char: GLYPHS.STAR_DIM, brightness: 0.6, mass: 0.51 * SOLAR_MASS_KG, radius: 0.59 * SOLAR_RADIUS_M },    // M0V approx
        10, 'K'
    ),

    // --- NEW M Subtypes (M0V to M9V) ---
    ...generateSubTypes(
        { temp: 3850, colour: '#FFB070', char: GLYPHS.STAR_DIM, brightness: 0.6, mass: 0.51 * SOLAR_MASS_KG, radius: 0.59 * SOLAR_RADIUS_M },    // M0V approx
        { temp: 2300, colour: '#FF8040', char: GLYPHS.STAR_DIM, brightness: 0.2, mass: 0.08 * SOLAR_MASS_KG, radius: 0.10 * SOLAR_RADIUS_M },    // M9V approx (extrapolated)
        10, 'M'
    ),
};

// --- Spectral Distribution ---
// Keeping the original distribution for now: [cite: 426]
export const SPECTRAL_DISTRIBUTION: string[] = [
    'M', 'M', 'M', 'M', 'M', 'M', 'M', 'M', 'K', 'K', 'K', 'G', 'G', 'F', 'A', 'B', 'O'
];

// --- Planet Data ---
interface PlanetTypeInfo {
    terrainColours: string[]; // Array of hex colour strings [cite: 428]
    baseTemp: number; [cite: 429]
}

export const PLANET_TYPES: Record<string, PlanetTypeInfo> = {
    'Molten':   { terrainColours: ['#200000', '#401000', '#662000', '#993000', '#CC5000', '#FF8010', '#FFB030', '#FFE060', '#FFFF99'], baseTemp: 1500 },
    'Rock':     { terrainColours: ['#2b2b2b', '#404040', '#555555', '#6f6f6f', '#8a8a8a', '#a5a5a5', '#c0c0c0', '#dbdbdb', '#f6f6f6'], baseTemp: 300 },
    'Oceanic':  { terrainColours: ['#000020', '#001040', '#002060', '#003399', '#0050B2', '#3380CC', '#66B0FF', '#99D0FF', '#CCF0FF'], baseTemp: 280 },
    'Lunar':    { terrainColours: ['#303030', '#404040', '#505050', '#656565', '#7f7f7f', '#9a9a9a', '#b5b5b5', '#d0d0d0', '#ebebeb'], baseTemp: 250 },
    'GasGiant': { terrainColours: ['#6f3f1f', '#8B4513', '#A0522D', '#B86B42', '#CD853F', '#D2B48C', '#E8D8B8', '#F5EDE0', '#FFFFF0'], baseTemp: 150 }, // [cite: 430]
    'IceGiant': { terrainColours: ['#003060', '#004080', '#0050A0', '#0060C0', '#3377D0', '#6699E0', '#99BBF0', '#CCE6FF', '#E6F2FF'], baseTemp: 100 },
    'Frozen':   { terrainColours: ['#A0C0C0', '#C0D0D0', '#E0E8E8', '#F0F4F4', '#FFFFFF', '#F8F8F8', '#E8E8E8', '#D8D8D8', '#C8C8C8'], baseTemp: 50 }
};

// Could use an enum, but string array is simple enough for now. [cite: 431]
export const ATMOSPHERE_DENSITIES: string[] = ['None', 'Thin', 'Earth-like', 'Thick']; // [cite: 432]

export const ATMOSPHERE_GASES: string[] = [ // [cite: 7]
    // Original Gases
    'Hydrogen',         // H₂ - Diatomic Hydrogen [cite: 7]
    'Helium',           // He [cite: 7]
    'Nitrogen',         // N₂ [cite: 7]
    'Oxygen',           // O₂ [cite: 8]
    'Carbon Dioxide',   // CO₂ [cite: 8]
    'Argon',            // Ar [cite: 8]
    'Water Vapor',      // H₂O [cite: 8]
    'Methane',          // CH₄ [cite: 8]
    'Ammonia',          // NH₃ [cite: 8]
    'Neon',             // Ne [cite: 8]
    'Xenon',            // Xe [cite: 9]
    'Carbon Monoxide',  // CO [cite: 9]
    'Ethane',           // C₂H₆ [cite: 9]
    'Chlorine',         // Cl₂ [cite: 9]
    'Fluorine',         // F₂ [cite: 9]
    'Sulfur Dioxide',   // SO₂ [cite: 9]

    // New Gases (Added April 2025)
    'Atomic Hydrogen',    // H [cite: 13]
    'Hydrogen Cyanide', // HCN [cite: 14]
    'Formaldehyde',     // H₂CO [cite: 10, 14]
    'Hydrogen Sulfide', // H₂S [cite: 10, 15]
    'Silicon Monoxide', // SiO (Gas at high temps) [cite: 10, 15, 16]
    'Carbonyl Sulfide', // OCS [cite: 10, 16]
    'Acetylene',        // C₂H₂ [cite: 10, 17]
    'Methanol',         // CH₃OH [cite: 10, 18]
    'Formic Acid',      // HCOOH [cite: 10, 18, 19]
    'Silane',           // SiH₄ [cite: 10, 19]
    'Phosphine',        // PH₃ [cite: 10, 20]
    'Hydrogen Chloride',// HCl [cite: 11, 20, 21]
    'Nitric Oxide',     // NO [cite: 11, 21]
    'Nitrous Oxide',    // N₂O [cite: 11, 22]
    'Ozone',            // O₃ [cite: 11, 22, 23]
    'Sulfur Monoxide',  // SO [cite: 11, 23]
    'Silicon Dioxide',  // SiO₂ (Gas at very high temps) [cite: 11, 24]
    'Magnesium Oxide',  // MgO (Gas at very high temps) [cite: 11, 24, 25]
    'Iron Oxide',       // FeO (Gas at very high temps) [cite: 11, 25, 26]
    'Diatomic Carbon'   // C₂ [cite: 12, 26, 27]
];

// Interface for element properties [cite: 437]
export interface ElementInfo {
    name: string;
    symbol: string;       // Short symbol (e.g., Fe, Si, H2O) [cite: 438]
    description: string;  // Brief description
    baseValue: number;    // Base credits per unit [cite: 439]
    baseFrequency: number;// General rarity (higher = more common base chance) [cite: 440]
    typeHints: string[];  // Planet types where it might be more common (e.g., ['Rock', 'Molten']) [cite: 441]
    isGas: boolean;       // If the element is typically gaseous [cite: 442]
    meltingPoint: number; // Approximate melting point in Kelvin (Use low value like 0 or 1 for gases if specific MP irrelevant) [cite: 443]
    group: string;        // General classification (e.g., 'Metal', 'Silicate', 'Gas', 'Noble', 'Nonmetal', 'Ice', 'Actinide', 'Lanthanide', 'Metalloid') [cite: 444]
    atomicWeight: number; // Relative atomic weight (for gravity effect) [cite: 445]
}

// Define elements relevant to mining
export const ELEMENTS: Record<string, ElementInfo> = {
    // --- Abundant Base & Industrial Metals ---
    'IRON': {
        name: 'Iron', symbol: 'Fe', description: 'Core industrial metal for steel production.', baseValue: 3, baseFrequency: 1.0,
        typeHints: ['Rock', 'Molten', 'Lunar'], isGas: false, meltingPoint: 1811, group: 'Metal', atomicWeight: 55.8
    },
    'ALUMINIUM': {
        name: 'Aluminium', symbol: 'Al', description: 'Lightweight, corrosion-resistant metal.', baseValue: 4, baseFrequency: 0.8, // [cite: 446]
        typeHints: ['Rock', 'Lunar'], isGas: false, meltingPoint: 933, group: 'Metal', atomicWeight: 27.0
    },
    'SILICON': {
        name: 'Silicon', symbol: 'Si', description: 'Basis of rock and crucial for semiconductors.', baseValue: 2, baseFrequency: 1.0,
        typeHints: ['Rock', 'Lunar', 'Frozen'], isGas: false, meltingPoint: 1687, group: 'Silicate', atomicWeight: 28.1
    },
    'TITANIUM': {
        name: 'Titanium', symbol: 'Ti', description: 'Strong, light, corrosion-resistant metal.', baseValue: 10, baseFrequency: 0.3, // [cite: 447]
        typeHints: ['Rock', 'Molten', 'Lunar'], isGas: false, meltingPoint: 1941, group: 'Metal', atomicWeight: 47.9
    },
    'MAGNESIUM': {
        name: 'Magnesium', symbol: 'Mg', description: 'Very lightweight structural metal.', baseValue: 5, baseFrequency: 0.6,
        typeHints: ['Rock', 'Lunar', 'Oceanic'], isGas: false, meltingPoint: 923, group: 'Metal', atomicWeight: 24.3
    },
    'COPPER': {
        name: 'Copper', symbol: 'Cu', description: 'Excellent electrical conductor.', baseValue: 7, baseFrequency: 0.5,
        typeHints: ['Rock'], isGas: false, meltingPoint: 1358, group: 'Metal', atomicWeight: 63.5 // [cite: 448]
    },
    'ZINC': {
        name: 'Zinc', symbol: 'Zn', description: 'Used for galvanizing steel and in alloys.', baseValue: 6, baseFrequency: 0.45,
        typeHints: ['Rock'], isGas: false, meltingPoint: 693, group: 'Metal', atomicWeight: 65.4
    },
    'LEAD': {
        name: 'Lead', symbol: 'Pb', description: 'Dense metal used in batteries and shielding.', baseValue: 5, baseFrequency: 0.4,
        typeHints: ['Rock'], isGas: false, meltingPoint: 601, group: 'Metal', atomicWeight: 207.2 // [cite: 449]
    },
    'NICKEL': {
        name: 'Nickel', symbol: 'Ni', description: 'Key component in stainless steel and batteries.', baseValue: 8, baseFrequency: 0.35,
        typeHints: ['Rock', 'Molten'], isGas: false, meltingPoint: 1728, group: 'Metal', atomicWeight: 58.7
    },
    'TIN': {
        name: 'Tin', symbol: 'Sn', description: 'Used in solder and corrosion-resistant coatings.', baseValue: 9, baseFrequency: 0.3,
        typeHints: ['Rock'], isGas: false, meltingPoint: 505, group: 'Metal', atomicWeight: 118.7 // [cite: 450]
    },

    // --- Precious & Noble Metals ---
    'GOLD': {
        name: 'Gold', symbol: 'Au', description: 'Highly valuable, inert precious metal.', baseValue: 100, baseFrequency: 0.01,
        typeHints: ['Rock', 'Molten'], isGas: false, meltingPoint: 1337, group: 'Metal', atomicWeight: 197.0
    },
    'SILVER': {
        name: 'Silver', symbol: 'Ag', description: 'Precious metal with excellent conductivity.', baseValue: 20, baseFrequency: 0.05,
        typeHints: ['Rock', 'Molten'], isGas: false, meltingPoint: 1235, group: 'Metal', atomicWeight: 107.9 // [cite: 451]
    },
    'PLATINUM': {
        name: 'Platinum', symbol: 'Pt', description: 'Rare, valuable catalytic and jewelry metal.', baseValue: 80, baseFrequency: 0.008,
        typeHints: ['Molten', 'Rock'], isGas: false, meltingPoint: 2041, group: 'Metal', atomicWeight: 195.1
    },
    'PALLADIUM': {
        name: 'Palladium', symbol: 'Pd', description: 'Platinum-group metal used in catalysts.', baseValue: 70, baseFrequency: 0.007,
        typeHints: ['Molten', 'Rock'], isGas: false, meltingPoint: 1828, group: 'Metal', atomicWeight: 106.4 // [cite: 452]
    },
    'RHODIUM': {
        name: 'Rhodium', symbol: 'Rh', description: 'Extremely rare platinum-group metal.', baseValue: 150, baseFrequency: 0.001,
        typeHints: ['Molten'], isGas: false, meltingPoint: 2237, group: 'Metal', atomicWeight: 102.9
    },

    // --- Tech & Energy Metals ---
    'LITHIUM': {
        name: 'Lithium', symbol: 'Li', description: 'Light alkali metal crucial for batteries.', baseValue: 15, baseFrequency: 0.15,
        typeHints: ['Rock', 'Oceanic'], isGas: false, meltingPoint: 454, group: 'Metal', atomicWeight: 6.9 // [cite: 453]
    },
    'COBALT': {
        name: 'Cobalt', symbol: 'Co', description: 'Used in alloys and battery cathodes.', baseValue: 25, baseFrequency: 0.1,
        typeHints: ['Rock', 'Molten'], isGas: false, meltingPoint: 1768, group: 'Metal', atomicWeight: 58.9
    },
    'TUNGSTEN': {
        name: 'Tungsten', symbol: 'W', description: 'Metal with very high melting point.', baseValue: 18, baseFrequency: 0.12,
        typeHints: ['Molten', 'Rock'], isGas: false, meltingPoint: 3695, group: 'Metal', atomicWeight: 183.8 // [cite: 454]
    },
    'URANIUM': {
        name: 'Uranium', symbol: 'U', description: 'Heavy radioactive metal for nuclear fuel.', baseValue: 40, baseFrequency: 0.03,
        typeHints: ['Rock', 'Molten'], isGas: false, meltingPoint: 1405, group: 'Actinide', atomicWeight: 238.0
    },
    'THORIUM': {
        name: 'Thorium', symbol: 'Th', description: 'Radioactive metal, potential nuclear fuel.', baseValue: 30, baseFrequency: 0.04,
        typeHints: ['Rock', 'Molten', 'Lunar'], isGas: false, meltingPoint: 2023, group: 'Actinide', atomicWeight: 232.0 // [cite: 455]
    },
    'NEODYMIUM': {
        name: 'Neodymium', symbol: 'Nd', description: 'Rare earth element vital for strong magnets.', baseValue: 50, baseFrequency: 0.02,
        typeHints: ['Rock'], isGas: false, meltingPoint: 1297, group: 'Lanthanide', atomicWeight: 144.2
    },
    'DYSPROSIUM': {
        name: 'Dysprosium', symbol: 'Dy', description: 'Rare earth element for high-temp magnets.', baseValue: 60, baseFrequency: 0.015,
        typeHints: ['Rock'], isGas: false, meltingPoint: 1680, group: 'Lanthanide', atomicWeight: 162.5 // [cite: 456]
    },
    'GALLIUM': {
        name: 'Gallium', symbol: 'Ga', description: 'Metal used in semiconductors and alloys.', baseValue: 35, baseFrequency: 0.05,
        typeHints: ['Rock'], isGas: false, meltingPoint: 303, group: 'Metal', atomicWeight: 69.7
    },
    'GERMANIUM': {
        name: 'Germanium', symbol: 'Ge', description: 'Metalloid used in fiber/infrared optics.', baseValue: 45, baseFrequency: 0.04,
        typeHints: ['Rock'], isGas: false, meltingPoint: 1211, group: 'Metalloid', atomicWeight: 72.6 // [cite: 457]
    },
    'INDIUM': {
        name: 'Indium', symbol: 'In', description: 'Soft metal used for coatings and electrodes.', baseValue: 65, baseFrequency: 0.01,
        typeHints: ['Rock'], isGas: false, meltingPoint: 430, group: 'Metal', atomicWeight: 114.8
    },

    // --- Non-Metals & Others ---
    'CARBON': {
        name: 'Carbon', symbol: 'C', description: 'Basis of organic chemistry, found in rocks and ices.', baseValue: 5, baseFrequency: 0.6, // [cite: 458]
        typeHints: ['Rock', 'Frozen', 'Oceanic'], isGas: false, meltingPoint: 4000, group: 'Nonmetal', atomicWeight: 12.0 // Sublimates
    },
    'SULFUR': {
        name: 'Sulfur', symbol: 'S', description: 'Essential non-metal used in chemical production.', baseValue: 4, baseFrequency: 0.5,
        typeHints: ['Rock', 'Molten', 'Oceanic'], isGas: false, meltingPoint: 388, group: 'Nonmetal', atomicWeight: 32.1
    },
    'PHOSPHORUS': {
        name: 'Phosphorus', symbol: 'P', description: 'Non-metal essential for life, used in fertilizers.', baseValue: 3, baseFrequency: 0.4, // [cite: 459]
        typeHints: ['Rock', 'Oceanic'], isGas: false, meltingPoint: 317, group: 'Nonmetal', atomicWeight: 31.0
    },
    'POTASSIUM': {
        name: 'Potassium', symbol: 'K', description: 'Alkali metal (mined as potash) used in fertilizers.', baseValue: 3, baseFrequency: 0.7,
        typeHints: ['Rock', 'Oceanic'], isGas: false, meltingPoint: 337, group: 'Metal', atomicWeight: 39.1 // Alkali Metal
    },
    'BORON': {
        name: 'Boron', symbol: 'B', description: 'Metalloid used in glass and high-strength materials.', baseValue: 14, baseFrequency: 0.08, // [cite: 460]
        typeHints: ['Rock', 'Oceanic'], isGas: false, meltingPoint: 2349, group: 'Metalloid', atomicWeight: 10.8
    },

    // --- Gases & Ices ---
    'HYDROGEN': {
        name: 'Hydrogen', symbol: 'H', description: 'Lightest element, primary component of stars and gas giants.', baseValue: 1, baseFrequency: 0.9,
        typeHints: ['GasGiant'], isGas: true, meltingPoint: 14, group: 'Gas', atomicWeight: 1.0
    },
    'HELIUM': { // [cite: 461]
        name: 'Helium', symbol: 'He', description: 'Inert gas, found with Hydrogen, used in cryogenics.', baseValue: 12, baseFrequency: 0.7,
        typeHints: ['GasGiant', 'IceGiant', 'Lunar'], isGas: true, meltingPoint: 1, group: 'Noble', atomicWeight: 4.0 // Approx MP near 0K
    },
    'WATER_ICE': {
        name: 'Water Ice', symbol: 'H₂O', description: 'Frozen water, essential volatile.', baseValue: 1, baseFrequency: 0.6,
        typeHints: ['Frozen', 'IceGiant', 'Rock', 'Lunar'], isGas: false, meltingPoint: 273, group: 'Ice', atomicWeight: 18.0 // [cite: 462]
    },
    'AMMONIA_ICE': {
        name: 'Ammonia Ice', symbol: 'NH₃', description: 'Frozen ammonia, common in outer systems.', baseValue: 2, baseFrequency: 0.3,
        typeHints: ['Frozen', 'IceGiant'], isGas: false, meltingPoint: 195, group: 'Ice', atomicWeight: 17.0
    },
    'METHANE_ICE': {
        name: 'Methane Ice', symbol: 'CH₄', description: 'Frozen methane, very volatile.', baseValue: 2, baseFrequency: 0.2,
        typeHints: ['Frozen', 'IceGiant'], isGas: false, meltingPoint: 91, group: 'Ice', atomicWeight: 16.0
    }, // [cite: 463]

    // --- Additional Common Gases & Volatiles (Added April 2025) ---
    'ATOMIC_HYDROGEN': {
        name: 'Atomic Hydrogen', symbol: 'H', description: 'Single hydrogen atoms, prevalent in hot or ionized regions.', baseValue: 1, baseFrequency: 0.85, // Slightly less common than H2 overall but still abundant
        typeHints: ['GasGiant', 'Molten'], // Found near stars, in hot gas
        isGas: true, meltingPoint: 1, group: 'Gas', atomicWeight: 1.008
    }, // [cite: 13, 464]
    'HYDROGEN_CYANIDE': {
        name: 'Hydrogen Cyanide', symbol: 'HCN', description: 'A toxic but important prebiotic molecule found in molecular clouds.', baseValue: 15, baseFrequency: 0.08,
        typeHints: ['GasGiant', 'Frozen', 'Oceanic'], // Titan, comets, interstellar medium [cite: 14]
        isGas: true, meltingPoint: 260, group: 'Volatile', atomicWeight: 27.03 // Boiling Point ~299K
    },
    'FORMALDEHYDE': {
        name: 'Formaldehyde', symbol: 'H₂CO', description: 'An organic molecule, common in interstellar clouds and comets.', baseValue: 12, baseFrequency: 0.1, // [cite: 465]
        typeHints: ['GasGiant', 'Frozen'], // Interstellar medium, comets [cite: 14]
        isGas: true, meltingPoint: 181, group: 'Volatile', atomicWeight: 30.03 // Boiling Point ~254K
    },
    'HYDROGEN_SULFIDE': {
        name: 'Hydrogen Sulfide', symbol: 'H₂S', description: 'A toxic gas with a rotten egg smell, found in volcanic regions and some atmospheres.', baseValue: 6, baseFrequency: 0.25,
        typeHints: ['GasGiant', 'Rock', 'Molten'], // Volcanic activity, some giant planets [cite: 15]
        isGas: true, meltingPoint: 187, group: 'Volatile', atomicWeight: 34.08 // Boiling Point ~213K [cite: 466]
    },
    'SILICON_MONOXIDE': {
        name: 'Silicon Monoxide', symbol: 'SiO', description: 'Common in stellar outflows and protoplanetary disks, precursor to silicates.', baseValue: 8, baseFrequency: 0.3, // [cite: 16]
        typeHints: ['Molten', 'Rock'], // Stellar envelopes, accretion disks [cite: 16]
        isGas: true, meltingPoint: 1973, group: 'Oxide', atomicWeight: 44.09 // Boiling Point ~2123K (Gas at high temp)
    },
    'CARBONYL_SULFIDE': { // [cite: 467]
        name: 'Carbonyl Sulfide', symbol: 'OCS', description: 'A sulfur-containing gas found in volcanic emissions and interstellar clouds.', baseValue: 7, baseFrequency: 0.15,
        typeHints: ['GasGiant', 'Rock', 'Molten'], // Volcanic, interstellar [cite: 16]
        isGas: true, meltingPoint: 134, group: 'Volatile', atomicWeight: 60.08 // Boiling Point ~223K [cite: 17]
    },
    'ACETYLENE': {
        name: 'Acetylene', symbol: 'C₂H₂', description: 'A simple hydrocarbon found in giant planet atmospheres and carbon-rich stars.', baseValue: 5, baseFrequency: 0.2,
        typeHints: ['GasGiant', 'Frozen'], // Giant planets, carbon stars [cite: 17, 468]
        isGas: true, meltingPoint: 192, group: 'Hydrocarbon', atomicWeight: 26.04 // Sublimes
    },
    'METHANOL': {
        name: 'Methanol', symbol: 'CH₃OH', description: 'An alcohol found as ice in interstellar clouds and comets.', baseValue: 10, baseFrequency: 0.12, // [cite: 18]
        typeHints: ['Frozen', 'IceGiant'], // Interstellar ices, comets [cite: 18]
        isGas: true, meltingPoint: 175, group: 'Volatile', atomicWeight: 32.04 // Boiling Point ~338K
    },
    'FORMIC_ACID': { // [cite: 469]
        name: 'Formic Acid', symbol: 'HCOOH', description: 'The simplest carboxylic acid, detected in interstellar clouds.', baseValue: 14, baseFrequency: 0.07,
        typeHints: ['Frozen'], // Interstellar medium [cite: 18, 19]
        isGas: true, meltingPoint: 281, group: 'Volatile', atomicWeight: 46.03 // Boiling Point ~374K
    },
    'SILANE': {
        name: 'Silane', symbol: 'SiH₄', description: 'A silicon hydride, analogue of methane, found in some giant planet atmospheres.', baseValue: 18, baseFrequency: 0.05,
        typeHints: ['GasGiant'], // Jupiter, Saturn atmospheres [cite: 19, 470]
        isGas: true, meltingPoint: 88, group: 'Hydride', atomicWeight: 32.12 // Boiling Point ~161K
    },
    'PHOSPHINE': {
        name: 'Phosphine', symbol: 'PH₃', description: 'A phosphorus hydride, detected in atmospheres of Jupiter and Saturn.', baseValue: 22, baseFrequency: 0.03, // [cite: 20]
        typeHints: ['GasGiant'], // Jupiter, Saturn atmospheres [cite: 20]
        isGas: true, meltingPoint: 139, group: 'Hydride', atomicWeight: 34.00 // Boiling Point ~185K
    },
    'HYDROGEN_CHLORIDE': { // [cite: 471]
        name: 'Hydrogen Chloride', symbol: 'HCl', description: 'An acidic gas, potentially found in volcanic outgassing or specific atmospheric layers.', baseValue: 9, baseFrequency: 0.06,
        typeHints: ['Rock', 'Molten'], // Volcanic activity? Venus atmosphere trace. [cite: 21, 472]
        isGas: true, meltingPoint: 159, group: 'Acid', atomicWeight: 36.46 // Boiling Point ~188K
    },
    'NITRIC_OXIDE': {
        name: 'Nitric Oxide', symbol: 'NO', description: 'A reactive nitrogen oxide, can form in high-energy atmospheric processes.', baseValue: 8, baseFrequency: 0.1,
        typeHints: ['GasGiant', 'Rock'], // Lightning, upper atmospheres [cite: 21]
        isGas: true, meltingPoint: 109, group: 'Oxide', atomicWeight: 30.01 // Boiling Point ~121K
    },
    'NITROUS_OXIDE': { // [cite: 473]
        name: 'Nitrous Oxide', symbol: 'N₂O', description: 'A nitrogen oxide, trace component in some planetary atmospheres.', baseValue: 7, baseFrequency: 0.09,
        typeHints: ['Rock', 'Oceanic'], // Earth-like atmospheres (trace) [cite: 22]
        isGas: true, meltingPoint: 182, group: 'Oxide', atomicWeight: 44.01 // Boiling Point ~184K
    },
    'OZONE': {
        name: 'Ozone', symbol: 'O₃', description: 'An allotrope of oxygen, forms protective layers in some atmospheres.', baseValue: 11, baseFrequency: 0.07,
        typeHints: ['Rock', 'Oceanic'], // Earth-like atmospheres [cite: 23, 474]
        isGas: true, meltingPoint: 80, group: 'Gas', atomicWeight: 48.00 // Boiling Point ~161K
    },
    'SULFUR_MONOXIDE': {
        name: 'Sulfur Monoxide', symbol: 'SO', description: 'A reactive sulfur oxide, found in volcanic plumes and interstellar clouds.', baseValue: 9, baseFrequency: 0.11,
        typeHints: ['Molten', 'GasGiant'], // Volcanic (Io), interstellar [cite: 23]
        isGas: true, meltingPoint: 1, group: 'Oxide', atomicWeight: 48.06 // Unstable, use low MP [cite: 24]
    },
    'SILICON_DIOXIDE': { // [cite: 475]
        name: 'Silicon Dioxide', symbol: 'SiO₂', description: 'Primary component of silicates, gaseous only at extreme temperatures.', baseValue: 3, baseFrequency: 0.7, // Common as solid [cite: 24]
        typeHints: ['Molten', 'Rock'], // Everywhere as rock, gas near hot stars/events [cite: 24]
        isGas: true, meltingPoint: 1986, group: 'Silicate', atomicWeight: 60.08 // Boiling Point ~2503K (Gas at high temp)
    },
    'MAGNESIUM_OXIDE': {
        name: 'Magnesium Oxide', symbol: 'MgO', description: 'A refractory oxide, component of planetary mantles, gaseous at high temperatures.', baseValue: 4, baseFrequency: 0.6, // Common as solid [cite: 25, 476]
        typeHints: ['Molten', 'Rock'], // Mantles, gas near hot stars [cite: 25]
        isGas: true, meltingPoint: 3125, group: 'Oxide', atomicWeight: 40.30 // Boiling Point ~3873K (Gas at high temp)
    },
    'IRON_OXIDE': { // Assuming FeO
        name: 'Iron Oxide', symbol: 'FeO', description: 'Common iron oxide, component of rocky bodies, gaseous at high temperatures.', baseValue: 3, baseFrequency: 0.75, // Common as solid [cite: 26]
        typeHints: ['Molten', 'Rock', 'Lunar'], // Everywhere as rock/dust, gas near hot stars [cite: 26, 477]
        isGas: true, meltingPoint: 1650, group: 'Oxide', atomicWeight: 71.84 // Boiling Point ~3673K (Gas at high temp)
    },
    'DIATOMIC_CARBON': {
        name: 'Diatomic Carbon', symbol: 'C₂', description: 'A molecule found in carbon-rich stars, comets, and interstellar medium.', baseValue: 6, baseFrequency: 0.18,
        typeHints: ['GasGiant', 'Frozen'], // Carbon stars, comets, ISM [cite: 27]
        isGas: true, meltingPoint: 1, group: 'Gas', atomicWeight: 24.02 // Exists as gas, use low MP [cite: 27, 478]
    },
};

// --- User-Facing Messages --- [cite: 28, 479]
export const STATUS_MESSAGES = {
    // General
    ERROR_UNKNOWN_STATE: (state: string) => `<e>Error: Unknown game state ${state}</e>`,
    ERROR_DATA_MISSING: (dataType: string) => `<e>Error: ${dataType} data missing!</e>`,
    ACTION_CANNOT_PERFORM: (action: string, context: string) => `[-W-]Cannot perform ${action} while ${context}.</w>`,

    // Hyperspace
    HYPERSPACE_NO_STAR: "[-W-]No star system detected at this location.</w>",
    HYPERSPACE_ENTERING: (systemName: string | undefined) => `<h>--- Entering system: ${systemName} ---</h>`,
    HYPERSPACE_SCANNING_SYSTEM: (systemName: string) => `<h>--- Scanning star system ${systemName} ---</h>`, // [cite: 480]
    HYPERSPACE_SCAN_FAIL: "[-W-]Nothing nearby to scan.</w>", // [cite: 480]

    // System
    SYSTEM_LEAVE_TOO_CLOSE: "[-W-]Must travel further from the star to leave the system.</w>",
    SYSTEM_LEAVING: "<h>Entered hyperspace.</h>",
    SYSTEM_LAND_APPROACHING: (targetName: string) => `<h>Approaching ${targetName}...</h>`,
    SYSTEM_LAND_FAIL_NO_TARGET: "[-W-]Nothing nearby to land on.</w>",
    SYSTEM_SCAN_STAR: (systemName: string) => `<h>--- Scanning local star (${systemName}) ---</h>`,
    SYSTEM_SCAN_OBJECT: (objectName: string) => `<h>--- Scanning ${objectName} ---</h>`,
    SYSTEM_SCAN_FAIL_NO_TARGET: "[-W-]Nothing close enough to scan.</w>",

    // Planet
    LIFTOFF_SUCCESS: (targetName: string) => `<h>Liftoff from ${targetName} successful.</h>`, // [cite: 481]
    LIFTOFF_FAIL: "[-W-]Liftoff failed.</w>", // [cite: 481]
    PLANET_SCAN_COMPLETE: (planetName: string, resource: string | null, richness: string) => `<h>${planetName} scan complete.</h> Primary: <hl>${resource || 'N/A'}.</hl> Richness: <hl>${richness}.</hl>`, // [cite: 482, 483]
    PLANET_SCAN_ALREADY: (planetName: string, richness: string) => `${planetName} has already been scanned. (${richness})`, // [cite: 484]
    PLANET_SCAN_REQUIRED: (richness: string) => `[-W-]Scan required before mining. Richness potential: ${richness}.</w>`, // [cite: 485]
    PLANET_MINE_INVALID_TYPE: (planetType: string) => `[-W-]Cannot mine surface of ${planetType}.</w>`,
    PLANET_MINE_SUCCESS: (amount: number, unitName: string, current: number, capacity: number) => `Mined ${amount} units of ${unitName}. (${current}/${capacity})`, // [cite: 486]
    PLANET_MINE_CARGO_FULL: (current: number, capacity: number) => `[-W-]Mining failed: Cargo hold full. (${current}/${capacity})</w>`, // [cite: 487]
    PLANET_MINE_NO_ELEMENTS: "Found no mineable elements at this location.",
    PLANET_MINE_TRACE: (elementName: string) => `Trace amounts of ${elementName} found, but not enough to mine.`,
    PLANET_MINE_DEPLETED: "This location has already been mined.",

    // Starbase - Note that starbase does not use terminal overlay and hence doesn't have styling 'tags'
    STARBASE_TRADE_EMPTY: "Cargo hold is empty. Nothing to sell.",
    STARBASE_TRADE_SUCCESS: (itemsString: string, units: number, credits: number) => `Sold ${itemsString} (${units} units) for ${credits} Cr.`,
    STARBASE_REFUEL_FULL: "Fuel tank is already full.", // [cite: 488]
    STARBASE_REFUEL_SUCCESS: (amount: number, cost: number) => `Purchased ${amount} fuel for ${cost} Cr.`,
    STARBASE_REFUEL_FAIL_CREDITS: (costPerUnit: number, currentCredits: number) => `Not enough credits for fuel (Need ${costPerUnit.toFixed(1)} Cr/unit). Have ${currentCredits} Cr.`, // [cite: 489]

    // Errors
    ERROR_ACTION: (errorMessage: string) => `<e>ACTION ERROR: ${errorMessage}</e>`,
    ERROR_UPDATE: (errorMessage: string) => `<e>UPDATE ERROR: ${errorMessage}</e>`,
    ERROR_RENDER: (errorMessage: string) => `<e>RENDER ERROR: ${errorMessage}</e>`,
    ERROR_SURFACE_PREP: (errorMessage: string) => `<e>Surface Error: ${errorMessage}</e>`,
    ERROR_LANDING: (targetName: string, errorMessage: string) => `<e>Landing Error on ${targetName}: ${errorMessage}</e>`,
    ERROR_MINING: (errorMessage: string) => `<e>Mining Error: ${errorMessage}</e>`,

} as const;