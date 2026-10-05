# Heavy-Haul Foundations

M0-M2 build rules, lifecycle, fitting, and persistence only. Production haul
offers remain unavailable until journey execution and useful commissioning are
implemented in M3-M5. No real-time towing physics or cargo-mass overhaul is
part of these foundations.

## Integration Inventory

- `MovementSystem` owns discrete hyperspace steps and system cursor movement;
  `Game.updateApproachAssist` also directly changes local coordinates. Apply
  future tow handling to both, and guard hyperspace requests at their owner.
- `mission_board`, `mission_progress`, `mission_navigation`, `mission_journal`,
  `biological_mission_guidance`, `biological_contracts`, `science_log`, and
  `comparative_biology` must distinguish biology positively, not by excluding scan.
- Station targeting, nearby lookup, rendering, orbit updates, docking and restore
  currently rely on `system.starbase`. Infrastructure collections and identity
  resolution are M4 work, not a reason to alter generation in M0-M2.
- `Game.restoreSaveGame` materialises the location before restoring missions.
  M4 must restore deployment records before resolving a docked deployed depot.
- `Game` and `SolarSystem` duplicate frame-to-simulation time conversion. M3
  introduces explicit bulk seconds and catch-up without changing untowed zoom.
- Save storage uses versioned keys and legacy fallback. Every schema increase
  must include migration, fallback, and clearing of the immediately prior key.

## Initial Calibration

All values are game-model calibration, not physical laws of hyperdrive.

| Parameter | Initial choice |
| --- | --- |
| External coupler classes | 20,000 / 500,000 / 5,000,000 kg ratings; 600 / 2,400 / 7,200 Cr |
| Drive classes 1-3 haul ratings | 20,000 / 250,000 / 2,000,000 kg; reference masses 1,000 / 4,000 / 16,000 kg |
| Unloaded strategic duration | 180 / 120 / 90 simulated seconds per light-year |
| Hyper load penalty | `1 + 25 * (wetMass / referenceMass)^2` |
| Local handling | `max(0.35, 1 / sqrt(1 + load))`; no tow always returns 1 |
| Local transfer profile | `distanceM / 1e7 * sqrt(1 + load)` simulated seconds |
| Crew hypersleep | Required above 48 simulated hours; 3 / 6 berths at 2,800 / 6,500 Cr, one special bay |
| Certification | Hull at least 75%; drive/coupler/module damage at most 20% |
| Maximum quoted voyage | 20 simulated years; reject rather than truncate |
| Support reserve | 10 abstract fuel units, retained for final approach |

The fixed benchmarks in `src/tests/fixtures/heavy_haul.ts` cover a 1-AU buoy
transfer, a 25-light-year medium job, and the same 100-light-year depot job with
two drives. Expected outcomes are hours, about 22 days, about 3.8 years, and
about 65 days respectively. Crew planning may reduce fuel, not reroll duration
or reward. Better drives must improve the same quoted job.

## Progress And Verification

- M0: source inventory, route fixtures, and untowed movement tests written.
- M1: typed quote rules, frozen accepted terms, attachment/recovery, receipt
  validation, and prepared destination settlement written in focused services.
- M2: shipyard fitting, itemised repair, and version-18 save support written.
- `npm run check` passes: documentation checks, formatting, lint, app and test
  typechecks, all 981 tests, and the production build.
- Headless Chrome confirms that the running application loads and renders its
  title scene. Playwright is unavailable here, so no interactive shipyard browser
  walkthrough was run; dedicated unit tests cover upgrade availability,
  installation, bay accounting, and save round-trips.

## Implementation Map

- `constants/heavy_haul.ts`: one documented calibration table for ratings,
  prices, duration, support reserve, and certification limits.
- `core/heavy_haul_types.ts`: typed external-package definitions and compact
  persistent ledgers, separate from cubic-metre cargo.
- `core/tow_performance.ts`: readonly quote calculations and capability errors.
- `core/heavy_haul_service.ts`: one logical package, using MissionProgress as
  the canonical accepted-contract owner. Arrival/deployment methods prepare
  domain effects; they do not implement flight, payment, or station spawning.
- `core/heavy_haul_validation.ts`: strict definitions, chronology, support
  accounting, identity, and future installation-record validation.
- `core/ship_modifications.ts`: real yard options, one-bay hypersleep upgrades,
  external couplers, drive classes 2-3, and module repair faults.
- `core/save_game.ts`: schema 18, explicit migration from 17, old storage-key
  fallback/clearing, empty default ledgers, and cross-owner validation.
- `core/game.ts`: persistence plumbing and fitting readouts only. No production
  haul board, transit UI, bulk-time execution, or infrastructure overlay yet.

The baseline movement, quote, lifecycle, fitting, save, and biological regression
tests have passed together with `npm run check`. Contracts themselves remain
future M3-M5 work. M0 is committed independently; M1 and M2 are kept together
because typed objectives, save schema, equipment, and game save plumbing depend
on the same versioned state contract.

The full design and later stages are in
[the implementation plan](plans/heavy-haul-first-version.md).
