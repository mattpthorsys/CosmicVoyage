# Heavy-Haul Contracts: First-Version Implementation Plan

Status: M0-M3 implemented and verified. M4-M5 implementation and regression
tests are committed, awaiting the requested Luna verification gate. M6 onwards
remain planned.
Baseline inspected on 2026-10-05: save schema 17 and Galaxy model 8; M4-M5
use schema 20 and retain Galaxy model 8. Do not overwrite
migrations introduced by intervening work.

This plan adds a playable infrastructure-delivery loop to the current game,
not a general towing physics engine. The implementation should leave existing
untowed travel, ordinary cargo, xenobiology, natural generation, and station
services unchanged except at explicitly documented integration points.

## 1. First Playable Release

The player can accept one active heavy-haul contract alongside existing missions.
They rendezvous with a contractor's package, couple it externally, review a
paused voyage manifest, travel, approach the deployment site, and commission
the installation. Payment occurs at deployment rather than requiring a return
to the issuer.

Include:

- Light, intra-system deliveries that do not require crew hypersleep.
- Intersystem infrastructure deliveries whose heavy loads can take months or
  years of game time, without months or years of real waiting.
- A purchased tow coupler, a purchased three-berth hypersleep module, and a
  small set of working drive refits that improve haul capability.
- One external package with contractor-provided propulsion support. Neither
  the package nor its support fuel occupies ordinary cargo space.
- Persistent navigation buoys and compact automated depots with actual uses.
- Mission-journal navigation, Ship Operations access, readable quotes, visible
  attachment, save/load support, and clear cancellation/recovery rules.

Do not include complete station relocation, arbitrary salvage towing, cable
physics, a new ship-hull purchasing system, industrial production, or an
autonomously expanding human civilisation.

For initial depot contracts, choose destination systems with no existing
dockable station. This limits content and station-service complexity, but does
not excuse leaving consumers tied to the singular `system.starbase` field.

## 2. Current Foundations And Constraints

The code is authoritative. These are existing foundations, not features that
already implement towing:

| Foundation | Reuse and required boundary |
| --- | --- |
| [Mission board](../../src/core/mission_board.ts) and [progress](../../src/core/mission_progress.ts) | Offers, frozen accepted terms, progress, and completion IDs. Add an explicit haul objective and destination settlement; current non-scan assumptions are biological. |
| [Journal](../../src/core/mission_journal.ts) and [navigation](../../src/core/mission_navigation.ts) | Contract access and target selection. Hauls require separate pickup and deployment endpoints rather than one local target. |
| [Ship modifications](../../src/core/ship_modifications.ts) | Equipment, bay accounting, damage, repairs, prices, and engine classes. Engine fuel multipliers exist, but engine purchases and payload-dependent movement do not. |
| [Crew](../../src/core/crew.ts) | A three-person starter roster and health. There is no crew sleep state or berth inventory; specimen stasis is not crew hypersleep. |
| [Movement](../../src/systems/movement_system.ts) | Discrete hyperspace steps and zoom-scaled system movement. There is no velocity, physical thrust, or general cargo-mass model. |
| [Game](../../src/core/game.ts) and [SolarSystem](../../src/entities/solar_system.ts) | Calendar and analytic orbital updates. Time acceleration is duplicated, and no general bulk-time operation exists. Approach assist bypasses `MovementSystem`. |
| [Starbase](../../src/entities/starbase.ts) and [commerce](../../src/core/starbase_commerce.ts) | Automated depots already provide trade, fuel, and basic repairs. They do not offer crew, missions, or a full shipyard. |
| [State manager](../../src/core/game_state_manager.ts) and [saves](../../src/core/save_game.ts) | System materialisation, station identity, strict validation, and migration. Restore currently relies on a singular station, and there is no deployment registry. |
| [Scene model](../../src/rendering/scene_view_model.ts) and [renderer](../../src/rendering/scene_renderer.ts) | Prepared snapshots, ASCII travel scenes, and modal layering. Add readonly tow/infrastructure models, not renderer-owned mission logic. |

Cargo capacity is measured in cubic metres, not kilograms. Fitted-load and
drive-efficiency displays must not be mistaken for an existing physical mass
model. Human presence is spatially generated, not advanced by the calendar.

## 3. Ownership And Proposed Modules

