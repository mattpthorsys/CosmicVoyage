# Xenobiology: Ambitious Expansion Roadmap

Status: the first habitat/group/live-reference expansion and mission navigation
passed automated and browser verification. The next authorised four steps
(science log, expanded habitat and anatomy content, ordinary individual size
variation, and analysis/tissue requests) also passed full automated and browser
verification. See the [verification handoff](../xenobiology-expansion-verification.md).
The subsequent native-family, inherited pixel anatomy, bounded defensive
activity and comparative-research steps also passed automated and browser
verification. See
[native expansion checkpoints](../xenobiology-native-expansion.md).
The next authorised wave adds survey previews, acquired-trait comparisons,
reinforced covering variation and one pressure-preservation expedition. It is
implemented, with verification pending the requested Luna handoff. See
[survey expansion checkpoints](../xenobiology-survey-expansion.md).
Later waves remain exploratory, not implementation commitments.
The latest authorised steps add habitat-directed foraging/shelter activity,
persistent witnessed episodes, and finite non-destructive field studies. They
passed automated and browser verification, followed by a successful personal
expedition. See the
[field-research guide and checkpoints](../xenobiology-behaviour-research.md).
Reproductive material/propagules (step four) are now implemented for one sessile
mat family, pending Luna verification. See the
[propagule guide and checkpoints](../xenobiology-propagules.md).
Codebase baseline inspected: 2026-10-04. The bounded discovery, capture, cargo,
stasis, and research loop now exists, including the terrain-integrated field
view and specimen listings in Sell. See the [implementation plan](xenobiology-first-version.md)
and [current implementation/player guide](../xenobiology.md). Long-session
balance and enjoyment are not established by automated verification or the
initial successful expeditions. Recheck source contracts before implementation.

This document explores richer biology, research, logistics, visualisation, and
encounters. It is deliberately not a checklist that must all be completed.
Prioritise distinct, readable expeditions over additional menus or specimen
categories. Select larger extensions only when representative playthroughs
justify their complexity; the roadmap is not an implementation commitment.

