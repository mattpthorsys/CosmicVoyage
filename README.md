# Cosmic Voyage

Cosmic Voyage is a browser-based TypeScript space exploration game with a sparse CGA terminal style. It is built around procedural astronomy, quiet instrument panels, and the feeling of travelling through a very large and mostly indifferent universe.

The project is under active development. Systems are playable, but mechanics, balance, screens, and data models are still evolving.

## Current Game

You command a small fusion-powered vessel through several scales of space:

- Interstellar travel through a deterministic starfield with nebulae, brown dwarfs, rare deep-space phenomena, free planetary-mass objects, and subtle overlay instrumentation.
- Planetary system travel with generated stars, binaries/trinaries, planets, moons, starbases, orbital paths, target selection, approach assist, zoom, and bottom command menus.
- Orbital operations around planets, including a rotating ASCII globe, moon selection, scan summary, landing-map cursor, and coordinate-based landing.
- Planet surface travel using a terrain vehicle with fuel, cargo, mining, surface scan cursor, map view, icon legend, crew status, and return-to-ship navigation.
- Starbase operations with section menus, scrollable tables, cargo review, buy/sell/refuel services, notices, missions, shipyard, crew hiring, and training.
- Ship operations outside starbase/orbit, including cargo, crew, ship status, jettison prompts, and the ship-as-place compartment view.

The game favours deterministic procedural generation. Given the same seed and coordinates, stars, systems, planet properties, surfaces, resources, starbases, and mission boards should remain stable rather than changing with scan or travel order.

## Scientific Simulation

The simulation aims for plausible science rather than arcade space fantasy:

- Star generation includes main sequence stars, binary/trinary systems, brown dwarfs, rare neutron stars and black holes, and rare starless/local-frame objects.
- Planet frequencies, types, moon counts, orbital velocities, densities, gravities, temperatures, axial tilt, tidal locking, and tidal heating are modelled from simplified astrophysical rules.
- Planet classes include rocky, molten, lunar, oceanic, frozen, gas giant, ice giant, Hycean, greenhouse, carbon-rich, chthonian, cryovolcanic, and dwarf ice worlds.
- Atmosphere, hydrosphere, lithosphere, temperature range, greenhouse effect, albedo, core heat, tidal flexing, and age all feed into scan descriptions and surface generation.
- Surfaces use type-aware terrain generation: bands and turbulence for giants, craters where erosion permits, ice fractures, cryovolcanic domes, carbon dunes, volcanic rifts, oceanic ridges, and specialist palettes.
- Nebula rendering is restrained and astronomical: emission, reflection, dark cloud, planetary, and remnant structures blend softly into black space.
- Resources are biased by planetary type, stellar metallicity, volatile availability, and realistic element associations. Deuterium can be mined in plausible locations; helium-3 is primarily purchased at starbases.

## Interface

Cosmic Voyage is keyboard-first, but newer screens use reusable text UI controls and bottom command menus so available actions are visible.

Common controls:

- `Arrow keys`: move ship, cursor, menu selection, or terrain vehicle depending on mode.
- `Numpad 1/3/7/9`: diagonal interstellar movement with NumLock off.
- `Enter` / `Space`: select, confirm, or perform the recommended/current action.
- `Esc`: cancel menus, popups, targeting, orbit, or command movement where applicable.
- `Tab`: recommended action / cycle target depending on context.
- `?`: help reference.
- `o`: ship operations.
- `n`: navigation target menu.
- `s`: scan or observe current space contact.
- `v`: surface scan.
- `m`: mine on the surface.
- `l`: orbit, dock, launch, or depart where context allows.
- `a`: approach selected target automatically.
- `=` / `-`: zoom system view.
- `F3`: performance profiler.

Travel command strips:

- Interstellar: Move, Scan, Operations, Observe, with a green Enter System button when available.
- Planetary: Move, Scan, Operations, Observe, Targets, with a green Orbit/Dock/Leave button when available.
- Surface: Map, Move, Cargo, Mine, Scan, Icon, with a green Embark button only when parked at the ship.

Starbase screens use arrows, Page Up/Page Down, Left/Right section changes, Enter to use a row, and Escape or `l` to leave/cancel where appropriate.

## Visual Style

The visual style is documented in [STYLE_GUIDE.md](STYLE_GUIDE.md). In short:

- black space baseline;
- CGA-era square-grid typography;
- restrained cyan, green, amber, and red signal colours;
- dim overlays and instrument-like panels;
- minimal animation used for scanning, cursor focus, orbital rotation, and starbase indicators.

## Project Structure

Key folders:

- `src/core`: game loop, state transitions, input handling, command menus, ship/crew/orbit/starbase UI models, missions, and high-level gameplay orchestration.
- `src/entities`: generated stars, planets, systems, starbases, planetary physics, atmosphere, temperature, resources, and surface generation.
- `src/generation`: deterministic PRNG/noise and system data generation.
- `src/rendering`: canvas grid renderer, scene renderer, overlays, nebulae, starfields, status bars, and command strip rendering.
- `src/systems`: cargo, mining, and movement logic.
- `src/tests`: Vitest suites grouped by gameplay domain.
- `src/assets/fonts`: CGA and DOS-style bitmap fonts used by the renderer.

See [ARCHITECTURE.md](ARCHITECTURE.md) for a chart-style overview of how the code works.

## Requirements

- Node.js 20.5.1 or compatible
- npm 9.8.0 or compatible

The repository uses Volta metadata in `package.json` to pin the preferred Node version.

## Setup

```bash
npm install
```

## Run

```bash
npm run dev
```

Open the local Vite URL shown in the terminal, usually `http://localhost:5173`.

## Build

```bash
npm run build
```

To preview the production build:

```bash
npm run preview
```

## Tests

Run the full suite:

```bash
npm run test:run
```

Useful focused groups:

```bash
npm run test:surface
npm run test:ship
npm run test:navigation
npm run test:interface
npm run test:people
npm run test:entities
npm run test:planetary
npm run test:stellar
npm run test:generation
npm run test:systems
npm run test:rendering
npm run test:utils
```

The test grouping is described in [src/tests/README.md](src/tests/README.md). Rendering tests include visual-signature snapshots for important ASCII screens.

## Development Notes

- `src/config.ts` contains tuning values, key bindings, travel scales, terrain vehicle limits, and procedural generation constants.
- `src/constants.ts` contains glyphs, planet type palettes, atmosphere/resource metadata, and shared astronomical constants.
- `GameStateManager` owns mode transitions between hyperspace, system, orbit, planet, and starbase.
- `Game` coordinates the loop, current UI mode, contextual actions, command bars, popups, surface vehicle state, starbase rows, and renderer calls.
- `SystemDataGenerator` keeps interstellar generation deterministic and caches system/contact properties.
- `ScreenBuffer` stages character cells and supports sub-cell scaled glyphs for high-detail orbital and map views.
- `SceneRenderer` draws the major game screens; `RendererFacade` connects renderer updates to game events and DOM status/command bars.

## Status

Cosmic Voyage is playable but unfinished. The codebase currently emphasizes deterministic generation, scientific plausibility, readable terminal UI, and test coverage for systems that have recently been made more complex.
