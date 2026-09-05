# Rendering And UI

## Rendering Pipeline

```text
Game and feature controllers
  -> readonly UI and SceneViewModel data
  -> RendererFacade
  -> SceneRenderer
  -> ScreenBuffer
  -> Canvas
```

DOM status and command bars are updated separately through typed events.
Terminal and astrometric overlays draw directly on canvas after the main buffer.

The game canvas has three ordered layers:

- the main terminal-cell canvas;
- the transparent orbital sub-cell raster canvas;
- the transparent HUD and terminal-overlay canvas.

Keep orbital mini-pixels on the raster canvas. Sending them through the main
canvas defeats differential cell rendering and causes a full repaint at the
animation rate.

## Scene Models

`SceneViewModel` is a discriminated union:

- `hyperspace`
- `system`
- `orbit`
- `surface`
- `starbase`

Create immutable player snapshots with `createPlayerViewSnapshot`. Do not pass
the mutable `Player` into new scene render paths.

## Screen Buffer

Use:

- `drawChar` and `drawString` for normal cells;
- `drawScaledChar` only for deliberate sub-cell detail;
- `renderDiff` when direct overlays do not require a full repaint;
- `renderFull` after resize or when direct canvas layers could leave artifacts.

Keep all coordinates in grid cells until direct-canvas overlay rendering.

Half-cell blocks are pooled, written into a reusable two-pixels-per-cell
`ImageData`, and composited once with nearest-neighbour scaling. Preserve this
batching path for dense planetary graphics; do not replace it with per-pixel
`fillRect` calls.

The visible half-cell pixel size of orbital bodies is intentional. Keep the
nearest-neighbour compositor and do not enable canvas image smoothing to hide
surface aliasing. Planet rendering should have crisp, stable display pixels:
solve shimmer by prefiltering body-fixed source textures before projection, not
by shrinking or blurring the final pixels.

The Galaxy instrument reuses this same half-cell raster. Its analytical colour
field is cached by generation version, viewport, zoom, and dimensions. Do not
enumerate star systems or regenerate planet data to draw it; only the player
crosshair and labels are dynamic.

## Orbital Planet Rendering

`scenes/orbit_lighting.ts` owns the shared perspective camera: both surface
normals and distant stellar positions use a camera three body radii from the
centre. Do not mix orthographic terrain lighting with perspective star markers.
At a star's apparent limb contact, the corresponding surface normal must have
zero solar incidence. Companion bearings come from system coordinates; their
lighting weights use luminosity divided by distance squared, not marker brightness.

`scenes/orbit_atmosphere.ts` integrates single molecular scattering in a thin,
isothermal hydrostatic shell, with solid-body shadowing and Beer-Lambert
extinction on both light and viewing paths. The warm contact colour emerges from
optical path length, not an orange overlay on every surface terminator. Clear
daylight can still produce a blue limb; not all atmospheric light is sunset light.
Point-like stellar markers also dim and redden through grazing atmospheric paths.
The shell is area-sampled onto the same half-cell raster, including its subpixel
extent outside the solid limb. Preserve that alignment and test airless bodies.

This is a bounded visual approximation, not a spectral radiative-transfer solver:
common gases use molecular masses and approximate cross sections scaled by
[NIST polarizabilities](https://cccbdb.nist.gov/pollistx.asp); unsupported species
use air-equivalent optical properties. It omits absorption bands, dust, clouds,
multiple scattering, refraction, finite stellar discs and mutual-body eclipses.
Do not infer orange CO2 sunsets or strongly forward-peaked scattering from
molecules alone. See [NASA's planetary sunset comparison](https://www.nasa.gov/solar-system/nasa-scientist-simulates-sunsets-on-other-worlds/)
and the [single-scattering formulation](https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/functions.glsl.html).
Display exposure is artistic; atmospheric scale height and occultation geometry
are not enlarged to manufacture a glow. Very extended envelopes (H/R > 0.02)
are outside this thin-shell model. Terrain shading remains a low-cost visual model.

With Vite running, `tools/orbit-lighting-preview.html` provides an actual-canvas
phase comparison for atmospheric and airless bodies. Colour-and-position regression
signatures accompany analytic contact, transmission and planetary-shadow tests.

Gas- and ice-giant weather is deterministic, body-fixed source data. Bake the
procedural bands, storms, and ribbons once through `GiantAtmosphereRenderer`,
then rotate by changing texture longitude and apply view lighting separately.
Solid worlds similarly use `SolidPlanetOrbitTextureRenderer` to area-filter the
prepared heightmap, liquid, and vegetation colours into a small body-fixed mip
chain. The globe samples that chain according to its projected footprint and
limb compression. This prevents fine terrain and hard biome thresholds from
shimmering as longitude changes while preserving the fixed half-cell display
grid. Fractional liquid coverage should scale coastal lighting and reflection;
do not turn it back into a per-pixel binary threshold.

Nearby orbital bodies are prepared during the existing predictive surface
prefetch window and one body texture is built per browser idle callback.

The globe projection cache contains screen-space samples and antialiased limb
coverage for each supported radius. The landing-map raster is also cached per
body and resolution. Invalidate projection caches after resize and rebuild a
landing map when its prepared heightmap identity changes.

Do not perform any of the following inside a per-frame planet-pixel loop:

- procedural weather generation or deterministic string hashing;
- palette parsing;
- unfiltered sampling of a full-resolution solid heightmap;
- atmosphere-composition sorting;
- sixteen complete texture samples for edge antialiasing;
- allocation of temporary coordinate arrays or interpolation closures.

## UI Models

Prepare menus and tables in `src/core`:

- table rows contain display cells, detail text, disabled state, and tones;
- controllers own selection and scroll offsets;
- renderers clip and draw models but do not perform business actions.

Every active action should be discoverable in one of:

- command strip;
- table footer;
- help reference;
- contextual terminal message.

## Overlays

Terminal overlay:

- short scan and contextual messages;
- typing and fade animation;
- marker tags for semantic colour.

Astrometric overlay:

- temporary target diagnostics;
- low-alpha thin-font labels;
- direct target lines and markers.

Because both draw directly onto canvas, changes to skip/full repaint logic need
render regression tests.

## Animation And Time

Animation may use frame time for presentation only. Generated-world output and
gameplay outcomes must not use render timing.

Simulation delta remains capped after pauses, but orbital presentation uses the
uncapped monotonic frame delta. This prevents a machine rendering below ten FPS
from slowing the apparent physical rotation rate.

Accepted presentation timing includes:

- cursor blink;
- popup opening;
- typed terminal messages;
- orbital rotation display;
- astrometric fade;
- subtle command emphasis.

## Rendering Changes Checklist

1. Build or update a readonly model.
2. Keep gameplay decisions outside rendering.
3. Preserve grid alignment and clipping.
4. Check small canvas dimensions.
5. Update visual-regression signatures if appearance intentionally changes.
6. Run `npm run test:rendering` and then `npm run check`.

Use `F3` to inspect `PREP`, `CANVAS`, and `ORBIT RASTER` timings. Sustained
orbital frames should remain below the 16.7 ms budget required for 60 FPS.
