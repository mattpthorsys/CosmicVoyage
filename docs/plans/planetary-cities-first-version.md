# Planetary Cities First Version Implementation Plan

Status: M0-M4 are implemented and verified. M5 final visual/performance tuning
remains planned. See
[the foundations guide](../planetary-cities.md) for
ownership and verification details.

Add decorative human settlements to inhabited planets, using one generated
settlement layer across orbital view, the landing map and surface travel.
Night lights should make inhabited worlds quietly recognisable from orbit;
closer views should reveal compact settlement patterns without replacing the
existing terrain or introducing a city simulation.

## 1. First Version Scope

Include:

- Deterministic settlement locations on existing human colony worlds.
- Sparse, irregular urban regions on completed colonies and smaller sealed
  habitat or industrial compounds on partially terraformed worlds.
- Restrained orbital night lights and subtle urban surface colours in daylight.
- Landing-map settlement symbols at the same locations.
- Decorative structures and short transport patterns in regional surface travel.
- Shared coordinates, bounded preparation costs and targeted graphics coverage.

Keep cities decorative and traversable. They do not provide shops, missions,
repairs, population simulation, collision, landing restrictions or new rewards.
Existing starports and orbital depots retain their current services.

Do not add a street-level mode, traffic, moving inhabitants, planetary growth,
planet-wide road networks, alien cities or procedurally expanding civilisation.
Do not increase colony frequency to demonstrate the visuals.

## 2. Existing Foundations

| Current owner                                                                               | Reuse and constraint                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`SolarSystem`](../../src/entities/solar_system.ts)                                         | `colonyWorld` and `settlementStage` identify existing human settlements. An orbital automated depot does not establish a surface colony.                                  |
| [`Planet`](../../src/entities/planet.ts)                                                    | `terraforming`, effective atmosphere and temperature, immutable `mapSeed`, lazy surface preparation and revision protection. There is no detailed human population model. |
| [`habitability.ts`](../../src/entities/habitability.ts)                                     | Complete and partial terraforming profiles, including sealed-settlement support. Reuse their environmental distinction without changing suitability rules.                |
| [`surface_generator.ts`](../../src/entities/planet/surface_generator.ts)                    | Pure generation shared by synchronous and worker providers. Heightmap, liquids and materials supply placement inputs.                                                     |
| [`surface_coordinates.ts`](../../src/utils/surface_coordinates.ts)                          | Regional longitude wrapping and latitude clamping. Longitude seams must not split city identity.                                                                          |
| [`solid_planet_orbit_texture.ts`](../../src/rendering/scenes/solid_planet_orbit_texture.ts) | Cached body-fixed textures and filtered sampling shared by the globe and landing map. Preserve their crisp half-cell raster.                                              |
| [`scene_renderer.ts`](../../src/rendering/scene_renderer.ts)                                | Current globe projection, stellar radiance composition, landing-map cache and terrain/vehicle drawing. Keep new generation and art rules in focused modules.              |
| [`orbit_atmosphere_sampler.ts`](../../src/rendering/scenes/orbit_atmosphere_sampler.ts)     | Cached viewing rays already contain ground-to-camera transmission. City emission needs viewing extinction, not the reflected-sunlight transfer.                           |
| [`encounter_surface.ts`](../../src/core/encounter_surface.ts)                               | Xenobiology uses a separate close-up field derived from regional terrain. Do not scatter city buildings through every biological encounter.                               |

The orbital renderer currently approximates molecular scattering and extinction;
it does not model clouds, particulate pollution or a complete spectral atmosphere.
Use the existing atmospheric approximation for city lights. A new cloud or urban
smog simulation is outside this feature.

## 3. Data And Ownership

Use a small typed settlement profile, a pure generator and a prepared visual
layer. Names below are proposed; follow existing module conventions.

| Owner                                    | Responsibility                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `entities/planet/surface_settlements.ts` | Serializable profile and site types, eligibility, terrain-based placement and deterministic footprint generation.         |
| `SurfaceGenerationRequest`               | Optional explicit settlement profile derived from the planet's existing colony metadata, plus physical size where needed. |
| `SurfaceData`                            | Optional settlement layer with bounded site records and prepared coverage, urban tint and emission data.                  |
| `Planet`                                 | Build the profile, publish the prepared layer with other surface data and invalidate it when terraforming changes.        |
| Existing solid texture renderer          | Prefilter urban coverage and emission with the body-fixed texture; share sampling between globe and map.                  |
| Focused surface drawing helper           | Translate prepared settlement patterns into restrained regional glyphs or small pixel motifs.                             |
| Existing scene and UI model builders     | Pass prepared readonly information and preserve player, resource, scan and interface priorities.                          |

