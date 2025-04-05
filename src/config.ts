// src/config.ts (Added DOWNLOAD_LOG binding)

// Basic types for configuration values - can be expanded later if needed
// We are letting TypeScript infer most types here for simplicity during the initial port.
export const CONFIG = {
    // --- Core Settings ---
    SEED: "haunting beauty",
    LOG_LEVEL: 'DEBUG', // Set to DEBUG to capture more detail during testing, INFO for release
    TARGET_RESOLUTION_WIDTH: 1920, // Target reference width (scaling not fully implemented based on this yet)

    // --- Font & Display ---
    CHAR_ASPECT_RATIO: 1.0, // Explicitly 1.0 for square characters assumed by logic
    CHAR_SCALE: 2, // Scales the base font size
    FONT_SIZE_PX: 8, // Base size in pixels
    FONT_FAMILY: '"Courier New", Courier, monospace', //

    // --- Player / Start ---
    PLAYER_START_X: 0, // Initial world X
    PLAYER_START_Y: 0, // Initial world Y
    PLAYER_CHAR: '@',
    PLAYER_COLOR: '#00FF00',
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
        // Optional diagonal keys (map multiple keys in InputManager later)
        // MOVE_UP_LEFT: 'Home',
        // MOVE_UP_RIGHT: 'PageUp',
        // MOVE_DOWN_LEFT: 'End', //
        // MOVE_DOWN_RIGHT: 'PageDown',
        // Actions
        ENTER_SYSTEM: 'Enter', // Or 'e' etc.
        LEAVE_SYSTEM: 'Backspace', // Or 'h' etc.
        LAND: 'l', // Landing - Lowercase L
        LIFTOFF: 'l', // Liftoff (same key often used) - Lowercase L
        SCAN: 'v', // Lowercase v
        MINE: 'm', // Lowercase m //
        TRADE: 't', // Lowercase t
        REFUEL: 'r', // Lowercase r
        DOWNLOAD_LOG: 'p', // <<< Added key binding for log download ('p')
        QUIT: 'Escape',
        // Modifiers (Need special handling in InputManager)
        // FINE_CONTROL: 'Shift',
    },

    // --- Planet Surface ---
    PLANET_MAP_BASE_SIZE: 256, // Target size for heightmap generation (actual will be power of 2 + 1)
    // PLANET_MAP_DETAIL_SCALE: 1.0, // Controls zoom level on surface (not currently used) //
    PLANET_SURFACE_ROUGHNESS: 0.7, // Diamond-Square roughness factor
    PLANET_HEIGHT_LEVELS: 256, // Number of distinct altitude levels/colors
    MINING_RATE_FACTOR: 5, // Base number of minerals mined per action (scales with richness)

    // --- Hyperspace Generation ---
    STAR_DENSITY: 0.008, // Approximate fraction of cells containing a star check
    STAR_CHECK_HASH_SCALE: 10000, // Divisor for hash check
    NEBULA_SCALE: 0.05, // Perlin noise scale for nebulae
    NEBULA_INTENSITY: 0.8, // How much nebula colour affects background (0-1)
    NEBULA_COLORS: [ // Base colours for nebula interpolation //
        { r: 60, g: 20, b: 70 },
        { r: 20, g: 50, b: 80 },
        { r: 90, g: 30, b: 30 },
    ],
    NEBULA_CACHE_PRECISION: 1, // Decimal places for Perlin noise cache keys
    CELL_BLOCK_SIZE: 3, // Optimization: Draw background in blocks (reduces Perlin calls)

    // --- System View ---
    SYSTEM_VIEW_SCALE: 1000, // World units per character cell in system view //
    SYSTEM_EDGE_RADIUS_FACTOR: 1.5, // How much bigger the system edge is than the outermost object
    MAX_PLANETS_PER_SYSTEM: 9,
    PLANET_MAIN_VIEW_RADIUS: 3, // Character radius for planets/starbases in main view
    MINIMAP_SIZE_FACTOR: 0.15, // Fraction of screen width for minimap
    STARBASE_PROBABILITY: 0.03, // Chance a system has a starbase
    STARBASE_ORBIT_DISTANCE: 75000, // Base orbit distance for starbases

    // --- Colours --- (Using Australian spelling based on user preference)
    DEFAULT_BG_COLOR: '#000000',
    DEFAULT_FG_COLOR: '#FFFFFF',
    STATUS_BAR_FG_COLOR: '#FFA500', //
    STATUS_BAR_BG_COLOR: '#000000', //
    ORBIT_COLOR_MAIN: '#777777',
    ORBIT_COLOR_MINIMAP: '#444444',
    STARBASE_COLOR: '#00FFFF', // Colour for starbase icon, orbit, interior highlight
};