Prefer a few cohesive modules to a framework of tiny classes. Names below are
proposed; follow nearby code conventions when implementing.

| Owner | Responsibility |
| --- | --- |
| `core/heavy_haul_types.ts` | Typed endpoints, immutable package/contract definitions, lifecycle records, quotes, and receipts. |
| `core/tow_performance.ts` | Pure capability checks, load factors, route duration, and support-fuel estimates. |
| `core/heavy_haul_service.ts` | One active package, validated commands, lifecycle transitions, and prepared journey/deployment outcomes. |
| `core/heavy_haul_contracts.ts` | Bounded deterministic offers, eligible endpoints, reserved deployment sites, and fixed rewards. |
| `core/simulation_time.ts` | Shared time units, existing frame-time conversion, and explicit bulk advancement. |
| `core/world_infrastructure.ts` | Persistent deployment records, stable IDs, materialisation, and registry revision/query APIs. |
| Focused haul controller/model builder | Transient selection, confirmation, manifest, and readonly presentation. Reuse existing terminal/dialogue helpers. |
| Existing owners | `MissionProgress` owns acceptance/completion, ship modifications own fitted equipment, commerce owns station markets, and `Game` coordinates effects and saves. |

Do not maintain independent copies of accepted terms in both the mission and
tow services. Reference the frozen accepted mission definition by ID. Haul
service state describes its physical/logical progress; journal status derives
from that progress and existing mission resolution records.

Game orchestrates a validated outcome containing time, position, fuel ledger,
mission changes, and infrastructure changes. It must not recalculate prices or
contain the quote formulas. Renderers and UI model builders do not mutate these
owners.

Add explicit small target/contact types for the pickup package, deployment
marker, and buoy. The current navigation target union covers planets, stars,
and stations; extend its model/resolution paths without pretending a buoy is
a staffed `Starbase` or introducing a general entity-physics framework.

## 4. Records, Units, And Invariants

Use explicit units: kilograms for mass, metres for local geometry, light-years
for intersystem distance, simulated seconds for duration, fuel units for the
existing resource convention, and credits for payment. Never pass real frame
seconds to an API that expects simulated seconds.

Minimum proposed records:

| Record | Contents |
| --- | --- |
| `HaulEndpoint` | Full system address (`worldX`, `worldY`, `systemSlot`), endpoint role, stable site/asset ID, and local orbit or staging specification. |
| `TowPackageDefinition` | Payload kind, dry mass, conservative wet departure mass, physical-size category, support budget, and equipment requirements. |
| Haul objective | Pickup/deployment endpoints, package definition, immutable reward, route constraints, and settlement policy. |
| `ActiveTowRecord` | Mission/package IDs, stage, remaining auxiliary fuel, attachment state, and committed journey receipt references. |
| `HaulQuote` | Capability result, duration, support consumption, berth requirement, onward-safety result, and specific refusal reasons. |
| `JourneyReceipt` | Unique operation ID, route, elapsed simulated seconds, fuel consumed, departure/arrival dates, and arrival placement. |
| `InfrastructureRecord` | Stable asset ID, source contract, system address, installation kind, orbit specification/epoch, commissioning date, and service profile. |

Required invariants:

1. Only one haul is active and only one package is attached; other mission types
   remain independent.
2. A package exists in exactly one state: awaiting pickup, attached, deployed,
   or recovered/cancelled. Re-entering a system cannot respawn a coupled package.
3. No tow means identity modifiers: ordinary movement and fuel behaviour remain
   unchanged.
4. Accepted reward, package, and destination do not reroll after save/load,
   equipment changes, calendar jumps, or catalogue visits.
5. Contractor fuel never enters normal ship fuel, cargo, station buyback, or a
   transferable inventory.
6. Quotes and committed actions use the same pure rules and input snapshot.
   Revalidate changed conditions before committing.
7. Deployment, support-tank removal, and payment occur exactly once, in one
   coordinated outcome. A reload cannot produce two installations or payments.
8. Natural galaxy generation and its PRNG streams do not consume deployment or
   contract state.

## 5. Contract And Attachment Lifecycle

```text
available -> accepted / awaiting pickup -> attached -> arrived
          -> approach deployment -> deployed / paid

accepted or attached -> explicit cancellation / contractor recovery
```

