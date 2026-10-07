# Automated Depots

Status: M0-M7 verified with `npm run check` (1,273 tests across 170 files) and
the depot Playwright flow at 1400x900 and 390x844. M7 includes actual orbital
survey completion/claim, science upload, a cross-depot duplicate refusal and
hypersleep depot catch-up. Both font assets loaded; there were no browser errors
or stale orbital pixels.

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
inventing historical observations or payments. Schema 22 introduced extraction
profiles/carry; schema 23 adds small sponsor/offer records inside `depots`, keyed
by stable station ID. Canonical accepted terms remain in
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

## Route Balance (M7)

`src/tests/core/depot_route_balance.test.ts` measures three reproducible journeys:
25 ly out and back with a class-1 drive, 120 ly out and back with class 1, and the
same 120 ly route with class 3. The supplier is a controlled staffed market;
these are cost benchmarks, not promises that real ports exist at those coordinates.

Each route starts with the intended **1,000 Cr** balance, ignoring the temporary
5,000 Cr observatory playtest allowance. It accepts a Workshop Spares delivery
and one local orbital survey, physically buys the promised lot, uses real
hyperspace movement, settles both jobs and sells the actual star/system/body
observations. It pays the full robotic quotes for 10 hull points, 20 rover points,
10 crew HP and replacing the journey's fuel. Cargo consent is off for those quotes.

The emitted report separates gross supply/survey/science earnings, acquisition,
repairs/treatment, fuel units and sealed-batch refuelling charges. This matters:
even a short trip uses a whole isotope pair, not a fractional market purchase.
Uninterrupted drift time is reported separately; manoeuvring, surveying and
planetary work take additional time. No system-entry charge is invented for a
configuration value that the travel implementation does not currently debit.

Economic guardrails require a positive net return after that wear and a net gain
below one 650 Cr cargo pod, well below a 3,600 Cr entry observatory. A star/system/
single-body local evidence bundle yields **185 Cr**; the job premium is additional.
Mission and science budgets remain finite and separate. Public charts and repeat
uploads earn nothing. Distance cannot multiply scientific value without bound.

Measured results, nominal route / actual grid round trip:

| Drive | Route        | Fuel used | Fuel charge | Other costs | Total rewards | Net from 1,000 Cr |
| ----- | ------------ | --------: | ----------: | ----------: | ------------: | ----------------: |
| 1     | 25 / 52.16 ly  |      6.67 |       36 Cr |      614 Cr |       973 Cr |           +323 Cr |
| 1     | 120 / 240.91 ly|     32.03 |       39 Cr |      614 Cr |       973 Cr |           +320 Cr |
| 3     | 120 / 240.91 ly|     22.88 |       38 Cr |      614 Cr |       973 Cr |           +321 Cr |

Other costs comprise the 198 Cr resupply lot and 416 Cr in quoted hull/rover
repair and medical work. Total rewards comprise 368 Cr supply delivery, 420 Cr
survey contract and 185 Cr new local science. The movement simulation advances
about 0.06–0.27 game days in uninterrupted transit; actual interactions add time.
Fuel replacement is quantized by the real sealed-material service recipe, so it
does not scale smoothly with the exact number of units burned. These three
controlled runs meet the M7 net-profit guardrail. No reward or production rates
were changed. They do not establish profitability under severe damage, depleted
stores, market price variation, or a longer route with no funded local work.

## Verification

The completed M5-M6 gate passed 168 focused assertions, the full 1,267-test check
and the expanded depot browser flow. It exercised No-default authorisation,
partial/cargo-assisted work, paused clocks, handoffs, upload decline/payment,
duplicate refusal, public-chart provenance, carrier reception, read-state reload,
destination marking and Communications returning to Operations. A payment-ledger
test and a travel-context browser fixture were corrected; no production gameplay
change was required at that gate.

Prepared M7 coverage:

- `fixtures/depot_exploration.ts`: one supply-dependent depot, one assessed miner,
  a staffed supplier and shared real owners; full save parsing/restoration.
