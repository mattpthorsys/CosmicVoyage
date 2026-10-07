# Planetary City Foundations

Status: M0-M4 are implemented and verified. M5 visual review and city-rendering
verification are complete, with a documented three-star atmospheric performance
limit. See the [implementation plan](plans/planetary-cities-first-version.md).

## Visual Budgets

Cities are a sparse decorative layer on existing human colony worlds. Native
biospheres and orbital automated depots do not imply human surface settlements.
Complete breathable colonies use urban regions and occasional industrial sites;
partial or non-breathable colonies use sealed habitats and industrial compounds.

- At most 12 settlement regions and seven footprint patches per region.
- Complete colonies initially request 6-10 regions before world-size scaling;
  sealed colonies request 2-4. Placement may yield fewer valid regions.
- Urban cores have roughly 12-42 km radii, sealed/industrial cores 2-8 km,
  further bounded relative to world diameter. These are illustrative regions,
  not population measurements or individual building dimensions.
- Footprints retain fractional coverage of regional cells. A settlement symbol
  in regional travel will not claim that one building fills the entire cell.
- Night lights use restrained warm amber, with cooler sealed-habitat lights.
  Daytime urban tint remains subordinate to native terrain.
- Candidate sampling, patch attempts and sparse output have explicit caps.
  Reject unsafe terrain rather than flattening or draining it.

The surface projection is Mercator. Generated maps duplicate their longitude
endpoint; settlement identity and coverage use the unique longitude period and
alias the final column to the first. Latitude never wraps.

## Baseline Fixtures

`src/tests/fixtures/settlements.ts` supplies controlled completed/partial colony
environments and small coast, island, seam, dry, flooded and rough terrain maps.
The `depot-only` diagnostic intentionally has no terraforming profile: station
presence alone must not create cities. It does not instantiate station services.

The existing production-renderer diagnostic accepts a settlement suite, including
the real starting colony for its chosen seed:

```bash
node scripts/capture_orbit_surfaces.cjs --suite settlements --phase full --out /tmp/cosmic-cities-full
node scripts/capture_orbit_surfaces.cjs --suite settlements --phase quarter --stars 2 --out /tmp/cosmic-cities-quarter
node scripts/capture_orbit_surfaces.cjs --suite settlements --phase crescent --stars 3 --out /tmp/cosmic-cities-crescent
node scripts/capture_orbit_surfaces.cjs --suite settlements --phase night --body starting-colony --out /tmp/cosmic-cities-night
```

With Vite running, open:

```text
http://127.0.0.1:5173/tools/orbit-surface-preview.html?suite=settlements
```

The suite records generated elevation, native colours, unlit globe albedo,
bare/atmospheric globe views, the actual landing map and regional surface travel.
Camera positions, phases and seeds are fixed. Reports contain pixel hashes,
physical/environment data, preparation timings and settlement metadata.

M0/M1 do not change the production rendering paths. The Luna baseline captures
completed for full, quarter, crescent and night-side lighting; the captured
globe, landing-map and surface-travel views contain no city marks, as expected
before M2. The captures are in `/tmp/cosmic-cities-{full,quarter,crescent,night}`.
The full `npm run check` passed (1,290 tests, formatting, lint, type checks and
production build). Focused suites also passed: 99 planetary, 96 generation,
247 rendering and 8 surface tests. The build reports the existing large-bundle
advisory; it completes successfully.

The settlement diagnostic generated 10 sites for the real starting colony,
6 for the completed-colony fixture and 3 for the partial-colony fixture.
Uninhabited and depot-only fixtures have no settlement layer. Retain these
captures as the city-free visual baseline for M2/M3 comparisons.

## Orbital Rendering (M2)

`SolidPlanetOrbitTextureRenderer` optionally caches urban albedo, fractional
coverage and linear RGB emission alongside its existing natural terrain mip
chain. Colours are decoded during preparation; city layout is never generated
in a frame loop. Float32 coverage/emission preserve small settlements while
area filtering conserves their average brightness. City-free bodies allocate
none of these optional channels. The nominal added numeric storage is about
0.8 MiB per prepared colony texture, before JavaScript object overhead.

