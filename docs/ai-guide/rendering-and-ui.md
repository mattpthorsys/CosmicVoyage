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
multiple scattering, refraction and mutual-body eclipses. Stellar markers sample
finite discs; diffuse scattering still uses point-source directions.
Do not infer orange CO2 sunsets or strongly forward-peaked scattering from
molecules alone. See [NASA's planetary sunset comparison](https://www.nasa.gov/solar-system/nasa-scientist-simulates-sunsets-on-other-worlds/)
and the [single-scattering formulation](https://ebruneton.github.io/precomputed_atmospheric_scattering/atmosphere/functions.glsl.html).
Display exposure adapts to combined visible stellar irradiance for both bare and
atmospheric worlds; both use the same linear reflectance and per-star lighting.
Pressure, composition, temperature, and gravity determine haze, not density labels.
Very extended envelopes (H/R > 0.02) use a compact equivalent shell preserving
vertical optical depth instead of being discarded. Its limb geometry is only an
approximation; see `docs/orbit-atmosphere.md` before extending it.

With Vite running, `tools/orbit-lighting-preview.html` provides an actual-canvas
phase comparison for atmospheric and airless bodies. Colour-and-position regression
signatures accompany analytic contact, transmission and planetary-shadow tests.

Gas- and ice-giant weather is deterministic, body-fixed source data. Bake the
procedural bands, storms, and ribbons once through `GiantAtmosphereRenderer`,
then rotate by changing texture longitude and apply view lighting separately.
Solid worlds similarly use `SolidPlanetOrbitTextureRenderer` to area-filter the
prepared heightmap, liquid, and vegetation colours into a body-fixed mip chain.
Its 256x128 base level retains narrow terrain features at the largest globe
size; the chosen level follows the camera's projected pixel footprint, limb
compression, and Mercator latitude stretch. This prevents subpixel terrain and
hard biome thresholds from shimmering as longitude changes while preserving
the fixed half-cell display grid. Fractional liquid coverage should scale
coastal lighting and reflection; do not turn it back into a per-pixel binary
threshold.

Colony orbital textures also prepare optional urban albedo, Float32 coverage
and linear emission mip channels. At the 256x128 base resolution, the optional
channels hold 829,920 typed-array bytes per prepared colony texture, in
addition to 174,720 natural bytes, before JavaScript object overhead.
Artificial light is added once after all stellar contributions and passes only
through the cached ground-to-camera
transmission; reflected-light transfer includes sunlight attenuation and must
not be reused for it. Ground viewing transmission already includes covered
limb area. Urban colour and emission share terrain projection and rotation.
The landing-map terrain uses the natural colour channel, with compact settlement
symbols composed only when its raster cache rebuilds. Cache matching includes
settlement-layer identity and version. `SettlementSurfaceRenderer` prepares
four-colour regional motifs outside drawing loops; these half-cell pixels stay
inside their native terrain cells and the travel viewport. Reserve mineral,
vehicle, ship, scan and HUD cells using
`ScreenBuffer.occludeScaledGlyphs`: call order alone does not put terminal text
above the raster layer. Generic animated popups reserve their current visible
bounds too; closing them relies on a complete new scene frame, not retained
raster pixels. Grid replacement discards staged glyphs and foreground masks
from the previous dimensions. See [planetary city foundations](../planetary-cities.md)
for ownership, art budgets and verification status.

`core/surface_ui.ts` owns the surface overlay contract and shared responsive
terrain/footer geometry. Reserve telemetry and command rows before calculating
terrain height; the scan cursor uses those same limits. `SurfaceTelemetryRenderer`
draws thin readings, wrapped notices and a command window that follows the
selected action. Small displays move crew health beneath the terrain. The Icon
command retains the detailed legend without painting labels over travel.
The optional settlement sector label also has reserved rows, so entering or
leaving a mapped footprint never shifts the viewport or scanner bounds.

`OrbitDossier` is the shared paused modal owner for planetary statistics and
the **U** settlement directory/detail screens. `OrbitSettlements` prepares
responsive coloured content, while `OrbitModeController` owns selection and
landing effects. Directory Enter chooses a native coordinate; a separate Enter
lands. Async atlas requests must match the live body and modal session before
publishing. Names come from `settlement_identity.ts` and an independent stable
site seed, never from renderer randomness. Directories do not imply surface
services, population estimates or street-level maps.

For reproducible city captures, run `scripts/capture_orbit_surfaces.cjs` with
`--suite settlements --real-colonies 3`; this includes nearby generated
complete and partial colonies. Its Chrome virtual-time figures are not valid
frame timings. `scripts/profile_planetary_cities.cjs` uses a normal Chrome clock
to time the production orbital view after warm-up, including full/diff buffer
composition, and reports preparation time and texture bytes separately. The
one-star case is below 16.7 ms at 120x64 on the reference setup; the shared
three-star atmospheric path is above that threshold even without cities.

Nearby orbital bodies are prepared during the existing predictive surface
prefetch window and one body texture is built per browser idle callback.
Predictive attempts are bounded per surface revision so terraforming can
invalidate and reprepare a body. The facade cancels deferred warming on
discontinuous arrival and destruction. View-cache invalidation does not discard
the source-validated body-fixed WeakMap caches; resizing an unchanged planet
should not rebuild its textures.

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

Starbase tables share `getStarbaseTableLayout` in `core/starbase_ui.ts` between
the controller and renderer. Its visible-row budget includes section-specific
details, alerts and footers; use it for scrolling and Page Up/Down as well as
drawing. Screen construction reconciles the stored selection/offset after a
resize or a change in available rows, so the highlighted row stays visible.

Every active action should be discoverable in one of:

- command strip;
- table footer;
- help reference;
- contextual terminal message.

### Reusable Terminal Reveal

`src/core/terminal_text_reveal.ts` provides a presentation-only `TerminalTextReveal`
timer and a pure `revealTerminalLines` helper. Keep one timer in the owning
controller, call `start()` when opening, and advance it with real frame seconds
even if the simulation is paused. Its default duration is 1.5 seconds; a different
positive duration can be supplied to the constructor. Request a redraw only while
`update()` reports a change.

For dashboard modals, pass `dashboardReveal: reveal.progress` alongside the full
`dashboard` content. `SceneRenderer` reveals only the visible page and draws the
writing cursor. It measures the original text for layout, preserving the frame,
scrollbar, fonts, and colours throughout the effect. Omit `dashboardReveal` for
instant display. Other text surfaces can use `revealTerminalLines` directly with
their styled lines, progress, and available column width; its cursor coordinates
are relative to those lines.

Use `InputManager.wasAnyKeyJustPressed()` to complete an active reveal, including
unbound keys. Consume that key before handling normal modal controls so skipping
does not also scroll, close, or trigger another instrument. Held keys and repeats
must not skip it. Call `complete()` on close and do not restart on every scroll.
The planetary dossier is the reference integration.

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
