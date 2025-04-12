// src/config.ts (Added DOWNLOAD_LOG binding)

// Basic types for configuration values - can be expanded later if needed
// We are letting TypeScript infer most types here for simplicity during the initial port.
export const CONFIG = {
    // --- Core Settings ---
    SEED: "haunting beauty",
    LOG_LEVEL: 'INFO', // Set to DEBUG to capture more detail during testing, INFO for release
    TARGET_RESOLUTION_WIDTH: 1920, // Target reference width (scaling not fully implemented based on this yet)

    // --- Font & Display ---
    CHAR_ASPECT_RATIO: 1.0, // Explicitly 1.0 for square characters assumed by logic
    CHAR_SCALE: 2, // Scales the base font size
    FONT_SIZE_PX: 8, // Base size in pixels
    FONT_FAMILY: '"PxPlus_IBM_CGA", "Courier New", Courier, monospace',

    // --- Player / Start ---
    PLAYER_START_X: 0, // Initial world X
    PLAYER_START_Y: 0, // Initial world Y
    PLAYER_CHAR: '@',
    PLAYER_COLOUR: '#00A0A0',
    INITIAL_FUEL: 500,
    MAX_FUEL: 500,
    INITIAL_CARGO_CAPACITY: 100,
    INITIAL_CREDITS: 1000,

    // --- Movement / Physics ---
    SYSTEM_MOVE_INCREMENT: 5000, // World units per input step in system view (adjust for speed)
    SYSTEM_ORBIT_SPEED_FACTOR: 0.01, // How fast planets orbit (higher is faster)
    LANDING_DISTANCE: 30000, // Max distance from planet/starbase center to allow landing action prompt //
    FINE_CONTROL_FACTOR: 0.1, // Speed reduction factor for fine movement (e.g., holding Shift)
    BOOST_FACTOR: 5.0, // Multiplier for speed when boosting

    // --- Fuel & Economy ---
    HYPERSPACE_FUEL_COST: 10, // Fuel cost to jump between systems (Currently applies on entry)
    SYSTEM_MOVE_FUEL_COST: 0.0, // Fuel cost per move update within a system (Set > 0 to enable)
    FUEL_PER_CREDIT: 10, // Units of fuel bought per credit at starbase
    MINERAL_SELL_PRICE: 5, // Credits received per unit of mineral sold


    // --- Input Keys --- (Using KeyboardEvent.key values - Case sensitive!)
    KEY_BINDINGS: {
        MOVE_UP: 'ArrowUp',
        MOVE_DOWN: 'ArrowDown',
        MOVE_LEFT: 'ArrowLeft',
        MOVE_RIGHT: 'ArrowRight',
        ENTER_SYSTEM: 'Enter',
        LEAVE_SYSTEM: 'Backspace',
        // Assign 'l' to a single, representative action name
        ACTIVATE_LAND_LIFTOFF: 'l',
        SCAN: 'v',
        MINE: 'm',
        TRADE: 't',
        REFUEL: 'r',
        DOWNLOAD_LOG: 'p',
        QUIT: 'Escape',
    },

    // --- Planet Surface ---
    PLANET_MAP_BASE_SIZE: 256, // Target size for heightmap generation (actual will be power of 2 + 1)
    // PLANET_MAP_DETAIL_SCALE: 1.0, // Controls zoom level on surface (not currently used) //
    PLANET_SURFACE_ROUGHNESS: 0.7, // Diamond-Square roughness factor
    PLANET_HEIGHT_LEVELS: 256, // Number of distinct altitude levels/colours
    MINING_RATE_FACTOR: 5, // Base number of minerals mined per action (scales with richness)

    // --- Hyperspace Generation ---
    STAR_DENSITY: 0.008, // Approximate fraction of cells containing a star check
    STAR_CHECK_HASH_SCALE: 10000, // Divisor for hash check
    NEBULA_SCALE: 0.05, // Perlin noise scale for nebulae
    NEBULA_INTENSITY: 1, // How much nebula colour affects background (0-1)
    NEBULA_SPARSITY: 0.4
    , // Probability of a nebula pixel being black (0-1)
    NEBULA_COLOURS: [ // Base colours for nebula interpolation //
        { r: 90, g: 0, b: 70 },
        { r: 0, g: 10, b: 90 },
        { r: 0, g: 80, b: 10 },
    ],
    NEBULA_CACHE_PRECISION: 2, // Decimal places for Perlin noise cache keys
    CELL_BLOCK_SIZE: 1, // Optimization: Draw background in blocks (reduces Perlin calls)

    // --- System View ---
    SYSTEM_VIEW_SCALE: 1000, // World units per character cell in system view //
    SYSTEM_EDGE_RADIUS_FACTOR: 1.5, // How much bigger the system edge is than the outermost object
    MAX_PLANETS_PER_SYSTEM: 9,
    PLANET_MAIN_VIEW_RADIUS: 3, // Character radius for planets/starbases in main view
    MINIMAP_SIZE_FACTOR: 0.15, // Fraction of screen width for minimap
    STARBASE_PROBABILITY: 0.2, // Chance a system has a starbase
    STARBASE_ORBIT_DISTANCE: 75000, // Base orbit distance for starbases

    // --- Colours --- (Using Australian spelling based on user preference)
    DEFAULT_BG_COLOUR: '#000000',
    DEFAULT_FG_COLOUR: '#FFFFFF',
    STATUS_BAR_FG_COLOUR: '#FFA500', //
    STATUS_BAR_BG_COLOUR: '#000000', //
    ORBIT_COLOUR_MAIN: '#777777',
    ORBIT_COLOUR_MINIMAP: '#444444',
    STARBASE_COLOUR: '#00FFFF', // Colour for starbase icon, orbit, interior highlight
    TRANSPARENT_COLOUR: '#FFFFFF00'
};