The shared camera, body transform, tilt and Mercator sampling place urban tint
and lights on exactly the same terrain. `sampleMap` samples natural colours
under the landing-map navigation symbols, using the same cache without
discarding the orbital channels.
Texture matching includes settlement-layer identity and generation version.

`orbit_settlement_light.ts` owns the art budgets: a 35% urban tint at full
coverage and a 0.55 solar-relative linear emission scale. These are display
parameters for unresolved settlements, not calibrated lighting measurements.
Emission already contains fractional coverage and is not multiplied by it again.
Lights switch on smoothly with decreasing combined direct visible stellar
irradiance, including the actual relative strengths of companion stars; the
twilight knee is 0.002 times the visible Earth/Sun reference. A weak star above
the horizon does not automatically count as daylight.

`SceneRenderer` adds this emission once after summing stellar reflection and
scattering, before the existing exposure/tone map. Its colour is independent
of the host star. `OrbitAtmosphereSampler.sampleGroundViewingTransmission`
reuses cached camera rays to apply outgoing-only extinction and solid limb
coverage. It adds no per-frame optical integrations and excludes rays which
miss the ground. Thick molecular atmospheres obscure ground lights according
to the existing optical model; no separate glow or cloud simulation is added.

The settlement capture suite now includes a `noCities` reference with identical
terrain and atmosphere and a `cityEffect` pixel-difference summary. It also
accepts `--rotation` (0..<1) and `--pressure` (nonnegative bar) to compare
rotation and viewing extinction without changing generated land or city sites.
Keep the M0/M1 baseline directories intact and use separate M2 output paths:

```bash
node scripts/capture_orbit_surfaces.cjs --suite settlements --phase night --body starting-colony --out /tmp/cosmic-cities-m2-night
node scripts/capture_orbit_surfaces.cjs --suite settlements --phase full --out /tmp/cosmic-cities-m2-full
node scripts/capture_orbit_surfaces.cjs --suite settlements --phase quarter --stars 2 --out /tmp/cosmic-cities-m2-quarter
node scripts/capture_orbit_surfaces.cjs --suite settlements --phase crescent --stars 3 --out /tmp/cosmic-cities-m2-crescent
node scripts/capture_orbit_surfaces.cjs --suite settlements --phase night --body starting-colony --rotation 0.6 --out /tmp/cosmic-cities-m2-rotated
node scripts/capture_orbit_surfaces.cjs --suite settlements --phase night --body starting-colony --pressure 10 --out /tmp/cosmic-cities-m2-thick
```

The M2 captures are in `/tmp/cosmic-cities-m2-{night,full,quarter,crescent,rotated,thick}`
and `/tmp/cosmic-cities-m2-three-night`. The real starting colony shows
restrained warm lights on the night-facing surface; changing body rotation moves
the lights with the terrain. Three-source illumination does not duplicate the
emission, and the 10-bar diagnostic attenuates it. At the diagnostic's maximum
52-pixel globe size, daylight and crescent urban-albedo changes remain below
pixel quantisation; night lighting is the long-range settlement cue. M3's map
and regional views will provide the closer-scale city presentation.

## Map And Regional Presentation (M3)

`src/rendering/scenes/settlement_surface_renderer.ts` owns the shared map
projection and a small library of urban, sealed-habitat and industrial motifs.
Preparation blends four restrained structure colours into each site's existing
dry material and selects a fixed orientation from native coordinates. It is
cached by settlement-layer identity/version and terrain, palette, liquid and
material identities. No world generation, PRNG consumption or mutation is
introduced by drawing.

Landing-map annotations are compact, three-pixel symbols projected into the
same integer native cell used by the landing cursor. Co-located sites share a
marker without shifting their coordinates. Icons wrap horizontally at the seam
and clip at latitude limits. They are navigation annotations, not enlarged
physical city footprints; `SceneRenderer` caches them above natural terrain,
invalidating when settlement data or map dimensions change. Moving the cursor
does not rebuild the raster or erase a site from the cache.

