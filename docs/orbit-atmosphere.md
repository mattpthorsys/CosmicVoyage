# Orbital sunrise and sunset

Atmospheric planets use a clear-gas, single-scattering approximation over the
entire disc and limb. The star, terrain terminator, planet shadow, and atmosphere use the
same pinhole camera (currently three planet radii from the centre).

## Inputs and calculation

- `Game.getOrbitStellarSources` supplies each star's bolometric irradiance
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
