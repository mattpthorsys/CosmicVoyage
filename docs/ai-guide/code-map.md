# Code Map

Use this file to find the likely owner of a change before searching globally.

## Entry And Configuration

- `src/main.ts`: provider registration and browser startup.
- `src/config.ts`: tuning, key bindings, display settings, gameplay limits.
- `src/constants/`: focused physical, visual, planetary, resource, trade, and
  message constants.
- `src/constants.ts`: compatibility catalogue; prefer focused constant modules
  in new code.

## Core Runtime

- `src/core/game.ts`: frame loop and remaining high-level orchestration.
- `src/core/game_state_manager.ts`: world-location transitions.
- `src/core/action_processor.ts`: translates high-level input actions.
- `src/core/input_manager.ts`: keyboard state and action mapping.
- `src/core/event_manager.ts`: typed event contracts and event delivery.
- `src/core/player.ts`: player-owned components and crew progression hooks.
- `src/core/components.ts`: position, resources, render, cargo, and rover data.

## Focused Controllers And Services

- `src/core/modes/game_mode_controllers.ts`: travel, orbit, surface, ship, modal
  state, and mode dispatch.
- `src/core/starbase_controller.ts`: starbase UI state and screen composition.
- `src/core/starbase_commerce.ts`: deterministic markets, trading, and refuel.
- `src/core/system_zoom.ts`: canonical system zoom levels and speed factors.
- `src/core/hyperspace_survey.ts`: survey models and contact lookup.
- `src/core/mission_board.ts`: deterministic notices and missions.
- `src/core/mission_progress.ts`: multi-stage objective progress and station
  hand-in state.
- `src/core/discovery.ts`: ordered knowledge levels and discovery helpers.
- `src/core/scan_service.ts`: planetary and catalogue discovery progression.
- `src/core/surface_prefetch.ts`: serialized predictive preparation for orbital
  planet and moon rendering data.
- `src/core/save_game.ts`: versioned save schema, strict runtime validation,
  discriminated location snapshots, and migrations.
- `src/core/game_state_manager.ts`: transition authority and typed active
  location invariants.
- `src/core/operational_capabilities.ts`: bounded crew and equipment modifiers
  shared by scanning, travel, mining, and trade.
- `src/core/starbase_commerce.ts`: persistent station stock, skilled pricing,
  buying, selling, and refueling.
- `src/core/crew.ts`: crew generation, skills, experience, and training.
- `src/core/ship_modifications.ts`: ship modules, derived statistics, upgrades.

## Reusable UI Models

- `src/core/text_ui.ts`: rows, tables, menus, scrolling helpers.
- `src/core/command_bar.ts`: bottom command-bar models.
- `src/core/available_actions.ts`: contextual actions.
- `src/core/quantity_selector.ts`: numeric transfer controls.
- `src/core/orbit_ui.ts`: orbit screen model.
- `src/core/starbase_ui.ts`: starbase table model.
- `src/core/ship_place.ts`: ship compartments and stations.
- `src/core/ship_status_dashboard.ts`: ship instrumentation model.
- `src/core/help_reference.ts`: help content.

## Entities And Generation

- `src/entities/solar_system.ts`: system, stars, planets, moons, orbital setup.
- `src/entities/planet.ts`: planet data, scan state, mined state, surface cache.
- `src/entities/starbase.ts`: starbase entity and placeholder interior surface.
- `src/entities/stellar_body.ts`: star and orbit-host data.
- `src/entities/stellar_environment.ts`: stellar age and metallicity.
- `src/entities/planet/`: physical, atmosphere, temperature, resources,
  descriptors, surfaces, liquid overlays, and worker providers.
- `src/generation/system_data_generator.ts`: deterministic map-cell systems,
  phenomena, interstellar medium, and architecture.
- `src/generation/perlin.ts`, `src/generation/heightmap.ts`: noise primitives.

## Systems

- `src/systems/movement_system.ts`: hyperspace, system, and surface movement.
- `src/systems/cargo_systems.ts`: cargo capacity and transfer primitives.
- `src/systems/mining_system.ts`: mining options, extraction, and depletion.

## Rendering

- `src/rendering/renderer_facade.ts`: canvas/DOM setup and renderer coordination.
- `src/rendering/scene_view_model.ts`: immutable scene union and player snapshot.
- `src/rendering/scene_renderer.ts`: major scene and table drawing.
- `src/rendering/screen_buffer.ts`: staged cells and full/diff canvas rendering.
- `src/rendering/drawing_context.ts`: boxes, lines, arcs, and drawing helpers.
- `src/rendering/astrometric_overlay.ts`: direct-canvas scan instrumentation.
- `src/rendering/terminal_overlay.ts`: typed/fading terminal messages.
- `src/rendering/nebula_renderer.ts`: sparse nebula field.
- `src/rendering/scenes/giant_atmosphere_renderer.ts`: giant-world bands,
  storms, and cloud texture.
- `src/rendering/text_palette.ts`: semantic UI colours.

## Tests

Tests mirror source domains under `src/tests`. Add tests to the narrowest
matching domain. Prefer direct tests of controllers/services over constructing
partial `Game` objects.
