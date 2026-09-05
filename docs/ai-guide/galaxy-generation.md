# Milky Way Generation And Human Space

## Scope And Coordinate Model

Generation version 6 treats the navigable map as a top-down projection of the
Milky Way. It is not a hidden three-dimensional simulation.

- One world cell is one light-year.
- World `(0, 0)` is the Solar neighbourhood.
- Positive world X and screen-right follow the adopted direction of Galactic
  rotation.
- Decreasing world Y and screen-up point toward the Galactic centre. This is
  the game's two-dimensional "Galactic north" convention; positive world Y is
  outward from the centre.
- On the whole-Galaxy instrument, Sol is below the core at a galactocentric
  radius of 8.15 kpc.
- The analytical main disk radius is 16 kpc.
- Surface-density functions are vertically integrated because player travel is
  two-dimensional.

Do not add a fake Z value to distance calculations. True three-dimensional
navigation would require a deliberate location, movement, fuel, UI, worker,
and save redesign.

`HYPERSPACE_CELL_LIGHT_YEARS` at the top of `src/config.ts` is the one
authoritative cell-distance setting. Density uses the derived cell-area ratio;
movement fuel and repeat intervals use the inverse linear scale; sensor,
overlay, and compact-object radii use the linear scale; nebula and
interstellar-medium noise use its inverse.
Physical human-space radii remain expressed directly in light-years. Change the
cell-distance setting, not each derived value independently. A cell-scale change
alters generated addresses and therefore also requires a Galaxy model/save
migration.

## Generation Pipeline

```text
world coordinate and system slot
  -> MilkyWayModel GalacticCellContext
  -> system count and present-day stellar population
  -> stellar architecture and lightweight settlement disposition
  -> SolarSystem planets and moons
  -> habitability assessment and terraforming overlay
  -> starbase or automated depot
  -> surface generation only when explicitly prepared
```

`src/generation/milky_way_model.ts` owns the large-scale model:

- thin disk, thick disk, central bar/bulge, and stellar halo;
- parallax-fitted logarithmic arms, including the Local Arm;
- radial density and metallicity gradients;
- arm-correlated gas and dust;
- deterministic open and globular cluster ownership sectors;
- the inhabited and automated-logistics distance envelopes.

`src/generation/system_data_generator.ts` consumes that context. Renderers and
gameplay code must not duplicate Galactic formulas.

## Macro Structure And Micro Detail

The Milky Way's macro structure is fixed so every game remains recognizably the
Milky Way. Generation version 6 retains the Reid et al. maser-fit observed beta
ranges, kink radii, piecewise pitch angles, and widths for the major structures.
Norma is joined to the measured Outer structure on the preceding winding;
Scutum-Centaurus, Sagittarius-Carina, and Perseus receive bounded continuations;
and the Local Arm remains an isolated segment. Uncertain continuations taper at
declared endpoints. Never treat every angle differing by `2π` as another valid
copy of an observed fit: low local pitch angles then become false concentric
rings.

The four-arm field describes gas and young stars. A separate broad two-armed
old-stellar response leaves opposite ends of the central bar, reflecting the
weaker two-arm structure traced in infrared light. The central bar uses a
30.5-degree viewing angle and five-kiloparsec half-length based on red-clump
mapping. The game seed controls fine structure, disk-edge irregularity, cluster
ownership, individual systems, and gas/dust clumping. All seed labels include
the generation version.

Version 6 avalanches coordinate hashes before interpolation: unfinalized FNV
hashes of adjacent decimal coordinates previously created vertical streaks.
Cloud structure combines two rotated noise scales, with locally displaced gas
filaments, irregular star-forming complexes, and offset dust lanes inside the
measured arm envelopes. The smooth old population has only a modest arm excess;
its width is measured normal to the spiral, not along an azimuthal arc. Central
disk depletion is gradual, the bar/bulge dominates the centre, and the outer
disk fades over several kiloparsecs. These are approximations, not a claim to
know every cloud or the uncertain far-side arm structure.