A site needs a stable ID, regional centre, physical footprint or size category,
appearance archetype, layout seed and bounded light strength. Retain fractional
coordinates or coverage where needed: many real city footprints are smaller
than a regional map cell. A visual region can represent several nearby urban
clusters rather than a single continent-sized city.

Use `Planet.mapSeed` with a dedicated label such as `surface-settlements-v1`.
Do not consume the mineral-generation PRNG or seed from the mutable colony
display name. Keep a separate settlement-generation version so art revisions
do not change the stellar population or natural geology.

Generate settlements after the existing terrain, liquid and material data is
prepared, through the same worker-safe entry point. Requests contain plain
serializable values, not a `Planet` instance. An absent profile means no cities;
legacy test adapters and surface packages without the optional field remain valid.

For this decorative version, regenerate settlements from stable inputs rather
than saving a duplicate city inventory. No new campaign save field is required
if these inputs are already restored. Verify that during implementation. Future
player-built cities or population changes would require authoritative persistence.

## 4. Placement And Visual Rules

### Eligibility and distribution

- Only a world explicitly designated as a human colony receives this layer.
  Native life, a surveyed planet or an orbital depot is insufficient.
- Completed colonies favour dry lowlands near liquid-water shores and gentler
  terrain, with occasional inland regions for variety.
- Partial colonies favour compact sealed habitats and industrial compounds on
  stable dry terrain. Open-air residential appearance requires suitable air.
- Reject submerged and excessively rough footprints, not just unsuitable centres.
  Do not flatten the planet to make a candidate fit.
- Use clustered growth and small satellite patches rather than uniformly spaced
  dots, repeated rectangular grids or rings around every coastline.
- Bound candidate attempts and total sites. Prefer fewer valid settlements over
  relaxing constraints into implausible terrain.
- Treat settlement density as an art parameter, not an invented population count.
  Tune it by available land and world size; most of the planet remains natural.

The starting colony should have at least one clearly recognisable settlement
when valid land is available. Achieve this through its existing colony profile
and a deterministic dry-site fallback, never by painting over water or changing
the galaxy generation seed. Other worlds should vary visibly.

### Appearance at each scale

| View                    | Presentation                                                                                                                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Orbital night side      | Small, irregular amber and off-white clusters, with restrained bright centres and dim outskirts. Avoid neon continents, blinking or decorative bloom. |
| Orbital day side        | Subtle grey or mineral-coloured urban patches under ordinary stellar lighting. Terrain remains dominant.                                              |
| Landing map             | A few compact, consistent settlement symbols over the terrain raster. Symbols are navigation-scale annotations, not enlarged physical footprints.     |
| Regional surface travel | Small block/shade motifs suggesting built areas, sealed compounds, pads and short local connections. Keep surrounding terrain colours visible.        |

Regional terrain cells cover large areas. Building and road motifs there are
map-scale settlement symbols, not metre-scale street geometry. Do not stretch
a small city across several enormous cells to make individual buildings visible.
A future close-up mode can supply real districts and local coordinates.

Use existing block, shade and IBM line glyphs where they read clearly. Optional
small pixel motifs should use at most four colours and the existing
nearest-neighbour rendering path. Do not reuse the player or orbital-starbase
glyph as the city symbol.

## 5. Orbital Light Composition

Keep artificial emission separate from surface albedo. Painting yellow pixels
into the terrain palette would make the lights disappear in darkness and change
colour according to the parent star.

The intended composition is:

```text
reflected terrain and atmospheric scattering from all stars
  + settlement emission attenuated on the ground-to-camera path
  -> existing exposure and tone mapping
```

Emission is added once per pixel, after summing stellar contributions. It is not
multiplied by stellar irradiance or added separately for every star. Its colour
comes from the settlement profile. Use a bounded, smooth night-light response
based on combined local incident irradiance; a very faint companion above the
horizon must not incorrectly suppress all city lights.

Expose a narrow viewing-transmission query from the existing cached atmosphere
sampler if needed. Do not reuse `OrbitAtmosphereTransfer.surface` as emission
transmission: it also contains sunlight-path attenuation and solar incidence.
Reuse prepared rays without rerunning expensive optical integrals. Handle
pixel coverage exactly once, particularly at the limb.

