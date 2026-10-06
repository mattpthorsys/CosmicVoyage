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

- hyperspace and system records contain world coordinates and the projected
  system slot;
- orbit and planet records require stable body and orbit-reference paths;
- starbase records require the station identity.

Do not reintroduce independent flags such as `atStarbase` or nullable body paths
shared by every state. Save parsing validates nested player, mission, discovery,
planet mutation, and economy state before restoration. Schema changes require a
new save version and an explicit migration from the previous version.

Save version 18 records Galaxy generation version 8 and adds independent tow,
infrastructure, and bulk-time watermark records. Version-17 voyages migrate
with empty haul/world ledgers and no purchased crew hypersleep or coupler;
biological stasis is preserved. Actual haul travel and world commissioning are
not yet enabled. See [heavy-haul foundations](../heavy-haul-foundations.md).

Historically, save version 9 recorded Galaxy generation version 5. Version-eight and
version-seven coordinates remain unchanged during migration; version-six saves
are rotated and rescaled onto the one-light-year, north-up coordinate system.
Planet mutation keys include the slot so dense projected cells cannot alias one
another; incompatible generated local records are deliberately retired during
a Galaxy-model migration.

## Input

`InputManager` maps `KeyboardEvent.key` and numpad codes to actions from
`CONFIG.KEY_BINDINGS`.

- Held actions drive continuous movement where appropriate.
- `justPressedActions` drives discrete menus, surface steps, and confirmations.
- Browser defaults are prevented for recognized gameplay keys.

The documented playtest shortcut is `Shift` held through `K`, `Y`, `R`, with a
three-second timeout between letters. `InputManager` consumes the sequence and
emits the discrete `TEST_CREDITS` action. `Game` handles it before modal input,
adds `CONFIG.TEST_CREDIT_GRANT` to normal credits, and publishes the usual credit
and status notifications. Partial sequences reset on Shift release or input
reset and are never saved. No gameplay key binding or save field is needed.

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
- Galaxy map.

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

Every starbase accepts recognized mined elements and trade substances, even
when they were not initially stocked. The station pays half its displayed
resale price; sold material becomes persistent local stock and can subsequently
be bought back. Unrecognized cargo must remain aboard rather than being silently
discarded by bulk sale.

Crew and equipment are operational systems rather than descriptive ratings:

- astroscience and the fitted survey suite improve scan confidence;
- geology and the survey suite improve extraction throughput;
- navigation and engineering reduce hyperspace fuel use;
- trade and communication improve station buy and sell prices;
- engine class, cargo pods, damage, shields, weapons, and survey-suite class
  continue to alter their corresponding ship capabilities.

Keep these effects bounded and visible in the relevant instrument or menu.

Major starbases and automated depots share the landable station entity but not
their capabilities. A major starbase always references a completed terraformed
world. Automated depots are uncrewed, stock fewer goods, provide only basic
repair, and expose no missions, crew, or shipyard panels.

## Galaxy Map

The Galaxy map is a modal instrument, not a sixth physical location. `G` opens
it, arrows pan, `+/-` zoom, `Home` recentres, and `G` or `Esc` closes it. It
pauses simulation without changing the active `GameState` or saved location.
Screen-up is coreward Galactic north, and Sol/player start below the core.

The local navigation target table marks complete terraformed worlds as
`COLONY` and partial projects as `T-FORM` in its `HAB` column. These are direct
domain-state indicators and must remain visible without requiring a scan.

## Surface

Surface operation depends on explicit planet surface data, rover deployment,
fuel, cargo, and nearby deposits. Surface X wraps; Y clamps at the poles.
Movement, drawing, mining, scanning, habitat distance and ship bearings share
this topology. Out-of-range polar terrain is not painted from the other hemisphere.

Biological habitats are nested surface encounters, not another `GameState`.
`B` selects habitats in orbit or enters a nearby habitat with a deployed rover.
An active field suspends accelerated world time; successful commands advance
the persisted local clock and bounded actors. `SurfaceEncounterController`
owns interaction modes and opens `xenobiology` in `InterfaceModeController`
for menus/dossiers. See [xenobiology](../xenobiology.md).

Surface generation uses a single worker with a bounded queue. Predictive work
must go through `SurfacePrefetchService`, which serializes requests so newer
moon previews do not supersede older queued work. System approach warms the
target planet and first two moons; orbital selection warms nearby bodies. Once
surface preparation completes, the renderer schedules any giant-world orbital
texture during browser idle time rather than generating weather in the frame
loop.

Mining yield is derived from stable planet and coordinate seeds. Extraction
order must not alter deposits elsewhere.

## Status And Time

The simulated clock advances rapidly during travel and pauses in modal
interfaces and starbase. Orbit continues unless a modal pauses it.

System zoom affects view scale and simulation/cursor speed through
`system_zoom.ts`. Use its canonical helpers rather than duplicating zoom math.