Regional travel draws half-cell roof, pad and short-connection motifs only in
prepared dry settlement cells. Transparent pixels keep the original terrain
visible. Motifs shrink for expanded-map scales, remain inside a native cell,
and move with the ground. Even a tiny fractional city core gets a compact
regional symbol; low-coverage outskirts remain sparse. The final duplicated
longitude column uses the first column's artwork; latitude does not wrap.

The raster canvas is above terminal cells regardless of call order. Mineral
markers, parked ship, player/reticle, scan arrows and narrow-screen legend
labels explicitly reserve their cells through the existing
`ScreenBuffer.occludeScaledGlyphs` API. Cities cannot cover those controls.
Sidebar and notification areas remain outside the clipped decoration viewport.
Mining, vehicle movement, natural terrain arrays and biological encounters
remain unchanged; cities are still decorative, not new service locations.

The settlement diagnostic now centres regional travel near the selected real
site and captures matching `landingMapNoCities` and `surfaceTravelNoCities`
references. `groundEffect` reports actual displayed pixel differences;
`groundFocus` records the selected site and vehicle coordinates. Use `--site`
to inspect another settlement and `--cols`/`--rows` to change the terminal grid.
Use new directories to preserve earlier baseline captures:

```bash
node scripts/capture_orbit_surfaces.cjs --suite settlements --body starting-colony --cols 120 --rows 64 --out /tmp/cosmic-cities-m3-desktop
node scripts/capture_orbit_surfaces.cjs --suite settlements --body starting-colony --cols 40 --rows 45 --out /tmp/cosmic-cities-m3-narrow
node scripts/capture_orbit_surfaces.cjs --suite settlements --body colony-partial --out /tmp/cosmic-cities-m3-sealed
node scripts/capture_orbit_surfaces.cjs --suite settlements --body uninhabited --out /tmp/cosmic-cities-m3-uninhabited
node scripts/capture_orbit_surfaces.cjs --suite settlements --body depot-only --out /tmp/cosmic-cities-m3-depot
```

M3 helper tests cover deterministic four-colour motifs, native movement,
different cell scales, tiny cores, seam aliases, latitude clipping, liquid
rejection and preparation invalidation. Production renderer tests cover map
cursor/site alignment, map cache refresh, desktop/narrow viewport bounds,
unchanged city-free terminal drawing, ground-relative movement and actual
buffer rectangle compositing beneath foreground glyphs. `npm run check` passed
with 1,326 tests across 176 files, including 17 new M3 rendering cases. Browser
captures were inspected at 120x64 and 40x45 terminal grids, for a partial
sealed colony, and for uninhabited and depot-only worlds. The starting colony
changed 1,008 landing-map output pixels and 176 regional surface pixels; the
partial colony changed 416 and 192 respectively. Uninhabited and depot-only
captures had zero changes. Capture directories are `/tmp/cosmic-cities-m3-desktop`,
`/tmp/cosmic-cities-m3-narrow`, `/tmp/cosmic-cities-m3-sealed`,
`/tmp/cosmic-cities-m3-uninhabited` and `/tmp/cosmic-cities-m3-depot`.
M4 adds the broader loading, body-switching, modal, save/reload and lifecycle
transition audit below; M5 retains final visual and performance tuning.

## Preparation And Transitions (M4)

Implementation and verification are complete. The existing source checks and
the final M4 regression results are summarized below.

`Planet.getSurfaceGenerationRevision()` exposes only the existing preparation
revision. `SurfacePrefetchService` records attempts per revision rather than
per body lifetime. New terraforming inputs can therefore receive predictive
preparation again, while a failed unchanged revision does not retry endlessly.
Queued work records the revision when preparation starts. Existing worker
publication guards still reject obsolete results.

`RendererFacade` retains cancellable idle/timeout handles for texture warming.
Discontinuous arrival releases the old queue; destruction cancels pending work
and refuses future preparation. View-cache invalidation retains the source-
validated body-fixed texture and landing-map WeakMaps: resizing need not rebuild
unchanged terrain or city art. Generated data and source identity, not a display
name, determine texture reuse.