Do not persist an in-transit animation as authoritative state in version one.
The long journey is one committed operation with a receipt; its presentation is
skippable. Save before departure and checkpoint the arrived state. A cosmetic
terminal reveal must never advance time or repeat fuel consumption.

Commands should include accept, couple, quote journey, depart, deploy, and
cancel/recover. Validate stage, address, pickup/arrival distance, equipment,
site reservation, and funds where applicable before changing anything.

- Coupling requires a rendezvous in system space. Do not make a distant mission
  menu magically attach an object.
- Departure requires a safe staging location. A short local transfer uses a
  staging point; an intersystem transfer uses the departure boundary.
- Arrival places the ship and package at a safe entry/staging position, not
  already docked or intersecting a star/planet.
- Final approach and commissioning remain explicit player actions.
- The haul is paid by contractor escrow on successful deployment. Existing
  survey/xenobiology hand-in rules remain issuer-based.
- The journal shows `READY TO DEPLOY` before deployment and a paid completion
  receipt afterwards, not a misleading issuer-return instruction or unclaimed
  reward.

Before attachment, cancellation retires that offer. After attachment, provide
an explicit contractor-recovery action with no payout: remove the package and
remaining support supply, retire the job, and report the outcome. This is a
deliberate recovery abstraction, not free salvage. It prevents damaged
equipment or a changed crew roster from trapping the player in towing mode.

Disallow planetary landing, ordinary hyperspace steering, and additional
coupling while attached. Source staging-yard access may remain available for
repairs/refits, with the package parked externally. Explain restrictions in the
action result; never silently ignore an input.

## 6. Performance And Route Quotes

### Separate playable handling from strategic duration

The existing travel controls are not Newtonian physics. Do not retrofit velocity
integration or cargo mass into all movement as part of this feature.

Introduce documented tow-specific drive/coupler ratings and a conservative wet
package mass. If a reference ship mass is needed by a formula, define it as
explicit hull data, not a conversion from cargo volume or fitted-load percent.

Use a monotonically increasing load penalty and a bounded local handling factor:

```text
load = wetTowMassKg / driveReferenceMassKg
localStepFactor = clamp(localHandling(load), minimumPlayableFactor, 1)
intersystemSeconds = distanceLy * unloadedSecondsPerLy * hyperLoadPenalty(load)
```

These are model interfaces, not final coefficients. Calibrate the hyperdrive
curve against explicit benchmark routes; heavy-rated loads must genuinely
produce month/year voyages. A modest local slowdown must not require minutes
of repeated keys just to reach the deployment marker. Fictional hyperdrive
performance must not be presented as a derived real-world propulsion law.

Apply the same local factor to manual system movement and approach assist.
Apply it after existing zoom/fine-control scaling. Package mass must not alter
screen projection, system size, or docking tolerances.

Maximum accepted mass is the minimum of structural coupler capacity, drive
certification, and package-specific requirements. Damage can reduce readiness
or disqualify departure. Do not clamp an overweight package into apparent
eligibility. Better drives must not increase duration or support consumption
for an otherwise identical valid journey.

### No manual-travel bypass

While attached, strategic movement uses the quoted haul-transit command.
Ordinary hyperspace movement is blocked, including fine control, boost, and
any alternate navigation/approach path. This avoids a second travel model in
which the player can tow a station across the map in ordinary calendar time.

Use one authoritative quote for local and intersystem transfers. Local quotes
use metre distances and a documented tow-transfer profile; intersystem quotes
use the current cell-to-light-year conversion. No quote depends on FPS,
keyboard repeat, selected zoom, or time spent reading a panel.

For local jobs, manual movement is for staging and final approach, not a way to
skip the contracted transfer. Deployment requires a committed transfer receipt
even if the player manually reaches the destination. Define approach corridors
and quote endpoints clearly; do not reward an invisible movement restriction.
Set explicit route/duration limits compatible with date and phase arithmetic.

Initially generate endpoints in enterable slot-zero stellar systems. Validate
the destination against the catalogue; do not confuse co-located stellar
signals, rogue planets, or non-enterable slots with usable system endpoints.

## 7. Equipment, Crew, And Support Fuel

### Equipment progression

Add a modestly priced external coupler so local jobs are accessible early.
Treat it as certified hull equipment, not a cargo pod or biological stasis
upgrade. Define its fitting limit explicitly rather than inventing a universal
module system.

