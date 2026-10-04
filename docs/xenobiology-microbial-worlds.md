# Microbial Worlds And Biosphere Complexity

## Playing

Native inhabited planets can now contain microbial-only communities, modest
multicellular communities, or richer biospheres. Microbes also occur alongside
larger organisms. Completed managed worlds retain their existing ten introduced
taxa and familiar encounters.

1. Investigate a biosignature candidate using normal orbital surveying. In the
   landing view, `B` cycles accessible habitat coordinates. Planetary dossiers
   list those sites; a distant spectrum does not identify their species.
2. Land, deploy the rover, approach a habitat coordinate and use `B` to investigate.
   Microbial-only worlds have at most four accessible sites and a few patches per
   field. Most terrain remains empty.
3. Pigmented films can be acquired within 40 m; subtle colonies require proximity
   within 15 m. Obstacles still occlude contacts. `Tab` cycles visible contacts,
   `V` observes, `A` analyses and `D` opens the coloured biological dossier.
4. Approach within 7.5 m. `S` takes one microbial material sample without needing
   stasis. `I` opens Cargo; select **Preserve microbial sample** and press Enter
   to take viable material. Opening Cargo does not collect anything. `C` is the
   direct preserve shortcut. Microbial contacts cannot be stunned or shot.
5. Return samples through Research or Sell at an inhabited port. Novel material
   uses the existing finite scientific demand, not a reward based on patch size
   or hauling distance. Data remains useful when physical preservation is impossible.

An analysed contact is identified as a single-celled community, with its energy
source, ecological role, chemistry and preservation needs. The scanner's mass and
dimensions describe the **aggregate patch**, never one oversized cell. Collection
takes 5 g of representative material, not the whole substrate. A viable community
sample is not claimed to be an isolated species or an established laboratory culture.
Finding only microscopic structures at one contact does not establish that the
entire world lacks multicellular life.

The sealed field cassette occupies 0.1 m^3, including containment hardware. This
retains the existing cargo system's 0.1 m^3 precision; it is not 100 litres of
biomass. A viable cassette occupies one stasis slot. Basic starting stasis supports
ordinary compatible water-based material, within its existing temperature/pressure
envelope. Specialised pressure communities retain their native-substrate and
Class III cradle requirement. Ordinary microbial samples do not all require that
upgrade. Each source supplies at most one material and one viable contribution;
selling, disposal, saving and revisiting do not renew it.

## Generation

`biosphere_complexity.ts` selects complexity on an independent seeded stream
**after** the existing physical eligibility and life-occurrence roll. Its reference
conditional weights are 0.62 microbial, 0.28 simple and 0.10 complex. These are
explicit gameplay priors, not measured frequencies of alien life.

Age, thermal suitability and energy availability influence the richer community
weights. Old planets can remain microbial-only indefinitely. Oxygen favours the
existing energetic fauna, not every kind of multicellularity. Low oxygen does not
forbid simple multicellular organisms; low available light/carbon confines the
current implementation to sparse water-rock microbial niches. The screened 8-30
bar pressure community remains microbial-only. There is no evolving oxygenation,
atmospheric feedback or simulated evolutionary clock.

`microbial_biosphere.ts` supplies two inherited groups: carbon-fixing producers
and organic recyclers, each with two habitat specialisations. Group members share
lineage names, pigment and structural traits. Phototrophy uses reference stellar
flux and carbon availability; chemical production is a bounded local water-rock
redox **proxy**, not a computed geothermal/mineral energy balance. Mineral inventory,
dissolved inorganic carbon, local moisture, UV screening and nutrient transport are
not modelled in this version. No unusual solvent chemistry is implied.

Simple multicellular forms are small, have distributed coordination, no locomotor
limbs and no generated predators or territorial attacks. Richer communities reuse
the inherited body plans and bounded behaviour already present. Every new native
biosphere includes microbial material; not every taxon occupies every habitat.
Habitat descriptions now describe physical terrain rather than promising animals
which might not exist there.

## Observatory Consistency

