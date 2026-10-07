# Automated Depots

Status: M0-M4 verified with `npm run check` (1,220 tests) and the full depot
Playwright flow, including services, robot contracts, resource reports and
desktop/narrow rendering without browser errors or stale orbital pixels.
M5 chart exchange and M6 broadcasts are implemented. Static checks pass; their
new runtime suites and expanded browser flow await the requested Luna gate.

## Playing

Dock at a naturally generated automated depot or one delivered by a heavy-haul
contract. Move to **Services** with Left/Right and select the repair, reactor
loading or medical bay with Up/Down and Enter. Automated depots remain uncrewed;
their notices no longer imply that basic services require arriving staff.

The terminal writes out quickly. Its first keypress during that animation reveals
the text without also authorising work. Afterwards:

| Control   | Action                                                       |
| --------- | ------------------------------------------------------------ |
| Up/Down   | Select a work order or individual patient                    |
| PgUp/PgDn | Scroll the readout independently of selection                |
| Tab       | Enable/disable supplementing depot shortages from ship cargo |
| Enter     | Review the selected quote                                    |
| A         | Review all supported repairs or eligible crew treatment      |
| Y / N     | Authorise or reject the confirmation                         |
| Esc       | Close a confirmation or return from the bay to Services      |

The clickable bottom menu exposes the same controls. Cargo supplementation starts
off whenever a bay opens. Confirmations default to **No**, list actual materials
and credits, and warn about partial work. A completion receipt stays open until
dismissed. All depot terminals and confirmations pause simulation.

## Supplies And Limits

Depot service materials are real trade goods measured in the existing cargo
unit, cubic metres. Buying them reduces the supply available for services;
selling them to the depot replenishes that same stock. Workshop Spares and
Medical Supplies can also be bought at staffed ports.

| Service       | One sealed service batch                       | Maximum work per batch | Labour                     |
| ------------- | ---------------------------------------------- | ---------------------- | -------------------------- |
| Hull          | 1 m^3 Titanium Trusses + 1 m^3 Workshop Spares | 10 integrity points    | 12 Cr / point              |
| Secured rover | Same materials as hull                         | 20 integrity points    | 5 Cr / point               |
| Reactor       | 1 m^3 Helium-3 + 1 m^3 Deuterium Pellets       | 40 reactor units       | Existing fuel-loading rate |
| Medical       | 1 m^3 Medical Supplies per patient             | 20 HP                  | 4 Cr / HP                  |

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

## Robot Contracts (M4)

Open **Missions** at an automated depot. Its dedicated robotic board offers at
most two supply requests and one local orbital survey, selected from actual stock
shortages and unmeasured catalogue bodies. It does not open biological research,
staff recruitment, shipyard work or the staffed-port mission generator.

Select a job and press **Enter**, then **Y/N** to accept or decline. The briefing
and **J** mission journal give the required goods or survey body and full
hyperspace coordinates/contact slot. Acceptance reserves the quoted payment but
does not consume cargo or pay immediately. The selected row stays in place.

Supply work uses the **ship hold**, not goods left in the rover. Bring the full
requested lot, select its **CLAIMABLE** row under Missions and press Enter. One
handoff consumes that lot, replenishes the depot's actual shared stock, completes
the mission and pays the reserved reward. Ordinary selling does not complete
the request. Selling or transferring the required cargo away returns it to ACTIVE.
Replenished or full stores do not invalidate an already accepted promise; a
contract intake can use overflow receiving storage.

Survey work requires an actual orbital measurement of the specified body, then
a return to the issuing depot. Full system addresses and stable body paths are
checked: similarly named systems or planets elsewhere cannot fulfil a scan job.
Already measured bodies do not create new robot survey offers. Remote charts
are not substituted for these observations.

**C** on an accepted job opens a No-default cancellation confirmation. Cancellation
returns escrow to its sponsor, consumes no cargo and retires that offer until
the next scheduled revision. Completion and refusal receipts remain visible
until acknowledged; all reading/confirmation time is paused.

Each depot starts with **6,000 Cr** of finite sponsor funding. Supplies pay twice
their catalogue material value plus an 80 Cr logistics fee; a local survey pays
420 Cr. The board refreshes on access at most once per **90 simulated days**.
Opening menus, buying stock or sleeping through missed cycles does not reroll
offers immediately or accumulate new funds. Resource report lists unreserved
and committed funds and the next refresh epoch. Sponsor replenishment is outside
this milestone.