Generic animated popups now mask their current visible bounds through
`ScreenBuffer.occludeScaledGlyphs`, as dossier and terminal-dialog renderers
already do. The underlying city raster is redrawn when the popup closes.
Replacing the terminal grid discards both staged raster glyphs and old-grid
foreground masks, even if resize interrupts an unflushed frame.

New tests use the real `ScreenBuffer` raster bitmap, not just mocked draw calls.
They cover popup phases and exact restoration, loading, city-free body changes,
resize, interrupted staging, return to system travel and texture reuse. Additional
checks cover idle/timeout cancellation, prefetch revisions and the actual saved-
location restoration boundary with regenerated settlement data. Existing tests
retain seam, stale worker publication and natural-world regression coverage.

The optional `--transitions` diagnostic reuses the same production renderer,
buffer and canvases across transitions. PNGs and `transitionEffect` record
popup masking, exact display restoration, comparisons against fresh resized
and city-free renderers, and empty raster layers during loading/system travel.
These controls isolate stale pixels from intended decorative differences.

Commands used for M4 verification, preserving earlier captures:

```bash
npm run test:run -- src/tests/core/surface_prefetch.test.ts src/tests/rendering/renderer_facade.assets.test.ts src/tests/rendering/settlement_transitions.test.ts src/tests/entities/planetary/surface_settlement_generation.test.ts
npm run check
node scripts/capture_orbit_surfaces.cjs --suite settlements --body starting-colony --transitions --out /tmp/cosmic-cities-m4-desktop
node scripts/capture_orbit_surfaces.cjs --suite settlements --body starting-colony --transitions --cols 40 --rows 45 --out /tmp/cosmic-cities-m4-narrow
node scripts/capture_orbit_surfaces.cjs --suite settlements --body colony-partial --transitions --out /tmp/cosmic-cities-m4-sealed
node scripts/capture_orbit_surfaces.cjs --suite settlements --body uninhabited --transitions --out /tmp/cosmic-cities-m4-uninhabited
node scripts/capture_orbit_surfaces.cjs --suite settlements --body depot-only --transitions --out /tmp/cosmic-cities-m4-depot
```

Inspect the popup and resized PNGs as well as the metrics. For city-bearing
fixtures, popup `coveredBefore` must be positive and `coveredAfter` zero;
restoration and fresh-render comparisons must have zero changed pixels.
Loading, city-free and system-travel raster counts must be zero. The launch
capture uses the real starting hub; standalone planet fixtures omit that stage.
All five browser captures completed. The starting colony's popup mask removed
176 raster pixels (192 on the sealed colony) in each phase; closing restored the
display with zero changed RGB pixels. Desktop and narrow resize references also
had zero changed pixels. Loading, city-free, and system-travel raster layers
were empty. Uninhabited and depot-only controls had zero city changes. Captures
are in `/tmp/cosmic-cities-m4-{desktop,narrow,sealed,uninhabited,depot}`.

The focused suites passed 26 tests across six files. `npm run check` passed
documentation checks, formatting, lint, both TypeScript projects, all 1,342
tests across 178 files, and the production build. The build reports the existing
large JavaScript chunk advisory; it completed successfully.

## Visual And Performance Review (M5)

`--real-colonies 3` searches deterministically around the starting hub and
captures three generated colonies in addition to the hub. With seed
`orbit-surface-baseline-v1`, the generated systems are (-9, 2) and (-32, 12)
(complete oceanic colonies) and (-20, -44) (a partial oceanic colony). This
tests real placement and terrain instead of only controlled fixture palettes.
The partial world has just two small sealed sites; most of it remains empty.

The sealed-habitat tint is now cool teal so it reads against blue oceanic
terrain without using the warm amber of open-air cities. Night radiance was
raised from 0.35 to 0.55 in solar-relative display units. At a 52-pixel globe,
lights remain small and some sites are hidden on the far hemisphere or below
pixel quantisation. Do not add a screen-space glow for those cases: the landing
map and regional view are the readable close-range views. Captures at 120x64,
80x45 and 40x45 grids were inspected, including a rotated night view and
three-star quarter lighting. The 40-column capture preserves terrain and site
marks, though the existing full surface telemetry is cramped at that width.

Reproduce the visual review with Vite running:

