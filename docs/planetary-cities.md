# Planetary City Foundations

Status: M0 and M1 are implemented and verified. City rendering is not enabled.
Orbital lights are M2, and map/surface presentation is M3 in the
[implementation plan](plans/planetary-cities-first-version.md).

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
captures as the city-free visual baseline while implementing M2/M3.

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

The checks above are complete for M0/M1. M1 leaves the existing rendered globe,
landing map and terrain unchanged; city-bearing visuals are intentionally not
drawn yet. Keep these checks and baseline captures as regression gates for M2.