City patterns use the same body rotation, tilt, perspective projection and
Mercator texture mapping as the terrain. They disappear behind the solid limb
and never become free-floating points beside the planet. Do not add a second
latitude conversion that disagrees with current terrain sampling.

Prefilter emission separately from albedo, retaining fractional coverage and
approximately conserving integrated brightness between texture levels. Do not
threshold tiny settlements out of existence or magnify them into bright squares.
Retain the fixed half-cell output grid and do not change global exposure or
atmospheric settings just to make cities brighter.

## 6. Implementation Milestones

### M0 Define fixtures and visual budgets

Status: verified. Settlement fixtures and baseline captures are in place; the
four illumination cases were checked before adding any city rendering.

Identify representative existing colony worlds and prepare controlled fixtures:
completed and partial colonies, an uninhabited terrestrial world, a depot-only
system, coastlines, small islands and a longitude seam. Include atmospheric,
airless and multiple-light-source rendering fixtures where appropriate without
changing generated settlement eligibility.

Capture the existing globe, landing map and surface appearance before code
changes. Define the placement limits, symbolic scale, glyph palette and light
brightness budget. Reuse the existing preview tools and capture script where
practical rather than creating a separate rendering demo.

Acceptance: the fixtures, baseline comparisons and planned module contracts
are ready; unrelated terrain and lighting changes can be detected.

Suggested commit: `Define planetary settlement visual fixtures and contracts`.

### M1 Generate shared settlement data

Status: verified. Deterministic data is generated only for colony worlds and
does not alter existing surface fields or rendered output.

Implement the typed profile and pure placement/footprint generator. Pass the
optional profile through the existing surface request, publish the result in
`SurfaceData`, and support already-ready reads, synchronous generation and the
worker provider. Reuse terraforming revision invalidation and stale-result guards.

Add tests for stable placement, land constraints, seam handling, profile
eligibility, bounded candidate failure and worker/synchronous equivalence.
Compare natural surface outputs with and without the optional city profile.

Acceptance: eligible colonies have repeatable valid settlement data; an
uninhabited or depot-only world has none; geology, resources and PRNG state
remain unchanged.

Suggested commit: `Generate deterministic planetary settlement layers`.

### M2 Render cities from orbit

Status: verified. Optional filtered urban/emission channels and cached outgoing
atmospheric transmission are connected to the production globe. The diagnostic
supports matching city-free references, rotation and pressure overrides. The
full check passed with 1,309 tests; see the foundations guide for capture results.

Extend cached solid textures with urban coverage and a separate emission
channel. Integrate the latter into radiance composition and add the narrow
cached viewing-transmission API. Share existing projection and rotation.
Keep daytime footprints muted and night lights sparse.

Add analytic and buffer tests for dark-side visibility, daylight contrast,
multiple stars, atmospheric extinction, limb coverage, rotation and filtered
subpixel settlements. Keep existing city-free airless and uninhabited
regression fixtures unchanged.

Acceptance: lights follow terrain, survive sensible filtering, respect the
atmosphere and remain inside the planet; existing terrain and sunrise/sunset
appearance remain intact. Review real rotating captures before proceeding.

Suggested commit: `Render restrained orbital city lights and urban surfaces`.

### M3 Show settlements on map and surface

Status: verified. `SettlementSurfaceRenderer` prepares four-colour regional
artwork and compact landing-map symbols from existing settlement sites. Scene
integration preserves terminal foreground markers using the buffer's
raster-occlusion API, including narrow-screen terrain legends. Landing-map
cache matching includes settlement identity and version. The full check passed
with 1,326 tests across 176 files; desktop, narrow, sealed-habitat, uninhabited
and depot-only captures were inspected. See the foundations guide for results.

Add landing-map symbols from the same site records, with correct longitude
wrapping and matching locations. Draw prepared regional settlement motifs in
surface travel. Reuse viewport clipping and the current surface cell scale.

Explicit draw priority: natural ground, settlement decoration, mineral/resource
markers, parked ship and rover/player, scan selection and HUD. Preserve existing
behaviour when markers overlap a city; decoration must not hide actionable data.
Do not alter mining, vehicle movement or biological encounter terrain.