Spiral arms strongly affect gas, dust, young massive stars, and open clusters.
Arm tracers are modulated into large complexes and gaps; they are not continuous
luminous or dark tubes. Arms only modestly increase total stellar density
because old populations have orbited and mixed through the disk. Do not turn
arms into solid stripes of all star types.

Metallicity depends on galactocentric radius, Galactic population, age, and
scatter. Do not restore the old age-only metallicity model.

## System Density And Addresses

System count is sampled as a Poisson process from local expected density. A
projected cell may expose up to
`GALACTIC_MAX_RESOLVED_SYSTEMS_PER_CELL` individually addressable systems:

```ts
interface SystemAddress {
  cellX: number;
  cellY: number;
  slot: number;
}
```

The current travel UI enters slot zero. Dense cells retain additional resolved
slots through `getResolvedSystemMapProperties`; excess stars are represented by
`unresolvedSystemCount` for statistics and future presentation. Save locations
and planet-mutation keys carry slot identity even while ordinary local cells
usually contain only slot zero.

Do not enumerate the Galaxy or generate every physical star. The game exposes
a deterministic representative catalogue while preserving relative density
and integrated brightness.

## Stellar Populations

Generation samples population, age, and metallicity before spectral class.
The present-day class distribution is dominated by M dwarfs, followed by K and
G stars. Short-lived O/B/A stars are only possible in appropriately young
populations and are enhanced near arm gas without becoming common.

Multiplicity is generated independently from stable address seeds. Human
settlements select naturally single architectures; generation must not change
an architecture after deciding that humans live there.

Brown dwarfs are a separate faint contact population and do not receive human
settlements or starbases.

## Habitability And Terraforming

`src/entities/habitability.ts` owns host suitability, conservative habitable
zones, binary stability, planetary assessment, and terraforming profiles.

Preferred complete-terraforming hosts are quiet G and K dwarfs. Late F and old
early M hosts are conditional. O, B, A, early F, young active M stars,
substellar objects, and unstable multiple-star orbits are excluded from major
open-air colonies.

Habitable zones use temperature-dependent effective stellar flux. Multiple
systems use approximate Holman-Wiegert stability limits. A planet assessment
also checks:

- terrestrial composition;
- orbit and incident flux;
- gravity and escape velocity;
- natural temperature engineering delta;
- tidal locking;
- magnetic shielding.

Terraforming is an overlay on a natural planet. It must never silently change
mass, radius, gravity, orbit, geology, resources, or the natural atmosphere.
Use `Planet.effectiveAtmosphere` and effective-temperature getters where
inhabited conditions should be displayed.

A complete profile has Earthlike pressure, nitrogen/oxygen ratios, safe oxygen
partial pressure, liquid water, a managed biosphere, and reasonable gravity.
A partial profile remains dependent on atmospheric processors, sealed
settlements, and climate engineering.

Both complete and partial terraforming candidates must orbit inside the
conservative habitable zone. Settlement generation first tests naturally
generated terrestrial worlds. If none is viable, `SolarSystem` makes bounded,
seeded candidate draws at the preferred habitable-zone distance; a complete
colony has a final constrained-but-physical terrestrial fallback. Do not assign
terraforming to an arbitrary existing planet merely because a station was
rolled.

Complete worlds carry 48-78 percent managed surface water. Partial projects
carry 18-52 percent, ensuring at least large connected lakes. Surface liquid
generation adds a muted green managed-biosphere band immediately above water
level, and all globe, landing-map, and surface render paths consume that same
coastal vegetation overlay. Keep it restrained and terrain-derived rather than
painting whole continents bright green.

Successful terraforming also replaces the procedural Roman-numeral display
name with a deterministic human colony name from
`src/constants/colony_names.ts`. `Planet.catalogueName` retains the original
physical designation, and index-based body paths remain the persistent
identity. `reserveColonyWorldName` selects without replacement inside one
stellar system, so future multi-colony systems cannot reuse a world name around
the same star. Names are assigned after physical generation and must never feed
back into terrain, atmosphere, or orbital seeds.

