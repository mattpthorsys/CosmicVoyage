# Heavy-Haul Gameplay And Verification

M4-M5 implementation and automated verification are complete. The current
browser smoke covers launch, Operations, and the empty manifest at desktop and
narrow widths. It does not replace the full contract playthrough described below.
The subsequent Yes/No dialogs and voyage presentation have regression coverage
written; their automated and browser verification is awaiting the Luna stage.

## First Local Contract

1. Dock at the starting hub's staffed port, not an automated depot. In Shipyard, buy a class-1
   external tow coupler (600 Cr). The normal class-1 drive handles the small
   local buoy job; it does not normally require crew hypersleep.
2. Open Missions and select **Local navigation buoy transfer**. Enter opens
   the terminal manifest. Read mass, escrow, route, duration and certification.
   A key during the reveal only finishes the text. Enter opens a **Yes / No**
   acceptance popup; **Y** accepts, **N** or **Escape** cancels, and Enter uses
   the highlighted choice. Missing equipment or unsafe fuel produces a refusal
   instead of accepting an unusable job.
3. Escape returns to the station. Undock with the station's departure control.
   Open **O -> Heavy-Haul Manifest**, or **J -> select the haul -> Enter**.
4. In the manifest, **N** selects the current-stage contact and starts approach
   assist when undocked in its actual system. At pickup, reopen the manifest and
   select **Couple** and confirm **Yes**. The sealed contractor tank attaches with
   the external package; neither occupies internal cargo space.
5. Select **Begin voyage** and confirm **Yes**. A local transfer starts near pickup;
   a remote transfer must start at the departure boundary. The quoted calendar
   time passes immediately, support fuel is recorded once and normal fuel is
   preserved. Required crew hypersleep is announced before a short fade out/in.
   **Enter** skips the visual transition without cancelling the voyage. A paused
   arrival popup reports the destination, elapsed time, dates and fuel use.
   Acknowledge it to return to the manifest for final approach.
6. Use **N** to approach the deployment contact. Reopen the manifest and confirm
   **Deploy**, then **Yes**. Commissioning releases the package and tank, creates
   the permanent installation and credits escrow at the destination. A separate
   **TOW DELIVERED** popup confirms where it was deployed and how much was paid.
   No issuer return is needed.
7. Leave and revisit, or save/reload. The buoy remains selectable and scannable.
   The manifest can also show the most recent voyage receipt after settlement.

## Remote And Depot Jobs

- A regional buoy uses at least a class-1 drive/coupler; deep-range relays need
  a class-2 drive. Its duration usually makes
  hypersleep necessary; a three-person living crew needs three functional berths.
- A logistics depot needs at least a class-2 drive/coupler and appropriate berths.
  Shipyard equipment, available bays and damage determine whether the fit is valid.
- After coupling a remote tow, **N** approaches the fixed departure-boundary
  waypoint. Reopen the manifest there to confirm transit.
- Outside the selected endpoint's actual system, **N** marks its interstellar
  coordinates. It never approaches an unrelated local object at those coordinates.
- A commissioned depot is a real station alongside any natural station. Select
  and dock there for trade, reactor fuel, and basic hull/rover repair. It has no
  crew office, research department, mission office or full equipment refits.
- Its initial reactor refill allowance is free, capped by remaining allowance and
  normal tank capacity. It cannot be sold, moved to cargo or reset by docking again.
  Later refuelling follows normal station rules.
- **C** requests contractor recovery. **Y** confirms; **N** or **Escape** cancels the
  confirmation. Recovery removes the package/support, pays nothing and permanently
  retires that offer. This is the escape hatch for an inconvenient haul.
- **Up/Down** scroll, **Page Up/Page Down** page, and **Escape** returns to the
  parent menu. The bottom command strip supports the same actions by clicking.
- For playtesting funds, hold **Shift** through **K, Y, R** to add 10,000 Cr.
- Ordinary mission-board contracts also use the **Yes / No** acceptance popup.
  Dialogs pause time, preserve the parent selection, support scrolling, and
  expose the same choices as clickable bottom commands.

## Station Variety And Longer Routes

- The starting hub retains a generous board and its starter local tow when safe
  orbital geometry exists. Other ports specialise in survey, research or
  logistics, offering at most four or five new jobs across those categories.
  Accepted contracts remain visible regardless of that offer budget.
- Local buoy work is occasional elsewhere, not guaranteed at every port. Regional
  routes span roughly 35-140 light-years; long-range routes span 450-1,800
  light-years. Ports have different seeded package masses and route mixes, with
  logistics depots as well as navigation relays. Offers do not reroll on reopening.