- `core/depot_exploration.test.ts`: connected supply/services/medical/survey/science
  playthrough, cross-depot incremental payments, real hypersleep time passage,
  finite funding/depleted isotopes, mining caps and failed-checkpoint invariants.
- `core/depot_route_balance.test.ts`: production route/market/work-order costs
  against modest exploration rewards and equipment prices; optional JSON reports.
- `scripts/check_depot_browser.cjs`: actual parent/body selection and orbital scan,
  CLAIMABLE survey handoff, selling that measurement, and repeat refusal at a
  second real delivered depot. Existing desktop/narrow checks remain in the flow.

M7 passed: all 6 new connected-loop and economic benchmark tests, the complete
`npm run check` (170 files / 1,273 tests / production build), and the expanded
desktop/narrow browser flow. The survey was targeted and orbited through normal
navigation, then claimed and uploaded; another depot refused the same paid tier.
The browser reported no errors. Inspected captures include claimable and settled
mission rows, payment receipt and second-depot refusal. Measured route totals are
in the balance table above; no payout or extraction tuning was needed.

To repeat the M7 Luna gate:

```bash
DEPOT_ROUTE_REPORT=1 npm run test:run -- src/tests/core/depot_exploration.test.ts src/tests/core/depot_route_balance.test.ts
npm run check
COSMIC_URL=http://127.0.0.1:5173/ PLAYWRIGHT_MODULE=/home/mpalmer/.cache/ms-playwright-go/1.57.0/package node scripts/check_depot_browser.cjs
```

The browser script requires a running Vite server, Chrome, and Playwright or a
`PLAYWRIGHT_MODULE` path to an installed copy. `CHROME_PATH`, `COSMIC_URL` and
`DEPOT_CAPTURE_DIR` can override the defaults. Captures and importable setup saves
go to `/tmp/cosmic-depots`. Inspect desktop/narrow captures alongside the pixel
checks; do not report prepared checks as passed. `npm run check` also covers
ordinary commerce, crew, observatory, save migrations, surface/orbit rendering,
travel and deferred heavy-haul homebound regressions.

## Personal Playthrough

1. In hyperspace, press **H**, read a nearby depot report and **Enter** to mark it.
   **O / Communications** is the equivalent menu route. No stock changes remotely.
2. Dock and use **Services / Resource report** to compare reserves with Buy/Sell.
   Request repair, fuel and medical care; review partial work before pressing Y.
   Use Tab only when you intend to contribute carried materials.
3. Under Missions, accept a supply request and a survey with Y. **J** shows the
   exact lot, body and coordinates. Buy the lot elsewhere into the ship hold.
4. Return and select the **CLAIMABLE** supply mission. Its receipt should remain
   visible; credits rise once, cargo leaves the hold and depot stocks increase.
5. Use **N Targets** to select/approach the survey's parent planet, then Orbit.
   Select a requested moon with Left/Right if needed. Returning to the issuing
   depot should make the survey claimable. Claim its separate contract reward.
6. Open **Astrometric exchange**, review that measured body and accept the upload.
   Trying again, including at another depot, should refuse the paid tier. A real
   later mapping/sample improvement can still earn only the incremental value.
7. Tab to public charts, download one free and mark it with A. It supplies a
   navigation reference, not orbital measurements or mission completion.
8. Save/reload after services and payments. Health, supplies, funds, read states
   and receipts should persist. If a depot has a verified extraction source,
   revisit after travel/hypersleep: only its raw outputs grow, up to the caps.
   Neither manufactured supplies nor sponsor money replenish by waiting.
9. Check narrow-window paging and menu selection. Ordinary staffed starports and
   an already deferred heavy-haul return should still be available as before.

The browser's `depot-fixture.json` offers controlled damage/shortages for personal
service testing; `depot-survey-approach.json` stages an accepted survey at its
parent planet. Importing either replaces the current session, so export a personal
voyage first. These saves do not change production starting stocks or galaxy density.
