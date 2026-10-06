# Heavy-Haul Foundations

M0-M2 establish rules, lifecycle, fitting, and persistence. M3 adds supported
journey execution and analytic time advancement; its verification gate passed.
M4 adds persistent registry overlays and checkpointed commissioning. Its new
regression tests await the user's Luna verification stage.
Production haul offers remain unavailable until useful commissioning
and the playable contract interface are implemented in M4-M5. No real-time
towing physics or cargo-mass overhaul is part of these foundations.

## Integration Inventory

- `MovementSystem` owns discrete hyperspace steps and system cursor movement;
  `Game.updateApproachAssist` also directly changes local coordinates. Apply
  tow handling to both, and guard hyperspace requests at their owner (M3).
- `mission_board`, `mission_progress`, `mission_navigation`, `mission_journal`,
  `biological_mission_guidance`, `biological_contracts`, `science_log`, and
  `comparative_biology` must distinguish biology positively, not by excluding scan.
- Station targeting, nearby lookup, rendering, orbit updates, docking and restore
  currently rely on `system.starbase`. Infrastructure collections and identity
  resolution are M4 work, not a reason to alter generation in M0-M2.
- `Game.restoreSaveGame` materialises the location before restoring missions.
  M4 must restore deployment records before resolving a docked deployed depot.
- `simulation_time` now owns the shared frame conversion. M3 introduces
  explicit bulk seconds and catch-up without changing untowed zoom.
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
- M3: prepared arrival checkpoints, bulk-time/orbital catch-up, manual/assisted
  tow handling, travel restrictions, and version-19 migration verified; full
  check passed with 1,010 tests. Subsequent shipyard checks passed with 1,033 tests.
- M4: registry overlays, moving contract sites, multi-station navigation/docking,
  depot services, observatory technology evidence, atomic escrow/deployment and
  restricted commissioning fuel implemented. Schema 20 preserves contract site
  phases and migrates/falls back to v19 storage. New tests are written, not run.
- M0-M2 `npm run check` passed: documentation checks, formatting, lint, app and test
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
- `core/simulation_time.ts`: the unchanged frame scale, validated bulk clock
  preparation, and modulo-reduced orbital phases in simulated seconds.
- `core/system_orbit_state.ts`: visited stellar/station phases and per-body
  bulk watermarks, independent of natural generator blueprints.
- `core/heavy_haul_journey.ts`: real onward-supply checks, source staging,
  current quote revalidation, disposable destination preparation, safe arrival,
  and checkpoint-before-application coordination.
- `core/save_game.ts`: schema 20, migrations including 19, prior-key fallback and
  clearing, orbital-history validation, and cross-owner checks.
- `core/game.ts`: `quoteHaulJourney` and `departHaulJourney` orchestrate future
  manifest commands; ApplicationController provides a throwing session writer.
  Infrastructure is materialized after natural catch-up. M5 adds the production
  board and paused voyage interface.

## M4 Registry And Commissioning

Natural generation remains unchanged. `InfrastructureRegistry` materializes
stable IDs as extra stations or selectable navigation transmitters, after
restoring the host system's natural phases. Its separate per-installation epoch
prevents applying time from before commissioning. `haul_sites` materializes
the accepted contract's pickup/deployment contacts at the same orbital epoch.

Commissioning prepares one validated save containing installation, detached
tank, completed objective and escrow payment. Storage failure applies none of
these effects. Depot commissioning fuel fills only the normal reactor tank,
is capped by remaining allowance/capacity and cannot become tradable cargo.
Station services and markets use stable installation identity. Docked references
are reconciled after registry refresh, including saves made inside a new depot.

The baseline movement, quote, lifecycle, fitting, save, and biological regression
tests have passed together with `npm run check`. Contracts themselves remain
future M4-M5 work. M0 is committed independently; M1 and M2 are kept together
because typed objectives, save schema, equipment, and game save plumbing depend
on the same versioned state contract.

## M3 Time And Transaction Policy

Preparation constructs a fresh destination, validates its full address and
stable stellar host, computes the current quote, and produces one durable
arrival save. The writer must succeed before Game applies the receipt, calendar,
position, and support-fuel ledger. Storage failure leaves live position,
orbital phases, normal resources, and attachment unchanged. The next departure
attempt prepares/revalidates again; an arrived stage cannot depart a second time.

Both the calendar and cumulative bulk watermark increase by the quoted
simulated seconds once. The destination catches up immediately, while the
departed/other visited systems retain their last-applied epoch and catch up only
on materialisation. Unvisited systems start at bulk epoch zero. Saved body
watermarks may differ from saved stellar watermarks on old voyages; only each
body's missing interval is added before reconstructing host-relative positions.
Existing real-frame/zoom behaviour is otherwise retained; this is not a universal
absolute ephemeris redesign.

Normal ship fuel is unchanged by transit. Support consumption comes solely from
the package ledger. M3 requires an actual existing fuel station for onward
safety; the commissioned-depot allowance remains M4 work. Crew, specimens,
surface encounters, market stock, and ordinary non-expiring missions do not
undergo years of catch-up simulation.

Local transfers depart near the pickup site and arrive outside commissioning
range. Intersystem transfers depart at the source boundary and arrive at a
checked entry position. Final approach remains manual/assisted and uses the
same bounded mass modifier in both paths. Attached packages cannot use ordinary
hyperspace travel or planetary landing; the source yard may park the package
externally for repairs until departure. Recovery retains its no-payment policy.

Arrival clears held inputs, approach/selection state, terminal/HUD annotations,
survey caches, and projected-scene caches. Cosmetic effects never advance the
voyage clock.

The full design and later stages are in
[the implementation plan](plans/heavy-haul-first-version.md).
