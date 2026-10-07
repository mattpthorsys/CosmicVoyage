# Automated Frontier Depots: Implementation Plan

Status: M0-M2 implemented; automated verification pending the requested Luna stage.
M3 onwards remain planned. See [the current depot guide](../automated-depots.md)
for implemented controls, recipes, ownership and verification commands.
Baseline inspected on 2026-10-07: save schema 20. Recheck the current schema and
module boundaries before implementation; do not overwrite intervening changes.

## 1. First Playable Version

Turn the existing automated depots into useful, permanently uncrewed frontier
waystations. They support exploration through limited repairs, reactor fuel,
medical care, local supply/survey contracts, chart exchange and quiet broadcasts.
Some have modest autonomous extraction capability.

The player finds or delivers a depot, inspects its condition and supplies,
obtains available services, contributes materials or observations, and continues
exploring. Returning later reveals the same installation with updated stocks.
No facility management screen, NPC mining fleet simulation or mandatory waiting
is required.

First-version scope:

- Existing generated depots and player-delivered depots use the same service rules.
- Hull and rover repair are limited by materials, parts and workshop capability.
- Refuelling consumes finite supplies rather than granting an unlimited paid top-off.
- Robotic treatment restores injured crew using finite medical supplies.
- Small extraction units replenish suitable bulk materials slowly, up to storage caps.
- Depot jobs request actual supplies or useful observations; accepted terms remain fixed.
- Chart exchange rewards new or improved evidence without repeat-sale exploits.
- Nearby broadcasts advertise real services, shortages and a few opportunities.
- Supplies, receipts, observations and notices survive travel and save/load.

Do not add recruitment, advanced ship refits, full hospital simulation, autonomous
colonisation, station ownership, cable physics or a universal remote marketplace.
Do not increase depot generation density just to demonstrate the feature.

## 2. Actual Starting Points

| Current owner                                                                                | Existing behaviour                                                                  | Required extension                                                                                      |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [`Starbase`](../../src/entities/starbase.ts)                                                 | Stable station IDs; automated-depot type; trade, fuel and basic repair capabilities | Explicit robotic medical, survey-exchange and automated-job capabilities; accurate operational notices  |
| [`StarbaseCommerceService`](../../src/core/starbase_commerce.ts)                             | Persistent market quantities, prices and cargo transactions                         | Canonical depot consumables, finite service stock and coordinated inventory transactions                |
| [`ShipRepairConsole`](../../src/core/ship_repair_console.ts)                                 | Paused diagnostic terminal; basic hull/rover work orders                            | Material requirements, achievable repair amount and partial-work quotes                                 |
| [`InfrastructureRegistry`](../../src/core/infrastructure_registry.ts)                        | Persistent delivered installations, orbital catch-up and service materialisation    | Initialise depot operations at commissioning without duplicating natural stations or resetting supplies |
| [`MissionProgressService`](../../src/core/mission_progress.ts)                               | Accepted contracts, objective progress, claims and station identity                 | Explicit material-delivery objectives and atomic cargo/stock/payment settlement                         |
| [`station_mission_offers.ts`](../../src/core/station_mission_offers.ts)                      | Bounded, station-specific staffed-port offers                                       | Separate bounded robot supply/survey offers, not the full staffed-port board                            |
| [`ScanService`](../../src/core/scan_service.ts)                                              | Planetary and stellar discovery progression                                         | Publish qualifying observation improvements to a shared survey-data owner                               |
| [`ObservatoryService`](../../src/core/observatory_service.ts)                                | Bounded remote evidence and marked destinations                                     | Import/export measured chart information without inventing scans or revealing ground organisms          |
| [`CrewMember`](../../src/core/crew.ts)                                                       | Persistent HP, medical skill and identity                                           | Robotic treatment through the existing roster and health rules                                          |
| [`simulation_time.ts`](../../src/core/simulation_time.ts)                                    | Normal accelerated time and explicit bulk jumps                                     | Depot elapsed-time catch-up using total simulated time                                                  |
| [`starbase_ui.ts`](../../src/core/starbase_ui.ts), [`text_ui.ts`](../../src/core/text_ui.ts) | Capability-filtered panels and reusable terminal formatting                         | Depot overview, medical/survey readouts and resource-aware rows                                         |
| [`save_game.ts`](../../src/core/save_game.ts)                                                | Versioned snapshots, migrations and strict validation                               | Depot operations, survey settlement ledger and bounded communications state                             |

Important gaps in the current code:

- Basic repair currently restores all eligible damage for credits, without materials.
- `refuel()` has no station argument and purchases unlimited top-off fuel after
  trying the player's carried fusion fuel.
- Automated depots currently have `missions: false`; their Research section is
  also hidden by station kind. Medical care is not a functioning station service.
- Ordinary survey payouts are contracts, not a general astrometric-data market.
- The observatory keeps at most 4,096 detailed records and may evict records.
- Infrastructure records cover delivered installations, not naturally generated depots.
- The delivered-depot message about awaiting staff is cosmetic, not an upgrade process.

## 3. Ownership And Integration

Prefer cohesive services and pure rules over a general station-simulation framework.
Module names below are proposed; merge small helpers where that is clearer.

| Owner                                   | Responsibility                                                                             |
| --------------------------------------- | ------------------------------------------------------------------------------------------ |
| `core/depot_types.ts`                   | Profiles, operational records, stock requirements, work orders and snapshots               |
| `core/depot_rules.ts`                   | Pure repair/treatment recipes, capability checks, production and quote calculations        |
| `core/depot_service.ts`                 | Persistent operational state; elapsed-time catch-up; validated service commands            |
| `core/depot_contracts.ts`               | Bounded funded requests derived from real local needs and survey gaps                      |
| `core/survey_data_service.ts`           | Measured evidence, provenance, chart exchange and campaign-wide submission ledger          |
| `core/depot_communications.ts`          | Nearby broadcasts, deduplication, notice expiry and readonly inbox models                  |
| Existing commerce owner                 | The single canonical item inventory and all stock transfers                                |
| Existing mission owner                  | Accepted terms, progression and completed-contract identities                              |
| Existing infrastructure owner           | Location, orbit, commissioning allowance and delivered-asset identity                      |
| Existing station/operations controllers | Selection, scrolling, confirmations, return paths and terminal reveal                      |
| `Game`                                  | Wire owners together, publish effects, checkpoint successful operations and prepare models |

Keep depot gameplay out of renderers. Models display prepared stock and quotes;
opening a panel or drawing another frame must not grant supplies, money or care.
Run catch-up explicitly before preparing a service model or committing a command.

### One physical inventory

Use the persistent station economy's item quantities as the canonical inventory.
Depot operations reference item keys, capacities and reservations, not a second
copy of the same metals, fuel or medicines. Add narrow inventory APIs instead of
letting depot code mutate commerce internals.

First audit the existing fuel representations. `FUSION_FUEL_MIX` purchases become
separate helium-3/deuterium cargo, while those materials also have individual
listings. For depots, make a blend listing a derived bundle of the canonical
components, or remove that listing. It must not create an independent reserve
that can be sold and also used for refuelling.

Keep the contractor's commissioning fuel allowance separate. It is restricted
support, not saleable inventory; loading it must decrement its existing ledger.
Preserve the deferred homebound route and ordinary ship return capability.

### Minimal persistent records

| Record                   | Minimum contents                                                                                                                                                             |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Depot operational record | Stable station ID, full system address, profile/version, initialisation epoch, last-updated simulated seconds, bounded production carry, job revision and reserved job funds |
| Depot profile            | Workshop/service limits, per-item storage caps, production recipes/rates, real extraction source or no-mining designation, initial supply policy                             |
| Service quote            | Station/target IDs, input revision, requested and achievable work, component quantities, player-supplied quantities, cost and refusal/shortfall reasons                      |
| Survey evidence          | Stable object address/body path, evidence category, quality tier, observation epoch/method and provenance                                                                    |
| Survey settlement        | Object/category key and highest remunerated tier; persist independently of detailed catalogue eviction                                                                       |
| Communications notice    | Stable source/content revision, type, concise text, address, issue/expiry time and read state                                                                                |

Use total `gameClockElapsedSeconds`, not `bulkAdvanceSeconds`, for production.
The latter excludes ordinary elapsed time. Cargo quantities remain in the game's
existing cubic-metre units; repair points, reactor units, seconds and integer
credits remain separate units with explicit conversion recipes.

Natural depots initialise once on first materialisation, using a stable profile
seed independent of world-generation PRNG streams. Delivered depots initialise
at commissioning. Neither receives hypothetical production before its epoch.
Previously visited depots retain existing market stock when migrated; seed only
new service supplies, never overwrite depleted quantities or refill the haul allowance.

## 4. Rules And Gameplay Limits

### Repairs, fuel and medical treatment