A three-berth hypersleep module consumes one genuinely available special-purpose
bay. Replacement upgrades reuse that bay. Add a clear damage/repair policy:
for version one, a certified functional module supplies all rated berths;
an inoperative module supplies none. Per-berth damage can wait.

Count all living crew aboard, including injured crew, not only a selected
specialist. The current roster is the authoritative set of occupants; do not
add an invisible fourth captain. Recheck capacity after hiring or changing
equipment. Name the long-voyage threshold in simulated seconds and show it
in the manifest.

Long journeys use certified autonomous navigation while everyone sleeps.
Crew planning bonuses are evaluated before departure; do not require an awake
pilot to perform the skipped journey or silently waive a crew member's berth.

Enable a limited set of genuine engine refits through the existing shipyard,
with prices, repair integration, save fields, and haul ratings. Preserve current
untowed speed controls; do not silently make normal travel use display-only
drive-efficiency statistics.

### Contractor support ledger

Use a separate ledger attached to the accepted package. Provision it against
the approved route with a visible allowance for departure and final approach.
Reserve enough support for valid manoeuvring; do not drain it merely because
the player reads a dossier or pauses.

The quote checks sufficient remaining support before departure. The committed
journey deducts the quoted amount once. At deployment/recovery, unused support
and the tank belong to the contractor/installation and leave the ship.

Keep wet departure mass conservative throughout this version. Modelling a
changing tank mass and detailed propulsion energy is not necessary, but labels
must not pretend the game's abstract fuel units are physical kilograms.

### Preserve onward capability, not just a fuel number

Leaving normal fuel unchanged is necessary but not sufficient: a very distant
delivery could still strand the player. Preflight must prove one of:

- Existing normal fuel can reach a known usable resupply station after delivery,
  using the existing engine/crew fuel rules and a safety margin.
- The delivered automated depot will provide fuel, and a one-time contractor
  commissioning allowance covers a defined normal-tank refill. After that
  refill, the ship must still be able to reach another usable resupply station
  or a verified safe onward route; filling the tank alone does not prove this.

Reject or do not generate other routes in version one. Do not promise an
unfunded round trip. A commissioning allowance is an idempotent restricted
service, not saleable fuel cargo or unlimited free refuelling. Neither the
support tank nor cancellation may generate tradable fuel.

## 8. Bulk Time Advancement

Create an explicit simulated-seconds bulk-time API. Share the existing frame
conversion constant between `Game` and `SolarSystem` without changing its value.
Expose analytic orbit advancement in simulated seconds; keep the current frame
wrapper so ordinary update/zoom behaviour remains stable.

For a committed journey:

1. Prepare destination, arrival placement, duration, support deduction, and
   all required effects without mutating live state.
2. Advance the calendar once by the quoted simulated seconds.
3. Advance applicable orbital phases analytically, not by replaying frames.
4. Apply arrival/mission changes and persist a single coherent checkpoint.
5. Show the departure/arrival dates, elapsed duration, and package status.

Bulk catch-up needs an explicit persistence policy. Preserve current local
frame/zoom semantics rather than silently converting the whole universe to a
new absolute-time simulation. Track cumulative bulk-advance seconds in the time
owner and a last-applied bulk watermark with saved orbital state. Apply only
the missing bulk delta when a system is materialised; generated unvisited
systems use the bulk epoch's zero watermark. An active system advanced directly
must record its new watermark, preventing a second catch-up on re-entry.

This watermark is not a second calendar. Only the time owner changes it, and
each committed journey increments both it and the calendar once. Document this
bounded compromise; a universal ephemeris/time redesign is separate work.

Audit planetary, lunar, stellar, station, and deployed-asset updates. Keep
per-host orbital geometry correct in binary/trinary systems, with no doubled
time-acceleration conversion.

Version-one large-time policy:

| System | Policy |
| --- | --- |
| Game date and orbital phases | Advance by the committed duration. |
| Sealed biological specimens and sleeping crew | Remain reliably preserved; no surprise decay or random sleep deaths. |
| Surface encounter fields | Preserve the existing paused/local-time abstraction. Do not simulate years of creature AI. |
| Existing missions | Preserve current non-expiring terms; do not introduce retroactive deadlines. |
| Station markets | Preserve current stock rules. A calendar jump is not an unlimited restock or contract-refresh trigger. |
| Salaries, ageing, colony growth, stellar evolution | Do not invent recurring charges or evolutionary changes absent from current gameplay. |
| UI/HUD/approach state | Clear stale targets/annotations and rebuild for arrival. No wall-clock animation may drive scientific time. |