## Human-Space Envelope

The inhabited radii are three times the original design:

- core: 0-1,500 light-years;
- settled volume: 1,500-3,000 light-years;
- fading frontier: 3,000-4,500 light-years;
- no inhabited planets beyond 4,500 light-years;
- automated logistics begins thinning beyond roughly 3,300 light-years;
- no automated depot beyond 12,000 light-years.

These values live in `CONFIG` and are hard cutoffs after smooth probability
curves. Partial terraforming is proportionally more common toward the frontier.
Natural Galactic generation is independent of human presence.

Eligible systems in the human core apply
`CORE_SETTLEMENT_DENSITY_MULTIPLIER`, currently `5`, to complete and partial
settlement probabilities while preserving their relative mix. The final total
is capped below certainty. Settled and frontier regions retain their original
rates.

The cell one step east of the configured player start is a generation
invariant: a mature single G2V host, complete HZ colony, and major starbase.
Other cells at the same or smaller distance are cleared of stellar and
substellar contacts, making this the unique nearest star for every seed. Keep
the offset in `CONFIG`; do not reproduce these coordinates elsewhere.

## Stations

A station has a declared kind and capabilities:

- `starbase`: inhabited hub with trade, fuel, full repair, missions, crew,
  equipment, and shipyard access;
- `automated-depot`: uncrewed node with minimal stock, fuel, basic repair, and
  no missions, crew, or shipyard.

Station construction occurs after planets. The invariant is strict:

> A major starbase must reference a completed, breathable terraformed colony
> world in the same system.

Depots require no habitable planet. UI sections must be derived from station
capabilities, not merely hidden cosmetically after unsupported actions become
available.

## Galaxy Instrument

`G` opens the modal Galaxy map. Arrows pan, `+/-` zoom, `Home` recentres, and
`G` or `Esc` closes. It is an instrument, not a physical `GameState`, and it
pauses simulation while open.

The whole-Galaxy image samples `MilkyWayModel.sampleGalaxyField` directly. It
must never enumerate generated systems. `GalaxyMapRenderer` caches the static
colour raster by model version, viewport, zoom, and dimensions; the player
crosshair is drawn separately. Pixels use the shared two-pixels-per-cell raster
and nearest-neighbour scaling used by orbital planets. `spanPc` is the shorter
axis's scientific field; the renderer expands the other axis to the viewport
aspect ratio so parsecs per pixel stay equal in landscape and portrait.
Reserve a terminal row above the raster for the coreward marker: the detail
canvas composites over terminal glyphs regardless of their draw-call order.
Narrow views use complete compact labels rather than truncated full-width text.

Keep the map restrained: exposure-compressed brightness, warm-white old stellar light,
clumpy cool young-star structure, a warm barred core, interrupted offset dust
lanes, an irregular disk edge, and a high-contrast crosshair. Spiral structure
must read as bounded tracks and complexes rather than contour lines or a
photographic pinwheel invented from visual intuition. The player crosshair
begins below the core and the north marker points upward/coreward. Do not reveal
undiscovered station locations on the whole-Galaxy view.

The renderer mixes population light before wavelength-dependent dust absorption
and a shared exposure curve. It must not add independent arm-outline brightness,
count bar/bulge light twice, or quantize brightness into coarse steps. Empty
space has no light floor. The colour composite is illustrative, not calibrated
surface photometry. `tools/galaxy-preview.html` renders the actual pipeline with
`?seed=...&zoom=0..3`; inspect it alongside the raster fingerprint and directional
texture, clipping, cache, and population-colour tests when retuning the model.

The hyperspace backdrop additionally guarantees one small, authored reflection
wisp near the configured start (14 ly east and 6 ly coreward). It is an
exposure-enhanced navigation visualization, not a claim that a bright catalogued
nebula lies next to the Sun. Its size and position are in light-years, its
filaments are seeded, and it blends smoothly into the sparse procedural field.
It does not change the stellar population or introduce surface-travel effects.
Use `tools/galaxy-preview.html?mode=hyperspace` to inspect the starting scene;
`x` and `y` offset the camera in world cells. Dense reverse-order samples, real
scene shifts, and cache rebuilding must produce identical world colours.

