# Planetary Atmosphere and Orbital Hierarchy Audit

## Fixed Defects

- Moon climate was generated at circumplanetary distance as though that were
  distance from the star, then left unchanged after replacing the moon's mass.
  Final physical properties now precede climate, hydrosphere and resources.
- The constrained colony-world fallback also resized a world after generating
  its climate. It now supplies the physical state before generation.
- Atmospheres ignored the combined stellar flux used by temperature generation.
  Both use the same illumination; each star contributes its own age/spectrum to
  high-energy exposure, including companions of a cool primary.
- Density categories were random and inconsistent with pressure. Categories now
  follow pressure: None < 1e-9 bar, Trace < 0.01, Thin < 0.5, Earth-like < 2,
  Thick < 20, otherwise Superdense. Earth-like is a pressure label, not a
  claim of breathable composition. Engineered atmospheres use the same bands.
- Escaping gases were merely downweighted and then renormalized back into a
  substantial atmosphere. Escape now removes partial pressure.
- Cold solids could retain bulk steam, CO2 and exotic refractory gases.
  Condensation limits each partial pressure, reducing total pressure. Random
  reactive/mineral trace gases no longer become major atmospheric constituents.
- Giant atmospheres could be assigned arbitrary dominant gases. Giant
  envelopes now consistently contain mostly hydrogen and helium.
- Rogue atmospheres used fractions where scanning/rendering expected
  percentages; some airless moons also had nonzero pressure. Rogue bodies now
  use the shared generator with explicit zero stellar flux and their known
  internally heated temperature.
- Greenhouse warming depended on categorical labels and gas percentage even
  in near-vacuum. A continuous partial-pressure model replaces those jumps.
- Default stellar ages no longer assign billions of years to short-lived hot
  stars. Generated stellar evolution metadata remains authoritative.
- Major moons are checked against fluid Roche limits, total satellite mass
  ceilings and mutual Hill spacing. Minimum-size clamps cannot exceed a
  parent's size limit. Same-host planets have mass-ratio and spacing screening,
  including inserted colony candidates. Orbital bounds no longer clamp multiple
  candidates onto the same outer edge.
- Catalogue-designated settled single-star systems reserve the colony orbit
  before generating other planets, preserving the starting hub without relaxing
  spacing or inserting an overlapping world.
- Kepler periods include both orbiting masses; synchronous rotation uses the
  same period. Stellar barycentres already used the appropriate component masses.
- Surface gravity now follows the same mass/radius calculation rather than a
  rounded Earth-density ratio with a 0.01 g floor. Small moons no longer gain
  artificial gravitational strength.
- Temperature range floors combine thermal fluxes in fourth-power space and
  cannot exceed a body's supplied mean temperature, including rogue moons.

## Model Boundaries

`atmosphere_generator.ts` samples seeded volatile delivery/outgassing histories.
Type and metallicity are broad priors, not measured occurrence distributions.
Gravity/escape velocity, age and radiation constrain the sampled inventory.
At fixed physical state, different seeds still produce different atmospheres.
Natural oxygen-rich biospheres are not assumed; terraforming supplies explicit
engineered oxygen. Planet type names are formation/material priors and are not
automatically renamed when a volatile envelope is lost.

`stellar_irradiation.ts` combines a photospheric ionizing blackbody estimate with
an age-dependent saturated/declining coronal term. Longer cool-M activity is
represented statistically, not as a rule that all M-star planets are airless.
The integral is a current-orbit, fixed-bolometric-luminosity exposure proxy. It
does not reconstruct migration, pre-main-sequence luminosity, flare histories,
white-dwarf progenitor irradiation or post-main-sequence mass loss. The hot-star
blackbody tail is not a detailed stellar-atmosphere spectrum.

`atmosphere_physics.ts` contains a Jeans binding parameter, pressure bands,
approximate saturation curves and a grey greenhouse approximation. The exobase
temperature, retention transition, heavy-gas erosion and greenhouse coefficients
are explicit modelling approximations, not fitted universal laws. Energy-limited
loss is applied only to small H/He envelopes, not to all secondary atmospheres.
Massive giant envelopes have a deep reference pressure, not a solid surface
pressure; their cloud-top condensation and radius evolution are not solved.

`atmosphere_climate.ts` brackets the coupled frost/greenhouse solution with the
airless and fully gaseous inventories. It never redraws the random inventory.
The temperature model still uses type-based albedo, global-average illumination
and a bounded grey greenhouse factor. It does not resolve seasons, cold traps,
cloud microphysics, detailed photochemistry or multiple stable climate branches
from a formation history. Rogue temperatures remain an internal-heat prior,
with tidal/internal contributions combined in fourth-power temperature space.