The operation must be bounded by records actually needed, not simulated days
or every star in the Galaxy. A century-long fixture should not require more
simulation steps than a one-day fixture.

## 9. Persistent Infrastructure

Use a compact player-world registry keyed by full system address and stable
asset ID. Generated system blueprints remain immutable. Materialise a small
overlay after natural system construction, before station/target resolution.

Persist installation kind, service profile, stable orbit host, orbital distance,
phase/epoch, and source contract. Do not save live `Starbase` instances or mutate
the generator cache. Use existing stability/uncrowded-orbit helpers to choose
deployment sites, including conservative binary/trinary stability limits.
Reserve a site's identity when accepting the contract.

An installation's phase epoch/bulk watermark starts at commissioning. Catch-up
must never apply journeys that occurred before the installation existed.
Materialisation must reproduce the saved identity and orbit exactly, without
the normal station constructor rerolling them or perturbing natural PRNG state.

First useful installation types:

| Type | Real first-version utility |
| --- | --- |
| Navigation buoy | Persistent named scan/navigation target, registered route marker, and detectable technology signal. It is not a staffed port or an unexplained drive buff. |
| Automated depot | Existing depot trade, paid fuel service, and basic repairs, plus the restricted commissioning allowance where quoted. No crew office, full shipyard, or mission factory. |

A separate scientific package is optional later content, not required to finish
the first release. A label with no useful interaction should not count as a
third gameplay installation.

Audit and update all singular-station consumers: target cycling, nearby-object
lookup, orbit updates, rendering/minimap, docking, commerce keys, active-location
restore, system bounds, scan summaries, and Observatory technology evidence.
Use station ID resolution over the station collection; keep a legacy primary
alias only where behaviour is deliberately equivalent.

Depot capability/commerce selection must use an explicit profile or reliable
kind, not accidentally infer services solely from a new asset's display name.
Restore the registry before restoring a docked location at a deployed depot.

Registry revisions invalidate prepared scene/Observatory caches, including
when the player is stationary. Worker-produced natural catalogue data remains
pure; merge deployment evidence at the world-query boundary. A buoy or depot
adds a technosignature, not a colony, managed biosphere, or indigenous life.

## 10. Offers And Economy

Use stable contractor, package, and site IDs and a separate haul-generation
version/PRNG namespace. Build a small bounded set of offers lazily at mission
boards. Do not regenerate natural planets or search the entire Galaxy every
frame to discover a destination.

Offer generation should check enterability, stable deployment geometry,
infrastructure absence/reservation, distance, supply access, and contract tier.
Show requirements even if the current ship cannot meet them; refuse acceptance
with a specific missing-capability explanation. Availability should not depend
on repeatedly opening the board or skipping calendar years.

Vary jobs through payload kind/mass, local versus intersystem route, remoteness,
available resupply, and the infrastructure they leave behind. A modest number
of hand-tuned templates with deterministic parameters is enough initially.
Do not promise danger or urgency that the game does not actually simulate.

Provisional reward bands, to tune during playtesting:

| Tier | Initial reward target |
| --- | --- |
| Light local tow | 1,200-2,000 Cr |
| Equipped intersystem haul | 3,000-6,000 Cr |
| Uncommon demanding deployment | 8,000-15,000 Cr |

These are proposed values, not current economy constants. Existing survey
fees are commonly hundreds to low thousands of credits; a cargo pod costs
650 Cr, and Observatory classes cost 3,600 / 9,200 / 19,800 Cr. Use those
progression anchors and the intended ordinary 1,000-Cr start, not the temporary
5,000-Cr test start, when setting coupler, berth, and drive prices.

Freeze rewards using reference-job difficulty and bounded distance/remoteness,
plus fitting/commissioning requirements. Do not pay by actual player elapsed
time, deliberate underpowered fitting, detours, or a percentage of the asset's
enormous capital value. Calendar time alone is not an effective economic cost
while there are no recurring expenses or meaningful deadlines.

Retire completed/cancelled site contracts and prevent duplicate commissioning.
No repeated instant deployment into the same site, free fuel resale, board
refresh farm, or years-skip money multiplier. Rare high rewards should unlock
another useful purchase, not make all other earning loops irrelevant.

