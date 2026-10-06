# Heavy-Haul Gameplay And Verification

M4-M5 implementation is committed. Automated checks and browser walkthroughs
are pending the requested Luna verification stage; this guide describes the
implemented controls, not a claim that those checks have passed.

## First Local Contract

1. Dock at a staffed port, not an automated depot. In Shipyard, buy a class-1
   external tow coupler (600 Cr). The normal class-1 drive handles the small
   local buoy job; it does not normally require crew hypersleep.
2. Open Missions and select **Local navigation buoy transfer**. Enter opens
   the terminal manifest. Read mass, escrow, route, duration and certification.
   A key during the reveal only finishes the text. Enter once arms acceptance;
   Enter again confirms. Missing equipment or unsafe fuel produces a refusal
   instead of accepting an unusable job.
3. Escape returns to the station. Undock with the station's departure control.
   Open **O -> Heavy-Haul Manifest**, or **J -> select the haul -> Enter**.
4. In the manifest, **N** selects the current-stage contact and starts approach
   assist when undocked in its actual system. At pickup, reopen the manifest and
   confirm **Couple** with Enter twice. The sealed contractor tank attaches with
   the external package; neither occupies internal cargo space.
5. Confirm **Begin voyage** with Enter twice. A local transfer starts near pickup;
   a remote transfer must start at the departure boundary. The quoted calendar
   time passes immediately, support fuel is recorded once and normal fuel is
   preserved. Arrival opens a paused receipt.
6. Use **N** to approach the deployment contact. Reopen the manifest and confirm
   **Deploy**. Commissioning releases the package and tank, creates the permanent
   installation and credits escrow at the destination. No issuer return is needed.
7. Leave and revisit, or save/reload. The buoy remains selectable and scannable.
   The manifest can also show the most recent voyage receipt after settlement.

## Remote And Depot Jobs

- A remote buoy uses at least a class-1 drive/coupler. Its duration usually makes
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
- **C** requests contractor recovery. **Enter** confirms; **Escape** cancels the
  confirmation. Recovery removes the package/support, pays nothing and permanently
  retires that offer. This is the escape hatch for an inconvenient haul.
- **Up/Down** scroll, **Page Up/Page Down** page, and **Escape** returns to the
  parent menu. The bottom command strip supports the same actions by clicking.
- For playtesting funds, hold **Shift** through **K, Y, R** to add 10,000 Cr.

## Verification Gate

Start with focused tests:

```sh
npm run test:run -- src/tests/core/navigation/heavy_haul_commissioning.test.ts src/tests/core/navigation/infrastructure_registry.test.ts src/tests/core/navigation/heavy_haul_offers.test.ts src/tests/core/navigation/heavy_haul_gameplay.test.ts src/tests/core/interface/haul_manifest.test.ts src/tests/rendering/haul_manifest_renderer.test.ts
npm run check
```

The full check must include the existing haul journey/service, save migrations,
station commerce, repairs, mission journal, observatory, ordinary travel,
biology and graphics regression suites. Resolve failures according to actual
behaviour; do not loosen assertions merely to accept new drawing output.

Browser walkthroughs should cover:

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