Acceptance: a visible map settlement can be reached at its matching regional
coordinates; cities appear naturally within terrain; player, resources and
scan controls remain readable at desktop and narrow widths.

Suggested commit: `Show consistent settlements on landing maps and terrain`.

### M4 Harden preparation and graphics transitions

Status: verified. Existing
source-identity/version checks are retained. Predictive preparation now retries
after a surface revision changes; pending texture work is cancelled on renderer
disposal and discontinuous arrival. Generic animated popups reserve their current
raster bounds, and grid replacement discards old staged glyphs and masks.

Focused coverage adds raster-pixel transition checks, revision-aware prefetch,
idle/timeout cancellation and regenerated cities after saved-location restoration.
The diagnostic's optional `--transitions` captures popup phases, resize, loading,
body changes and system travel repeatedly on the same display.

Include settlement-layer identity/version in orbital-texture and landing-map
cache matching. Rebuild only when source data or dimensions change. Keep lazy
preparation and predictive prefetch; never start generation from drawing.

Cover loading completion, rapid body switching, terraforming invalidation,
save/reload, cache eviction, viewport resize, longitude wrap, launch and modal
open/close. Preserve the raster/terminal/HUD ordering and clear stale city
pixels using existing buffer lifecycle rules.

Acceptance: settlements remain identical after regeneration and reload;
no patterns bleed onto another planet, outside the viewport or over a popup.
Uninhabited scenes follow the existing rendering path without additional work.

Suggested commit: `Harden settlement caching and rendering transitions`.

### M5 Verify performance and finish visual tuning

Run the verification matrix below and inspect actual rotating captures. Tune
placement and colour budgets against several real colonies, not only a
hand-picked showcase. Update the rendering/visual guides with current ownership,
the regional scale convention and reproducible verification commands.

Notify the owner before test execution so they can switch to Luna. Write focused
coverage alongside each implementation milestone, but coordinate its execution
and the final browser/performance gate with that requested model switch.

Acceptance: focused tests and `npm run check` pass; real desktop/narrow captures
are readable and stable; warm orbital frames retain the existing 16.7 ms target
on the reference setup. Record cold-preparation time and cache memory separately.

Suggested commit: `Verify and document planetary city visuals`.

## 7. Verification Matrix

- Generation: same inputs yield the same sites across scan order, colony renaming,
  preparation order, worker completion order and regeneration. Existing terrain,
  materials, liquids, deposits and later shared-PRNG outputs do not change.
- Placement: centres and occupied ground remain dry; candidates are bounded;
  islands, no-valid-land fixtures, longitude seams and latitude limits behave safely.
- Lighting: noon, crescent, terminator and night views; airless, thin and thick
  atmospheres; differently coloured and unequal-intensity stellar sources.
- Rendering: emission is not counted per star, coverage is not applied twice,
  small lights survive filtering, and rotation does not cause shimmer or popping.
- Consistency: globe, landing map and regional terrain refer to the same sites;
  uninhabited and depot-only worlds have no accidental cities.
- Layering: cities never obscure the ship, rover, resources, scan cursor, HUD,
  planetary dossier or other modal. No streaks remain after movement or resizing.
- Regression: existing uninhabited surface and orbital signatures remain unchanged;
  update only fixtures whose city-bearing appearance intentionally changes.
- Performance: no procedural layout, hashing, colour parsing or new optical
  integration in a per-frame pixel loop; caches remain bounded as bodies change.

Use `npm run test:planetary`, `npm run test:rendering`, `npm run test:surface`
and focused worker/navigation tests, followed by `npm run check`. Extend
`tools/orbit-surface-preview.html`, `tools/orbit-lighting-preview.html` and
`scripts/capture_orbit_surfaces.cjs` where needed for reproducible city captures.
Browser checks must inspect pixels, glyph priorities and real layer clearing,
not merely successful model construction.

## 8. Implementation Order And Deferred Features

Start with M0 and M1 together, then review M2 as the first visible milestone.
Orbital emission is the most sensitive integration, so verify it before adding
map and surface presentation. M3-M4 complete the shared visual feature; M5 is
the release gate. Keep each milestone independently reviewable and commit it
with its focused coverage, without unrelated refactors.

Later versions can add named districts, a dedicated local city view, service
access, settlement-specific missions, industrial identity and player-deployed
surface installations. Stable site IDs and shared coordinates provide useful
foundations, but do not create those systems or persist speculative simulation
state in this decorative first version.