Navigation: [priorities](#3-candidate-priorities),
[research](#4-richer-research-and-scientific-commodities),
[variants](#5-individual-variants-and-sampling-value),
[phylogeny](#6-extended-biology-and-hidden-phylogeny),
[chemistry](#7-exotic-environments-and-chemistry),
[atmospheres](#9-native-biospheres-atmospheres-and-terraforming),
[traversal](#11-expanded-surface-environments),
[expansion waves](#15-suggested-expansion-waves),
[next milestone](#recommended-next-milestone-one-coherent-expedition),
[decision gates](#16-verification-and-decision-gates).

## 1. Direction And Boundaries

The long-term attraction is learning how unfamiliar life belongs to an
unfamiliar world, then deciding how to investigate it with finite equipment.
Complexity is worthwhile when it changes observation, preparation, handling,
or expedition decisions. More traits or more moving creatures alone are not
sufficient justification.

Maintain the existing [scientific, quiet design](../ai-guide/game-design.md):

- Biology should reflect habitat, energy, history, and inherited organisation.
- Instruments should resolve uncertainty rather than expose every hidden fact.
- Most life is not interested in attacking the player.
- Scientific material is not ordinary infinitely reusable loot.
- Logistics should create choices, not maintenance chores or surprise losses.
- Text and motion remain sparse. Anatomy can be rich in a dossier without
  filling the travel view with labels and effects.
- Scientific speculation must be labelled as such, especially exotic life,
  stun susceptibility, and reversible stasis.

Do not adopt a full ecosystem/evolution simulator as the assumed destination.
It may never be the best game for this codebase.

### Lessons from the implemented loop

- Life belongs in the landscape. Preserve regional terrain colours, an unframed
  field, small pixel silhouettes, the bottom action menu, and readable telemetry;
  do not return to a separate boxed creature minigame.
- Physical proximity and the Cargo pickup flow provide a common interaction
  language. New sampling tools should extend it rather than create unrelated
  control schemes. Keep direct action hotkeys and mutually exclusive menu modes.
- Basic stasis is included from the start. Ordinary compatible life must remain
  collectible without a paid refit; specialisation should unlock new choices.
- Collection, scientific recognition, remaining demand, and buyer capability
  are separate facts. A zero-price specimen remains visible in the manifest and
  Sell; the player needs a reason for the price, not a disappearing possession.
- Tiny cached four-colour silhouettes already make contacts more tangible.
  Extend a constrained visual library before considering general procedural
  skeletons. Sparse motion and labels remain part of the aesthetic.
- A polished presentation does not establish ecological depth. Species and
  encounter composition are still deliberately small and repetitive; improving
  their relationship to the habitat has greater immediate value than more loot.

### Intended extended expedition

A possible expedition starts with a mineral-rich, moist habitat identified by
survey. Producer colonies occupy suitable patches; small armoured grazers and
a related shelter-dwelling form share inherited anatomical features. Their
distribution and behaviour suggest how they belong to this place. This is a
generated ecological scene, not a simulated food web or a claim that these
specific alien organisms are scientifically predictable.

Observation reveals a group's retreat response or a defensive display before
danger. Analysis narrows handling uncertainty. Two basic live-specimen slots
make a novel reference organism compete with a familiar population requested
by a research station. A large adult might justify tissue collection rather
than capture; a later size-variant feature could make a smaller individual a
useful alternative. Field records retain the evidence and provenance needed
to choose a return visit. Discovery need not end with killing or collecting.

## 2. Preconditions And Architecture

Preserve established contracts and distinguish them from unfinished extensions:

| Foundation | Current position | Expansion constraint |
| --- | --- | --- |
| Stable species, site, individual, and container IDs | Implemented, with independent biology seeds | New content must not reset knowledge, ownership, or rewards unintentionally. |
| Separate definitions, evidence, science demand, and specimen state | Implemented | A visual change or new trait must not become an economic migration by accident. |
| Explicit encounter time and modal pausing | Successful commands advance local time; reading and inactive fields are suspended | Extra behaviour must not silently use accelerated travel or rendering time. |
| Whole-container transactions and shared occupied volume | Ship and rover specimens share ordinary cargo capacity | New material/carriers must not permit partial organisms, duplicate ownership, or duplicate sales. |
| Typed commands, bounded actors, and readonly scene models | Implemented with controller/system/renderer separation | Add concrete domain rules rather than more formulas in Game or SceneRenderer. |
| Versioned snapshots | Schema 16 also retains source-specific behavioural episodes and field-study objectives; current wave verification pending | Sparse deltas or another bounded retention policy remain future work, not an existing foundation. |
| Evidence-filtered descriptions and handling checks | Explicit solvent, temperature/pressure, substrate isolation, mass and live-slot capabilities; current wave verification pending | Current kits support water only; new chemistry must not be unlocked by an arbitrary class number. |
| Terrain-integrated field UI and pixel silhouettes | Implemented with cached surface appearance and two-frame sprites | Appearance is not detailed local geology, habitat simulation, or continuous traversal. |

### Current limits that should guide expansion

- The generator supplies ten species in five inherited groups. It uses a
  carbon-water suitability gate and explicit gameplay occurrence priors, not
  measured probabilities for alien life. The inherited groups are not a stored
  phylogenetic tree.
- New accessible land sites have coarse numeric water-margin, rocky-margin,
  sheltered, exposed, or elevated profiles and approximately four to eight
  contacts from two or three taxa.
  Species temperature and pressure still use whole-planet environmental inputs,
  not a local climate model. Preserved legacy fields retain their ten-contact
  pattern. The 32 by 24 field's cells remain 5 m regardless of viewport size.
- Surface colours come from the prepared regional terrain; local texture is an
  illustrative layer. Habitat suitability must become explicit domain input,
  not something inferred from pixel colour or renderer noise.
- Individuals have lifecycle, injury, sampling, alert state, optional local
  retreat-group membership/timers and persistent ordinary mass scales. Those
  scales affect handling, stun outcomes, silhouette and cargo, not novelty.
  Inherited individual adaptations and verified life stages remain future work.
  Groups are bounded encounter behaviour, not an ecosystem.
- Scientific demand is campaign-wide. Sell and Research use the same award
  ledger for physical specimens; data remains in Research. Neither tab is a
  second buyer capable of renewing novelty.
- Full visited-field snapshots are reasonable for a small prototype. Measure
  save growth before expanding site counts or introducing streamed terrain.

These are useful domain boundaries, not instructions to write a generic plugin,
AI, inventory, taxonomy, or simulation framework in advance. Extend concrete
systems when a selected feature needs the extension.

The primary implemented owners are:

| Owner | Reuse for expansion |
| --- | --- |
| [Biosphere generator](../../src/entities/biology/biosphere_generator.ts) | Numeric environment adapter, inherited species groups, and canonical site generation. |
| [Biology types](../../src/entities/biology/biology_types.ts) and [validation](../../src/entities/biology/biology_validation.ts) | Versioned definitions, actor state, evidence, provenance, and lifecycle validation. |
| [Encounter system](../../src/systems/surface_encounter_system.ts) | Deterministic action time, visibility, rot-js routing, handling, and bounded behaviour. |
| [Specimen cargo](../../src/systems/specimen_cargo_system.ts) | Whole-container capacity, transfer, and preservation checks. |
| [Xenobiology service](../../src/core/xenobiology_service.ts) | Evidence, recognition, capped novelty, repeat demand, and submission records. |
| [Encounter controller](../../src/core/modes/surface_encounter_controller.ts) and [actions](../../src/core/encounter_actions.ts) | Driving, target selection, menus, confirmations, hotkeys, and Cargo pickup. |
| [Biology UI](../../src/core/xenobiology_ui.ts) and [field renderer](../../src/rendering/surface_encounter_renderer.ts) | Evidence-limited readouts, coloured dossiers, manifests, and responsive telemetry. |
| [Surface appearance](../../src/core/encounter_surface.ts) and [sprites](../../src/rendering/encounter_sprites.ts) | Cached regional colours and constrained four-colour contact silhouettes. |

Wider integration hooks remain [Planet](../../src/entities/planet.ts),
[surface generation](../../src/entities/planet/surface_generator.ts),
[human presence](../../src/generation/milky_way_model.ts),
[ship equipment](../../src/core/ship_modifications.ts),
[mission progress](../../src/core/mission_progress.ts), and
[text UI](../../src/core/text_ui.ts). Domain inputs and generation should not
depend on the renderer or browser.

## 3. Candidate Priorities

Effort is relative to the implemented bounded version, not a calendar estimate
or a measured performance claim. Costs increase sharply where a feature needs
a new traversal environment. Habitat coherence and readable encounter behaviour
move ahead of exotic chemistry; the next milestone combines a small amount of
each with one purposeful contract rather than implementing whole rows at once.

| Extension | Expected return | Relative effort | Suggested order |
| --- | --- | --- | --- |
| Habitat-specific communities and population placement | High: makes expeditions feel different | Medium | First representative scene |
| One readable group or defensive behaviour | High if it changes approach | Medium | With the first scene |
| Specific scientific acquisition contracts | High: gives an expedition purpose | Medium: new objective and physical hand-in semantics | One bounded request early |
| More constrained body-plan/content families | High, with existing runtime | Medium | Alongside habitat variety |
| Expanded four-colour silhouette library | High readability and identity | Low-medium | Alongside content, not a new renderer |
| Species database and evidence comparison | High for accumulated exploration | Medium | After the first purposeful expedition |
| Useful individual variation | High if rare and legible | Medium | After species/habitat distinctions are clear |
| Reproductive material and specialised sampling | Medium-high | Medium-high | After logistics validation |
| Wider stasis envelopes and laboratory equipment | High if tied to accessible habitats | Medium-high | Alongside new content |
| Exotic biochemistry | Potentially high wonder; scientific uncertainty | High | Prototype one family |
| Native atmosphere/biosphere coupling | High scientific coherence | High | Separate generation audit |
| Additional social/stalking behaviours | Medium-high | Medium | One at a time after the first behaviour |
| Continuous/chunked surface encounters | High freedom | High | Separate architecture project |
| Aquatic, aerial, and subsurface expeditions | High variety | Very high | One environment at a time |
| Larger anatomical portraits or articulated animation | Uncertain benefit beyond existing silhouettes | High | Optional dossier prototype later |
| Lightweight ecological change | Uncertain gameplay return | High | Experiment, not commitment |
| Full population simulation/evolution | Low direct player return | Very high | Defer indefinitely |
| Simulated research communications networks | Low unless central to exploration | High | Prefer abstract policy |

## 4. Richer Research And Scientific Commodities

### Scientific interest, demand, and price

Keep catalogue recognition, player evidence, specimen ownership, current
scientific demand, and buyer capability separate. The scanner can explain both
scientific interest and an actionable estimate; the market must show every
owned specimen, even if the current offer is zero or the port cannot receive it.
Distinguish unresolved identification from exhausted demand and an unequipped
buyer instead of presenting all three as an unexplained zero.

A recognised, adequately sampled species may still support a finite request
for a regional reference specimen or comparison. That request does not make
the species unknown again. Ordinary familiar life can also provide context and
observation without every organism becoming profitable cargo. Any later
zero-value donation flow needs explicit consent and a clear ownership result;
the current implementation leaves such containers aboard.

### Evidence types rather than one universal rarity ladder

Extend beyond first-version data/tissue/dead/live handling to distinguish:

- Observational telemetry and behaviour records.
- Biochemical/spectroscopic analysis.
- Tissue or other structural samples.
- Intact dead reference specimens.
- Viable reproductive material or propagules.
- Live specimens suitable for physiological study.

These categories provide different evidence, not necessarily a strict ordering.
A complete structural specimen may be more useful than damaged live material;
a stable propagule may suit a contract better than a large adult. Do not assume
every alien taxon has Earth-style seeds, eggs, DNA, or discrete individuals.

Model evidence contributions as typed capabilities/usefulness: morphology,
chemistry, physiology, behaviour, reproduction, and variation. A buyer requests
a missing contribution; the campaign ledger tracks contributions already met.
Keep first-discovery/reference rewards cumulative and bounded as in the first
plan, even if the demand vector becomes richer.

### Analysis methods

Candidate methods include imaging, passive spectroscopy, behavioural
observation, substrate/chemical sampling, and onboard laboratory analysis.
Introduce a method only if it provides a different decision or enables an
otherwise unavailable conclusion. Five progress bars that all unlock the same
description are not five worthwhile mechanics.

Laboratory work could advance during ordinary travel using explicit durations,
but should not decay evidence while the player reads. Separate research
completion time from preservation reliability. A queue with concise results is
preferable to repeatedly reopening an analysis panel.

### Contracts and buyers

The mission board currently stores arrays of `ScanMissionObjective`; progress
matches discovery and hands in at the issuing station. Introduce a discriminated
objective union with typed evidence/submission objectives referencing stable
species/site IDs, required contribution, quality, and handling conditions.
Update objective evaluation and save validation together. Keep issuing-station
hand-in semantics, but do not treat possession at capture time as an irreversible
delivery: a live container may subsequently be sold or discarded.

Start with one request for an existing, identified habitat population rather
than individual variants or new evidence categories. A contract destination,
required specimen, handling limit, and fixed payment must be legible before
departure. Only advertise a target whose canonical site and eligible organism
can actually be resolved; preparation/readiness is not a reason to invent a
replacement species or mutate the universe to fulfil a board entry.

Physical hand-in must revalidate station identity, specimen ownership,
species/site provenance, kind, and quality before consuming exactly one whole
container and completing the objective. Commit cargo, mission, credits, and
applicable research-ledger changes atomically. Specify ordinary research value
and the finite contract payment separately; if the latter includes the former,
settle both in one transaction rather than awarding novelty again in Sell.
Record accepted scientific contributions even when their ordinary market price
is zero; accepting material for a contract is not the same as a refused sale.
One physical container must not satisfy multiple delivery contracts. Decide
explicitly whether nonphysical evidence can serve multiple independent requests.

Examples: a live reference voucher for a recognised but poorly sampled species;
reproductive material from a particular habitat; comparison of two related
species; behaviour evidence from a territorial organism without killing it.

Buyer specialisation can distinguish general survey offices and equipped
research centres. Show destinations and current estimates before departure.
Campaign demand remains shared: changing buyer does not recreate novelty.
Automated depots may eventually offer sealed freight services, but not magically
perform all biological analysis.

Prototype gate: a contract should change preparation or the specimen selected,
not merely attach an extra reward to what the player was already doing.

## 5. Individual Variants And Sampling Value

Generate variation from the individual's stable seed and inherited species
limits: life stage, size, physiological state, mineralisation, coloration,
symbiont association, or a genuinely informative environmental adaptation.
Distinguish ordinary within-species variation from a scientifically useful
variant. Unusual does not automatically mean valuable.

Persistent ordinary size variation now exists. A future rare variant should
add one bounded adaptation or life-stage feature only after habitat/species variety
works. If size changes, scanner mass, silhouette scale, stun outcomes, handling
limits, and container volume must all use the same resolved individual traits.
Retain those traits in specimen provenance rather than regenerating them from
a possibly revised species definition at sale time. Juveniles can be a useful
handling choice without guaranteeing the adult's full reference value.

Possible demand rule: a limited research request for an unsampled phenotype
cluster or habitat-associated form, rather than a permanent rare-loot multiplier.
Require appropriate evidence to distinguish the variant and estimate value.

Important cautions:

- Reentering a field must not reroll individuals until a profitable one appears.
- Killing everything to search for rare traits should not be the optimal loop.
- Scanner confidence affects recognition; novelty is not granted for every
  minor deviation or possible measurement error.
- Colour changes alone are insufficient reason for extreme prices.
- Variants remain variants of their canonical species unless later analysis
  explicitly supports taxonomic revision.

Prototype gate: the player occasionally changes their collection choice after
noticing a variant, without being trained to grind endless low-value contacts.

## 6. Extended Biology And Hidden Phylogeny

### More coherent histories

The existing paired species share seeded symmetry, covering, senses, and some
organisation through five ancestor groups. Use this to make visible family
resemblances before expanding the model: related contacts should have recognisable
structural features and coherent handling, not just a common clade label.

When evidence comparison warrants it, expand these groups into a shallow
generated tree. Store parent relationships and inherited biochemical/developmental
traits. Generate descendants by constrained changes, allowing ecological
specialisation and convergence without assuming that visual similarity means
close relationship.

The root primarily supplies biochemical foundations. Symmetry, appendages,
segmentation, colonies, and sensory organisation belong to appropriate branches;
not every organism on a planet must share the same macroscopic body plan.
Support multiple major groups before considering multiple independent origins
of life on one planet.

Generate a plausible abstract history from environmental stability, energy,
available habitats, and stellar age. Do not simulate billions of years of
mutation/selection. Avoid converting system age into a guaranteed complexity
ladder: old does not necessarily mean sophisticated, and stability matters.

### What the player learns

Keep the generated tree hidden. Scanner/database relationships are inferred
from actual evidence, with confidence. Observation may suggest a shared plan;
analysis may strengthen or reject the relationship. A screen must not reveal
the generator's tree simply because it is easy to draw.

Taxonomic names are presentation, not identity. If an inferred grouping changes,
preserve specimen provenance, evidence, and already-paid claims. A future
species split/merge needs explicit claim reconciliation, not renamed cargo keys.

Prototype gate: two or three related taxa should feel connected in descriptions
and handling, while offering different encounters. If a larger tree adds only
more names, stop at the shallow model.

## 7. Exotic Environments And Chemistry

Treat this as a set of individually researched content families, not a single
`exotic` flag that makes every impossible organism acceptable.

Candidate families:

- Carbon-water extremophiles with pressure, salinity, acidity, or thermal limits.
- Cold water/ammonia-rich environments with appropriate phase constraints.
- Hydrocarbon-solvent biology in suitable cold habitats, explicitly hypothetical.
- Organisms with unusual structural minerals or metallic inclusions while
  retaining a conventional biochemical backbone.
- More speculative chemistries only after their environmental and gameplay
  assumptions are documented.

For each family define solvent phase, operating temperature/pressure, usable
energy, substrates/products, structural materials, expected metabolic scale,
observation methods, stunner applicability, and preservation requirements.
Use typed numeric data and shared phase/physical helpers, not text heuristics.

Do not confuse a silicon-rich shell with proven silicon-based life. Do not
populate extremely cold, low-energy environments with fast Earth-like pursuit
predators just because the species has an exotic label. Partial pressures,
solvent availability, and local refugia matter more than a planet's name.

Known life provides a carbon-water baseline; non-water solvents remain
speculative. Useful research starting points are
[NASA's overview of life requirements](https://astrobiology.nasa.gov/education/alp/what-does-life-need-for-survival/)
and [NASA's discussion of experimental alternative biochemistry](https://science.nasa.gov/universe/search-for-life/life-in-the-lab/).
Consult primary research for each selected family before coding its constraints.

Prototype gate: one new family creates a recognisable expedition with different
equipment and scientific uncertainty. Avoid implementing a dozen solvent
families as interchangeable labels.

## 8. Stasis And Handling Progression

Basic carbon-water stasis is already included in the standard survey bay:
280-315 K, 0.3-2 bar, two live slots per carrier, and an 80 kg handling limit.
The existing extended kit expands the thermal/pressure envelope and live slots.
These are gameplay equipment specifications, not measured preservation limits
for unknown organisms. Preserve the included kit and reliable handling of
compatible specimens when introducing specialisation.

Prefer capability envelopes to a single power level that eventually accepts
everything. Candidate upgrades expand pressure containment, thermal control,
compatible atmospheres/solvents, isolation, or container size.

Both rover preservation and ship facilities must support the specimen. Large
adults may be impossible to collect while tissue or propagules remain useful.
Show the limiting capability before capture and before transfer. A smaller
live specimen or nonliving sample should be a valid strategic alternative.

Distinguish science-fiction suspension from physical containment. A specimen
that cannot be cooled safely may require an actively maintained habitat;
pressure transitions and incompatible substrate mixing cannot be hand-waved
away by calling the container stasis.

Possible later reliability mechanics include damaged containment, power
limitations, contamination, or temperature excursions. Introduce these only
with clear warnings, meaningful countermeasures, and an explicit time model.
The first version promises reliable compatible stasis; breaking that promise
silently during long travel would be a regression, not added realism.

Do not require manual atmosphere tuning for each mundane specimen. Let known
profiles configure automatically. Unknown profiles might require choosing a
conservative strategy, but not searching dozens of sliders by trial and error.

Prototype gate: an upgrade unlocks a destination/specimen the player wants,
rather than merely reducing an invisible random death roll.

## 9. Native Biospheres, Atmospheres, And Terraforming

This deserves a separate scientific generation project. Current natural
atmospheres do not include biospheric oxygen feedback; managed terraforming is
an explicit environmental overlay. See [the atmosphere audit](../planetary-atmosphere-audit.md)
and [terraforming model](../terraforming_model.md).

A possible bounded generation sequence:

```text
physical environment and volatile inventory
  -> possible abiotic habitats and energy sources
  -> seeded biosphere origin/history/productivity
  -> constrained atmospheric surface-process adjustment
  -> re-evaluate climate/solvent stability and biosphere consistency
```

This requires mass/redox budgets, physical atmospheric retention, and a bounded
convergence policy, not simply adding 21% oxygen whenever life exists. Native
life need not oxygenate its world; photosynthetic chemistry is not necessarily
Earth-like. A stable final state must satisfy atmosphere, temperature, liquids,
and biological constraints together.

Use independent versioned seeds and intentional generation fingerprints.
Do not consume or reorder unrelated stellar/geology/resource streams. A world
generation revision can intentionally change outputs, but must be declared and
handled in saves rather than occurring through a renderer or scanner side effect.

Terraforming adds provenance questions: indigenous life, imported organisms,
managed strains, altered habitats, and remnants of earlier ecosystems. These
should affect catalogue familiarity and research value without confusing
introduced life with a newly discovered independent biosphere.

Optional protection/contamination protocols could reward careful observation
and sealed sampling. Prefer concrete research conditions to a universal moral
score or punitive surprise rules.

Prototype gate: representative single/binary/triple, hot/cold, and managed/native
fixtures remain physically coherent. Do not undertake this just to recolour
vegetation or populate more planets conveniently.

## 10. More Behaviour Without Expensive Ecosystem AI

The encounter system already supports sessile, passive, skittish, territorial,
and ambush families. Behaviour advances on successful local actions, not a
free-running clock; dangerous contacts warn before damage. Retain these pacing
and safety contracts. Motion can be richer without turning reading and target
selection into reflex tests.

Good candidates, added one at a time:

- Herd groups sharing a home area and loose cohesion.
- Defensive displays and retreat before attacking.
- A stalker that keeps distance and reacts to the rover's approach.
- Pursuit restricted by territory, stamina, and reachable habitat.
- Shelter seeking or activity changes under local environmental conditions.
- Coarse feeding/resting cycles and symbiotic associations.

Use shared state machines or small utility choices with species parameters.
Sensing should reflect the organism's plausible sensory family and actual
line-of-sight/chemical-range abstractions, not omniscient player coordinates.
Keep active population and update budgets explicit.

Additional costs include terrain routing, group coordination, collision,
telegraphing, recovery, and deterministic suspension/restoration. Reuse `rot-js`
pathfinding where appropriate; avoid introducing a behaviour-tree framework
before simpler state machines demonstrate a limitation.

Habitat and group membership can make encounters feel ecological without
simulating hunger, individual reproduction, and every predator/prey interaction.

Pair behaviour with a relevant habitat and legible visual response. Loose group
retreat around a producer patch offers more expedition value than a new
behaviour label whose movement is indistinguishable from random roaming. Do
not increase contact density or warning frequency just to demonstrate the AI.

Prototype gate: the player can distinguish behaviours through observation and
adapt their approach. If extra AI mostly produces unexplained aggression,
oscillation, or more chasing, remove it.

## 11. Expanded Surface Environments

### Continuous local travel

Replacing bounded fields with streamed terrain chunks is a major spatial
project. It needs canonical planetary/local coordinates, persistent chunk and
actor identities, cross-chunk movement, loading boundaries, resource rules,
and bounded generation/prefetch. Screen resizing must not change world geometry.

The current full-area presentation does not remove this boundary: it still
shows a 32 by 24 logical field. Complete visited fields are saved and frozen
while away. Any streaming proposal must explicitly replace or extend these
contracts and budget retained state; neither chunk ownership nor sparse
site-change persistence is already implemented.

Do not reinterpret existing tens-of-kilometres heightmap cells as metres.
Derive detailed terrain beneath a macro region while preserving geology and
habitat relationships. Keep regional travel distinct from slow local traversal
so crossing a planet does not become an enormous walking task.

Unloaded actors need a clear policy: suspended, analytically advanced, or
population-abstracted. Deterministic resumption must preserve captures and
removals, not respawn a hunted individual under a new transient ID.

### Aquatic, aerial, and subsurface habitats

Each adds new traversal and equipment requirements. Liquid-covered cells are
not already a submarine game. Gas-giant atmospheric views are not solid terrain
or evidence that a rover can safely pursue aerial organisms there.

Prototype one habitat at a time: shoreline sampling before underwater
navigation; tethered observation before powered flight; a small subsurface
survey site before a full cave generator. Pressure, temperature, visibility,
vehicle range, entry/exit, and rescue must be intelligible.

### Crew and remote tools

Selectable foot expeditions, drones, probes, nets, and remote samplers introduce
additional carriers and independent positions. Add a carrier abstraction when
the third real carrier arrives, not merely because it may exist someday.
Keep container ownership and transfer transactions unified.

Crew skills should influence analysis and handling within visible bounds, not
force repetitive minigames or enable magical certainty. Safety must reflect
actual protective equipment and deployment state.

Prototype gate: the new traversal produces discoveries that bounded rover
fields cannot, while preserving reasonable travel time and recovery options.

## 12. Procedural Visual Anatomy

The first visual step already exists: small four-colour pixel silhouettes from
ten patterns, compact size variation, two-frame mobile animation, and a selected-contact portrait when
the telemetry layout has room. They use a separate pixel drawing layer rather
than replacing the game's terminal typography. Patterns currently distinguish
broad sessile/mobile, radial, covering, and ambush characteristics; they are not
a complete anatomical grammar or a literal scale model.

Extend the library with constrained proportions, segmentation, appendage
arrangements, and inherited family cues. Derive visible anatomy from the same
typed traits used in biology descriptions. Match both field silhouettes and
dossier portraits to those traits; do not generate contradictory illustrations
from an unrelated decorative seed. Keep each sprite within four colours.

Cache prepared sprites/portraits by stable identity and visual version. Keep
animation to a few deliberate frames and preserve terminal typography, contact
brackets, and spacing. A richer image must not leak unobserved internal chemistry
or hidden lineage. Visual-only work must not advance gameplay random streams.

Later options include directional multi-cell silhouettes or a constrained
developmental grammar. Costs include valid topology, limb placement,
occlusion, collision footprint, motion, clipping, and test fixture breadth.
Visual scale and collision scale must remain understandable.

Do not attempt unrestricted procedural skeletons/soft-body animation first.
If modules produce incoherent anatomy, improve the library and constraints
before increasing the generator's freedom.

Prototype gate: generated portraits are recognisably different, consistent with
their dossiers, and readable in actual fonts at small viewports. Repeated seeds
must render identically without per-frame generation.

## 13. Database And Inferred Relationships

Build on the initial species table with filters for origin, catalogue status,
evidence, useful demand, carried material, and pending contracts. The database
should help plan expeditions, not require completing an encyclopaedia.

The shipboard `X` science log now supplies evidence-filtered dossiers, novelty,
pending-data and aboard filters, recorded origin coordinates, personal and
submission history, accepted requests and orbital return-site selection.
The current unverified wave adds `C` acquired-trait comparisons and Tab counterpart
selection. These report qualitative morphological/structural affinity and
convergence limits, not established ancestry or a numerical confidence model.
Genomic evidence and a richer relationship visualisation remain future work.

Suggested views:

- Species dossier with confirmed/probable/unresolved traits.
- Evidence history and submitted reference/sample contributions.
- Habitat and handling requirements with equipment compatibility.
- Related-species comparison and inferred lineage confidence.
- Origin chart/site references and collection provenance.

Use the existing text UI and terminal reveal conventions. A relationship table
or compact branch view is sufficient before attempting a large pan/zoom tree.
Unknown relationships remain unknown; the UI cannot simply expose hidden ancestry.

Index only encountered or relevant historical records. Do not generate an
entire Galactic species database for a search screen. Preserve stable IDs under
renaming, revised descriptions, and improved classification.

Prototype gate: the player uses the database to choose a specimen, equipment
upgrade, or destination, rather than opening it only to clear completion marks.

## 14. Ecology And Evolution: Optional Research Projects

A low-cost ecological impression can come from static guilds and habitat
productivity: producers, consumers, scavengers, decomposers, and constrained
abundance. Broad consistency checks already provide much of the perceived depth.

Possible intermediate experiments:

- A local disturbance state after sampling/hunting that changes nearby behaviour.
- Seasonal activity or a temporary resource pulse derived from physical inputs.
- A few coarse population cohorts with analytical recovery while unloaded.
- Competition between habitat groups, without individual food-chain simulation.

These still require explicit time, birth/removal identity, bounded persistent
history, and consequences the player can observe. A recovered population must
not reset scientific demand or recreate the same sold specimen.

Full simulation would add energy budgets, reproduction, predation, population
collapse, migration, mutation, and long timescale integration. It is expensive
to validate scientifically and difficult to make stable under fast travel,
saved games, suspended chunks, and player intervention.

Recommendation: do not implement evolutionary simulation unless a separate
prototype proves a compelling player-facing benefit that deterministic
generated history cannot provide.

## 15. Suggested Expansion Waves

Choose one small project within a wave; do not implement all columns at once.
The first vertical slice intentionally connects habitat, behaviour, and a
contract so their benefit can be assessed together. Later waves remain optional.

| Wave | Candidate deliverable | Prerequisite | Exit gate |
| --- | --- | --- | --- |
| A: Coherent expedition | One habitat community, one readable behaviour, one acquisition request | Existing bounded loop; reviewed canonical habitat inputs | The player recognises the scene and changes approach/specimen selection for a reason. |
| B: Research continuity | Useful species/evidence comparison, provenance, further specific requests | First purposeful expedition is enjoyable | Records help choose a return visit or preparation without a completion grind. |
| C: Individual choices | One size/life-stage/adaptation variant or specialised sample type | Clear species/habitat distinctions and stable provenance | Individual choice changes handling or finite demand without rare-loot farming. |
| D: Handling and scientific breadth | One carbon-water extremophile family with relevant equipment; later one reviewed speculative family | Typed physical compatibility and reliable basic stasis | A new expedition has visible preparation, uncertainty, and useful fallback evidence. |
| E: New traversal | One streamed/local, aquatic, aerial, or subsurface prototype | Canonical coordinates and bounded persistence | Discoveries justify new vehicle/loading/rescue complexity. |
| F: Ecological experiment | One observable local disturbance/seasonal effect | Explicit multi-timescale policy | Player-facing benefit exceeds upkeep and simulation cost. |

Atmosphere coupling may need to precede a specific content family; wave order
is not permission to generate physically incompatible life while waiting.

### Recommended next milestone: one coherent expedition

This milestone has been explicitly authorised and its automated and browser
verification passed, as did the science log, individual sizes and
analysis/tissue requests. Native inherited groups, their silhouettes, visible
defensive activity and paired comparison requests also passed verification.
Survey previews, recorded comparisons, reinforced coverings and the pressure
expedition are the current unverified extension. The stages below document scope and acceptance gates rather than
claiming tested completion or instructing implementation of later waves.

**Player decision:** choose how to approach a recognisable community and which
eligible specimen to retain for a known research request while live slots and
cargo remain limited. A familiar species can be worthwhile for the request
without being reclassified as a new discovery.

**Content boundary:** one accessible carbon-water habitat family, roughly three
relevant taxa drawn from a constrained content library, and a sparse population
within the existing field dimensions and actor budget. Use numeric terrain,
liquid proximity, and environmental inputs where available. Describe a moist
rocky margin only when these inputs support it; do not add a new microclimate
simulation or infer moisture from terrain colour. Include plausible producers
and consumers without inventing an unreviewed high-energy anaerobic community.
Allow barren/unsuitable sites rather than filling every field with life.

**Behaviour boundary:** one loose group-retreat behaviour for suitable mobile
organisms. Shared home areas and local reaction are enough; no feeding,
reproduction, flocking engine, or continuous population simulation. Keep a
reachable return route and ensure collective movement cannot permanently trap
the rover. Existing hazardous behaviour remains bounded and telegraphed.

**Research boundary:** one finite request for a live specimen of a recognised
species from a specified habitat, within existing basic-stasis limits. Do not
require individual variants, new solvents, or a general multidimensional
research-demand model for this milestone. Tissue/data retain their ordinary
fallback value but do not silently fulfil a live-delivery objective.

| Stage | Implementation focus | Completion gate |
| --- | --- | --- |
| A0: Specify a representative fixture | Inspect numeric environment/surface inputs and existing tests; define one suitable habitat, target, finite payment policy, and intentionally changed generation version | A canonical eligible site can be produced without changing unrelated stellar, geology, mineral, or market streams. |
| A1: Generate the community | Extend biology definitions/generation with explicit habitat suitability and species affinities; replace fixed composition/placement for this family only | Suitable contacts occupy reachable, appropriate patches; unsuitable and legacy sites have a documented fallback. |
| A2: Add readable group retreat | Extend encounter actor state and bounded update rules with stable group membership/local sensing; persist and validate actual new state | The player can recognise a coordinated response; identical actions reproduce it across save/reload and suspension. |
| A3: Add the one acquisition objective | Extend mission objective types, progress evaluation, board generation/readiness, save validation, and atomic physical hand-in | A real target is advertised; the correct live container can be delivered once at the issuer; wrong provenance, sold specimens, and duplicate claims fail without mutation. |
| A4: Present the expedition | Reuse field renderer, sprite library, action list, evidence-filtered dossiers, Cargo, Sell, and Research; show requested specimen and destination | Habitat, behaviour, handling requirements, price, and contract eligibility are readable without permanent label clutter or hidden-trait leakage. |
| A5: Verify and playtest | Announce the testing phase, then run focused generation/actor/cargo/mission/save/UI tests, graphics captures, and the complete existing checks | One representative expedition changes approach or collection choice; regressions and repeat-reward exploits are absent; results distinguish measured behaviour from design expectations. |

Implement domain rules in the current generator, encounter system, cargo, and
research/mission services. Keep Game as the orchestration boundary. Add a
focused habitat helper only if it removes concrete complexity; do not introduce
an ecosystem manager, generic quest engine, or third carrier in advance.

Version new biology and mission save contracts deliberately. Preserve unrelated
world identities and existing owned specimens/evidence, or provide an explicit
development-save reset policy rather than silently mixing regenerated species
with old actor records. Generation changes need not reproduce unreleased old
worlds forever; they must still have clear ownership and deterministic outcomes.

Verify zero-value/unsupported specimen visibility, basic-stasis availability,
nearby Cargo pickup, direct hotkeys versus menu selection, reading/reveal pauses,
and desktop/narrow-screen layering alongside the new feature. Avoid replacing
unrelated graphics expectations to make the expansion pass.

**Stop condition:** if the first scene merely adds more labels, extra chasing,
or another routine collection reward, improve or remove that addition before
implementing more habitat families. Do not proceed directly to streamed
terrain, exotic solvents, an inferred tree browser, or ecosystem simulation.

## 16. Verification And Decision Gates

For every proposed extension, write down before implementation:

1. The new decision or discovery it gives the player.
2. Existing systems it reuses and new state/architecture it requires.
3. Scientific assumptions, speculative elements, and numeric units.
4. Evidence the player can actually obtain and what remains uncertain.
5. Persistent identity, ownership, time, and reward consequences.
6. A smallest representative prototype and explicit stop condition.
7. Focused tests, representative captures, performance measurements, and save
   compatibility policy.

Retain first-version regression gates: order-independent generation,
constraint validity, pause/input correctness, atomic transactions, bounded
value, persistence, and contact layering/clipping. Do not replace unrelated
graphics snapshots merely because a new biology feature was added.

Additional checks by project:

- Habitats: numeric suitability and constrained abundance, distinct composition,
  reachable entry/contacts, empty-site fallback, and no ecology inferred from pixels.
- Contracts: eligible advertised targets, provenance/ownership revalidation at
  physical hand-in, issuing-station identity, atomic completion, and no duplicate
  container or novelty award through another contract/tab/port.
- Chemistry: solvent phase, energy/redox compatibility, and explicit speculation.
- Atmosphere: converged temperature/composition, retention, multi-star exposure,
  managed/native distinctions, and intentional generation-version changes.
- Variants/taxonomy: canonical IDs survive reclassification; claim reconciliation
  cannot inflate lifetime rewards.
- New evidence types: usefulness/demand is not an unlimited additive payout ladder.
- Stasis: compatibility and damage warnings match outcomes and time sources.
- AI/ecology: bounded work, deterministic suspend/resume, clear warnings, and
  no free respawn/collection reset.
- New carriers/chunks: unique ownership, stable positions, partial-load refusal,
  and no evidence loss after travel/save/import.
- Visual anatomy/database: real-font readability, viewport behaviour, evidence
  masking, stable cached generation, and no leaked hidden tree.

Announce testing/data-collection phases when following the user's model-switching
workflow. Distinguish measured performance or playtest observations from guesses.

## 17. Open Decisions To Revisit

- How rare should life and encounterable complexity be for enjoyable travel?
- Can players recognise different habitats and behaviours without reading every
  dossier? Does a specific request change which specimen they retain?
- Do zero-demand specimens need an optional donation flow, or is clear pricing
  and deliberate disposal sufficient? Keep ownership visible either way.
- Is structured analysis a useful action, an automatic equipment capability,
  or a travel-time laboratory task?
- Which scientific contributions justify a first reference-specimen reward,
  independently of the first observational discovery?
- When are native oxygenating atmospheres needed to support intended organisms?
- Should any specimen require maintained habitat rather than fictional stasis?
- Do buyer specialisations improve expedition planning enough to justify travel?
- Would safe automatic return reduce field-exit tedium without erasing danger?
- Which new habitat provides the strongest return per new traversal system?
- Does inferred phylogeny affect handling/research, or mainly enrich descriptions?
- Does any ecological change create a better decision than generated static history?

Answer with representative prototypes and playthroughs, not by adding speculative
state to the first release. The smaller plan is complete when its own loop is
good; this roadmap is a menu of future projects, not a debt that must be paid.
