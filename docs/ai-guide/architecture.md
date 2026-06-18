# Architecture

## Runtime Composition

```text
main.ts
  |
  +-- installs worker-backed providers
  |
  v
Game
  |
  +-- InputManager
  +-- GameStateManager
  +-- ActionProcessor
  +-- Player
  +-- MovementSystem / MiningSystem / CargoSystem
  +-- focused feature controllers and services
  +-- SystemDataGenerator / HyperspaceSurveyService
  +-- RendererFacade
        |
        +-- SceneRenderer
        +-- ScreenBuffer / DrawingContext
        +-- NebulaRenderer
        +-- status and command-strip DOM updaters
```

`main.ts` installs worker providers before constructing `Game`. Tests may use
synchronous providers, so provider interfaces must preserve identical inputs
and outputs.

## Responsibility Layers

### Domain and generation

`src/entities`, `src/generation`, and most of `src/constants` describe the
generated universe and its physical properties.

Domain code should not depend on browser DOM elements, canvas contexts, command
bars, or terminal overlays. A small amount of rendering colour data is still
shared with planet surfaces; avoid adding further reverse dependencies.

### Application and gameplay

`src/core` and `src/systems` coordinate player actions and mutate game state.

Preferred components:

- Controllers own transient interaction state and navigation.
- Services implement cohesive business rules and return explicit results.
- Systems mutate a narrow gameplay domain such as movement, cargo, or mining.
- Model builders convert gameplay state into readonly UI data.
- `Game` wires components together, runs the frame loop, and publishes effects.

### Presentation

`src/rendering` turns prepared models into character cells, direct canvas
overlays, or DOM status controls.

Rendering code must not decide whether an action succeeds, charge credits,
generate mission outcomes, or mutate player progression.

## State Ownership

- `GameStateManager` owns the active world location and current system/body.
- `TravelModeController`, `OrbitModeController`, and `SurfaceModeController`
  own mode-specific transient interaction state.
- `StarbaseController` owns starbase panel, selection, scrolling, and alert
  state.
- `ShipOperationsController` owns ship-menu state.
- `InterfaceModeController` guarantees that only one modal interface is active.
- `Player` owns resources, position, ship, cargo, rover, and crew.

Do not duplicate state in two owners. Transitional aliases in `Game` exist for
older tests and should be removed as tests migrate to direct component usage.

## Events

`src/core/event_manager.ts` defines a typed synchronous event map.

Use events for notifications that genuinely cross component boundaries. Prefer
direct method calls for request/response workflows where the caller needs the
result immediately.

Subscriptions return an idempotent disposer:

```ts
const unsubscribe = eventManager.subscribe(GameEvents.PLAYER_FUEL_CHANGED, payload => {
  // React to the typed notification.
});

unsubscribe();
```

Store and invoke disposers during component destruction. Never subscribe and
unsubscribe using separate `bind(this)` expressions.

## Rendering Boundary

`Game` creates a discriminated `SceneViewModel`. Player values are copied into
an immutable `PlayerViewSnapshot` so rendering observes one coherent frame.

```text
mutable gameplay state
  -> readonly scene model
  -> RendererFacade
  -> SceneRenderer
  -> ScreenBuffer
  -> Canvas
```

Continue moving scene-specific preparation out of render methods and into model
builders or presenters.

## Known Architectural Debt

- `Game` is still large and contains several feature domains.
- `SceneRenderer` still coordinates many unrelated scenes.
- Some entity getters trigger synchronous surface generation.
- Some tests use prototype-based `Game` harnesses and `any`.
- The current location model can represent invalid combinations of state and
  nullable object references.

Improve these incrementally with focused, behavior-preserving extractions.