Coordinate-hashed Perlin sampling deliberately skips rounded scalar-value
caching: it previously substituted whichever neighbouring fraction was sampled
first. Complete nebula colours remain cached by their renderer/provider; legacy
terrain noise retains its existing behaviour. Foreground stars and the ship
must preserve each cell's nebula background rather than clear holes through it.

The local automatic-navigation target table includes a `HAB` field. `COLONY`
means complete terraforming and `T-FORM` means an active partial project. Do not
infer this from planet colour or name; read `Planet.terraforming.stage`.

## Persistence And Migration

Save schema version 10 records generation version 6 identities. Version 9
generation-five saves retain their coordinates and assets but migrate because
the corrected density and noise change generated systems and clusters. Version 8
generation-four saves retain their one-light-year coordinates but migrate
because the arm environment and generation seeds changed. Version 7
generation-three saves also retain their coordinates while migrating colony,
settlement, and Galactic identities. Version 6 and older saves rotate and
rescale from the old
coreward-X/rotation-Y parsec grid onto the east-X/coreward-negative-Y
one-light-year grid. If a legacy save was inside any generated local location,
restoration preserves player,
ship, crew, cargo, credits, completed-contract history, and economic assets
while relocating the vessel to hyperspace at the same projected physical
location.
Generated-body mutations, local catalogue records, station-market state, and
active contracts are retired because their old coordinate identities could
silently alias unrelated current-generation systems. Generated identity is stable
only within a generation version; changing Galactic formulas or seed labels
requires a deliberate model-version migration and deterministic fixture
updates.

Stations also carry coordinate-derived IDs. Saves, markets, shipyards, crew
rosters, and mission hand-in checks use those IDs rather than display names,
which may recur elsewhere in a Galaxy-sized world.

## Required Tests

Changes to this domain should cover:

- coordinate transforms and Solar radius;
- one-light-year scaling relationships for density, fuel, sensing, and noise;
- inner/local/outer density and metallicity relationships;
- measured spiral-arm ridge fixtures, bounded radial crossing counts, and
  north/core orientation;
- class distributions and massive-star rarity;
- order independence and cache rebuilding;
- dense-cell slot identities;
- human and depot hard cutoffs;
- Solar-analogue habitable-zone bounds;
- host rejection and binary stability;
- complete-starbase colony and breathable-atmosphere invariant;
- complete and partial colony habitable-zone and surface-water invariants;
- managed coastal vegetation overlays;
- starting-hub uniqueness, stable host, colony, and starbase invariants;
- colony-name catalogue uniqueness and per-star reservation;
- core versus settled inhabited-world density;
- automatic-navigation terraforming markers;
- depot capability restrictions;
- Galaxy map pan, zoom, and recenter controls;
- performance paths that avoid planet terrain and Galaxy enumeration.

## Scientific Anchors

The implementation is a game-scale approximation. Use these sources when
retuning it rather than relying on visual intuition:

- Reid et al. (2019), maser-based spiral structure and Solar radius:
  <https://arxiv.org/abs/1910.03357>
- Wegg, Gerhard, and Portail (2015), long-bar angle and half-length:
  <https://arxiv.org/abs/1504.01401>
- Drimmel (2000), two dominant old-stellar arms versus four-arm dust structure:
  <https://arxiv.org/abs/astro-ph/0005241>
- Hayden et al. (2015), APOGEE disk metallicity structure:
  <https://arxiv.org/abs/1503.02110>
- Kopparapu et al. (2013), temperature-dependent habitable zones:
  <https://arxiv.org/abs/1301.6674>
- Holman and Wiegert (1999), planetary stability in binary systems:
  <https://physics.uwo.ca/~pwiegert/papers/1999AJ.117.621.pdf>
