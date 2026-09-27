# Orbital sunrise and sunset

Atmospheric planets use a clear-gas, single-scattering approximation over the
entire disc and limb. The star, terrain terminator, planet shadow, and atmosphere use the
same pinhole camera (currently three planet radii from the centre).

## Inputs and calculation

- `createOrbitStellarSources` supplies each star's bolometric irradiance
  `L / (4 pi d^2)`, effective temperature `(L / (4 pi R^2 sigma))^(1/4)`,
  and apparent angular radius `asin(R / d)`. Companions contribute independently.
- `orbit_stellar_light.ts` samples a Planck spectrum at 680, 550, and 440 nm,
  normalised against solar irradiance at Earth. Dividing the spectral shape by
  `T^4` preserves the supplied bolometric flux: infrared output from a cool star
  is not simply converted into visible red light. These are three representative
  wavelengths, not a full spectral-to-CIE colour calculation.
- `orbit_atmosphere.ts` uses hydrostatic scale height `H = Rgas T / (M g)` and
  density proportional to `p / T`. Stored pressure is **bar**, not atmospheres.
  Molecular abundances set mean molar mass and approximate Rayleigh scattering
  strength through mean squared polarizability. Unknown gases use air-equivalent
  properties. The outer shell extends until its blue tangent optical depth is
  approximately below `1e-4`, bounded to 8-20 scale heights.
- Giant textures already represent visible clouds. Only the gas above that
  optical boundary is added: representative cloud-top pressures of 0.5 bar for
  gas giants and 0.3 bar for ice giants, bounded by the stored pressure. These
  Solar-System-inspired defaults are not a condensation model or predictions for
  hot exoplanets. The globe and stellar occultation use the same boundary; saved
  atmosphere data and rocky surface pressures are unchanged.
- Incoming and outgoing paths both undergo wavelength-dependent Beer-Lambert
  extinction. Rays intercepted by the solid planet receive no direct sunlight.
  The Rayleigh phase function is `3 (1 + cos(theta)^2) / (16 pi)`; it does not
  have an invented forward-scattering spike. Dense grazing paths remove blue
  light preferentially; higher, thinner layers can remain blue.
- Density columns use six-point Gauss-Legendre quadrature on each side of the
  tangent point. Single scattering uses 32 view segments, with analytical
  extinction within each segment. Subpixel layers are area-sampled in polar
  strips so a physically thin atmosphere remains visible without inflating it.
- Each ray returns both atmospheric scattering and the light reaching the viewer
  from a unit-albedo Lambertian surface. The latter is
  `mu_sun / pi * exp(-tau_sun - tau_view)`. Terrain palette colours are decoded to
  linear reflectance and multiply this surface term before scattering is added.
  Both terms use the same stellar irradiance. Liquid materials retain a bounded
  gloss approximation aligned to each star, attenuated along the same paths.
- Pixels crossing the solid limb integrate surface and atmospheric light over
  the same footprint. Surface coverage is included once. Interior pixels also
  receive atmospheric transfer, so there is no artificial boundary at 90% of
  the displayed radius.
- The direct stellar marker integrates a uniform disc using seven weighted
  samples. Its transmitted centroid, brightness, and colour change during
  partial occultation. Diffuse scattering uses the central stellar direction
  (small-source approximation) to keep frame costs practical.

Absolute irradiance controls both atmosphere and reflected terrain light on
atmospheric worlds. One exposure is shared by terrain, atmosphere, and direct
stellar markers. It follows the sum of visible stellar irradiance, approximating
an observer whose eyes have adapted to the available light; a small lower bound
keeps extremely faint systems dark. After combining light, the tone curve
compresses luminance once, then scales red, green, and blue together before
gamma encoding. This preserves surface and stellar colours at high exposure.
There is no separate rim boost, radial fade, artificial surface haze, or
surface-only highlight compression. A faint blue daylight limb remains physically
possible; no orbital-phase mask forces it to disappear. Warm twilight is determined
by grazing light paths and the planet's shadow. Output pixels are not calibrated
radiometry. Airless bodies and envelopes outside the model retain the existing
material shading path.
Legacy UI fixtures without physical source data default to a solar spectrum and
Earth-level irradiation scaled by their relative flux.