## Astrometric Exchange (M5)

Depot Services / **Astrometric exchange** opens a paused scientific terminal.
Up/Down selects records; PgUp/PgDn scrolls the readout; Enter reviews a measured
upload; Y/N accepts or declines the No-default quote; Esc returns to Services.
Tab switches between measured evidence and public charts. Charts download free
with Enter; A marks a filed chart; R refreshes the 40-light-year public catalogue.
The first reveal key only finishes writing the terminal.

Actual observatory stellar spectra cross quality thresholds of 0.35, 0.65 and
0.85. Local stellar scans, system surveys and orbital/terrain surveys supply
distinct stable object records. Spectra do not count as local system or orbital
surveys. Public charts only provide navigation references: downloading does not
complete mission objectives, generate scan data or expose surface biology.

Each verified depot receives a once-only 2,400 Cr scientific allowance, separate
from its mission escrow and material inventory. The shared campaign ledger pays
only the incremental value of a higher tier, across all depots. Unfunded evidence
remains available; contract premiums can accompany one base scientific sale.
Base cumulative tier values are 12/25/40 Cr for stellar evidence, 55/85/110 Cr
for system surveys and 90/135/165 Cr for body surveys. A bounded frontier premium
increases those values by at most two times. Routine local system scans supply
the first system tier; surveyed/mapped/sampled bodies supply body tiers 1/2/3.

Evidence is a compact 4,096-record index, not a duplicate of detailed observatory
measurements. Paid evidence can be evicted, but the separate 16,384-entry payment
ledger is never evicted. If unpaid evidence fills its cache, new records are
refused until uploads make space. A full receipt ledger refuses new paid
identities while allowing existing tier improvements. Public navigation charts
are capped at 512; sponsors at 2,048. No astrometric data uses physical cargo.
Uploads and chart downloads checkpoint detached outcomes before assignment;
failed writes leave receipts, funding, charts and credits unchanged.

## Communications (M6)

Press **H**, select **Comms** in a travel menu, or choose **Communications** under
**O Operations**. The paused thin-text inbox retains nearby depot reports; Up/Down
selects a carrier, PgUp/PgDn scrolls its dossier, Enter marks the system in
navigation, R reacquires contacts and Esc restores the previous interface.
The first keyboard press or menu click during writing only completes the reveal.

Background hyperspace reception uses a fixed **60 ly** circular radius, independent
of screen dimensions and observatory equipment. Batches yield between worker
requests. At most eight natural candidates are verified against canonical station
generation per sweep, then merged with real delivered depots; phantom candidate
flags and navigation buoys cannot advertise depot services. Up to 32 closest real
carriers are retained per sweep. Searches can finish during movement, but results
are filtered at the latest ship coordinates. Leaving the travel context cancels
pending work.

Reception is throttled to two real seconds in motion, fifteen when stationary.
New or meaningfully changed content generates at most one aggregate HUD notice
per fifteen real seconds. Repeated reception and minor stock fluctuations do not
re-alert; real shortage categories or available-job changes do. The inbox contains
at most 128 reports, with a 512-source deduplication index. Reports expire after
30 simulated days, while content fingerprints prevent repeated carrier spam.

An unvisited, verified depot reports its services and coordinates, not invented
stocks or job offers. Previously visited depots also show stored shared-inventory
shortages and up to three actual unaccepted robot offers, with their report age.
Those reports can be stale: docking is required to refresh stock, accept work,
transact or receive payment. Broadcast reception never creates service stocks,
reserves sponsor money, advances scans or completes missions. Read states persist.

## Ownership And Persistence

- `core/depot_types.ts`: typed operational records, work orders and validation.
- `core/depot_extraction.ts`: catalogue-only source assessment and capped elapsed-time rules.
- `core/depot_contracts.ts`: prepared bounded offers, funded acceptance, atomic
  supply/survey settlement, cancellation and checkpoint coordination.
- `core/depot_contract_validation.ts`: restricted robot definitions and
  cross-owner mission/escrow validation at import.
- `core/depot_rules.ts`: pure stock/cargo/credit-limited quotes and sealed recipes.
- `core/survey_data_service.ts`, `survey_data_types.ts`: compact measured evidence,
  public-chart provenance, finite sponsor funding and durable shared receipts.
- `core/survey_observations.ts`: local discovery-to-evidence adapter.
- `core/frontier_catalogue.ts`: bounded worker-backed public descriptors and verified
  natural-depot summaries, without terrain preparation or new generation rolls.