- Quote material/part requirements and the amount actually repairable before purchase.
- Allow partial hull/rover repair when stock is insufficient for complete restoration.
- Workshop rating limits supported tasks, not an arbitrary permanent hull-HP cap.
  A basic depot cannot rebuild engines, shields or hypersleep systems.
- Offer one explicit action to contribute carried materials to a quoted work order.
  Do not silently consume cargo that the player may want for another contract.
- Manufactured repair spares and medical supplies need appropriate goods definitions.
  Existing trusses/metals can be reused where sensible; medical isotopes alone
  are not a universal treatment kit.
- Convert station fusion components using the existing gameplay reactor recipe.
  Show missing helium-3 or deuterium separately. Do not silently manufacture either.
- Quote cargo-assisted fuel loading before applying it. Preserve ordinary staffed-port
  refuelling behaviour unless deliberately changed in a separate task.
- Treat eligible injured roster members under existing HP semantics. Do not invent
  resurrection, new diseases or changed crew-death rules in this milestone.
- Deduct stocks and credits only for work actually performed. Failed orders change nothing.
- Quantise fractional material use through documented batches or bounded carry;
  repeated tiny repairs must not become free through rounding.

The interface must distinguish unsupported service, unavailable supplies,
insufficient credits and fully restored condition.

### Background extraction

Give each mining-equipped depot at most a few verified extraction outputs.
Begin with existing metal/volatile resources whose local presence can be checked
without preparing terrain. If the current catalogue cannot substantiate a source,
mark the depot supply-dependent rather than inventing an asteroid field.

Do not mine pharmaceutical packs, silicon electronics, navigation beacons or
ready-made helium-3/deuterium fuel from arbitrary rock or water ice. Advanced
processing and specialised harvesting can be separate later features.

Catch-up uses elapsed simulated seconds and bounded analytic calculations, not
one tick per frame, hour or day. Capacity-limited overflow is discarded and the
epoch still advances; there must be no banked overflow that instantly refills
stocks after the player empties them.

First-version hardware has a documented sustainable operating rate and resource
profile. Avoid adding reactor/power-grid simulation or automatic manufacturing.
If a production recipe consumes inputs, clamp by every required input as well
as output capacity, and test large versus partitioned advances.

Calibrate against the accelerated calendar: roughly four real hours represent
one Julian year. A nominal daily rate can replenish surprisingly quickly during
ordinary play. Menu time is paused; hypersleep and deliberate observatory
integrations count as actual elapsed simulated time.

### Supply and survey contracts

Use a small dedicated robot board: initially at most two supply requests and
one local survey request per depot, subject to need and funding. Do not enable
the existing staffed-port board wholesale.

Add an explicit delivery objective with item key, quantity and issuing station
ID. Do not pretend commodities are specimens or use display names as identity.
Cargo possession makes a request claimable only while sufficient cargo is held;
selling that cargo must revert eligibility. First-version delivery occurs at
the issuing depot in one handoff, not through a partial-delivery tracking system.

Acceptance uses the existing YES/NO dialogue. Accepted quantity, destination,
reward and funding are fixed and saved. Autonomous replenishment does not
invalidate an accepted contract. Fulfilment consumes the required cargo,
increases station stock, releases escrow and pays once. Reserve sufficient
storage for an accepted delivery or provide a defined overflow receipt path;
do not reject a valid return merely because miners filled the store meanwhile.

Jobs derive from low consumable stock, workshop/medical needs and reachable real
survey targets. Use stable revisions and conservative completion cooldowns.
Reopening menus, draining stock through purchases or entering hypersleep must
not instantly reroll lucrative offers. Cancellation releases reservations but
does not reset its offer into an immediate farming loop.

Survey objectives use full addresses/body paths and actual measurements. Current
discovery progression includes name-based matching; add address-aware matching
where needed rather than paying for an identically named body elsewhere.

### Scientific data and economy

Separate measured player evidence from acquired public charts. Imported charts
may improve navigation knowledge, but cannot be uploaded as the player's novel
research. Downloading records must not mark orbital/surface objectives complete
or reveal species, biome coordinates or specimen novelty.

Use a few discrete quality tiers rather than paying for every confidence
increment. Remote stellar observations and local system/orbital surveys have
different evidence categories; remote spectroscopy does not count as a full
in-system survey. Only real improvements cross a remunerated threshold.

The submission ledger is campaign-wide across all buying stations, not per
depot. Keep it after an observatory detail record is evicted. Credit a tier
once; if the depot cannot fund it, retain the upload as unpaid evidence rather
than marking it sold. Where survey contracts and general uploads overlap,
state the policy: contract premiums may stack with one base data sale, but
the same base evidence cannot be bought twice.

