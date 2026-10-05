# Native Life Generation Audit

## Baseline

Verification at `b75f865` found no native living worlds in six catalogues sampled
near human space and remotely across three seeds. Each catalogue contained 150
stellar systems; only one catalogue contained any physically eligible native
world. The independent reference trials still generated life probabilistically
on suitable environments. The main bottleneck was upstream of the occurrence
roll, rather than the microbial/simple/complex selection weights.

These samples included extra system slots at the same map coordinate. Ordinary
travel and Observatory contact discovery currently select slot zero. Catalogue
totals therefore cannot by themselves describe player discovery rates.

## Corrections

### Host-appropriate orbital layouts

`planet/orbit_sampling.ts` supplies a bounded luminosity-based layout scale for
dim main-sequence and substellar hosts. `solar_system.ts` applies it to both
the starting orbital prior and additive gaps, including circumstellar regions
in multiple systems. Previously the single-star layout began with a 0.2-0.7 AU
precursor, advanced it before the first planet, and required a 0.1 AU minimum
gap regardless of luminosity. This skipped much of the warm region around cool
stars, which dominate the generated catalogue.

The scale follows the inverse-square illumination relationship. It is a layout
prior, not a measured planet-occurrence law. Its 0.02 floor bounds substellar
sampling; brighter hosts retain the existing baseline. Evolved hosts retain
their baseline because present luminosity does not reconstruct their planet
formation epoch. Physical stellar-survival, binary/triple stability, mass-ratio
and mutual-Hill separation screens still govern every candidate. No habitable
orbit or living world is reserved by this change.

The single-star formation call also no longer receives the additional 0.08
multiple-star penalty. Multiple systems retain that penalty.

Compact systems around faint hosts are physically plausible: NASA describes
TRAPPIST-1's close planets as receiving illumination comparable to Earth and
its neighbours despite their much smaller orbital distances.
[NASA comparison](https://science.nasa.gov/photojournal/comparing-trappist-1-to-the-solar-system/).
This example motivates permitting compact layouts; it does not calibrate their
Galactic frequency or establish that their planets are habitable.

### Consistent surface-water interpretation

The broad volatile-retention proxy in `surface_descriptor.ts` now uses a
solar-equivalent irradiation distance calculated from the same reference
bolometric flux used for atmosphere/climate generation. Previously its fixed
0.18 AU proximity penalty could strip the inferred water inventory of a cool
star's otherwise temperate planet. Moons and multiple-star planets receive the
actual shared flux through `HydrosphereContext.stellarFluxWm2`.

This remains a retention heuristic. Age, host class, metallicity, mass, pressure
and temperature still affect it, while the separate atmospheric escape model
continues to use each source's high-energy exposure. This change does not
claim to reconstruct volatile delivery, a pre-main-sequence history or local
geothermal chemistry.

The hydrosphere boiling threshold now inverts the same saturation curve used
for condensation and biological phase screening. Its old independent logarithmic
fit rejected some temperate low-pressure water. The terrestrial/Oceanic
supercritical-water branches also require the critical temperature and pressure
in bar rather than confusing MPa and bar.

`surface_liquid.ts` recognises the generator's exact description, "Significant
Saline Oceans and Seas." Previously the extra word "Saline" made this ocean
disappear from numeric coverage, terrain overlays and biological inputs.

### Shared biological screen and diagnostics

`assessBiosphereEligibility` now supplies the generator and population probe with
the same physical exclusions. It rejects nonfinite environmental inputs and
reports temperature, liquid phase, pressure, water, age, gravity and landing
failures separately. Screened pressure communities retain their exception.

The life-occurrence roll and conditional complexity priors are unchanged.
Natural oxygen, methane or biology are not inserted to advertise a biosphere.
Native communities can remain anoxic and mostly microbial; oxygenated native
ecosystems still need a future explicitly modelled atmospheric history.

The population probe reports catalogue totals, slot-zero `enterable` totals,
independent physical counts, overlapping exclusion reasons, occurrence failures,
primary spectral-class breakdowns and examples. Reachable examples are listed
first, with eligible but uninhabited worlds kept separate from living worlds.
It generates neither terrain nor artificial life placements.

## Pending Luna Verification

Implementation and regression preparation are complete. No tests, typechecks,
lint/build checks, browser runs or new population probes have been executed for
these changes. Formatting and static diff review are complete.

1. Run the focused orbit-sampling, hydrosphere, biosphere, microbial Observatory,
   atmosphere-population and multi-star tests; investigate failures before
   updating any snapshots. The microbial Observatory fixture now correctly uses
   12,742 km for an Earth-sized diameter rather than 12,742,000 km.
2. Rerun `node scripts/profile_biosphere_population.cjs --systems=150 --samples=1200`
   for a comparison with the earlier samples. Then sample 600 systems per
   catalogue to reduce the sensitivity to individual rare worlds. Compare
   `enterable.nativeEligible`, `enterable.nativeLiving`, the rejection reasons
   and the distributions across seeds and spectral classes before tuning any
   gameplay probabilities.
3. Run `npm run check` and the existing microbial, Observatory and Xenobiology
   browser workflows to cover starting colonies, missions, cargo, save import
   and rendering. Review desktop/narrow captures after orbital layout changes.
4. Use a generated slot-zero native example to verify ordinary system entry,
   orbital survey, accessible habitat generation, landing and field scanning.
   A controlled fixture alone does not establish a reachable natural discovery.
   Nondetection in the Observatory is permissible for a sparse or obscured
   community; biological generation and remote evidence must remain distinct.

Planetary layouts and natural hydrospheres may regenerate differently with these
fixes. The stellar catalogue seed/version is unchanged. Use a new session when
assessing exploration pacing rather than treating an old visited-world identity
as a requirement for this unreleased generation model.
