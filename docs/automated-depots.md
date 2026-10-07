# Automated Depots

Status: M0-M3 implemented; M3 awaits Luna verification. The M0-M2 baseline
passed `npm run check` with all 1,179 tests. A
headless Chrome smoke check rendered the medical bay at desktop and narrow sizes,
confirmed both fonts and the No-default treatment quote, and reported no browser
errors. The full scripted Playwright interaction flow was not run because this
environment has no installed Playwright package. Robot contracts, chart
exchange and broadcasts remain planned.

## Playing

Dock at a naturally generated automated depot or one delivered by a heavy-haul
contract. Move to **Services** with Left/Right and select the repair, reactor
loading or medical bay with Up/Down and Enter. Automated depots remain uncrewed;
their notices no longer imply that basic services require arriving staff.

The terminal writes out quickly. Its first keypress during that animation reveals
the text without also authorising work. Afterwards:

| Control | Action |
| --- | --- |
| Up/Down | Select a work order or individual patient |
| PgUp/PgDn | Scroll the readout independently of selection |
| Tab | Enable/disable supplementing depot shortages from ship cargo |
| Enter | Review the selected quote |
| A | Review all supported repairs or eligible crew treatment |
| Y / N | Authorise or reject the confirmation |
| Esc | Close a confirmation or return from the bay to Services |

The clickable bottom menu exposes the same controls. Cargo supplementation starts
off whenever a bay opens. Confirmations default to **No**, list actual materials
and credits, and warn about partial work. A completion receipt stays open until
dismissed. All depot terminals and confirmations pause simulation.

## Supplies And Limits

Depot service materials are real trade goods measured in the existing cargo
unit, cubic metres. Buying them reduces the supply available for services;
selling them to the depot replenishes that same stock. Workshop Spares and
Medical Supplies can also be bought at staffed ports.

| Service | One sealed service batch | Maximum work per batch | Labour |
| --- | --- | --- | --- |
| Hull | 1 m^3 Titanium Trusses + 1 m^3 Workshop Spares | 10 integrity points | 12 Cr / point |
| Secured rover | Same materials as hull | 20 integrity points | 5 Cr / point |
| Reactor | 1 m^3 Helium-3 + 1 m^3 Deuterium Pellets | 40 reactor units | Existing fuel-loading rate |
| Medical | 1 m^3 Medical Supplies per patient | 20 HP | 4 Cr / HP |

Labour and issued depot materials are charged separately in one total quote.
Carried materials are not charged again as a purchase. Partly used sealed batches
are still consumed; splitting work into tiny orders cannot create free supplies.
These are gameplay workshop/loader units, not a new physical engine model.

Basic depots repair hulls and available, secured rovers, not damaged engines,
shields, weapons or hypersleep equipment. Treatment supports living roster
members only, prioritising the most injured proportionally in all-crew orders.
Healthy crew cost nothing; zero-HP crew cannot be revived by this service.

Fuel consumes physical D/He3 stocks. The duplicate fusion-blend listing is removed
from automated depots; imported legacy blend stock is converted once into its
component pairs. Carried legacy deuterium and packaged pellets are both accepted
with explicit cargo consent. Contractor commissioning fuel stays in the existing
infrastructure allowance and is never converted into saleable stock. A normal
refuel request uses that allowance first, when available.

Manufactured and reactor supplies remain finite. Sell suitable goods to the depot
or authorise carried supplies when stock is depleted.

## Autonomous Extraction (M3)

Services / **Resource report** shows verified sources, rates, shared reserves and
the last operational update. Nearby accessible solid bodies with actual catalogue
iron or cold water-ice abundance can support collection of 2 m^3 iron or 3 m^3 ice
per 30 simulated days. Each mining output stops at 24 m^3; imported/traded stock
above that cap is retained. Rates represent small autonomous collection hardware,
not a detailed mine or a claim about terrestrial mining productivity.

Source screening requires the same orbital host, parent orbit within 0.75 AU,
gravity at most 1.5 g, pressure at most 10 atm and temperature below 650 K
(below 260 K for ice). It reads catalogue data only; no terrain generation or
galaxy PRNG is involved. Unsupported depots stay supply-dependent.

Catch-up is analytic and lazy on system materialisation/service access. Total
simulation time counts, including ordinary travel, observatory integrations and
hypersleep; paused reading contributes nothing. Full stores discard excess and
fractional surplus, so depletion cannot release years of banked output. Spares,
medicines, trusses and reactor isotopes are never mined. Natural depots start on
first materialisation; delivered ones start at commissioning. Migrated v21 depot
profiles begin extraction assessment on revisit without historical output.

## Ownership And Persistence

- `core/depot_types.ts`: typed operational records, work orders and validation.
- `core/depot_extraction.ts`: catalogue-only source assessment and capped elapsed-time rules.
- `core/depot_rules.ts`: pure stock/cargo/credit-limited quotes and sealed recipes.
- `core/depot_service.ts`: once-only initialisation, supported targets and coordinated
  service commits, including a detached pre-commit checkpoint.
- `core/depot_service_console.ts`: selection, reveal, paging, semantic text models
  and confirmations; no resource mutation or drawing logic.
- `StarbaseCommerceService`: the only physical stock owner; depot code uses narrow
  stock initialisation, read and prepared-consumption APIs.
- `InfrastructureRegistry`: delivered location, orbit, commissioning allowance and
  homebound route; not a second depot inventory.
- `Game`: prepares stations, wires modal input/drawing, persists outcomes and publishes
  resource effects only after a successful commit.

Save schema 22 extends compact `depots` operational records with extraction profiles
and bounded fractional carry, keyed by stable station
ID. Older saves migrate with an empty ledger. Existing stock is preserved;
only missing new service listings are seeded. Natural depots initialise on first
materialisation; delivered depots retain their commissioning epoch. Dedicated
depot seeds do not consume procedural galaxy/system streams.

Quotes bind target health, funds, supplies, cargo consent and operational revision.
Changed or repeated confirmations are refused. Failed checkpoint writes leave
crew, damage, fuel, cargo, credits and station supplies untouched. Crew IDs and
health bounds are validated at the save boundary.

## Verification Handoff

To repeat automated verification:

```bash
npm run test:run -- src/tests/core/depot_service.test.ts src/tests/core/interface/depot_service_console.test.ts src/tests/core/interface/depot_service_integration.test.ts src/tests/core/interface/save_game.test.ts src/tests/core/starbase_commerce.test.ts src/tests/entities/stellar/starbase.test.ts src/tests/core/ship/ship_repair_console.test.ts src/tests/core/navigation/heavy_haul_gameplay.test.ts src/tests/core/navigation/heavy_haul_commissioning.test.ts src/tests/core/interface/mission_dialogs.test.ts src/tests/core/ship/ship_menu.test.ts
npm run check
COSMIC_URL=http://127.0.0.1:5176 node scripts/check_depot_browser.cjs
```

The browser script requires Playwright (or `PLAYWRIGHT_MODULE` pointing to an
installed copy), Chrome and a running Vite dev server. It imports a controlled
delivered-depot fixture through the normal save importer, checks confirmation,
partial repairs/fuel/treatment, cargo consent, depleted-stock persistence,
paused time, desktop/narrow terminal rendering and browser errors. Captures and
the importable fixture are written to `/tmp/cosmic-depots` by default.

Personally check a depot with damage, low fuel and an injured crew member.
Compare service supply readouts with Buy/Sell stocks, perform partial work,
supplement from cargo, leave/revisit, and save/reload. Confirm ordinary staffed
starports and deferred heavy-haul homebound travel still behave as before.