Initial reward calibration should use existing market and contract values:

- Common charting pays small amounts; a useful local survey pays more.
- Frontier novelty and genuine quality improvements matter more than distance alone.
- A normal exploration trip should offset some fuel/repair costs, not immediately
  purchase the highest observatory class or overshadow xenobiology and hauling.
- Supply contracts pay material replacement value plus a modest logistics premium.
- Contract rewards use reserved sponsor funds. General survey purchases have a
  bounded sponsor-funded allowance, separate from physical resource stock.
- Mining creates goods, not credits or unlimited research funding.
- Check buyback prices, bundle conversions and treatment/repair costs for arbitrage.

## 5. Interface And Communications

Reuse the station screen, terminal reveal, formatted dossier/table components,
confirmation dialogue and bottom command bar. Do not create a second station UI.

Depot overview shows concise operational facts: robotic status, hull/rover
workshop availability, fuel components, medical supplies, extraction outputs,
shortages and nearby jobs. Details live in focused panels rather than a long
opening blurb. Replace the staff-arrival notice with actual robotic operational
status; staffing is not required to make the depot functional.

Keep thick text for titles, headings and key tokens; thin text for body content.
Use cyan for instrument headings, green for available service, amber for limits
and claimable work, red for blocking shortages, and muted text for secondary data.
Preserve fixed font-cell alignment and existing measured wrapping/scrolling.
The first key during a reveal completes it without also purchasing or submitting.
Esc returns to the parent panel, not travel; all reading/confirmation overlays
pause simulation and fully occlude orbital/map graphics.

Expose chart exchange as an explicit capability/panel. Do not turn on the entire
Research section and accidentally grant depots specimen-buying or biological
services. Medical treatment belongs under Services, not crew recruitment.

Broadcasts use a finite configured communications radius, independent of screen
width and scientific scan reach. Discover contacts through existing physical
catalogue/infrastructure descriptors, with bounded work and cancellation; do not
materialise every nearby system or prepare terrain for every hyperspace step.

Generated stations are not all present in `InfrastructureRegistry`; query both
natural descriptors and delivered overlays, deduplicating by station ID. If
those descriptors lack station information, add a narrow cached/worker summary
query rather than a parallel depot-existence roll.

Give the player one brief notification for a new relevant contact or important
service change. Store the rest in a bounded Communications inbox accessible
through Ship Operations and a clickable travel-menu entry. Choose a hotkey only
after checking the current input map. Notices contain source, coordinates,
timestamp, services and optionally a job reference; selecting a destination
uses existing marked navigation, not teleportation.

Remote notices can be stale: show their timestamp, and refresh/requote on arrival.
First-version job acceptance, material handoff and paid services happen at the
depot. Remote transactions can follow later. Expired notices can be discarded;
accepted missions and payment receipts cannot.

## 6. Save Size And Integrity

Add versioned snapshots through the existing save boundary. Start new sections
empty on migration, then initialise a depot once when materialised. Validate
addresses, station IDs, profile versions, enums, finite quantities, capacities,
epochs, reservations, provenance and cross-owner receipts before restoring.
Reject prototype-polluting keys as existing mission/save validation does.

Store compact object keys, evidence tier codes and numeric measurements actually
needed by gameplay. Regenerate static labels/properties from seed and address;
never serialize terrain maps, rendered images, synthetic spectra arrays or one
full catalogue per station. Existing discovery/observatory owners remain the
source of detailed observations wherever possible.

Proposed first-version budgets, to be confirmed with measured fixtures:

- Reuse the observatory's 4,096-detail-record limit; do not double its payload.
- Bound the inbox to 128 notices, removing expired/read low-priority notices first.
- Use compact submission entries with a generous initial ceiling of 16,384
  object/category keys. Never evict paid identities and permit a second payout.
- Target less than 1 MiB of additional serialized state for representative long
  campaigns, and measure stress-case JSON size and browser-storage impact.
- At a hard ledger/storage limit, retain existing records and clearly refuse new
  paid uploads. Do not silently delete receipts, lose the save or reset rewards.

These are engineering budgets, not a claim about guaranteed browser storage
capacity. Reconsider IndexedDB/compressed exports only if measured growth makes
the existing browser-save approach insufficient. Astrometric records do not use
ship cargo volume in this version.

