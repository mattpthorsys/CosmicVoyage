# Xenobiology: First-Version Implementation Plan

Status: bounded first version implemented, including the M0-M5 contracts and
M6's automated integration/graphics verification and documentation. Long-session
economy balance and enjoyment remain playtest questions. Read the
[current implementation and player guide](../xenobiology.md) for exact controls,
equipment envelopes, limitations and verification commands.
Codebase baseline inspected: 2026-10-03. Recheck source contracts before starting
each milestone; implementation is authoritative when older notes disagree.

This is the programming guide for a bounded, playable xenobiology feature.
[The expansion roadmap](xenobiology-expansion-roadmap.md) describes optional
later directions, not additional requirements for this version.

Navigation: [scope](#2-first-version-scope),
[codebase foundations](#3-existing-foundations-and-limits),
[ownership](#4-ownership-and-suggested-modules),
[space](#5-spatial-model-and-surface-integration),
[time](#6-time-commands-and-randomness),
[biology](#7-biological-generation),
[research economy](#13-research-value-and-submission),
[milestones](#15-milestones-and-acceptance-gates),
[verification](#16-verification-guide).

## 1. Intended Result

Occasionally find a biologically interesting planet, locate a promising surface
region, enter a small encounter field, and investigate individual organisms.
Decide whether their scientific value justifies observation, sampling, capture,
danger, and storage. Return useful evidence or specimens to a research buyer.

The feature should support this complete loop:

```text
orbital habitat indication -> regional surface sweep -> local encounter
  -> identify / observe / analyse -> estimate value and capture risk
  -> sample / stun / kill / collect -> rover storage -> ship storage
  -> research submission -> persistent knowledge and reduced repeat demand
```

Success means the player can make informed, interesting decisions about a few
organisms. It does not mean simulating an entire biosphere.

## 2. First-Version Scope

Include:

- Carbon-water biology in accessible, physically suitable surface habitats.
- A small library of body-plan archetypes, with inherited procedural variation.
- A bounded species catalogue per living planet; initially target roughly
  four to eight encounterable species in two or three related groups.
- Sparse survey sites and a small number of active individuals per field.
- Passive/sessile, skittish, territorial, and ambush behaviour families.
- Progressive biological evidence, catalogue matching, and value estimates.
- Three stun settings, explicit lethal shooting, and collection of suitable
  stunned organisms, tissue, or intact remains.
- Observational data, detailed analysis, tissue, dead specimens, and live
  specimens. Observation and analysis are evidence levels, not cargo stacks.
- Basic stasis, one useful improvement, shared cargo accounting, and research
  sales with diminishing returns.
- Persistent captures, deaths, sampling, evidence, and scientific submissions.
- A small discovered-species table and individual dossier, not a full codex.

Exclude:

- Ecological population simulation, breeding, mutation over time, and genetics.
- Arbitrarily generated skeletons or realistic anatomical animation.
- Watercraft, diving, gas-giant expeditions, or new freely selectable foot travel.
- Pursuit-predator packs, elaborate flocking, and global creature pathfinding.
- Exotic solvents, reproductive-material commerce, and valuable individual
  variants. Preserve extension points without implementing empty frameworks.
- Biological effects on mining, terraforming, or atmospheric generation.
- Multiplayer discovery claims, communications-network simulation, and an
  elaborate general-purpose equipment/inventory rewrite.

Suggested organism counts and field dimensions below are tuning starting
points. They are not measured occurrence rates or fixed scientific constants.

## 3. Existing Foundations And Limits

| Area | Current source | Reuse and limitation |
| --- | --- | --- |
| Deterministic generation | [PRNG](../../src/utils/prng.ts), [generation guide](../ai-guide/determinism-and-generation.md) | Independent seeded streams; never consume unrelated generation randomness. |
| Environment | [Planet](../../src/entities/planet.ts), [stellar irradiation](../../src/entities/planet/stellar_irradiation.ts), [habitability](../../src/entities/habitability.ts) | Physical inputs exist; human terraforming suitability is not native-life suitability. |
| Human familiarity | [MilkyWayModel](../../src/generation/milky_way_model.ts) | Core/frontier context exists; historical biological survey coverage does not. |
| Scanning | [ScanService](../../src/core/scan_service.ts), [discovery](../../src/core/discovery.ts) | Catalogue keys and snapshots exist; a single discovery confidence is insufficient for biology. |
| Surface interaction | [Game](../../src/core/game.ts), [surface controller](../../src/core/modes/game_mode_controllers.ts) | Cursor/menu patterns exist; pickup, stun, and shoot are placeholders. |
| Movement | [MovementSystem](../../src/systems/movement_system.ts) | Player-only macro movement; no generic actor movement or obstacle navigation. |
| Cargo | [components](../../src/core/components.ts), [CargoSystem](../../src/systems/cargo_systems.ts) | Bulk quantities in cubic metres; partial transfers are unsuitable for specimens. |
| Economy | [StarbaseCommerceService](../../src/core/starbase_commerce.ts) | Persistent commodity markets and credits exist; no scientific acquisition ledger. |
| Equipment | [ship modifications](../../src/core/ship_modifications.ts), [operational capabilities](../../src/core/operational_capabilities.ts) | Survey upgrades, skills, and bay counts exist; explicit stasis equipment does not. |
| UI | [text UI](../../src/core/text_ui.ts), [OrbitDossier](../../src/core/orbit_dossier.ts), [terminal reveal](../../src/core/terminal_text_reveal.ts) | Reuse thin-font readouts, thick headings/keys, scrolling, and skippable reveal. |
| Rendering | [SceneViewModel](../../src/rendering/scene_view_model.ts), [SceneRenderer](../../src/rendering/scene_renderer.ts) | Add prepared contact models and a clipped layer, not gameplay inside drawing methods. |
| Persistence | [save schema](../../src/core/save_game.ts), [Game snapshots](../../src/core/game.ts) | Versioned snapshots and stable body paths exist; biological state must be added explicitly. |

Important baseline discrepancies: the inspected save schema is version 10, and
surface getters have explicit readiness support. Do not copy outdated version
numbers or getter behaviour from older architecture summaries.

## 4. Ownership And Suggested Modules

Follow [the architecture guide](../ai-guide/architecture.md): domain rules are
browser-independent; controllers own interaction; renderers draw prepared data.
The following paths are proposed, not existing implementation.

| Proposed owner | Responsibility |
| --- | --- |
| `entities/biology/biology_types.ts` | Stable identifiers, immutable biological definitions, evidence and specimen contracts. |
| `entities/biology/biosphere_generator.ts` | Environment adapter, suitability, ancestral groups, species, and deterministic site definitions. |
| `entities/biology/stun_model.ts` | Pure outcome probabilities, uncertainty projection, and recovery calculation. |
| `systems/surface_encounter_system.ts` | Active individual state, command steps, simple behaviour, sampling, and weapon outcomes. |
| `systems/specimen_cargo_system.ts` | Whole-container capture/transfer/removal transactions; shared capacity rules with CargoSystem. |
| `core/xenobiology_service.ts` | Player evidence, seeded scientific baseline, research demand, valuation, submission, and snapshots. |
| `core/surface_encounter_controller.ts` | Encounter navigation, stable target selection, and typed action intent. |
| `core/xenobiology_ui.ts` | Readonly scanner, dossier, manifest, and research table models. |
| `rendering/scenes/surface_encounter_renderer.ts` | Local field/contact drawing using ScreenBuffer and DrawingContext. |

Keep site and species generation together initially. Split them only when the
implementation establishes a real ownership or complexity benefit. Do not add
a separate manager for every biological noun.

`Game` should delegate actions, integrate snapshots, publish typed effects, and
request redraws. It must not acquire the biology, stun, or pricing formulas.

### Programming rules

- Follow [code style](../ai-guide/code-style.md) and
  [change workflow](../ai-guide/change-workflow.md), including JSDoc for every
  new/touched function and inline reasoning for non-obvious invariants/formulas.
- Use strict TypeScript, readonly definitions/frame models, discriminated
  commands/results, and explicit units. Avoid `any` and private-Game test access.
- Keep calculations and preview queries pure. Pass environment, seeds, clocks,
  and capabilities explicitly instead of reading DOM or global mutable state.
- Return typed refusals for ordinary gameplay failures such as no target,
  out of range, insufficient space, or incompatible preservation. Do not throw
  for these; reserve errors for broken invariants or invalid external data.
- A multi-owner operation prepares and validates all changes before committing
  them synchronously. Publish events/redraw effects only after the commit, so
  subscribers never observe half a capture or half a sale.
- Do not create speculative fields/modules for postponed roadmap features.

### Concrete integration touchpoints

Recheck these method names and contracts against source at implementation time:

| Touchpoint | Required change |
| --- | --- |
| `Game.activateSurfaceVehicleAction()` | Replace biological placeholders with delegated, targeted operations; keep regional mining/scan behaviour. |
| `SurfaceModeController` / `InterfaceModeController` | Own encounter activity and mutually exclusive modal interactions; no duplicate open flags in Game. |
| `Game._handleMovementInput()` | Route local steps before macro MOVE_REQUESTED publication; prevent one key driving both scales. |
| `Game._update()` / `isGameClockPaused()` | Disable accelerated calendar ticking in a field; apply committed encounter seconds exactly once. |
| `Game.createSaveGame()` / `restoreSaveGame()` | Add explicit biological snapshots and validate lifecycle/reference consistency. |
| `Game.captureCurrentPlanetMutations()` | Preserve existing orbital/mining mutations; keep biological visited-site deltas in their own snapshot owner. |
| `SceneViewModel` / surface model builders | Carry immutable contact/field snapshots and prepared scanner data, not mutable actors. |
| `Game.canSkipMainRender()` / render signatures | Invalidate on encounter, target, and modal revisions, including stationary-rover changes. |
| `CargoSystem.getTotalUnits()` and all capacity callers | Account for specimens without changing commodity quantities or permitting partial organism transfer. |
| Ship/rover cargo models and jettison handlers | Support distinct specimen rows and deliberate whole-container removal. |
| Starbase controller/UI and commerce effects | Add scientific submission separately from ordinary stock, bulk sale, and buyback. |
| Shipyard upgrades and save validators | Add explicit stasis state and minimal rover integrity; preserve valid bay and equipment accounting. |

## 5. Spatial Model And Surface Integration

### Macro terrain is not an encounter grid

The current planetary map is approximately 513 cells across. Its distance
calculation uses circumference divided by map size: about 78 km per cell for an
Earth-sized planet. `PLANET_SURFACE_CELL_VIEW_SCALE` only enlarges the display.

Keep existing surface traversal as regional exploration. Add a nested encounter
activity within the `planet` location, not a new global travel mode.

Initial field proposal: 32 by 24 logical cells, each approximately 5 m across.
The field fits inside a small part of one surveyed region. Screen-cell size
must not determine physical distance. Smaller displays show a clipped camera
window around the rover; they must not regenerate or shrink the encounter.

- Macro coordinates remain unchanged while the player explores a field.
- Local rover and organism coordinates are stored separately in metres or
  clearly documented fixed-size cells.
- Generate a small terrain patch from the site's broad habitat and independent
  seed. It is a plausible local interpretation, not metre-resolution data
  already present in the heightmap.
- Local obstacles, slopes, and liquid edges affect creature traversal; do not
  duplicate regional mineral deposits into every local cell.
- Regional mining is unavailable while actively operating in the field.
- Keep an entry marker with range/bearing. Initially, leaving requires returning
  within one local cell of it. Escape cancels an action before offering exit.
- Ensure entry and useful observation positions are reachable. Do not generate
  trapped starting positions or put all contacts behind impassable terrain.
- First-version collection is rover-operated. Preserve existing on-foot fuel
  exhaustion behaviour; do not accidentally imply a complete walking system.

Before integrating sites, make longitude wrapping and latitude boundaries
consistent across movement, terrain rendering, scanning, and range queries.
Recommended macro policy: X wraps, Y clamps, outward movement at a pole is
refused. Test the complete change rather than altering only the new generator.
Local encounter fields are bounded and do not wrap.

### Finding a field

Orbital survey reveals possible biological activity and promising habitat
regions, not a complete species list. A regional surface sweep identifies an
accessible survey site. The player explicitly chooses to investigate it.

Sites should follow habitat suitability rather than uniform random scattering.
Seed them independently of whether the player scans. Do not require searching
hundreds of identical cells with no directional or habitat feedback.

Native biospheres remain occasional, but development fixtures must guarantee
reachable examples. Validate discovery pacing before choosing a final global
frequency. Do not alter the production starting hub just to make tests pass.

## 6. Time, Commands, And Randomness

Use turn-stepped encounter simulation initially. A command carries an explicit
local duration: for example, a short rover step, observation, shot, pickup, or
wait. Select durations together with speeds and field size during tuning.

Entering a field suspends accelerated calendar advancement. Committed local
actions advance the calendar by their actual encounter seconds instead. Field
exit restores the normal travel clock. Do not add both time sources.

- Menu navigation, target selection, reading a dossier, previewing power, and
  cancelling do not advance time or consume random numbers.
- Rendering and terminal reveal use visual time, not encounter simulation time.
- A committed command updates all relevant individuals with a fixed, bounded
  stepping policy; large durations must not cause tunnelling or unbounded loops.
- Define command effect/recovery ordering once and test boundary deadlines.
  Diagonal movement must pay the corresponding distance/time; stable ID ordering
  resolves ties so actor-array order cannot alter simulation results.
- Recovery is a local deadline and cannot progress while reading a modal.
- Initially, inactive fields are suspended. Document this abstraction; do not
  simulate every site while travelling or silently reset it on return.
- Store active field state and action counters on save. Reopening the same save
  and taking the same actions must reproduce the same outcomes.
- Disallow leaving a field from resetting a threat, sampled individual, or
  recovery timer. A return restores the existing state.

Use stable per-site and per-individual seed streams for gameplay outcomes,
including an action/attempt index. Scans and quotes are pure queries. This does
not attempt to prevent deliberate save rollback; it prevents incidental
rerolls caused by UI navigation or frame timing.

## 7. Biological Generation

### Prepare numeric environmental inputs

Create a serializable `BiologyEnvironment` from stable system/body inputs:

- Gravity, temperature range, pressure, atmospheric composition/partial
  pressures, accessible solvent, and relevant surface material abundance.
- Stellar age/activity and exposure from all applicable host stars.
- Available energy and broad habitat/productivity classes.
- Native versus managed/introduced origin and human survey context.

Permanent generation uses canonical generated conditions or representative
exposure, not the current render-frame stellar positions or scan time. A change
in season/phase can later affect activity, but must never reroll a world's
species, historical catalogue status, or site identity.

Prefer existing phase/irradiation helpers. If hydrosphere or lithosphere data
only exists as display prose, add a small structured adapter at the source;
never parse formatted scan text to decide whether life can exist.

Separate probabilities for life, accessible surface life, and encounterable
complex organisms. A microbial biosphere need not contain large mobile forms.
Avoid guarantees based only on planet type or nominal habitable-zone membership.

Current natural atmosphere generation does not model oxygen produced by native
life. First-version profiles must work with the generated environment: primarily
modest, lower-energy organisms where appropriate. Do not generate oxygen-demanding
fast megafauna without an energy/redox basis. If richer profiles require
oxygenating atmospheres, scope that scientific extension separately.

Use physical constraints to reject invalid combinations before formatting:
solvent phase/tolerance, energy source, consumer food base, viable locomotion,
size/gravity relationship, and available structural materials. Materials such
as mineral shells do not automatically imply a non-carbon biochemical backbone.

### Inheritance, not independent trait rolls

Generate a shared biochemical foundation, then two or three ancestral groups.
Within a group, inherit developmental organisation, structural chemistry,
sensory conventions, and broad physiological tolerances. Species vary size,
covering, locomotion, ecological role, and behaviour within compatible bounds.

Use a small body-plan library. Store generated traits as typed data; descriptions
are evidence-filtered formatting of those traits, not the source of truth.
Nothing evolves during play. Atmospheric and ecological feedback are deferred.

### Scientific familiarity

Seed a historical survey prior independently of player discovery. Human core
and settled regions have higher survey coverage; frontier/remoteness lowers it.
Coverage also varies per world and habitat. Rare unknown native species can
exist near humans, and remote worlds need not be entirely uncatalogued.

Keep separate facts for catalogue recognition, taxonomic description, and
available scientific samples. A recognised species can still lack a live
reference specimen. Managed/introduced organisms use their established origin;
they must not earn native first-discovery rewards merely by being transplanted.

## 8. Stable Identity And Persistent Records

Derive body identity from world X/Y, system slot, and stable planet/moon path.
Include an explicit biology generation version. Names, array iteration order,
screen position, and current orbital angle are not identities.

```text
body address + biology version
  -> biosphere and lineage IDs
  -> species IDs
  -> canonical region + site slot -> site ID
  -> spawn slot -> individual ID
  -> collection/sample sequence -> container ID
```

Normalize macro coordinates before deriving site keys. Regeneration, visits,
and worker order must not change these IDs or definitions. Species from native
independent biospheres do not become the same species merely because their
descriptions or body-plan archetypes match.

Introduced taxa instead use shared historical registry IDs across planets.
Their collection origin remains provenance, not a newly generated taxonomic
identity. A familiar transplanted organism cannot become profitable again by
being encountered on another colony world.

Minimum records:

| Record | Required purpose |
| --- | --- |
| `SpeciesDefinition` | Immutable lineage, biology, archetype, habitat, and handling requirements. |
| `ScientificBaseline` | Seeded recognition, description quality, and existing sample sufficiency. |
| `SpeciesEvidence` | Player observations, resolved traits/confidence, collection history, and submitted evidence. |
| `ResearchDemandRecord` | Shared submission history, marginal demand, and novelty rewards already paid. |
| `EncounterIndividual` | Species ID, position, state, injury/dose, recovery deadline, and sampling history. |
| `SpecimenContainer` | Unique ID, source individual/body/site, specimen kind, quality, volume, and preservation requirements. |

Persist biological changes separately from generated definitions. Regenerate
immutable data lazily; save visited field state, removed individuals, evidence,
containers, and research deltas. Do not save every possible planetary organism
or instantiate the Galaxy's species catalogues at startup.

An individual must have exactly one lifecycle representation: active in a field,
dead remains there, collected in one carrier, submitted, or otherwise removed.
Tissue sampling records a contribution without duplicating an intact organism.

## 9. Scanner And Information Model

Provide three practical evidence steps:

1. Contact: movement, coarse size/mass, silhouette/body organisation.
2. Observation: probable ecological role, behaviour, catalogue candidates,
   broad chemistry, and estimated scientific demand/value.
3. Analysis/sample: confirmed identification where justified, narrower handling
   estimates, detailed biology, and improved scientific evidence quality.

Evidence advances through better range, an appropriate scan, observed behaviour,
or a sample. Repeating identical observations must not indefinitely improve
confidence, create saleable data, or award experience.

Show catalogue status and personal/sample status separately, combining them
into a useful short label when identified:

- Unknown to science: no confirmed catalogue match, with provisional novelty
  shown until evidence supports the claim.
- Known; not collected: recognised, but no personal collection history.
- Previously collected: player history exists; current scientific demand may
  still support an additional useful sample.
- Well sampled: little additional value, regardless of personal history.

Before identification, say `CATALOGUE MATCH UNRESOLVED`; do not confuse an
unrecognised silhouette with a genuinely new species.

Project only unlocked evidence into readonly UI models. Do not reveal true
hidden physiology through exact price or stun calculations on the first scan.
Survey equipment and astroscience improve evidence within bounded limits.
Keep biological evidence separate from a terrain scan reaching `mapped`/100%.

The compact target readout should show estimated value, novelty/demand,
behavioural danger, preservation compatibility, and capture range. A detailed
thin-font dossier reuses scrolling and `TerminalTextReveal`; revealing the
screen is presentation, not a second information unlock or mandatory delay.

## 10. Input And Behaviour

Preserve existing regional traversal. Add context-specific command rows inside
encounters, with the same keyboard-first conventions.

| Context | Controls |
| --- | --- |
| Encounter movement | Arrows step the rover; blocked steps report why. |
| Target selection | Tab cycles visible contacts using stable IDs; selection does not advance time. |
| Observation | Existing Scan action (`v`) operates on the selected contact. |
| Action menu | Arrows select; Enter/Space activate; includes Analyse, Stun, Shoot, Collect, Sample, Wait, Leave. |
| Stun preparation | Left/Right choose low/standard/high; Enter fires; Escape cancels. |
| Dossier | Up/Down and PageUp/PageDown scroll; Escape closes; any fresh key can finish the reveal first. |

A typed encounter interaction union must make movement, menu navigation, power
selection, and dossier reading mutually exclusive. Integrate modal ownership
with `InterfaceModeController`; do not add competing boolean open flags.
Guard held/just-pressed input so opening or closing a panel cannot fire a shot,
move the rover, or invoke a global travel action in the same frame.

Begin with passive/sessile, fleeing, territorial, and ambush archetypes. Each
uses a small state machine and bounded detection/response distances. Different
species supply parameters, not new bespoke AI code.

Use local terrain passability, simple range/line-of-sight checks, and a strict
active-individual limit, initially around eight to twelve. Territorial organisms
warn before attacking; ambushers require proximity/appropriate triggers. Most
contacts never attack. Avoid constant motion for sessile or resting life.
If obstacle routing is required, reuse the existing `rot-js` dependency rather
than introducing a custom general pathfinding engine.

## 11. Stun, Lethal Outcomes, And Hazards

Model low/standard/high as device doses, not arbitrary success percentages.
Inputs include estimated mass, physiology/susceptibility family, shielding,
range, prior exposure/injury, and device capability. Values are a fictional
instrument model, not established real-world alien biology.

For each dose, calculate mutually exclusive probabilities:

```text
pDead = mortality(dose, susceptibility, condition)
pLiveStunned = (1 - pDead) * stunGivenSurvival(dose, susceptibility, condition)
pUnaffectedOrActive = 1 - pDead - pLiveStunned
```

All probabilities remain in [0, 1] and sum to one. Mortality rises with dose;
live incapacitation need not keep rising once excess dose becomes lethal.
The scanner's incapacitation label must mean stunned and alive, not include
death. Evaluate uncertainty over plausible parameters allowed by current
evidence; never add an unrelated random percentage range around a hidden answer.

One committed action samples one outcome. Persist exposure and injury so repeat
shots are not independent free attempts. Predict recovery as a range until
analysis permits a narrower estimate. Unsupported physiology clearly states
that the stunner has no reliable incapacitation profile; sessile samples need
not involve shooting at all.

Default to standard or a conservative recommended setting, never maximum power
because a reused quantity selector defaults to its upper bound. Explicit lethal
shooting requires a clear confirmation; accidental stun mortality does not
spawn both a live specimen and a corpse.

Rover durability is new work. Add minimal integrity/max-integrity and a focused
damage operation, visible warnings, repair/replacement handling, and save
validation. Do not borrow ship hull damage for rover attacks. Crew exposure
must reflect actual vehicle protection; do not randomly injure protected crew
as though they were outside. Keep defeat/withdrawal recoverable and clearly
communicated, with no full tactical combat subsystem.

Before M5, choose and test an explicit disabled-rover policy: forced withdrawal
with repair costs is the simpler initial option; wreck recovery/destruction is
not required. Neither route may leave the player trapped in a field or strand
containers in an unreachable carrier. Lost or destroyed material, if allowed,
must be reported and recorded explicitly; scientific data survives separately.

## 12. Containers, Cargo, And Stasis

Extend `CargoComponent` with an explicit specimen-container collection; keep
bulk `items` as it is. Containers have positive cubic-metre occupancy and are
indivisible. First-version container volumes should respect the existing 0.1
cubic-metre accounting precision, rounding required space upward.

- Make CargoSystem's occupied-volume calculation include bulk goods and
  containers. Audit every purchase, mining, transfer, cargo display, capacity
  change, and jettison path that consumes this calculation.
- Commodity bulk sale/clearing must leave specimens untouched. Specimens never
  enter commodity stock or the normal buyback path.
- Add whole-container rows and typed selections to ship/rover manifests; do not
  encode organism metadata in synthetic commodity keys.
- Capture validates range, individual state, handling size, container space,
  and preservation capacity before removing the source organism.
- Transfer validates the destination before changing either carrier. Reject a
  whole transfer when it cannot fit; never transfer part of an animal.
- Scientific data has no cargo volume. Tissue and dead/live specimens do.
- Preserve true mass/size as biology and handling information. Do not imply
  that a general ship cargo-mass limit already exists.

Basic stasis supports an explicit carbon-water temperature/pressure/chemical
envelope and a small number of active live containers. Both envelope and slot
limit are visible. One upgrade expands useful tolerances or live capacity.
Rover portable preservation and ship equipment must both support the specimen;
check the destination before transferring a living container.

Add explicit fitted stasis state and occupied-bay accounting. Existing bay
counts are not an equipment inventory; installing a module must reserve a
genuinely available bay. Do not build a universal fitting system merely for
one module. Survey-suite upgrades continue to improve scanning independently.

Once compatible life is sealed in functional stasis, preservation is reliable
in this version. No hidden decay during long travel, reading, tab suspension,
or save/load. Unsupported organisms can still yield data or suitable nonliving
samples. Stasis is a science-fiction abstraction; universal reversible
suspension is not a known biological capability.

## 13. Research Value And Submission

Offer a research-submission panel at crewed starbases. Initially all major
starbases can acquire scientific material. Automated depots do not suddenly
become staffed xenobiology laboratories; storage/shipping services can come later.

Calculate value from evidence usefulness, novelty, baseline sample sufficiency,
condition/quality, specimen type, scarcity, and bounded origin-remoteness.
Live specimens generally have higher potential value, but low-quality live
material need not outrank excellent useful nonliving evidence universally.

Use two bounded reward components:

1. A cumulative discovery/reference entitlement, increasing with verified
   evidence quality. Pay only the positive difference from entitlement already
   rewarded; a later live voucher may improve on earlier data/dead material.
2. Additional-sample value, declining rapidly as scientific demand is met.
   Seed this demand from historical sampling; repeated mundane samples quickly
   become low-value or worthless.

Record contributions by species and source individual/sample identity. Selling
the same tissue record, resubmitting identical data, or moving between stations
must not create another discovery award. Catalogue recognition and sample
sufficiency are distinct: known species can justify a missing reference voucher.

The ledger is campaign-wide, not per station. A small station multiplier may
modify offers, but must not recreate already-paid scientific entitlement.
First-version station premiums can remain neutral to simplify balancing.

Remoteness is derived from the collection origin and exploration baseline,
with a strict cap. Carrying a mundane organism on a longer route never increases
its novelty. Unknown contacts show an estimated value band; confirmed evidence
permits a firm current quote. Previewing does not reserve demand or consume RNG.

On submission, revalidate ownership, evidence, demand, quality, and buyer
capability. Commit credits, consumed physical containers, submitted data claims,
and ledger progression atomically; then publish effects. Duplicate submissions
must be idempotently refused. Preserve personal collection history after sale.

## 14. Persistence, Performance, And Rendering Invariants

Extend the explicit save schema, parser validation, snapshot creation, and
restoration together. The current version-10 schema is the starting point.
Either migrate the current unreleased version with empty biological defaults,
or clearly reject/reset incompatible saves with user-visible explanation.
Do not spend this feature's budget preserving every historical generated world.

Save validation must reject duplicate container ownership, invalid references,
nonfinite values, negative volumes/demand, incompatible lifecycle states, and
bad field coordinates. Verify regenerated definitions before accepting deltas.

Restore ordinary location/surface preparation before applying biological field
state. Failed preparation cannot consume specimens or discard evidence.
Providers remain serializable and sync/worker results equivalent. Initially,
keep small biology generation synchronous and lazy; add workers only after
profiling demonstrates a need. Never put living actor state into surface
generation worker requests or cache mutable actors with immutable terrain.

Keep the active field bounded, save only visited-site deltas, and avoid scanning
all planetary cells for spawning or catalogue lookup. Use bounded caches for
regenerable definitions; never evict authoritative collected/submitted history.

Rendering order: local terrain, static habitat details, organisms, rover,
selection/range markers, instrument overlays, then modal occlusion. Carry
readonly contact snapshots in the scene model. Include encounter revision and
visual-effect state in render invalidation, so a stationary rover does not
freeze newly changed contacts. Clip everything to the encounter viewport.

No-life worlds and non-encounter scenes must retain their existing drawing.
Do not add planetary background stars, dense moving decoration, or anatomy
labels for every contact. Thin text is instrumentation; thick text is headings
and key names. Colour communicates evidence, selection, and actual danger.

## 15. Milestones And Acceptance Gates

Implement and commit one coherent stage at a time. Each milestone includes
tests for its new contracts; do not defer all testing to the end.

### M0. Lock Integration Contracts

Deliverables: canonical surface topology; encounter coordinate/time policy;
identity and lifecycle contracts; shared cargo-volume audit; feature fixtures.
Keep gameplay exposure gated until the relevant operations actually work.

Acceptance: existing surface navigation/scanning agree at seams and poles;
non-encounter movement is unchanged except the explicitly corrected topology;
no-life rendering remains identical; accelerated and encounter time cannot
advance together. Record intentional behaviour changes in documentation.

### M1. Generate Coherent Biospheres And Evidence

Deliverables: environment adapter, constrained archetypes/lineages, deterministic
sites/species, historical catalogue baseline, evidence projection, and formatter.

Acceptance: fixed-seed fingerprints and scan-order independence; valid ecology,
chemistry, and handling constraints; managed/native distinction; near-human
recognition trend without absolutes; unresolved contacts do not claim novelty;
no changes to unrelated stellar, geology, or resource generation streams.

### M2. Establish The Data-Only Research Loop

Deliverables: minimal reachable survey-site observation, useful scanner/dossier,
data evidence records, research quotes/submission, campaign demand, and saves.
Static contacts are sufficient here; do not represent placeholder combat as done.

Acceptance: obtain evidence, read its value, return to a starbase, submit once,
reload, and receive no duplicate reward. Station hopping and identical scans
do not reset demand. Unknown/known/personal/sampled distinctions are readable.
This is the first gameplay checkpoint before investing in creature simulation.

### M3. Add Bounded Encounter Movement

Deliverables: local field, rover position, entry/exit, terrain passability,
stable targeting, command-time stepping, passive and fleeing behaviours, and
prepared rendering models.

Acceptance: fields are reachable and bounded; contacts remain selectable while
moving; blocked movement and escape are clear; modals pause actors; no wrapping
within a field; reentry and save/load preserve state; smaller screens clip rather
than change the world. Check pacing and readability before adding more AI.

### M4. Complete Stun And Collection

Deliverables: dose/outcome model, uncertainty estimates, recovery, sampling,
lethal shooting, containers, capture transactions, basic stasis and ship transfer.

Acceptance: all outcomes sum correctly; power preview is pure; repeat exposure
matters; death never also produces a live specimen; unsupported profiles are
explicit; capacity failure leaves the source intact; one organism/container has
one owner; living transfers preserve compatibility; data/tissue/dead/live
submission pays only justified marginal scientific value.

### M5. Add Defensive Danger And Progression

Deliverables: territorial/ambush behaviours, warnings, minimal rover integrity
and repair, equipment upgrade, handling limits, and complete manifests/help.

Acceptance: most encounters are nonaggressive; threats are understandable and
avoidable; protected crew are not arbitrarily exposed; withdrawal is viable;
an upgrade unlocks a concrete opportunity; exhaustion, launch, replacement,
capacity changes, and save/load cannot orphan containers or active encounters.

### M6. Balance And Release The Bounded Version

Deliverables: integrated discovery-to-sale playthroughs, concise species list,
content/economy tuning, performance evidence, and updated current-state guides.

Acceptance: scanner predictions are decision-useful; repeat collection is not
the best money strategy; biological exploration is competitive with, not a
replacement for, mining/trade; navigation and menus do not become chores;
generation and interaction remain responsive at bounded maximum populations.
Remove development-only shortcuts from normal play.

## 16. Verification Guide

Add direct tests for the new generators, controller, encounter system, cargo
transactions, research service, and UI models. Prefer those over expanding
prototype-based private-Game harnesses.

Required cases:

- Same seed/address yields the same life regardless of generation, scan,
  render, menu, worker completion, and unrelated PRNG consumption order.
- Physical constraint fixtures cover hot/cold, low/high pressure, different
  gravities, low energy, multiple stars, native/managed worlds, and no surface.
- Catalogue recognition is distinct from player knowledge and sample demand.
- Terrain/actor coordinates, target IDs, visibility, range, and pole/seam
  behaviour agree; missing terrain cannot create partial transactions.
- Fixed action sequences produce identical outcomes; deterministic aggregate
  probability tests use tolerances rather than uncontrolled flaky randomness.
- Whole capture/transfer/sale transactions cover exact capacity, over-capacity,
  incompatible stasis, duplicate IDs, repeat commands, and quantity rounding.
- Revisit/save/import cannot resurrect collected individuals, reset demand,
  lose evidence, or create duplicate containers. Validate malformed snapshots.
- Dossier/power/cargo modals pause local time and block input leakage; reveal
  skipping never fires or moves; tab suspension adds no surprise damage/decay.
- Rendering checks contact visibility, layering, clipping, selections,
  viewport resize, thin/thick alignment, modal occlusion, and stale-cell clearing.
- Existing no-life surface signatures and unrelated orbit/space scenes remain
  unchanged. Extend [rendering regression tests](../../src/tests/rendering/scene_renderer.regression.test.ts)
  instead of regenerating all snapshots indiscriminately.

Use existing focused commands: `npm run test:surface`, `test:generation`,
`test:systems`, `test:interface`, `test:ship`, and `test:rendering`. Run the full
`npm run check` and `git diff --check` before broad implementation completion.
For visual integration, run the Vite server and inspect/capture desktop and
narrow viewports with real fonts as well as buffer-level tests.

When working with the user's model-switching workflow, announce the verification
phase before running tests/data collection and report when it is complete.

## 17. First-Version Completion Checklist

- [ ] Meaningful biological sites can be found without blind repetitive scanning.
- [ ] Related species are coherent and physically compatible with their habitats.
- [ ] Unknown, recognised, personally collected, and well-sampled are distinct.
- [ ] Value, danger, capture uncertainty, and handling limits are visible before pursuit.
- [ ] Observation, analysis, stun, kill, sample, capture, transfer, and submission work.
- [ ] Compatible stasis is reliable and an upgrade has an understandable benefit.
- [ ] Save/revisit preserves individual removal, ownership, evidence, and demand.
- [ ] Duplicate submissions and station hopping cannot repeat discovery rewards.
- [ ] Quiet presentation, existing travel, mining, and ordinary commerce remain intact.
- [ ] Focused/full checks and visual verification pass; current-state docs are updated.

Only after these gates should the larger roadmap become an implementation scope.