## 11. UI And Controls

Reuse the sparse terminal identity: thick headings and command keys, thin
readouts, restrained cyan/green/yellow highlights, and colour-coded readiness.
Use existing scrolling popup and `TerminalTextReveal` helpers where appropriate;
any key can finish cosmetic typing, but the same key must not also launch a
journey, couple, or deploy.

Provide access from the starbase mission board, mission journal, and Ship
Operations. Keep `O` as Operations; audit context hotkeys before assigning a
new shortcut. A bottom-menu action must reach every essential command even
when no new dedicated key is available.

The paused manifest should show:

- Payload, mass, coupler limit, drive readiness, and attachment state.
- Pickup, destination coordinates/name, and current-stage navigation target.
- Expected duration and departure/arrival dates.
- Required and functional berths, with the crew count.
- Contractor fuel required/remaining and onward-resupply assurance.
- Fixed payment, cancellation policy, and concrete readiness/refusal reasons.

Confirmation must clearly distinguish accepting a job, attaching a package,
starting the long voyage, and deploying it. Escape returns to play; arrows and
PageUp/PageDown scroll informational panels. Reading pauses time.

Draw a small symbolic package and connector behind the ship in system space,
using its last movement direction and the existing pixel/ASCII palette. It is
an explicit schematic, not a kilometre-scale collision body. Scale classes
change the compact silhouette/label rather than covering the scene with a
literal station footprint. Protect ship/target glyphs and modal layering;
moving or uncoupling must clear previous pixels. A concise bottom-bar status
indicates towing without disrupting existing responsive status columns.

## 12. Save And Command Safety

Add explicit fields/migration for haul state, new equipment, deployment
registry, journey receipts, and orbital bulk watermarks. Old saves default to
no haul, no purchased hypersleep/coupler, and no deployed infrastructure.
Default biological stasis remains available exactly as it is now.

Validate finite positive masses/durations, valid addresses/hosts, supported
kinds, bounded auxiliary fuel, unique IDs, stages, and cross-references.
Reject inconsistent records such as a paid deployment with an attached copy
or a docked deployed-station ID absent from the registry. Keep normal location
fallback/recovery rules explicit rather than silently respawning a parcel.

Audit every mission union consumer and save validator. Introduce positive
biological-objective type guards; never let `kind !== 'scan'` mean biology once
haul objectives exist.

Use one coordinated, idempotent departure/deployment operation with a stable
operation ID. Persist all affected owners in the same game checkpoint; do not
save payment separately from deployment. If checkpointing fails, report it and
leave a coherent recoverable state rather than continuing with a half-committed
operation. Test the save-failure/rollback policy before exposing production
offers. Prevent held keys or repeated events from committing twice.

## 13. Programming Milestones And Commits

Implement in order. Each milestone has a narrow verification gate and should
be committed once that gate passes. Keep production offers unavailable until
the vertical slice can be completed safely.

Before application tests, profiling, or browser verification, tell the user
what is ready and request the switch to Luna. Keep test-writing separate from
executing the checks. Report results and remaining work before resuming feature
development. Escalate unresolved clock, persistence, or orbital correctness
decisions before building further features on them.

### M0 - Baseline And Integration Inventory

- Inspect current source/tests and confirm versions and ownership.
- Inventory mission discriminant assumptions, direct position mutations,
  station consumers, pause logic, and save-restore order.
- Record ordinary movement/fuel/rendering fixtures before changing them.
- Specify local, medium, and heavy route benchmarks; document the load curve,
  berth threshold, damage policy, module prices, and cancellation semantics.
- Add a deterministic test fixture with an issuer, pickup, safe destination,
  and resupply path. Do not change production seeds to make testing easier.

Gate: baseline checks pass; proposed quotes satisfy the benchmark progression
without promising more capability than the code will implement.

Commit: `Document haul integration boundaries and baseline fixtures`.

### M1 - Domain, Quotes, And Lifecycle

- Add typed records, pure performance/support calculations, and service
  commands with explicit refusal results.
- Add haul mission/objective support and positive biological type guards.
- Establish canonical accepted terms, one-active-haul policy, cancellation,
  and destination-settlement commands without changing other mission rules.
