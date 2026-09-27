# Orbital Surface Improvement

The first texture adjustment is committed as `5a97330`. It raises the source
texture resolution and improves the central filtering estimate. At that baseline,
material colours primarily followed elevation. Lighting uses a smooth spherical normal.
The baseline below separates source-map detail, orbital filtering, illumination,
and atmospheric transfer before changing materials, relief, or display contrast.

## Collecting a Baseline

Run Vite with `npm run dev -- --host 127.0.0.1` and note the actual port. Open
`/tools/orbit-surface-preview.html` or use the collector below. Substitute that
port in `--url` if 5173 is already occupied.

```sh
node scripts/capture_orbit_surfaces.cjs --phase=full --out=/tmp/orbit-surfaces-before-full
node scripts/capture_orbit_surfaces.cjs --phase=quarter --out=/tmp/orbit-surfaces-before-quarter
node scripts/capture_orbit_surfaces.cjs --phase=quarter --stars=3 --out=/tmp/orbit-surfaces-before-triple
```

The collector uses installed Chrome and the repository's existing `happy-dom`
dependency. Browser launch may need the normal environment permission approval.
Each invocation saves a contact sheet, native PNGs for each stage, and `report.json`.
An incomplete browser render is an error, not an accepted blank baseline. Keep
captures outside the repository. The script records the Git revision and any
modified tracked production sources alongside the settings.

The same options are accepted as page query parameters: `phase` is `full`,
`quarter`, or `crescent`; `stars` is 1..3; `radius` is 10..26 half-cell pixels;
`body` optionally selects one preset (`lunar`, `rock`, `carbon`, `frozen`, `ocean`,
`greenhouse`, `dwarf-ice`); `seed` changes the deterministic generation seed.
For another supported globe size, collect `--radius=16` into a separate directory.

These are type-selected coverage fixtures, not replicas of named Solar-system
bodies. Planet properties and their full surface maps use the actual generators.
The type and distance are fixed for repeatability; temperature, atmosphere,
hydrosphere, gravity, tilt, and surface seed are recorded as generated. Extra
stars are controlled lighting experiments on those same bodies, not a rerun of
their climate generation.

## Baseline Findings

The baseline was captured from revision `5a97330e382114b10cc34f81aa2c29b1092d351f`
with seed `orbit-surface-baseline-v1`, using the largest 52-pixel globe. The
native generated heightmaps are 513x513; orbital colour is area-filtered into a
256x128 texture and then minified to the visible hemisphere.

- The native maps show broad, correlated terrain with some type-specific forms,
  but generally little crisp medium-scale structure. This is a source-geography
  limitation as well as a display-sampling limitation; raising resolution alone
  will not add useful terrain forms.
- At full phase, the generated `Rock` fixture's common lit-interior luminance
  standard deviation falls from 13.7 without air to 1.25 with its generated
  4.06-bar atmosphere. `Greenhouse` falls from 17.8 to 1.64 at 190 bar. By
  comparison, low-pressure `DwarfIce` (0.104 bar) retains 13.4 with air versus
  20.7 without. These are display-space measurements for deterministic samples,
  not universal pressure thresholds or physical radiance measurements.
- `Frozen` is low-contrast before lighting or air are applied because its
  generated surface palette is close to white. It needs material structure,
  not a blanket contrast boost.
- At quarter phase with one source, the common lit mask contains 392 pixels;
  with three sources it contains 1541. The three-source capture tests overlapping
  directional lighting, but its total irradiance is not normalized to the
  single-source case, so it is not a controlled brightness comparison.
- Visual inspection confirms the filtered orbital globe reads softer than the
  source map. Small-scale sharpness is correctly filtered at this size, but the
  broad source patterns and elevation-led palette leave too few coherent
  geological landmarks to survive projection.

Complete measurements and PNGs from this run are in
`/tmp/orbit-surfaces-before-full`, `/tmp/orbit-surfaces-before-quarter`, and
`/tmp/orbit-surfaces-before-triple`. They are intentionally not part of the repo.

## Interpreting the Stages

The page shows generated elevation, source surface colours, filtered globe
colours, a lit globe with air removed, and a lit globe with the generated air.
Removing air retains the original terrain, erosion, and liquid distribution.
The globe stages all use `SceneRenderer` and `ScreenBuffer`. The unlit colour
stage temporarily bypasses `composeOrbitRadiance` in this developer page only;
the production game has no diagnostic flags or changed rendering behavior.

Each PNG has a hash of its uncompressed RGBA values. Globe statistics use a
common interior mask facing at least one star, avoiding the silhouette and deep
terminator. A crescent may have no qualifying pixels, reported explicitly with
null statistics. Values are display-space luminance and neighbouring-pixel
differences, not physical radiance or automatic quality scores. Source-map
statistics cover the full rectangular map and should not be compared directly
with masked globe statistics.

