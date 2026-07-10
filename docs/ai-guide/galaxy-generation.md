# Milky Way Generation And Human Space

## Scope And Coordinate Model

Generation version 2 treats the navigable map as a top-down projection of the
Milky Way. It is not a hidden three-dimensional simulation.

- One world cell is 3.26 light-years, approximately one parsec.
- World `(0, 0)` is the Solar neighbourhood.
- Positive world X points toward the Galactic centre.
- Positive world Y follows the adopted direction of Galactic rotation.
- The Solar galactocentric radius is 8.2 kpc.
- The analytical main disk radius is 16 kpc.
- Surface-density functions are vertically integrated because player travel is
  two-dimensional.

Do not add a fake Z value to distance calculations. True three-dimensional
navigation would require a deliberate location, movement, fuel, UI, worker,
and save redesign.

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
- logarithmic major arms and the Local Spur;
- radial density and metallicity gradients;
- arm-correlated gas and dust;
- deterministic open and globular cluster ownership sectors;
- the inhabited and automated-logistics distance envelopes.

`src/generation/system_data_generator.ts` consumes that context. Renderers and
gameplay code must not duplicate Galactic formulas.

## Macro Structure And Micro Detail

The Milky Way's macro structure is fixed so every game remains recognizably the
Milky Way. The game seed controls fine structure, cluster ownership, individual
systems, and noise. All seed labels include the generation version.

Spiral arms strongly affect gas, dust, young massive stars, and open clusters.
They only modestly increase total stellar density because old populations have
orbited and mixed through the disk. Do not turn arms into solid stripes of all
star types.

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
and nearest-neighbour scaling used by orbital planets.

Keep the map restrained: logarithmic brightness, amber/white old stellar light,
subtle cooler arm gas, dark dust, and a high-contrast crosshair. Do not reveal
undiscovered station locations on the whole-Galaxy view.

## Persistence And Migration

Save schema version 6 records `generationVersion` and system slots. Version 5
and older saves migrate into generation version 2 with slot zero. If a legacy
save was inside any generated local location, restoration preserves player,
ship, crew, cargo, credits, completed-contract history, and economic assets
while relocating the vessel to hyperspace at the same world coordinate.
Generated-body mutations, local catalogue records, station-market state, and
active contracts are retired because their old coordinate identities could
silently alias unrelated generation-two systems. Generated identity is stable
only within a generation version; changing Galactic formulas or seed labels
requires a deliberate model-version migration and deterministic fixture
updates.

Stations also carry coordinate-derived IDs. Saves, markets, shipyards, crew
rosters, and mission hand-in checks use those IDs rather than display names,
which may recur elsewhere in a Galaxy-sized world.

## Required Tests

Changes to this domain should cover:

- coordinate transforms and Solar radius;
- inner/local/outer density and metallicity relationships;
- class distributions and massive-star rarity;
- order independence and cache rebuilding;
- dense-cell slot identities;
- human and depot hard cutoffs;
- Solar-analogue habitable-zone bounds;
- host rejection and binary stability;
- complete-starbase colony and breathable-atmosphere invariant;
- depot capability restrictions;
- Galaxy map pan, zoom, and recenter controls;
- performance paths that avoid planet terrain and Galaxy enumeration.

## Scientific Anchors

The implementation is a game-scale approximation. Use these sources when
retuning it rather than relying on visual intuition:

- McMillan (2017), Milky Way mass model and Solar radius:
  <https://arxiv.org/abs/1608.00971>
- Reid et al. (2019), maser-based spiral structure:
  <https://openaccess.inaf.it/entities/publication/534c53c1-19b2-482e-8792-544dea133d91>
- Hayden et al. (2015), APOGEE disk metallicity structure:
  <https://arxiv.org/abs/1503.02110>
- Kopparapu et al. (2013), temperature-dependent habitable zones:
  <https://arxiv.org/abs/1301.6674>
- Holman and Wiegert (1999), planetary stability in binary systems:
  <https://physics.uwo.ca/~pwiegert/papers/1999AJ.117.621.pdf>