Satellite ceilings are broad generation bounds: 0.001 of giant-parent mass and
0.04 of solid-parent mass. These allow terrestrial impact moons; they are not
universal satellite formation laws. Eight mutual Hill radii screens adjacent
circular orbits conservatively. It is not a long-term N-body stability proof or
a resonant-system model. Existing circular stellar stability/Hill limits remain
in force. The renderer still centres moons on the planet rather than moving
both around the planet-moon barycentre. Tidal heating retains its existing
heuristic because orbital eccentricities are not modelled.

## Scientific References

- [Atmospheric escape review](https://doi.org/10.1146/annurev-earth-053018-060246):
  high-energy irradiation, escape mechanisms and approximation limits.
- [M-dwarf H/He atmosphere evolution](https://academic.oup.com/mnras/article/459/4/4088/2624070):
  prolonged active phases and atmospheric retention dependence on host history.
- [Jeans/exobase treatment](https://www.aanda.org/component/article?access=doi&doi=10.1051%2F0004-6361%2F201832934):
  escape depends on upper-atmosphere conditions, not surface temperature alone.
- NIST liquid vapour-pressure fits for
  [nitrogen](https://webbook.nist.gov/cgi/cbook.cgi?ID=C7727379&Type=ANTOINE)
  and [methane](https://webbook.nist.gov/cgi/cbook.cgi?ID=C74828&Type=ANTOINE).
  Other curves use approximate triple-point/latent-heat parameters; they are not
  extrapolations of NIST fits outside their liquid ranges.
- NASA [Titan](https://science.nasa.gov/saturn/moons/titan/facts/) and
  [Pluto](https://science.nasa.gov/dwarf-planets/pluto/facts/): cold nitrogen-rich
  atmospheres range from substantial air to frost-supported tenuous gas.
- [Satellite mass scaling](https://www.nature.com/articles/nature04860):
  motivates separate giant-planet satellite budgets rather than diameter alone.
- [Satellite orbital stability](https://www.aanda.org/articles/aa/pdf/2010/13/aa14955-10.pdf):
  Roche disruption and the finite stable region within the Hill sphere.

## Verification

Executed on 2026-10-01 after approval to continue verification:

- Focused atmosphere, irradiation, satellite and orbital tests passed.
- Full `npm run check` passed: documentation, formatting, ESLint, application
  and test typechecking, **551 tests in 90 files**, and production build.
- Existing rendering and scene snapshots passed without updates. No renderer
  code changed. No separate interactive browser inspection was performed.
- The build still reports a non-failing bundle-size warning above 500 kB.
- The initial suite caught loss of the starting colony under the new spacing
  guard. Reserving colony orbits first fixed it; a regression also verifies
  separation from every other planet in the starting system.
- The new population audit caught the gravity floor and inverted rogue-moon
  temperature ranges described above; both were corrected before the final run.

The deterministic population regression covers 208 systems across 13 host
classes, including DA5 white dwarfs and rogue bodies. It checks 1,224 solid
planets/moons, plus their generated giant parents, for physical consistency,
gas-percentage normalization, pressure bands, condensation limits, satellite
mass/Roche constraints and same-host orbital spacing. Existing multiple-star
regressions additionally cover combined illumination and orbital hierarchy.

Illustrative solid-body sample results (planets and moons together):

| Host | Solid Bodies | Airless | Temperature Range (K) | Maximum Pressure (bar) |
| --- | ---: | ---: | ---: | ---: |
| G | 174 | 108 | 33-683 | 67.52 |
| M | 168 | 124 | 14-174 | 13.31 |
| Rogue | 114 | 75 | 9-87 | 0.217 |

This deliberately balanced test sample is **not** a Galactic occurrence-rate
prediction. Different hosts also have different sampled orbits and body sizes.
Separate paired-seed tests at equal irradiation/mass verify that M-star
high-energy exposure reduces typical retention without forbidding atmospheres.
Fixed-state seed tests verify a range of atmospheric inventories, including
airless outcomes. Titan/Pluto-like frost limits are unit-tested independently of
population sampling.

Reproduce the optional population report with:

```bash
COSMIC_ATMOSPHERE_REPORT=1 npm run test:run -- src/tests/entities/planetary/atmosphere_population.test.ts
```