Six small rotation steps keep lighting fixed and record consecutive pixel
differences. Inspect the pictures as well: high contrast alone can also mean
aliasing. Chrome's virtual clock can report zero elapsed time for later fixtures:
the collector's timing fields must not be used as performance benchmarks.
For timing, use an ordinary browser session or a wall-clock Node profiler.

## Shared Material Implementation

Solid worlds now carry a dry albedo map (`surface_material.ts`) sampled at up to
257x257 cells, with one byte per sample and a 256-colour palette. Its native
source dimensions map each sample back to the terrain grid so surface, orbit,
and landing views share the same geography. It combines broad and regional
seeded fields sampled in Cartesian coordinates on the sphere, then adds a small
elevation contribution. The resulting palette tints each body's existing
height colour at a restrained type-specific strength, retaining the underlying
elevation contrast and crater and basin cues. This makes irregular material regions without
longitude seams or polygonal cells. The field uses the inverse of the renderer's
Mercator mapping and duplicates the longitude endpoint exactly. Its independent
seed leaves elevation, liquid placement, and resource RNG intact.

The colours represent plausible mixtures, not a simulation of mineral formation
or measured reflectance spectra. The lunar distinction follows dark basaltic
plains and lighter highlands described by [NASA](https://science.nasa.gov/moon/viewing-tips/).
Icy surfaces use relatively clean and contaminated ice as a restrained visual
analogy; [NASA's Europa summary](https://science.nasa.gov/jupiter/jupiter-moons/europa/europa-facts/)
describes non-ice material mixed into its surface. Those analogies do not imply
all generated planets have the same composition or history. Hot icy-type
fixtures use exposed-rock colours; this is a visual fallback, not a phase solver.

Water and managed vegetation cover the dry material. Orbital textures prefilter
that resolved colour, and the landing map uses the same texture mip chain.
Surface travel reads the native material palette. Material replacement also
invalidates both orbital and landing caches. Atmosphere, exposure, and per-star
illumination remain separate from albedo; optically thick air can still obscure
terrain. Molten worlds retain their thermal palette and giants retain their
existing atmosphere textures.

The focused generation and rendering tests cover deterministic fields, crater
contrast, seam closure, spatial coherence, worker-safe data, material
replacement, water and vegetation precedence, cross-view consistency, and
texture stability during small rotations.

### Verification

The focused tests pass (59 tests across four files), including cross-view colour
consistency and preservation of crater-height contrast. A rendering regression
caught and fixed an invalid RGB conversion in the tint path, which had made dry
terrain appear black. The legacy elevation legend labels were also corrected.
Bounding material maps at 257x257 also brings the worker-compatibility test back
under its existing timeout without weakening the test.

Corrected captures are under `/tmp/orbit-surfaces-final-full`,
`/tmp/orbit-surfaces-final-quarter`, `/tmp/orbit-surfaces-final-triple`, and
`/tmp/orbit-surfaces-final-small`. Full and quarter phases use one source;
the triple capture uses three sources at quarter phase. Review the bare stage as
well as the air stage, since thick atmospheres can conceal terrain. The
generated elevation maps match the baseline hashes; the material field is
separate from unchanged terrain and crater generation.
Chrome's virtual clock can report zero elapsed time for later fixtures, so
capture timing is not a performance benchmark. `npm run check` passes: 528 tests
across 86 files, lint, application and test typechecks, and production build.
Surface slope lighting and physically scaled relief remain separate work.

## Next Implementation Decisions

- Review the shared material provinces at native orbital sizes. Adjust their
  scale and contrast only after inspecting the same deterministic fixtures.
- Establish an explicit elevation scale before calculating terrain slopes.
  The current normalized 0..255 height field is not measured in metres.
  Relief normals must transform with the body and respond separately to each
  stellar source. Atmospheric surface illumination must use the same normals
  without unstable division by near-zero geometric incidence at the terminator.
  Solid-body shadowing and the atmosphere's geometric boundary still need their
  own unperturbed normals. Avoid baking one fixed light direction into albedo.
- The current mip choice remains a scalar approximation. Improve the projected
  texture footprint when evidence warrants it, including longitude wrapping,
  Mercator distortion, and tilt. Preserve intermediate-scale features and test
  continuous rotation, not only a checkerboard that averages to a constant.
- Keep prepared material and slope data outside the frame loop. Compare setup
  cost and warmed rendering with the baseline before adopting more sampling.
- Recollect the same fixtures and phases after implementation. Review native
  PNGs and contact sheets before refreshing signatures. Then run the focused
  orbital rendering regressions and the project check before committing.

The initial replacement palette obscured familiar crater colour cues, as
confirmed during visual review. Tinting the existing height palette instead
preserves those cues; cratered fixtures are visible in the quarter-lit capture.
Crater generation and terrain heights were not changed by this work.
