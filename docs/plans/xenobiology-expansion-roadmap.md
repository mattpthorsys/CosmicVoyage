# Xenobiology: Ambitious Expansion Roadmap

Status: exploratory planning, not an implementation commitment.
Codebase baseline inspected: 2026-10-03. The bounded xenobiology system itself
is still proposed; references to a first-version foundation below mean the
future result of [the implementation plan](xenobiology-first-version.md).

This document explores richer biology, research, logistics, visualisation, and
encounters. It is deliberately not a checklist that must all be completed.
Select extensions only after the smaller discovery/capture/submission loop is
playable, reliable, and demonstrably enjoyable.

Navigation: [priorities](#3-candidate-priorities),
[research](#4-richer-research-and-scientific-commodities),
[variants](#5-individual-variants-and-sampling-value),
[phylogeny](#6-extended-biology-and-hidden-phylogeny),
[chemistry](#7-exotic-environments-and-chemistry),
[atmospheres](#9-native-biospheres-atmospheres-and-terraforming),
[traversal](#11-expanded-surface-environments),
[expansion waves](#15-suggested-expansion-waves),
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

## 2. Preconditions And Architecture

Require the first version to establish these contracts before adding breadth:

| Foundation | Why expansion depends on it |
| --- | --- |
| Stable species, site, individual, and container IDs | New content cannot reset knowledge, ownership, or rewards. |
| Separate definitions, evidence, science demand, and specimen state | A visual change or new trait must not become an economic migration by accident. |
| Explicit encounter time and modal pausing | Complex behaviour/recovery cannot use accelerated travel time accidentally. |
| Whole-container transactions and shared occupied volume | More sample types/carriers cannot duplicate specimens or bypass cargo capacity. |
| Typed commands, bounded actors, and readonly scene models | Additional interactions remain testable without enlarging Game/SceneRenderer. |
| Versioned snapshots and sparse visited-site deltas | Revisit and save/load remain coherent as content grows. |
| Evidence-filtered descriptions and capability-based handling | More chemistry does not require rewriting every scanner or equipment branch. |

These are useful domain boundaries, not instructions to write a generic plugin,
AI, inventory, taxonomy, or simulation framework in advance. Extend concrete
systems when a selected feature needs the extension.

The current hooks remain [Planet](../../src/entities/planet.ts),
[surface generation](../../src/entities/planet/surface_generator.ts),
[human presence](../../src/generation/milky_way_model.ts),
[ship equipment](../../src/core/ship_modifications.ts),
[mission progress](../../src/core/mission_progress.ts), and
[text UI](../../src/core/text_ui.ts). Domain inputs and generation should not
depend on the renderer or browser.

## 3. Candidate Priorities

Effort is relative to a completed first version, not a calendar estimate.
Costs increase sharply where a feature requires a new traversal environment.

| Extension | Expected return | Relative effort | Suggested order |
| --- | --- | --- | --- |
| Specific scientific acquisition contracts | High: gives an expedition purpose | Low-medium | Early |
| Useful individual variation | High if rare and legible | Medium | Early |
| Species database and evidence comparison | High for accumulated exploration | Medium | Early |
| More constrained body-plan/content families | High, with existing runtime | Medium | Early |
| Reproductive material and specialised sampling | Medium-high | Medium-high | After logistics validation |
| Wider stasis envelopes and laboratory equipment | High if tied to accessible habitats | Medium-high | Alongside new content |
| Exotic biochemistry | Potentially high wonder; scientific uncertainty | High | Prototype one family |
| Native atmosphere/biosphere coupling | High scientific coherence | High | Separate generation audit |
| Richer behaviour and modest social groups | Medium-high | Medium | Only where readable |
| Continuous/chunked surface encounters | High freedom | High | Separate architecture project |
| Aquatic, aerial, and subsurface expeditions | High variety | Very high | One environment at a time |
| Procedural anatomical portraits/animation | Medium visual return | High | Dossier prototype first |
| Lightweight ecological change | Uncertain gameplay return | High | Experiment, not commitment |
| Full population simulation/evolution | Low direct player return | Very high | Defer indefinitely |
| Simulated research communications networks | Low unless central to exploration | High | Prefer abstract policy |

## 4. Richer Research And Scientific Commodities

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

Extend the current scan-only objective union with typed evidence/submission
objectives referencing stable species/site IDs, required contribution, quality,
and handling conditions. Keep existing issuing-station hand-in semantics.

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

Expand the initial ancestral groups into a shallow generated tree. Store
parent relationships and inherited biochemical/developmental traits. Generate
descendants by constrained changes, allowing ecological specialisation and
convergence without assuming that visual similarity means close relationship.

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

Good candidates after four basic families work:

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

Prototype gate: the player can distinguish behaviours through observation and
adapt their approach. If extra AI mostly produces unexplained aggression,
oscillation, or more chasing, remove it.

## 11. Expanded Surface Environments

### Continuous local travel

Replacing bounded fields with streamed terrain chunks is a major spatial
project. It needs canonical planetary/local coordinates, persistent chunk and
actor identities, cross-chunk movement, loading boundaries, resource rules,
and bounded generation/prefetch. Screen resizing must not change world geometry.

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

Start with dossier portraits using small ASCII silhouettes assembled from
archetype modules. Derive symmetry, segmentation, appendages, covering, and
proportions from the same typed traits used in biology descriptions.

Cache prepared portraits by species definition/visual version. Keep animation
to a few deliberate frames, and preserve terminal typography and spacing.
The map glyph remains a legible contact, not a miniature unreadable portrait.

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

| Wave | Candidate deliverable | Prerequisite | Exit gate |
| --- | --- | --- | --- |
| A: Research depth | Specific contracts, useful variants, improved species table | Bounded version complete and balanced | Different specimen choices without grind or duplicate rewards. |
| B: Handling choices | Propagules, specialised sampling, one broader stasis envelope | Stable container/evidence contracts | A new expedition has visible preparation and useful fallback rewards. |
| C: Scientific breadth | One exotic family or native atmosphere coupling | Reviewed numeric environment model | Coherent physical fixtures and a distinct playable loop. |
| D: Encounter richness | One social/stalking behaviour or portrait library | Readable existing AI/rendering | Noticeable improvement without constant aggression or visual noise. |
| E: New traversal | One streamed/local, aquatic, aerial, or subsurface prototype | Canonical coordinates and bounded persistence | Discoveries justify the new vehicle/loading/rescue complexity. |
| F: Ecological experiment | One observable local disturbance/seasonal effect | Explicit multi-timescale policy | Player-facing benefit exceeds upkeep and simulation cost. |

Atmosphere coupling may need to precede a specific content family; wave order
is not permission to generate physically incompatible life while waiting.

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