```bash
node scripts/capture_orbit_surfaces.cjs --suite settlements --real-colonies 3 --phase night --out /tmp/cosmic-cities-m5-night
node scripts/capture_orbit_surfaces.cjs --suite settlements --real-colonies 3 --phase quarter --stars 3 --out /tmp/cosmic-cities-m5-quarter
node scripts/capture_orbit_surfaces.cjs --suite settlements --real-colonies 3 --phase quarter --stars 3 --cols 80 --rows 45 --out /tmp/cosmic-cities-m5-medium
node scripts/capture_orbit_surfaces.cjs --suite settlements --real-colonies 3 --phase quarter --stars 3 --cols 40 --rows 45 --out /tmp/cosmic-cities-m5-narrow
node scripts/capture_orbit_surfaces.cjs --suite settlements --body starting-colony --phase night --rotation 0.6 --out /tmp/cosmic-cities-m5-rotated
```

The capture script uses Chrome virtual time for deterministic screenshots; its
`captureMeanMs` is **not** a frame-time benchmark. Use the normal-clock CDP
profiler for timing. It creates an isolated Chrome profile and needs permission
to open a local debugging socket:

```bash
node scripts/profile_planetary_cities.cjs --real-colonies 3 --phase night --stars 1 --out /tmp/cosmic-cities-m5-profile-night.json
node scripts/profile_planetary_cities.cjs --real-colonies 3 --phase quarter --stars 3 --out /tmp/cosmic-cities-m5-profile-three-star.json
```

On AMD Ryzen 5 9600X, Chrome 143, 120x64 terminal cells, after eight warm-up
frames and over 40 measured frames per body, the one-star city frames had
95th-percentile times of 6.7-7.7 ms; matching city-free references took
6.6-7.2 ms. Three-star city frames took 23.7-24.5 ms; matching city-free
references took 22.4-24.5 ms. Thus cities retain the one-star 16.7 ms target
and add little warmed cost, but the existing per-star atmospheric integration
misses that target with three sources. Do not treat this as a city-lighting
regression or quietly lower the optical resolution; optimize that shared path
under separate multi-star lighting tests.

Cold natural surface plus settlement generation took 764-822 ms across these
four worlds. With the surface ready, first city texture preparation took
17-24 ms and the first complete orbital frame took 56-63 ms; these are distinct
from steady-state rendering. Each prepared colony texture held 174,720 bytes
of natural typed arrays and 829,920 bytes of optional settlement channels,
about 0.96 MiB combined before JavaScript object overhead. City-free textures
retain only the natural channels. Preparation remains outside the frame loop.

The focused city generation, lighting, texture, surface and scene regression
checks passed (95 tests). `npm run check` passed documentation comments,
formatting, lint, both type checks, all 1,342 tests across 178 files and the
production build. Its existing large-chunk advisory remains non-fatal.

## Responsive Surface Follow-Up

`core/surface_ui.ts` now owns the shared terrain/footer geometry and the
vehicle-overlay contract. Terrain height reserves the complete resource,
notification, selected-action and control rows before drawing. This fixes the
previous action strip being placed below the terminal's last row. Surface scan
limits use the same dimensions. `SurfaceTelemetryRenderer` draws the reserved
regions with thin readings and thick key labels. The selected horizontal action
window follows selection, including commands near the end of the list.

Wide views retain a crew sidebar; narrow views show date, return-to-ship range
and health below the terrain. Large rosters show the most injured first and
link to Operations for the full crew. Cargo includes both cubic metres and
percentage. The terrain legend is available through the existing Icon command
rather than floating over narrow travel views. Latitude labels now use the
actual Mercator projection and longitude respects its duplicated seam.

The complete check passes after the layout change: 181 test files and 1,372
tests, plus formatting, lint, type checks, documentation checks and production
build. The existing non-fatal large-bundle advisory remains. Chrome captures of
the starting colony completed at 120x64 and 40x45 with three stellar sources;
both reports are under `/tmp/cosmic-luna-settlement-wide` and
`/tmp/cosmic-luna-settlement-narrow`. Multi-star browser timings are recorded
under [orbital atmosphere performance](orbit-atmosphere.md).

