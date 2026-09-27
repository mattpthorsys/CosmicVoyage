# Orbital sunrise and sunset

The orbital limb is a clear-gas, single-scattering approximation, not a painted
orange ring. The star, terrain terminator, planet shadow, and atmosphere use the
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
- Incoming and outgoing paths both undergo wavelength-dependent Beer-Lambert
  extinction. Rays intercepted by the solid planet receive no direct sunlight.
  The Rayleigh phase function is `3 (1 + cos(theta)^2) / (16 pi)`; it does not
  have an invented forward-scattering spike. Dense grazing paths remove blue
  light preferentially; higher, thinner layers can remain blue.
- Density columns use six-point Gauss-Legendre quadrature on each side of the
  tangent point. Single scattering uses 32 view segments, with analytical
  extinction within each segment. Subpixel layers are area-sampled in polar
  strips so a physically thin atmosphere remains visible without inflating it.
- The direct stellar marker integrates a uniform disc using seven weighted
  samples. Its transmitted centroid, brightness, and colour change during
  partial occultation. Diffuse scattering uses the central stellar direction
  (small-source approximation) to keep frame costs practical.

Absolute irradiance controls the atmospheric band; terrain lighting retains its
existing exposure and relative-light treatment. Gamma and a fixed display exposure
make the calculated radiance legible, so output pixels are not calibrated radiometry.
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
for Earth-like, thin/dense CO2, airless, cool-star, and reduced-irradiance fixtures,
including measured rendering time.

## References

- [Bruneton's atmospheric scattering equations and reference implementation](https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/functions.glsl.html)
- [Physically Based Rendering: Planck spectra and blackbody emission](https://www.pbr-book.org/3ed-2018/Light_Sources/Light_Emission)
- [NASA SAGE: Sunsets and Atmosphere, including orbital photographs](https://sage.nasa.gov/wp/wp-content/uploads/2015/05/Sunsets_and_Atmosphere_K-5.pdf)
- [NIST CCCBDB: experimental molecular polarizabilities](https://cccbdb.nist.gov/pollistx.asp)