- `core/frontier_terminal.ts`, `survey_exchange_console.ts`: reusable thin-text
  terminal selection/reveal and formatted scientific quotes.
- `core/depot_communications.ts`, `communications_types.ts`: bounded acquisition,
  content deduplication, expiry and saved read-state validation.
- `core/communications_console.ts`: informational, age-labelled carrier dossiers;
  no remote transactions or procedural-world changes.
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

Save schema 25 adds bounded communications reports, content revisions and read
state. Version 24 migrates with an empty inbox while preserving survey receipts.
Save schema 24 adds compact survey evidence, receipts, public charts and scientific
sponsor accounts. Schema 23 migrates with empty science records rather than
inventing historical observations or payments. Schema 23 stores extraction profiles/carry and small sponsor/offer records
inside `depots`, keyed by stable station ID. Canonical accepted terms remain in
the ordinary mission ledger. Schema 21 records migrate with extraction pending;
schema 22 preserves extraction and starts with an uninitialised job board. Older
saves migrate with an empty depot ledger. Existing stock is preserved;
only missing new service listings are seeded. Natural depots initialise on first
materialisation; delivered depots retain their commissioning epoch. Dedicated
depot seeds do not consume procedural galaxy/system streams.

Quotes bind target health, funds, supplies, cargo consent and operational revision.
Robot acceptance, cancellation and payment checkpoint cargo, economy, missions,
depot escrow and player resources as one detached outcome before assignment.
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
It now also covers robot acceptance/decline, CLAIMABLE cargo, handoff/payment,
save/reload, stable mission selection and resource reports. That extended flow
passed during the M3-M4 gate using the installed Playwright Core package at
`/home/mpalmer/.cache/ms-playwright-go/1.57.0/package`.
The prepared M5-M6 extension additionally checks upload decline/payment/duplicate
refusal, navigation-only charts, receipt persistence, real delivered-carrier
reception, read state, destination marking, Operations return and narrow terminals.
That extension has not yet been run.

M3-M4 Luna gate:

```bash
npm run test:run -- src/tests/core/depot_extraction.test.ts src/tests/core/depot_contracts.test.ts src/tests/core/depot_service.test.ts src/tests/core/mission_progress.test.ts src/tests/core/interface/depot_contract_integration.test.ts src/tests/core/interface/depot_service_integration.test.ts src/tests/core/interface/save_game.test.ts
npm run check
COSMIC_URL=http://127.0.0.1:5173/ node scripts/check_depot_browser.cjs
```

Also run staffed-port, mission journal, biological delivery and heavy-haul
regressions. Browser verification needs Playwright or an explicitly documented
alternative; do not describe prepared checks as passed. Source/clock, saturation,
fractional carry, funding, cancellation, wrong-address, sold-cargo, full-store,
duplicate-payment and storage-failure cases are covered by the new focused suites.

M5-M6 Luna gate (pending):

```bash
npm run test:run -- src/tests/core/survey_data_service.test.ts src/tests/core/frontier_catalogue.test.ts src/tests/core/depot_communications.test.ts src/tests/core/interface/frontier_terminal.test.ts src/tests/core/interface/survey_exchange_integration.test.ts src/tests/core/interface/communications_integration.test.ts src/tests/core/interface/save_game.test.ts
npm run check
COSMIC_URL=http://127.0.0.1:5173/ PLAYWRIGHT_MODULE=/home/mpalmer/.cache/ms-playwright-go/1.57.0/package node scripts/check_depot_browser.cjs
```

Inspect the new desktop/narrow screenshots, not just their pixel counters. Check
unaffected travel, surface and orbit regression suites as part of `npm run check`.
No galaxy-generation version or population tuning is changed by M5-M6.

Personally check a depot with damage, low fuel and an injured crew member.
Compare service supply readouts with Buy/Sell stocks, perform partial work,
supplement from cargo, leave/revisit, and save/reload. Confirm ordinary staffed
starports and deferred heavy-haul homebound travel still behave as before.
For the new features, scan/observe a star or survey a planet, dock and upload it
in Astrometric exchange. Try again, then at another depot: the funded tier pays
only once. Download a public chart and confirm it supplies navigation, not scan
credit. In hyperspace, approach a depot region, open H and mark a destination.
Reopen through Operations and confirm Esc restores its selection. Reload and
check receipt/read-state persistence; compare narrow and desktop wrapping.