- Destination searches remain bounded. Sparse regions or unsuitable deployment
  geometry may yield fewer jobs; the board never invents an unreachable star.
  Contractor support and the normal-fuel route back to the issuer are certified
  before an offer is shown, and checked again against the actual ship on acceptance.
- Remote deployment saves a navigation mark back to the issuing port, including
  across reloads. The delivery popup confirms it. **N / Route home** in the settled
  manifest marks that route; in the source system it approaches the issuing port.
  Return travel is optional and untowed, not another instant tow voyage. Escrow
  is paid at deployment; there is no second payment for going home.
- Previously accepted hauls retain their original distance, mass and payment.
  New offers use the updated generator; accepting an old offer does not convert
  it into a long-range job.

## Precise Local Approach

Select a planet, moon or station with navigation, then engage **A / Approach**.
The final movement step closes to 50,000 km for stations and small contacts,
or three planetary radii for larger bodies, without overshooting. **L / Orbit**
or docking uses that selected body even if its parent or a neighbour is closer.
An out-of-range selection does not silently substitute another object. A moon
opens its own orbital view while retaining its parent as the local-space reference.

The station-variety, longer-route and precise-approach changes have regression
coverage prepared but have not yet undergone the Luna verification pass.

## Verification Gate

### Automated And Browser Results (2026-10-06)

- `npm run check` passed, including lint, formatting, both typechecks, all 1,071
  tests across 146 files, and the production build. The build retains Vite's
  warning about the ~987 kB minified main bundle.
- Headless Chrome opened the real game, Operations, and the haul manifest at
  desktop and 390px viewport widths. Both fonts rendered, the paused manifest
  suppressed travel telemetry, and there were no JavaScript errors.
- Not yet personally exercised end-to-end in browser: accepting and completing
  local/remote contracts, commissioning infrastructure, and save/reload while
  docked at a deployed depot. Playwright is not installed in this environment.

The subsequent confirmation and voyage-feedback changes are not included in
those baseline results. Their new dialog, input, transition, mission-acceptance,
voyage-checkpoint, and rendering regression suites are ready for Luna verification.

Start with focused tests:

```sh
npm run test:run -- src/tests/core/navigation/heavy_haul_commissioning.test.ts src/tests/core/navigation/infrastructure_registry.test.ts src/tests/core/navigation/heavy_haul_offers.test.ts src/tests/core/navigation/heavy_haul_gameplay.test.ts src/tests/core/interface/haul_manifest.test.ts src/tests/rendering/haul_manifest_renderer.test.ts
npm run check
```

Additional focused presentation coverage:

```sh
npm run test:run -- src/tests/core/interface/terminal_dialog.test.ts src/tests/core/interface/screen_transition.test.ts src/tests/core/interface/mission_dialogs.test.ts src/tests/core/interface/mission_dialog_integration.test.ts src/tests/core/interface/input_manager.test.ts src/tests/core/navigation/haul_presentation.test.ts src/tests/rendering/terminal_dialog_renderer.test.ts
```

The full check must include the existing haul journey/service, save migrations,
station commerce, repairs, mission journal, observatory, ordinary travel,
biology and graphics regression suites. Resolve failures according to actual
behaviour; do not loosen assertions merely to accept new drawing output.

Browser walkthroughs should cover:

- Yes/No acceptance on ordinary and haul missions, cancellation restoring the
  parent screen, repeat-key protection, and keyboard/clickable choices.
- Hypersleep preparation, fade out/in and skip, persistent arrival acknowledgement,
  reduced-motion mode, final delivery/payment acknowledgement, and checkpoint failure.
- Starter local job from the real starting staffed port, not only fixture worlds.
- Missing coupler and insufficient-berth refusal, then a properly equipped job.
- Long remote transit with exactly one time jump, protected normal fuel and a
  paused arrival receipt; duplicate departure/settlement must not pay or jump time.
- Final approach, deployment, automatic escrow, navigation buoy scan, depot trade,
  restricted free refill, basic repair, departure and re-entry.
- Save/reload at pickup, attached at source, arrived at destination and docked
  inside a deployed depot. Confirm phases, station identity and market stock persist.
- Keyboard and clickable controls at desktop and narrow viewports; terminal text,
  confirmation warnings and bottom commands must not overlap underlying graphics.
- Failure of the session checkpoint: acceptance, transit, deployment, refilling
  and recovery must leave all live owners unchanged.

Repair-only depots intentionally cannot fix damaged drive/coupler/hypersleep
equipment. Certification should direct the player to a staffed shipyard, not
silently provide a full refit through the basic repair-all command.