The Observatory reads the same canonical biosphere generator as surface play.
Pigment coverage varies separately from community complexity. Only light-powered
producers contribute to the biological reflectance-edge proxy; chemically powered
producers do not automatically acquire a pigment signature. Existing geological
false positives remain possible.

Atmospheric features still come from the actual atmosphere: generation does not
insert oxygen or methane to advertise microbes. A sufficiently exposed anoxic
microbial film can be a spectral candidate; a sparse or obscured living community
can yield no diagnostic signal. Neither spectral strength nor nondetection reveals
cellularity, guarantees fauna, or proves sterility. Complex worlds are not
automatically more remotely detectable than microbial ones.

## Extension Points

- `biology_types.ts`: typed cellularity, contact representation, energy source,
  surface expression, optional biosphere complexity and actual extracted mass.
- `biosphere_complexity.ts`: conditional priors and an isolated selection stream.
- `microbial_biosphere.ts`: shared microbial lineages; `pressure_biosphere.ts`
  retains the specialised environmental eligibility and preservation wrapper.
- `native_biosphere.ts`: small/simple versus richer organism generation.
- `biology_rules.ts`: typed patch identity and consistent contact/material labels.
- `surface_encounter_system.ts`: visibility, finite sampling and atomic refusals.
- `xenobiology_ui.ts`, `biology_survey.ts`: evidence-gated, locally scoped reports.
- `biology_validation.ts`, `specimen_provenance.ts`: import bounds and source integrity.

New generation uses biology version 4. Optional species metadata keeps legacy
records readable without guessing cellularity from a mat glyph or free-text
organisation. Previously visited worlds retain recorded field identities and taxa;
unvisited procedural content is not frozen. Active fields from every supported
biology version remain valid on import. New microbial mats are not silently
converted into dormant-bud parents by the legacy save enrichment path.

Laboratory culture, microscopic animation, expanding exotic-solvent niches,
atmospheric biosphere feedback and ecology simulation remain deferred.

## Pending Luna Verification

Implementation and test preparation are complete; **no new tests, typechecks,
lint/build checks, browser checks or population probes have been executed**.
Run these together with the pending Observatory verification:

```sh
npm run check
node scripts/profile_biosphere_population.cjs --systems=150 --samples=1200
PLAYWRIGHT_MODULE=/home/mpalmer/.cache/ms-playwright-go/1.57.0/package COSMIC_URL=http://127.0.0.1:5177 node scripts/check_microbial_browser.cjs
PLAYWRIGHT_MODULE=/home/mpalmer/.cache/ms-playwright-go/1.57.0/package COSMIC_URL=http://127.0.0.1:5177 node scripts/check_observatory_browser.cjs
```

Browser execution may need permission outside the filesystem sandbox for Chromium.
The microbial browser fixture isolates interactions on a physically compatible
managed world; it does not establish native population frequency. The population
probe separately samples actual near-human and remote canonical catalogues across
three seeds, including planets/moons and example addresses, without generating
terrain or injecting life. Conditional reference trials and actual catalogue
counts are reported separately. Review the results before changing the priors;
do not assert a precise population frequency from a small sample. Example addresses
can contain nonzero system slots, which normal travel cannot yet enter.

Prepared regressions cover deterministic inherited generation, old microbial worlds,
simple low-energy fauna, typed save validation, version-3 active save import,
progressive cellular identification, close-range detection/occlusion, stationary
bounded sprites, desktop/narrow field bounds and terrain preservation, weapon
refusal, finite samples, basic/pressure stasis, Cargo collection, source provenance,
zero-demand Sell entries and atmospheric/reflectance consistency. Existing
Observatory tests cover equipment, combined BIO filters, managed registry evidence,
progressive coverage, destinations and pause/save integration.

Inspect browser screenshots in `/tmp/cosmic-microbial` and
`/tmp/cosmic-observatory` after running the scripts. Also run the established
xenobiology/browser workflows as appropriate to catch unrelated mission,
propagule, Shipyard, launch and graphics regressions from recent unverified work.