- Test quotes independently of UI, FPS, and system zoom.

Gate: monotonic load/drive results, no-tow identity, invalid-value rejection,
single-package transitions, and no biological mission regressions.

Commit: `Add typed haul contracts and deterministic voyage quotes`.

### M2 - Equipment And Save Schema

- Implement coupler fitting, three-berth module, limited drive refits, prices,
  bay accounting, and visible damage/repair integration.
- Add snapshot validation/migrations for haul, equipment, time-watermark, and
  infrastructure record shapes; later milestones fill their behaviour.
- Recheck crew/module requirements on coupling and departure.

Gate: current and old saves load, fitted bays remain consistent, repairs restore
capability, and insufficient berths/mass rating produce useful errors.

Commit: `Add tow certification and crew hypersleep equipment`.

### M3 - Time And Safe Journey Execution

- Extract the unchanged shared time conversion and simulated-second orbital API.
- Implement lazy bulk catch-up, journey receipts, and the prepared arrival
  operation; protect normal fuel and consume only contractor support.
- Apply local handling to manual movement and approach assist. Block manual
  hyperspace travel while attached.
- Clear stale UI/navigation state and enforce coherent checkpoint failure
  behaviour. Use fixtures until registry commissioning is available.

Gate: one action advances the exact quoted time/fuel once; reload/duplicate
events cannot repeat it; long jumps are bounded; ordinary travel remains stable.

Commit: `Execute supported haul journeys with analytic time advancement`.

### M4 - Persistent Buoys And Automated Depots

Implementation committed in `b079c5c`; new verification gate pending Luna.

- Implement registry overlays, reserved stable sites, and useful buoy targets.
- Materialise automated depots with existing services and restricted initial
  refuelling allowance.
- Replace singular station lookup assumptions where necessary; support docking,
  commerce identity, deployed orbits, system bounds, and docked save restoration.
- Merge technology evidence and invalidate relevant scene/Observatory caches.
- Commission, remove support, and settle escrow as one idempotent outcome.

Gate: deployed assets survive leaving/reloading, retain their market identity,
and work in single/multiple-star fixtures without changing natural generation.

Commit: `Persist and commission player-delivered frontier infrastructure`.

### M5 - Offers, Journal, And Playable Vertical Slice

Implementation committed, including playable controls and regression coverage.
Verification gate pending Luna; see `docs/heavy-haul-gameplay.md` for the walkthrough.

- Generate bounded stable offers, including an accessible local job.
- Integrate paused manifest, acceptance errors, pickup/arrival navigation,
  coupling, departure, final deployment, receipt, and cancellation/recovery.
- Selecting a remote endpoint marks its interstellar destination; inside that
  system, select the current-stage local package/site. Do not reinterpret a
  remote coordinate as a local body position.
- Expose actions through mission menus and Ship Operations.
- Only now enable production offers that pass geometry and onward-safety checks.

Gate: a player can complete local and intersystem jobs with no console commands,
return safely, and understand every requirement from the visible interface.

Commit: `Expose playable heavy-haul contracts and voyage manifests`.

### M6 - Rendering And UX Polish

- Add schematic attached-package models, connector drawing, and a compact status.
- Apply terminal typography/colour, responsive wrapping, and modal input ownership.
- Verify arrival/deployment feedback, keyboard-only access, and rejection text.

Gate: package, targets, HUD, and modal layers remain readable at desktop and
narrow widths; turning, departure, and uncoupling leave no artefacts.

Commit: `Polish towing visuals and terminal contract interaction`.

### M7 - Regression Verification And Balance

- Run focused suites, full `npm run check`, and browser/pixel verification.
- Play from normal starting resources, not only fully equipped fixtures.
- Tune duration, fitting costs, rewards, and destination availability against
  actual other earning loops; update the player guide and architecture notes.
- Document known limits and any deferred nonessential edge cases.

Gate: all checks pass, the starter progression is viable, delivery gives useful
infrastructure, and no duplication/stranding exploit remains.

Commit: `Verify and balance the first heavy-haul progression`.

## 14. Verification Matrix

