# Survey, Comparison And Specialised Expeditions

The four authorised steps are being implemented as separate checkpoints.
Tests are written alongside implementation; execution and browser collection
await the user's requested switch to Luna.

1. Habitat surveying: implemented, verification pending. Orbit uses existing
   survey evidence; planetary dossiers show measured terrain, planetary mean
   conditions, visited sites and only locally acquired species-record counts.
   B selects a habitat with a concise physical preview. Undetected biology is
   unresolved; absence of accessible signatures is not proof of a sterile world.
2. Evidence-based species comparison: implemented, verification pending. X then
   C toggles a paired report; Tab chooses a recorded counterpart. Morphology
   and acquired analysis support qualitative affinity, with convergence and
   unconfirmed ancestry stated explicitly. Hidden family labels are not used.
3. Individual covering variation: implemented, verification pending. New native
   shell-bearing contacts can have a reinforced covering. Source and container
   retain that form; one resolved physical profile governs mass, stun modelling,
   handling and cargo. Observation reveals the form and sprites show a restrained
   ridge highlight. A 1,200 Cr finite request compares standard/reinforced tissue
   from actual individuals; it adds no ordinary rarity multiplier. The numerical
   mass/armour adjustments are explicit fictional handling priors, not measured
   dose-response data or proof of genetic adaptation.
4. Explicit preservation capabilities and one extremophile expedition:
   implemented, verification pending. Preservation profiles supply the shipyard,
   capture, transfer and save validator. The 4,200 Cr pressure-preserving cradle
   retains isolated native substrate at up to 30 bar, with six live slots per
   carrier and the existing 80 kg handling limit. One finite 1,600 Cr live
   reference request uses actual recognised or player-observed native contacts.
   Analysis and tissue requests remain available without live preservation.

## Scientific Scope

The added family is a conservative water-colony analogue, not a prediction
that a specific alien world has life. Native occurrence still uses the existing
probability/age/gravity priors. The special family requires verified liquid
water, landability, 280-330 K, 8-30 bar, generation-reference stellar flux of
20-3,000 W/m^2, and a coarse carbon-inventory screen (CO2 partial pressure
0.000001-0.1 bar). Actual summed multi-star reference flux is retained from
planet generation; travelling/animation does not reroll this biology.

Four taxa comprise attached photosynthetic producer films and small
fermentative detritus-recycling colonies. Mass describes collected colonial
material, not a macroscopic individual microbe. They are nonaggressive,
non-stunnable and limited to verified water-adjacent land habitats. They do not
invent geothermal energy, pressure oceans on land, or large anaerobic predators.
The anaerobic classification does not claim that every pathway or available
electron donor has been simulated.

Pressure/substrate preservation is motivated by the effects of decompression
on microbial recovery, documented in [Cario, Oliver and Rogers (2022)](https://www.frontiersin.org/journals/microbiology/articles/10.3389/fmicb.2022.867340/full).
The numerical generation envelope and equipment specifications are deliberate
gameplay assumptions, not values derived from that study. Ambient pressure
alone does not establish obligate piezophily. Local liquid chemistry, pH,
light attenuation, biomass productivity, and decompression dose-response are
not resolved here. Stasis remains a reliable science-fiction abstraction.

No ammonia/hydrocarbon life is generated in this wave. Typed solvent identifiers
make these requirements explicit, but current kits support water only; a larger
class number must never silently bypass chemistry or containment requirements.

## Persistence And Ownership

Save schema 15 migrates earlier storage keys. Biology generation version 3
governs new fields; already visited version-1/2 fields retain actual populations,
covering forms, evidence and specimens. Saved sites take precedence over a newly
generated site at identical coordinates, and remain accessible if a new
occurrence roll produces no new biosphere. This protects acquired material,
not unrestricted compatibility for every unvisited legacy contract identity.

Source lifecycle, individual size/covering and preservation requirements are
validated before imported specimens or contract deliveries are accepted.
Ordinary refusals consume no time, cargo, organisms or credits. Research uses
the same campaign-wide novelty ledger; no specialisation resets scientific
demand or creates an automatic rare-individual price multiplier.

## Verification Handoff

Do not report these additions as verified until Luna runs the following gates.
Focused regression coverage was written for survey evidence and previews,
acquired-trait comparisons and input ownership, covering provenance/handling,
finite paired settlement, pressure screening and colonial generation, typed
kit capabilities, atomic collection/transfer, live slots, source preservation,
version migration, persistent sites, and stable four-colour sprite footprints.

```bash
./node_modules/.bin/vitest --run src/tests/core/biology_survey.test.ts src/tests/core/species_comparison.test.ts src/tests/core/science_log.test.ts src/tests/core/pressure_expedition.test.ts src/tests/core/comparative_biology.test.ts src/tests/core/biological_contracts.test.ts src/tests/core/biological_mission_guidance.test.ts src/tests/core/xenobiology_integration.test.ts src/tests/core/xenobiology_ui.test.ts src/tests/core/interface/save_game.test.ts src/tests/generation/pressure_biosphere.test.ts src/tests/generation/native_biosphere.test.ts src/tests/generation/biosphere_generator.test.ts src/tests/generation/habitat.test.ts src/tests/systems/individual_variation.test.ts src/tests/systems/surface_encounter.test.ts src/tests/rendering/encounter_assets.test.ts src/tests/rendering/surface_encounter_renderer.test.ts
npm run check
COSMIC_URL=http://127.0.0.1:5175/ PLAYWRIGHT_MODULE=/home/mpalmer/.cache/ms-playwright-go/1.57.0/package node scripts/check_xenobiology_browser.cjs
```

Use an available Vite port and update COSMIC_URL if 5175 is not serving this
workspace. The walkthrough now captures survey dossiers, comparison/counterpart
selection and a pressure-preservation expedition across desktop/narrow layouts.
It checks paused reading, unchanged research during comparison, no sprite/modal
leakage, atomic refused collection, tissue without special stasis, the actual
shipyard purchase, live collection and finite delivery. The pressure scene is an
explicit controlled environment using production community/encounter generation,
not evidence of that atmosphere on the starting colony. World suitability and
occurrence are tested separately. Review the PNGs in `/tmp/cosmic-xenobiology`
for overlap, missing text, clipping and palette consistency; pixel counts alone
cannot establish visual quality. Fix and commit failures, then update this
document with actual results and any remaining playtest limitations.

## Personal Playthrough

1. Orbit a surveyed living world: `D` shows terrain/mean conditions and visited
   status, while `B` cycles habitat landing previews without revealing species.
2. Observe at least two species, then open `X` and press `C` for comparisons.
   Left/Right selects the primary species; Tab selects a recorded counterpart.
   Further analysis resolves structural/chemical rows, never confirmed ancestry.
3. Explore a new native shell-bearing field. `V` resolves standard/reinforced
   covering; sprites carry a modest ridge highlight. A station may request tissue
   from both actual forms. Partial delivery consumes nothing; the complete study
   pays once. Organic/managed organisms do not receive this native variation.
4. On an occasional suitable high-pressure water world, analyse an attached
   colony. Extended stasis must refuse native-substrate preservation while `S`
   still provides tissue. Fit the pressure-preserving cradle in Shipyard, return,
   approach within 7.5 m and collect through `O` Cargo or `C`. Deliver an accepted
   Pressure-preserved reference at its staffed issuer. Such a world is not
   guaranteed in a voyage or near the starting hub; do not search indefinitely
   just to validate interface changes.