All service and submission commands revalidate quotes before committing. Validate
stock, cargo, funds, eligibility and all target changes before touching owners;
publish effects only after the coordinated commit. Use revisions/operation IDs
for stale or repeated inputs. Checkpoint successful handoffs using the existing
save lifecycle, without introducing async saves inside a partially applied action.

## 7. Programming Milestones

Each milestone is a coherent commit after its verification gate. Add the focused
tests during implementation, then tell the user before running tests/browser
checks so they can switch to Luna. Do not describe written tests as verified.
For this M0-M2 batch, implementation commits precede the requested separate Luna
verification stage; corrective commits follow if that stage identifies problems.

### M0: Persistent Operations And Inventory Boundaries

Implement typed depot profiles/snapshots, explicit initialisation, elapsed-time
epochs and canonical stock APIs. Add the next save migration and validation.
Wire natural and delivered station materialisation to the same owner. Production
is initially disabled; existing services remain unchanged until their next stage.

Acceptance: leave/revisit and save/reload preserve stock and profile; two depots
cannot share inventory; delivered allowances/homebound routes remain intact.
Initialise from dedicated stable seeds without changing galaxy fingerprints.

Tests: both depot origins, depleted legacy markets, stable IDs, snapshot isolation,
malformed imports, duplicate initialisation and future/invalid epochs.

Suggested commit: `Add persistent automated-depot operations and shared stock APIs`.

### M1: Finite Repairs And Reactor Fuel

Add repair-material/spares recipes, partial work orders and resource-aware quotes.
Extend the repair console through prepared quotes rather than embedding recipes
in its controller. Introduce a station-aware refuel path, canonical fuel bundles
and explicit player-cargo contributions. Keep staffed-port service paths unchanged.
Update the depot overview and remove misleading staff-arrival messaging.

Acceptance: damaged hull/rover can be restored only as far as capability and
supplies permit; depleted stock stays depleted; fuel quotes identify component
shortages; unsupported subsystem repairs remain unavailable.

Tests: partial/full/zero work, rounding, stale quotes, insufficient materials or
credits, fuel aliases, commissioning allowance, duplicate actions, cargo consent
and unchanged staffed-port prices/behaviour.

Suggested commit: `Make robotic depot repairs and refuelling resource-limited`.

### M2: Robotic Medical Services

Define an appropriate medical commodity and treatment recipe. Add a paused
crew-status/service terminal using existing health data and text-model helpers.
Offer selected/all eligible treatment with a quote and clear supply limits.

Acceptance: actual injured roster members are treated; stocks and credits
decrease correctly; healthy crew incur no cost; recruitment remains unavailable.

Tests: partial supplies, mixed health, missing/changed crew IDs, stale quotes,
no over-healing, zero-cost no-op and save/reload of HP and consumed supplies.

Suggested commit: `Add supply-limited robotic medical treatment at depots`.

### M3: Capped Autonomous Extraction

Determine real suitable source descriptors, derive conservative depot extraction
profiles and implement analytic catch-up. Supply-dependent depots stay useful
without miners. Show output, caps and last update in a short resource report.
Do not add natural-depot locations or consume existing generation streams.

Acceptance: eligible stocks replenish across normal travel, observatory time and
hypersleep; full stores discard overflow; unsupported products never appear;
no visible waiting or background frame simulation is required.

Tests: zero/negative/huge elapsed time, paused menus, fractional accumulation,
capacity saturation, full-store overflow, bounded input/output recipes, source
eligibility, bulk versus partitioned catch-up and repeated reloads.

Suggested commit: `Add capped elapsed-time resource extraction to frontier depots`.

### M4: Local Robot Supply And Survey Contracts

Add the explicit delivery objective and update all objective-union consumers:
mission progress, shortfalls, journal, navigation, formatting, confirmations,
station selection and save validation. Supply handoffs transfer cargo and pay
reserved rewards atomically. Reuse existing scan objectives for local surveys,
fixing address matching where necessary. Enable only the robot-board capability.

Acceptance: real shortages create bounded varied offers; missions show coordinates
and CLAIMABLE status; accepted promises survive replenishment and reload;
returning with cargo produces a clear receipt and one reward.

Tests: insufficient/sold cargo, wrong depot, identical names at different
addresses, reservations, full stores, cancellation, duplicate claim, offer
cooldown, fixed accepted terms and unchanged biology/haul/survey contracts.

Suggested commit: `Add funded supply and survey contracts to automated depots`.

### M5: Compact Astrometric Exchange

