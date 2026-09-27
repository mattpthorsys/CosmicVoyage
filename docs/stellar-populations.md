# Stellar Population And Detection

Generation version 8 replaces independent age and spectral-frequency rolls with
a joint birth-mass, age and evolutionary-phase distribution. Existing worlds
change intentionally; this is not an identity-preserving generation change.

## Ownership

- `stellar_population.ts`: integrates a two-slope Kroupa-style birth IMF across
  mass bins, intersects phase lifetimes with local formation history, and
  normalises the surviving population. Do not multiply by a separate present-day
  O/B rarity factor: phase lifetimes already supply that rarity.
- `milky_way_model.ts`: population families, formation environment, clusters,
  chemical gradients and scatter. Very young open clusters are possible, with
  an arm-dependent enhancement; old halo populations cannot spawn living O stars.
- `galactic_projection.ts`: converts volume density into a finite-slab surface
  density, including different young/old scale heights and integrated population
  fractions. Number counts scale with cell area, not cell length.
- `system_data_generator.ts`: stores the sampled population and evolution in the
  lightweight map descriptor. Full local systems reuse these values. Evolved
  stars carry progenitor/current mass and actual radius into local physics.
- `stellar_detection.ts`: visible-band source strength and detection horizons,
  shared by map tiles, survey contacts, HUD and targeted observation.

## Projection And Selection

The navigable map samples a slab extending 50 pc above and below the midplane.
For an exponential vertical profile its effective depth is
`2 h (1 - exp(-z_max / h))`. Young/old thin-disk scale heights are 60/300 pc;
thick disk, bulge and halo use 900/500/3000 pc effective profiles. These are
coarse model assumptions, particularly outside the local disk.

The local normalisation is 0.08 stellar systems per cubic parsec. A uniform
1.3 percent navigable sample keeps the map sparse. This is an explicit gameplay
selection, not a claim to display every real star. It preserves intrinsic type
ratios and does not guarantee an exotic star beside the starting hub. Substellar
objects and compact-remnant phenomena retain their separate seeded populations.
There is no hidden Z coordinate; travel distances remain projected distances.

The 550 nm Planck approximation scales visible luminosity with actual radius
squared. Range follows its square root, as required by inverse-square flux.
A solar source has the existing approximately 59 ly horizon; ordinary stellar
sources are bounded to 8..180 ly. The 8 ly floor represents close sensor
acquisition, not optical detectability alone. Brown dwarfs have a separate
36 ly infrared horizon, and rogue planets remain visually traceable out to
about 196 ly. Both distances double the previous radii, covering four times
the area. Their glyphs blend gradually with the actual nebula background as
range changes. HUD annotations stay local so distant contacts do not crowd the
screen; stellar annotations are capped at 60 ly.
Passive ranging is additionally reduced by the existing medium multiplier;
glyphs and directed observations use the clear-medium instrument horizon.
These are instrument/gameplay limits, not naked-eye visibility or a calibrated
survey limiting magnitude. A source beyond the viewport is not automatically
marked onscreen even if its physical detection horizon is larger.

Tile caches retain each source's visibility threshold and whether its colour
depends on range, including hidden sources. Moving through a fade or across a
threshold must give the same frame as a fresh render; integer-bucketed range
keys are unsafe at fractional thresholds.

## Evolved Stars

The catalogue now includes blue giants, blue/red supergiants, red giants,
subgiants, Wolf-Rayet stars and hot/cool white dwarfs, as well as extra hot dwarf
anchors. Evolved spectra are phase representatives, with mass/radius tied to
their progenitor track. Expanded photospheres widen detached binaries; stable
planetary regions exclude current envelopes and a conservative former-giant
zone around white dwarfs. Local orbit generation must honour these limits too.
Evolved primaries cannot receive ordinary terraformed colonies. Scans report
actual generated mass/radius/luminosity and distinguish birth metallicity from
the present atmosphere of an evolved star.

This is a coarse population synthesis, not MESA or an isochrone interpolator.
Phase durations, mass loss, representative temperatures, and white-dwarf cooling
bins are approximate. It omits metallicity-dependent evolutionary tracks,
pre-main-sequence contraction, interacting binaries, detailed planetary
engulfment and atmospheric histories, and self-consistent supernova remnant
counts. Multiplicity remains the existing gameplay model; companions are
coeval surviving dwarfs, so evolved-evolved pairs are not represented. Do not
present these systems as precision reconstructions of individual real stars.

## Calibration And Regression Checks

Run `node scripts/profile_stellar_population.cjs --radius=250` for actual seeded
counts, rare-system coordinates, theoretical cohort fractions and idealised
route-acquisition distances. Use `--seed=...` and larger radii for independent
samples. Route estimates use `rate = 2 * detection_radius * surface_density`
in a homogeneous pure-cohort field; they are not promises about a particular
journey. Check intrinsic fractions separately from detected fractions.

Focused tests cover normalised probabilities, selectable phases, coeval ages,
old-population exclusions, physical radius propagation, surviving orbits,
projection area scaling, optical versus remnant visibility, exact detection
boundaries, shifted-frame parity and giant-disc clipping. Run the full check
before committing. Do not update unrelated graphics snapshots indiscriminately.

## Scientific References

- [Kroupa IMF overview](https://arxiv.org/abs/1011.1905): birth-mass distribution,
  distinct from a present-day or magnitude-selected population.
- [Gaia Universe Model](https://gea.esac.esa.int/archive/documentation/GEDR3/Data_processing/chap_simulated/sec_cu2UM/ssec_cu2starsgal.html): population synthesis and Galactic components.
- [Gaia HR diagram](https://www.cosmos.esa.int/web/gaia/gaiadr2_hrd): dwarf, giant
  and white-dwarf populations are distinct evolutionary sequences.
- [Gaia young-star structure](https://www.cosmos.esa.int/web/gaia/dr3-where-are-the-stars): young stars trace the disk and spiral structure.
- [Mamajek stellar tables](https://www.pas.rochester.edu/~emamajek/doc.html):
  reference dwarf temperatures and physical properties; the game's evolved
  phase table is an approximation, not a transcription of these dwarf tables.