## Settlement Identity And Navigation Follow-Up

Orbital operations now provides **U settlements**, both as a direct key and a
bottom-menu command. This opens a paused terminal directory for the selected
planet or moon. Up/down select a named site, page keys move through the list,
**D** opens its coloured dossier, and Escape returns to the list or orbit.
Detailed dossiers use the existing fast terminal reveal; a key first finishes
an active reveal. Enter selects the site's native coordinates, closes the
directory and enters landing selection. A separate Enter confirms the landing.
Opening or dismissing the directory alone never changes the landing cursor.

Names and concise urban/sealed/industrial descriptions derive from an
independent `settlement-identity-v1` branch of existing site IDs. Prepared
catalogs are weakly cached by settlement layer, not by mutable planet names.
Restored layers derive the same names without new save data. Replacement
terraforming layers cannot inherit an obsolete cached catalog. This does not
change placements, geology or the surface generator's random stream.

The dossier reports native and Mercator coordinates, district patch counts and
physical semi-axes. It does not invent population counts or shops; settlements
remain visual map references rather than operational surface ports. A stable
surface footer row identifies mapped settlement sectors; narrow terminals wrap
the name across two reserved rows. This denotes fractional regional coverage,
not a building-sized tile or guaranteed facilities at the vehicle's position.

Uninhabited and depot-only bodies show an empty directory. Missing colony
surface data is requested outside rendering, with a modal-session and live-body
guard against stale asynchronous completion. Existing dossier pause and raster
occlusion rules apply to both directory and detail views.

Focused identity, wrapping, selection, landing-confirmation, worker-lifecycle,
overlay and buffer-bound tests have been written. Formatting, lint, both type
checks and function-documentation checks pass; runtime tests have not been run
for these three follow-ups. Luna must run the
new tests, desktop/narrow captures and three-star performance measurements.

## Generated Data Ownership

`src/entities/planet/surface_settlements.ts` owns the typed colony profile,
independent `surface-settlements-v1` seeds, candidate placement, physical ellipse
patches and sparse fractional cell data. Site IDs never use mutable display names.
Cells are sorted by their canonical native coordinate; `getSurfaceSettlementCell`
reads them with a binary search and aliases the duplicated longitude endpoint.

`Planet.createSurfaceGenerationRequest()` supplies a profile only for worlds
with an explicit terraforming/colony environment. Breathability uses the existing
managed-air assessment, not an atmosphere-density label. The existing surface
generator prepares decoration after geology, liquids, materials and deposits,
without consuming their PRNG or modifying those arrays.

Worker and synchronous preparation use the same entry point. The legacy
`SurfaceGenerator` wrapper accepts an optional third settlement-profile argument.
The existing terraforming revision guard also rejects obsolete city layers.
`readReadySurfaceData` returns the prepared layer without triggering generation;
older packages without it remain valid.

No save field, Galaxy model version or movement rule changes. Surface city data
is derived from existing generated identity and colony inputs when a surface is
prepared. Do not generate it from rendering or station-menu code.

## Verification

Focused tests cover explicit colony eligibility, the real starting colony,
terrain/resource preservation, PRNG preservation, deterministic placement,
small islands and one-cell land, rough/flooded rejection, fractional coverage,
longitude aliases, structured transport, the actual worker message handler,
renaming/regeneration and stale asynchronous colony revisions.

```bash
npm run test:planetary
npm run test:generation
npm run test:rendering
npm run test:surface
npm run check
```

The M0-M4 checks above are complete. M2 adds focused texture tests for
fractional brightness, mip conservation, seam wrapping, daylight tint and cache
reuse. Optical checks compare outgoing transmission with a ground-to-camera
reference. Actual globe tests cover combined stellar illumination, spectrum,
night-side emission, extinction, rotation, occultation and silhouette coverage.
The M2 rendering suite passed (266 tests across 30 files). `npm run check`
passed with 1,309 tests across 174 files, documentation checks, formatting,
lint, both TypeScript projects and the production build. The build retains the
existing large-bundle advisory. Keep the M0/M1 baseline captures for comparison.