| Area | Required checks |
| --- | --- |
| Quotes | Zero tow, increasing mass, better drive, damage, overweight payload, local/intersystem units, diagonals, and finite bounded outputs. |
| Crew/fitting | Starter roster, injured crew, extra hire, missing/full bays, replacement module, broken module, and repairs. |
| Travel | Fine/boost/manual bypass blocked, approach-assist factor agrees, arrival outside bodies, local transfer without sleep, and unchanged untowed movement/fuel. |
| Time | Exact quoted seconds, paused readouts, no accelerated-seconds double conversion, watermark catch-up exactly once, multi-star/moon phases, and large-duration performance. |
| Fuel/safety | Normal tank unchanged, support insufficient refusal, reserved final approach, inaccessible resupply rejection, one-time refill allowance, and no resale/cancellation exploit. |
| Lifecycle | Double acceptance/coupling/departure/deployment, wrong endpoint, changed capability, recovery, stale quote, and reserved-site collision. |
| Persistence | Migration defaults, every reachable haul stage, arrival receipt, commissioned asset, docked deployed-depot restore, duplicate IDs, malformed records, and failed checkpoint recovery. |
| Economy | Reward fixed across upgrades/idling, no issuer-return requirement for haul, other hand-ins unchanged, finite retired offers, and no time-skip restock farm. |
| Generation | Natural fingerprints unchanged, stable contract/site IDs, load/query order independence, valid binary/trinary deployment hosts, and worker/fallback agreement. |
| Rendering/UI | Package cleared after turning/recovery, no ship/star occlusion, modal precedence, mixed-font alignment, narrow wrapping, and no reveal-key activation leak. |
| Existing systems | Survey/xenobiology journal and CLAIMABLE status, specimen stasis/cargo, Observatory BIO/TECH filters, station commerce/repairs, and orbital/surface scenes. |

Place tests with current ownership: ship/navigation/interface core suites,
movement systems, generation, and rendering. Build pure-rule tests first, then
save/service integration tests, then rendered pixel/screenshot and browser
workflow checks. Do not require nondeterministic random missions to hit the
critical paths.

Use existing focused `npm run test:*` commands while iterating; run
`npm run check` before broad feature completion. Follow the project's
[change workflow](../ai-guide/change-workflow.md), [testing guide](../ai-guide/testing.md),
and [visual conventions](../ai-guide/visual-style.md).

## 15. Personal Playtest And Definition Of Done

Provide a documented development fixture/save, separate from production world
generation, with one local buoy job and one heavier depot job. It should be
possible to inspect the same flow in a fresh normally funded session.

1. Read both jobs in the mission board; inspect mass, destination, time, payment,
   and unmet requirements.
2. Buy the local coupler, accept the buoy job, select its pickup in the journal,
   rendezvous, attach, transfer, approach, and deploy without hypersleep.
3. Check the payment receipt and select/scan the new persistent buoy. Reload and
   confirm that it is still present and cannot pay again.
4. Fit the required drive and crew berths. Accept the depot job and confirm the
   manifest shows all crew supported and a safe onward plan.
5. Depart through Operations, observe the calendar jump and unchanged normal
   fuel, then make the final approach and commission the depot.
6. Dock, buy/sell, refuel, and repair using its actual limited services. Reload
   while docked, leave, and revisit; market/asset identity must survive.
7. Try insufficient berths, a damaged coupler, recovery/cancellation, held keys,
   and another ordinary mission. The game must explain refusals and remain
   playable without a haul attached.

The first release is done when these workflows work without developer
intervention, verification passes, and both delivered installation types are
useful afterwards. A functional quote panel alone is not the finished feature.

## 16. Deliberately Deferred

- Multiple simultaneous packages, arbitrary detachable salvage, and detailed
  cable/inertia/collision physics.
- Whole stations, new hull families, per-berth damage, and multi-leg tow convoys.
- Mid-voyage encounters, mandatory sleep failures, staff ageing, ongoing wages,
  deadlines, or preservation decay introduced solely to penalise calendar jumps.
- Refineries, antimatter harvesters, factories, and persistent production chains
  before their scientific/site/service requirements have a real implementation.
- Autonomous expansion of the human sphere and a live galaxy-wide economy.
- Optional manual strategic towing, which would need the same authoritative
  duration/support accounting per step rather than a loophole around transit.
- A universal absolute-epoch rewrite of all existing frame/zoom simulation.

Extend only after the first deliveries, fitting decisions, and resulting useful
frontier services prove enjoyable. More asset names or astronomical masses do
not compensate for an unclear or repetitive contract loop.