Add the shared evidence/submission owner and feed it genuine improvements from
stellar scans, system/orbital surveys and observatory observations. Implement
public-chart provenance, finite funded upload quotes and navigation-only chart
downloads. Add a focused survey-exchange panel without enabling biological trade.

Acceptance: ordinary exploration creates useful saleable records; the player
sees expected payment; repeat scans/sales do not pay twice; downloaded charts
cannot be resold as research; unpaid evidence remains available for later upload.

Tests: quality thresholds, public versus measured evidence, cross-station sales,
catalogue eviction, failed funding, duplicate submission, contract overlap,
address/body identity, limits, migrations and serialized size fixtures.

Suggested commit: `Add bounded chart exchange and campaign-wide survey payments`.

### M6: Nearby Broadcasts And Communications Access

Implement bounded contact acquisition for natural/deployed depots, content
revision deduplication and the Communications inbox. Expose it through Operations
and the travel command menu. Link to existing missions/navigation destinations;
keep remote notices informational and timestamped.

Acceptance: crossing into range produces one relevant notice; the player can
find depot coordinates, inspect shortages/jobs and mark a route without HUD spam.
Changing display width does not change communications reach.

Tests: radius boundaries, contact deduplication, stale updates, cancellation,
same-seed worker/fallback results, notification throttling, inbox caps, modal
input/reveal behaviour and save/reload of read states.

Suggested commit: `Add quiet frontier-depot broadcasts and a communications inbox`.

### M7: Whole-Loop Verification, Balance And Documentation

Run the focused new suites and existing commerce, repair, crew, mission,
observatory, infrastructure and save suites, followed by `npm run check`.
Use browser fixtures at desktop and narrow/mobile widths for the complete loop.
Compare unaffected travel/orbit/surface drawing to existing regression baselines.

Acceptance: the player can discover a depot, repair/refuel, receive medical care,
complete a funded delivery/survey, sell new observations, leave, advance time and
return to coherent supplies and records. No duplicate money, resetting stock,
changed ordinary travel or broken deferred haul return routes.

Check normal-route earnings against exploration costs and major equipment prices.
Tune rates/rewards with explicit benchmark journeys rather than anecdotes. Add
`docs/automated-depots.md` with controls, actual limits, ownership, verification
results and a manual playthrough. Update the AI guide/module map when implemented.

Suggested commit: `Verify and document the frontier-depot exploration loop`.

## 8. Manual Test Route

Use a deterministic browser/save fixture placing one supply-dependent depot and
one extraction-equipped depot within reachable space. This avoids making the
starting galaxy artificially crowded. Include damaged hull/rover, injured crew,
some useful cargo and a nearby unmeasured system; no permanent testing credits
or production cheats are needed.

1. Enter broadcast range, read the notice in Operations and mark its coordinates.
2. Approach/dock; confirm the station says robotic services, not staff awaited.
3. Request repair/refuelling; inspect shortages, confirm partial work and check
   that unsuccessful actions charge nothing.
4. Contribute carried material explicitly; receive care for an injured crew member.
5. Accept a supply request using YES/NO. Check coordinates and quantity in Missions.
6. Obtain supplies elsewhere, return, see CLAIMABLE and hand them over once.
7. Observe/scan the nearby system; review/upload the data and its payment quote.
8. Try the same upload again and at another depot: the paid tier has no new value.
9. Leave and advance time, including a haul/hypersleep journey; return to bounded
   replenishment at the equipped depot and no invented supplies at the other.
10. Save/reload at several stages; check inventories, health, receipts and routes.
11. Repeat panels at narrow widths: selected rows remain visible, thin/thick text
    align, long descriptions wrap and the first reveal key never submits an action.

## 9. Recommended Implementation Batches And Deferred Work

Begin with M0-M2: persistent inventory, useful finite services and robotic medicine.
That is a coherent first playable improvement without introducing broadcasts,
survey payout rules and background production at the same time. Add M3-M4 next,
then M5-M6; M7 verifies the combined release. Keep milestone commits separate.

Postpone advanced refineries, dedicated gas-giant fuel harvesters, visible mining
craft, module damage/depot maintenance simulation, route-wide communications,
remote acceptance/payment, biological specimen markets, orbital observatories
that collect their own paid data, staffed upgrades and broader human expansion.

The most sensitive work is shared inventory/transaction ownership, survey
provenance and bounded time catch-up. Resolve those invariants before adding more
content. Notify the user before the planned test and browser-verification gates
so they can switch to Luna as requested.
