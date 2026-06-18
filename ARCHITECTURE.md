# Cosmic Voyage Code Architecture

This document is a chart-style overview of how the current codebase fits together. It is intended as a quick orientation map before editing gameplay, rendering, generation, or tests.

## Runtime Flow

```text
Browser
  |
  v
src/main.ts
  |
  v
Game
  |
  +-- Mode controllers
  |     travel, orbit, surface,
  |     starbase, ship operations
  |     own transient interaction state
  |
  +-- GameModeDispatcher
  |     routes active-state update work
  |
  +-- InputManager ----------------------+
  |     reads KeyboardEvent.key          |
  |     tracks active actions            |
  |                                      |
  +-- GameStateManager                   |
  |     owns current mode/context        |
  |     hyperspace/system/orbit/planet/  |
  |     starbase transitions             |
  |                                      |
  +-- ActionProcessor                    |
  |     handles high-level action intent |
  |                                      |
  +-- Player                             |
  |     position, resources, cargo,      |
  |     terrain vehicle, crew            |
  |                                      |
  +-- SystemDataGenerator                |
  |     deterministic star/system data   |
  |                                      |
  +-- SolarSystem / Planet / Starbase    |
  |     generated world model            |
  |                                      |
  +-- Systems                            |
  |     movement, cargo, mining          |
  |                                      |
  +-- UI model builders                  |
  |     orbit_ui, starbase_ui,           |
  |     ship_place, command_bar,         |
  |     text_ui, quantity_selector       |
  |                                      |
  +-- RendererFacade                     |
        |
        +-- SceneRenderer
        |     coordinates scene drawing
        |
        +-- scenes/GiantAtmosphereRenderer
        |     deterministic bands, storms,
        |     cloud streaks and ribbons
        |
        +-- ScreenBuffer
        |     character cell staging,
        |     diff/full canvas rendering,
        |     scaled sub-cell glyphs
        |
        +-- DrawingContext
        |     boxes, lines, orbit arcs
        |
        +-- AstrometricOverlay
        |     thin-font scan/HUD labels
        |
        +-- NebulaRenderer / Starfield
        |     restrained space backdrop
        |
        +-- StatusBarUpdater /
            CommandStripUpdater
              DOM status and bottom menus
```

## State Chart

```text
                   Enter system
  +-------------+  on stellar/contact   +----------+
  | Hyperspace  | --------------------> | System   |
  +-------------+                       +----------+
        ^                                  |   |
        |                                  |   | close to starbase
        | Leave near edge                  |   v
        |                                  | +----------+
        +----------------------------------+ | Starbase |
                                             +----------+
                                                ^   |
                                                |   | depart
                                                +---+

  System
    |
    | close to planet / planemo
    v
  +--------+  choose landing site  +--------+
  | Orbit  | --------------------> | Planet |
  +--------+                       +--------+
      ^                                |
      | launch / break orbit           | launch
      +--------------------------------+
```

Important state owners:

- `GameStateManager` changes the actual mode and current object references.
- Mode controllers in `core/modes/game_mode_controllers.ts` own travel, orbit, surface, starbase, and ship-operation interaction state.
- `Game` coordinates the loop, shared modal controls, controller actions, and transitions.
- `Player.position` stores world, system, and surface coordinates. Direction of interstellar entry influences system-entry placement.

## Generation Pipeline

```text
World coordinates + seed
  |
  v
SystemDataGenerator
  |
  +-- fast hash / PRNG checks
  |     star, brown dwarf, planemo,
  |     rare phenomena, starbase markers
  |
  +-- SolarSystem
        |
        +-- Stellar environment
        |     star class, mass, luminosity,
        |     age, metallicity, binaries
        |
        +-- Planet selection
        |     type frequency by flux,
        |     orbit, star type, metallicity
        |
        +-- Planet physical model
        |     diameter, density, gravity,
        |     rotation, tilt, tidal locking
        |
        +-- Atmosphere / temperature
        |     retention, pressure, albedo,
        |     greenhouse, core heat,
        |     tidal heating, min/max/current
        |
        +-- Moons
        |     realistic counts, locking,
        |     tidal heat, orbital velocity
        |
        +-- Surface and resources
              heightmap, colour map,
              deposits, craters, bands,
              volatile/metallicity bias
```