## Prepared rendering path

`orbit_atmosphere.ts` retains direct density integration and atmospheric transfer
as the reference. `orbit_atmosphere_sampler.ts` prepares the optical model used
by the globe renderer. Both paths use the same 32 view steps and the same polar
limb footprints; display resolution and the atmospheric layers are unchanged.

For each pixel ray, the prepared path retains sample positions, densities and
camera-path attenuation. These depend on the spherical atmosphere and camera,
so they can be shared by all stellar sources and reused while the planet texture
rotates. The renderer holds one active sampler. Changes to optical parameters
replace it, resizing clears its pixel rays, and `clearCaches()` releases it.
Matching uses physical values, not a planet name or a mutable object identity.

A 1024-by-256 Float64 density-column table replaces the nested sunlight-path
quadrature. Its coordinates follow distance to the top boundary and distance
from the ground tangent, concentrating resolution near grazing rays. This uses
the [Bruneton transmittance mapping](https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/functions.glsl.html).
Planet shadow intersections are evaluated before lookup, so interpolation does
not smear light through the opaque globe. Out-of-domain points use the direct
integral. Stellar marker transmission remains directly integrated.

Prepared rays also retain the radius-dependent lookup coordinates, removing two
square roots from every sun/segment evaluation. A sample position is represented
by its distance along the camera ray, so its projection toward each star follows
`camera dot sun + distance * (ray direction dot sun)`. The two freed position
slots hold the lookup coordinates without enlarging the per-ray buffers.

Sunlight attenuation uses a shared 160 KiB table for `exp(-opticalDepth)`, with
512 samples per unit optical depth. Linear interpolation has relative error
bounded by `exp(h) * h^2 / 8 < 4.8e-7`, where `h = 1/512`. Depths of 40 or more
return zero with absolute transmission error below `4.3e-18`. The table is
independent of atmosphere and stellar spectrum; each RGB extinction coefficient
still determines its own optical depth. Camera-path attenuation remains directly
computed once during ray preparation.

View segments stop only when all RGB view transmissions fall below `1e-14`.
The remaining single-scattered radiance per unit incident light is bounded by
`3 / (8 pi)` times that transmission; the independently integrated ground path
is still evaluated. The table introduces interpolation error, unlike caching
alone. New comparisons require less than half of one 8-bit display-channel
level against the reference over representative phases, pressures, wavelengths,
pixel sizes, one/three stars and exposure adaptation. These limits must pass
before treating the optimization as verified.

The cache holds at most 32,768 prepared rays and 16,384 pixel entries. Numerical
buffers occupy less than 59 MiB including both lookup tables; bounded JavaScript
object overhead is additional. Beyond that budget, uncached rays are evaluated
normally without eviction churn. Changing bodies cannot accumulate one cache
per visited planet.

### Performance and verification

The initial CPU profile identified atmospheric transfer and its nested density
integrals as the dominant work. Its reference dense-CO2 fixture at a 48-sample
globe radius averaged 84.64 ms with one star and 272.61 ms with three. Those
measurements include CPU-profiling overhead and exclude texture sampling and
final drawing.

In two 12-frame runs comparing the sampler from `b8f3b75` with the extended
sampler, warm dense-CO2 frames at a 48-sample globe radius averaged 16.52 ms
versus 15.63 ms with one star, and 59.12 ms versus 54.02 ms with three (about
5% and 9% faster). At radius 24, means were 6.28 ms versus 5.92 ms with one
star, and 22.60 ms versus 19.52 ms with three (about 6% and 14% faster). These
are optics-only, machine-specific timings, not whole-frame renderer measurements.

Earth-like frames were mostly flat: at radius 24, the one-star case averaged
4.49 ms versus 4.98 ms (11% slower), while the three-star case averaged 17.93 ms
versus 16.89 ms (6% faster). Prepared-table construction remained about 24 ms.
The new shared table adds 160 KiB; the largest case retained 53.9 MB (about
51.4 MiB) of numeric storage, with additional JavaScript object overhead. There
is one active sampler, and changing bodies replaces rather than accumulates
these caches.

Run the repeatable optics harness in both modes under the same conditions:

```sh
node scripts/profile_orbit_atmosphere.cjs
node scripts/profile_orbit_atmosphere.cjs --optimized
npm run test:run -- src/tests/rendering/orbit_atmosphere.test.ts src/tests/rendering/orbit_atmosphere_sampler.test.ts src/tests/rendering/orbit_stellar_light.test.ts src/tests/rendering/scene_renderer.regression.test.ts
npm run check
```

The harness uses identical changing star directions and pixel grids for both
modes. Its checksum prevents unused work; checksums are not an accuracy metric.
The raster regression also compares the prepared renderer to the direct path at
phase 0.2. At `b8f3b75`, one of 1,922 globe pixels changed by at most one RGB
level, and all other captured phase fingerprints were unchanged. The test limits
changed pixels to below 0.1%. `tools/orbit-lighting-preview.html` remains useful for manual
inspection through dawn, dusk and full daylight when changing the model.

The repeatable harness can compare the current sampler with a committed version
or with the direct integrator:

```sh
node scripts/profile_orbit_atmosphere.cjs --optimized --sampler-ref=b8f3b75 --frames=12
node scripts/profile_orbit_atmosphere.cjs --optimized --frames=12
```

`--sampler-ref` reads only the sampler from Git; its dependencies come from the
working tree, so comparisons require unchanged optical helpers. Repeat timings
to distinguish improvement from runtime noise. Setup times cover per-atmosphere
preparation; the shared attenuation table is initialized once at module load.
Transmission error-bound, inclined-star, orbital-raster, and direct-integration
tests all pass with the current lookup resolution. Investigate any changed raster
before updating snapshots.

## Limits and extension points

Surface temperature approximates an isothermal atmospheric profile. Clouds,
aerosols, dust, ozone/other absorption bands, refraction, multiple scattering,
stellar limb darkening, and atmospheric escape are not calculated. In particular,
a dense clear CO2 example is **not** a prediction of Venus's cloudy appearance;
dust-free thin CO2 is **not** a prediction of a dusty Martian sunset. Very extended
envelopes (`H / radius > 0.02`) are outside this model and are skipped. Large
apparent stars would require disc-integrated diffuse scattering.
Dense clear atmospheres can obscure rocky terrain completely; predicting giant
cloud-top heights instead of using representative defaults needs vertical structure. The current
model does not add an arbitrary night-side illumination floor or simulate airglow.

For greater realism, introduce explicit vertical temperature, aerosol optical
depth/phase function, cloud height, and absorbing-species profiles before adding
those effects. Do not infer their colours from atmosphere density labels alone.
Keep the pure optical functions separate from display exposure and sampling.

## Verification

`orbit_atmosphere.test.ts` checks scale height, pressure units, composition,
resolved reference column integration, wavelength-dependent extinction, shadowing,
and symmetry. Stellar tests check spectral energy scaling, inverse-square flux,
effective temperature, and partial-disc occultation. Scene regression tests protect
placement and the raster. `tools/orbit-lighting-preview.html` shows phase sweeps
for Earth-like, thin/dense CO2, airless, giant, cool-star, and reduced-irradiance fixtures,
including measured rendering time. Its phases explicitly include full and quarter
illumination as well as crescent, ingress, deep occultation, and egress. Daylight
rim contrast and occultation colour must be reviewed together at the same exposure.

## References

- [Bruneton's atmospheric scattering equations and reference implementation](https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/functions.glsl.html)
- [Physically Based Rendering: Planck spectra and blackbody emission](https://www.pbr-book.org/3ed-2018/Light_Sources/Light_Emission)
- [NASA SAGE: Sunsets and Atmosphere, including orbital photographs](https://sage.nasa.gov/wp/wp-content/uploads/2015/05/Sunsets_and_Atmosphere_K-5.pdf)
- [NIST CCCBDB: experimental molecular polarizabilities](https://cccbdb.nist.gov/pollistx.asp)
- [NASA: Jupiter cloud layers and pressure levels](https://science.nasa.gov/photojournal/jupiter-clouds-in-depth/)
- [Irwin et al.: Neptune cloud pressures and methane](https://arxiv.org/abs/2101.01063)
