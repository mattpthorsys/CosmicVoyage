# Gameplay And State

## Location State

The active location is represented by `GameState`:

```ts
type GameState = 'hyperspace' | 'system' | 'orbit' | 'planet' | 'starbase';
```

`GameStateManager` owns transitions and current object references. Call its
transition methods rather than assigning location fields externally.

`GameStateManager.location` exposes the active context as a discriminated
union. Code that needs coherent mode-specific context should prefer it over
reading several nullable getters independently. It fails immediately if an
internal state invariant has been broken.

Important transitions:

```text
hyperspace -> system
system -> hyperspace
system -> orbit
system -> starbase
orbit -> system
orbit -> planet
planet -> orbit
starbase -> system
```

State changes publish both previous and new state. Transition-dependent cleanup
must use that payload rather than inspecting already-mutated state.

Save locations use a separate discriminated union:

- hyperspace and system records contain only world coordinates;
- orbit and planet records require stable body and orbit-reference paths;
- starbase records require the station identity.

Do not reintroduce independent flags such as `atStarbase` or nullable body paths
shared by every state. Save parsing validates nested player, mission, discovery,
planet mutation, and economy state before restoration. Schema changes require a
new save version and an explicit migration from the previous version.

## Input

`InputManager` maps `KeyboardEvent.key` and numpad codes to actions from
`CONFIG.KEY_BINDINGS`.

- Held actions drive continuous movement where appropriate.
- `justPressedActions` drives discrete menus, surface steps, and confirmations.
- Browser defaults are prevented for recognized gameplay keys.

Do not add hidden controls. Update command bars, footers, and help content when
adding actions.

## Modal Interfaces

Only one modal interface may be active. `InterfaceModeController` stores a
discriminated union covering:

- help or scan popup;
- target menu;
- ship menu;
- rover cargo;
- surface legend;
- quantity selector;
- extraction selector;
- jettison confirmation.

Opening a modal replaces the previous one. New modal types must be added to the
union and integrated into input, rendering, pause behavior, and tests.

## Player State

`Player` owns:

- world, system, and surface position;
- render glyph and facing;
- credits and reactor fuel;
- ship modifications and cargo;
- rover state and cargo;
- crew.

Mutations should go through the relevant system or service when one exists.
Publish typed effects after successful mutations so status and presentation can
react.

## Starbase

- `StarbaseController` owns section and table interaction state.
- `StarbaseCommerceService` owns market and refueling rules.
- `mission_board.ts` owns deterministic mission definitions and formatting.
- `MissionProgressService` owns accepted contracts, per-objective progress,
  ready-for-return state, and station hand-in.
- `crew.ts` owns recruitment and training.
- `ship_modifications.ts` owns upgrades and derived ship statistics.
- `Game` currently delegates and publishes resulting effects.

Mission rewards are not granted remotely. Discovery completes typed objectives;
the finished telemetry must be returned to the issuing starbase and explicitly
handed in before credits and final crew experience are awarded.

Station markets are persistent state. Buying reduces local stock and selling
returns stocked commodities to that station; this state must be included in
saves rather than regenerated after every transaction.

Crew and equipment are operational systems rather than descriptive ratings:

- astroscience and the fitted survey suite improve scan confidence;
- geology and the survey suite improve extraction throughput;
- navigation and engineering reduce hyperspace fuel use;
- trade and communication improve station buy and sell prices;
- engine class, cargo pods, damage, shields, weapons, and survey-suite class
  continue to alter their corresponding ship capabilities.

Keep these effects bounded and visible in the relevant instrument or menu.

## Surface

Surface operation depends on explicit planet surface data, rover deployment,
fuel, cargo, and nearby deposits. Surface X wraps; latitude-like Y behavior must
be checked before changing movement because some generators and views treat it
differently.

Mining yield is derived from stable planet and coordinate seeds. Extraction
order must not alter deposits elsewhere.

## Status And Time

The simulated clock advances rapidly during travel and pauses in modal
interfaces and starbase. Orbit continues unless a modal pauses it.

System zoom affects view scale and simulation/cursor speed through
`system_zoom.ts`. Use its canonical helpers rather than duplicating zoom math.