Determinism rule:

- Generation should depend on seed, coordinates, stable object identity, and physical inputs.
- It should not depend on scan order, player action order, render timing, or menu navigation.

## Rendering Pipeline

```text
Game tick
  |
  v
Game chooses screen by GameState
  |
  v
RendererFacade
  |
  v
SceneRenderer draws into ScreenBuffer
  |
  +-- normal grid cells
  +-- scaled glyph layer for high-detail panels
  +-- text tables / modal boxes
  |
  v
ScreenBuffer renderDiff or renderFull
  |
  v
Canvas
  |
  +-- TerminalOverlay / AstrometricOverlay
  +-- DOM status bar / command strip
```

Rendering conventions:

- Use `ScreenBuffer.drawChar` and `drawString` for normal terminal cells.
- Use `ScreenBuffer.drawScaledChar` only where sub-cell detail is needed, such as orbital globes and landing maps.
- Keep major UI surfaces in `SceneRenderer`; keep reusable table/menu data shapes in `core/text_ui.ts`, `core/starbase_ui.ts`, `core/command_bar.ts`, and related model builders.
- Keep colours and glyphs aligned with `STYLE_GUIDE.md`, `src/config.ts`, and `src/constants.ts`.

## Constant Domains

Production modules import constants from focused entry points:

```text
src/constants
  physics.ts    physical and astronomical units
  visual.ts     CGA glyph definitions
  stellar.ts    spectral data
  planetary.ts planet and atmosphere definitions
  resources.ts mineral and element data
  trade.ts      station commodities
  messages.ts   user-facing status messages
```

`src/constants.ts` remains a compatibility catalogue while data definitions are migrated incrementally. New code should use the focused domain entry points.

## Input And UI Flow

```text
KeyboardEvent
  |
  v
InputManager
  |
  v
Game update/handler
  |
  +-- active popup/menu? handle locally
  |
  +-- command strip selecting? move selection or activate
  |
  +-- state-specific handler
        hyperspace movement / observe / enter
        system movement / target / orbit / dock
        orbit body select / landing cursor
        planet surface / terrain vehicle
        starbase table and sections
```

Reusable UI pieces:

- `text_ui.ts`: table, section, scrollbar, and modal structures.
- `quantity_selector.ts`: buy/sell/jettison/mine quantity control.
- `command_bar.ts`: bottom command strip buttons and tones.
- `available_actions.ts`: contextual action discovery.
- `help_reference.ts`: current help panel content.

## Core Data Objects

```text
Player
  position
  render glyph
  resources: credits, fuel
  ship cargo hold
  terrain vehicle: fuel, cargo, deployed/on-foot/available
  crew

CrewMember
  hit points, durability
  role, skills, skill caps
  experience and training points

SolarSystem
  stars and stellar environment
  planets and moons
  starbase, if present
  local scale/orbit data

Planet
  physical properties
  orbit and rotation
  atmosphere/hydrosphere/lithosphere
  temperatures
  resources and deposits
  heightmap/colour/surface element maps
  moons

Starbase
  name, services, market/mission/recruit context
```

## Test Map

```text
src/tests
  |
  +-- core
  |     interface, navigation, people,
  |     ship, surface
  |
  +-- entities
  |     planetary, stellar
  |
  +-- generation
  |     noise and map/system generation
  |
  +-- rendering
  |     buffers, overlays, nebulae,
  |     starfields, visual signatures
  |
  +-- systems
  |     cargo and mining
  |
  +-- utils
        hash, PRNG, distance formatting
```

Use the grouped npm scripts in `package.json` and described in `src/tests/README.md` when working in one domain. Run `npm run test:run` before considering broad gameplay or generation changes complete.

## Change Guidelines

- Preserve determinism unless a feature explicitly requires stateful randomness.
- Keep player-facing UI discoverable through command strips, help, or table footers.
- Put reusable menu/table/control data in `src/core` rather than embedding one-off behaviour in render code.
- Let render code draw models; avoid making it own gameplay decisions.
- Keep scientific rules close to the relevant planet/star generator modules.
- Add focused tests near the affected domain, then run the relevant grouped suite.
