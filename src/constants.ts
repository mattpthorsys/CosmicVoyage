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
    color: string;
    char: string; // Explicitly allow any of the star glyphs
    brightness: number;
}

// Use Record<string, T> for dictionary-like objects with string keys
export const SPECTRAL_TYPES: Record<string, SpectralTypeInfo> = {
    'O': { temp: 40000, color: '#6A8DFF', char: GLYPHS.STAR_BRIGHT, brightness: 1.5 },
    'B': { temp: 20000, color: '#8FABFF', char: GLYPHS.STAR_BRIGHT, brightness: 1.3 },
    'A': { temp: 8500,  color: '#DDE5FF', char: GLYPHS.STAR_MEDIUM, brightness: 1.1 },
    'F': { temp: 6500,  color: '#FFFFFF', char: GLYPHS.STAR_MEDIUM, brightness: 1.0 },
    'G': { temp: 5500,  color: '#FFFACD', char: GLYPHS.STAR_MEDIUM, brightness: 0.9 },
    'K': { temp: 4500,  color: '#FFC864', char: GLYPHS.STAR_DIM,   brightness: 0.7 },
    'M': { temp: 3000,  color: '#FF9A5A', char: GLYPHS.STAR_DIM,   brightness: 0.5 },
};

// Define the keys explicitly for type safety if needed, though string[] works fine.
export const SPECTRAL_DISTRIBUTION: string[] = [
    'M', 'M', 'M', 'M', 'M', 'M', 'M', 'M', 'K', 'K', 'K', 'G', 'G', 'F', 'A', 'B', 'O'
];


// --- Planet Data ---
interface PlanetTypeInfo {
    colors: string[]; // Array of hex color strings
    baseTemp: number;
}

export const PLANET_TYPES: Record<string, PlanetTypeInfo> = {
    'Molten':   { colors: ['#200000', '#401000', '#662000', '#993000', '#CC5000', '#FF8010', '#FFB030', '#FFE060', '#FFFF99'], baseTemp: 1500 },
    'Rock':     { colors: ['#2b2b2b', '#404040', '#555555', '#6f6f6f', '#8a8a8a', '#a5a5a5', '#c0c0c0', '#dbdbdb', '#f6f6f6'], baseTemp: 300 },
    'Oceanic':  { colors: ['#000020', '#001040', '#002060', '#003399', '#0050B2', '#3380CC', '#66B0FF', '#99D0FF', '#CCF0FF'], baseTemp: 280 },
    'Lunar':    { colors: ['#303030', '#404040', '#505050', '#656565', '#7f7f7f', '#9a9a9a', '#b5b5b5', '#d0d0d0', '#ebebeb'], baseTemp: 250 },
    'GasGiant': { colors: ['#6f3f1f', '#8B4513', '#A0522D', '#B86B42', '#CD853F', '#D2B48C', '#E8D8B8', '#F5EDE0', '#FFFFF0'], baseTemp: 150 },
    'IceGiant': { colors: ['#003060', '#004080', '#0050A0', '#0060C0', '#3377D0', '#6699E0', '#99BBF0', '#CCE6FF', '#E6F2FF'], baseTemp: 100 },
    'Frozen':   { colors: ['#A0C0C0', '#C0D0D0', '#E0E8E8', '#F0F4F4', '#FFFFFF', '#F8F8F8', '#E8E8E8', '#D8D8D8', '#C8C8C8'], baseTemp: 50 }
};

// Could use an enum, but string array is simple enough for now.
export const ATMOSPHERE_DENSITIES: string[] = ['None', 'Thin', 'Earth-like', 'Thick'];

export const ATMOSPHERE_GASES: string[] = [
    'Hydrogen', 'Helium', 'Nitrogen', 'Oxygen', 'Carbon Dioxide', 'Argon',
    'Water Vapor', 'Methane', 'Ammonia', 'Neon', 'Xenon', 'Carbon Monoxide',
    'Ethane', 'Chlorine', 'Fluorine', 'Sulfur Dioxide'
];