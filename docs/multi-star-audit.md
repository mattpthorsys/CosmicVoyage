# Multi-Star Scientific and Gameplay Audit

Date: 2026-09-27. Scope: stellar architecture, generated planets/moons,
habitability, live orbits, navigation/rendering, and save identities.

Status: source audit and implementation complete. Full verification passed on
2026-09-27 (459 tests, all 81 test files). The earlier orbital-controller
refactor was verified separately (446 tests, commit `d6f639a`).

## Findings Addressed

| Priority | Finding                                                                                                                                                                  | Correction                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High     | Runtime stars aliased the cached generation descriptor. Visiting/updating a system changed the input for subsequent construction.                                        | Clone the architecture, stars, environments and orbital records at the materialization boundary.                                                                           |
| High     | In triples, C orbited the origin while the AB centre stayed fixed. Total centre of mass drifted and actual outer separation disagreed with the period.                   | Translate both inner stars by the mass-weighted outer reflex motion. AB planets follow the live inner barycentre.                                                          |
| High     | Generation and habitability disagreed on stability; the latter assumed eccentricity 0.2 even though motion is circular, and applied the inner binary to C-hosted worlds. | One host-aware circular stability screen, including the outer companion. Do not manufacture a fallback planet when no supported primary region exists.                     |
| Medium   | Moon Hill radii around AB planets used A's mass alone.                                                                                                                   | Use the same combined host mass as planetary orbital motion.                                                                                                               |
| Medium   | Depots moved about the origin using all three stellar masses, regardless of their region.                                                                                | Give stations explicit hosts, bound their initial radii and use host mass/centre for motion and orbit outlines.                                                            |
| Medium   | System boundaries used initial positions and missed the full excursion of companion systems.                                                                             | Bound host excursion plus planet and moon radii over all circular phases.                                                                                                  |
| Medium   | A single circular HZ was inferred from all luminosities and A's spectrum, even for planets orbiting C.                                                                   | Single-source radial HZ only; multi-source screening uses the actual distances and each spectrum independently. Host longevity/activity checks use the named stellar host. |
| Medium   | Companion selection could choose a more massive, shorter-lived type without checking the common age.                                                                     | Restrict companions to surviving coeval types no heavier than A.                                                                                                           |
| Medium   | Orbital descriptions called everything a primary-star orbit and added moon and parent radii.                                                                             | Name the actual host; label light time across the selected orbital radius, not a supposed signal path.                                                                     |
| Low      | Cached orbital screens also cached physical lighting inputs. Same-name bodies could reuse stale references.                                                              | Refresh sources each screen preparation and include object identity in static-cache reuse. Physical orbital time still pauses in this mode.                                |

## Physical Model

The supported model remains circular, coplanar Keplerian hierarchies, not
an N-body integrator. This is a practical approximation for detached,
well-separated systems; adding eccentricity or inclination needs actual
orbital elements and revised stability screening, not visual offsets.

For inner relative vector `r = B - A`, outer relative vector `R = C - AB`,
and masses `Mab = Ma + Mb`, `Mtot = Mab + Mc`:

```text
AB = -Mc / Mtot * R
C  =  Mab / Mtot * R
A  = AB - Mb / Mab * r
B  = AB + Ma / Mab * r
```

The inner period uses `|r|` and `Mab`; the outer period uses `|R|` and
`Mtot`. These identities enforce a fixed total barycentre. With three equal
masses and a nominal 40 AU outer separation, the previous mapping placed C
26.67 AU from a fixed AB centre and displaced total COM by 8.89 AU.

Generation now keeps the stellar pair detached and imposes an outer/inner
separation ratio of at least ten. These are deliberately restricted generation
rules, not a claim that every real triple requires that ratio. The hierarchy
and its separate planetary regions follow the framework discussed by
[Verrier and Evans (2007)](https://arxiv.org/abs/0710.1167).

Stability screening uses the circular cases of the empirical S-type and P-type
[Holman-Wiegert limits](https://arxiv.org/abs/astro-ph/9809315), with a 10%
margin. Triple regions intersect the relevant inner/outer restrictions.
The fit's mass-ratio range is bounded; outside it an additional local Hill
restriction is applied. These choices are conservative heuristics, not a
long-term proof; resonances and planet-planet interactions are not integrated.

Moons retain the existing 0.32/0.42 Hill-radius generation fractions, now with
the correct host mass. Those are below the approximate circular prograde
single-star limit discussed by
[Domingos, Winter and Yokoyama (2006)](https://onlinelibrary.wiley.com/doi/10.1111/j.1365-2966.2006.11104.x),
but that restricted result does not certify arbitrary multi-star moon systems.

For habitable-zone screening, each star contributes
`(L / Lsun) / distance_AU^2 / Seff(temperature)` independently for the inner
and outer boundaries. The current position qualifies when the inner sum
is at most one and the outer sum at least one. This follows the need for
spectral weighting and individual distances described in
[Kaltenegger and Haghighipour's S-type study](https://arxiv.org/abs/1306.2889)
and [their P-type study](https://arxiv.org/abs/1306.2890).
The polynomial is not extrapolated beyond 2600-7200 K. An unsupported
spectrum fails this conservative screen; that is not proof of uninhabitability.

## Remaining Work, Ordered

1. **Simulation time and climate consistency.** `Game._updateSystem` advances
   physical orbits using zoom-dependent time acceleration; orbital/surface
   modes do not. The orbital camera has a separate visual cadence. Define a
   simulation-clock contract, then advance stars, bodies and observer together.
   Do not simply start moving bodies while leaving the landed ship behind.
   Generated atmospheres and temperatures currently use a formation snapshot;
   multi-star habitability is now position-correct but still instantaneous.
   Sample inner, outer and planetary phases for flux ranges/means before
   treating a world as continuously habitable. Add thermal inertia separately.
2. **Population realism.** O-M stars still share the same binary/triple
   probabilities, close-pair separations are narrowly sampled, and luminosity,
   age and substellar cooling are simplified. Real multiplicity is mass-dependent
   ([Duchene and Kraus, 2013](https://arxiv.org/abs/1303.3028)). Consolidate the
   duplicated multiplicity prediction/materialization rules before replacing
   them with a mass-conditioned distribution. Coeval filtering is only a guard,
   not a stellar-evolution track or realistic companion mass-ratio distribution.
3. **Illumination geometry.** Orbital sources are ranked by flux, making the
   brightest source the camera reference. Two similarly bright stars swapping
   order can rotate that reference abruptly. Use a persistent camera frame
   keyed by stable source IDs. Star-star eclipses are absent; atmospheric paths
   use physical per-source lighting, while airless terrain still has older
   display-oriented shading. Test unequal-colour sources and brightness swaps.
4. **Navigation and rendering.** Targets use current positions, but the target
   table should expose `A`, `B`, `AB`, `C`, and the system barycentre explicitly.
   Offer host-group filtering and host-relative framing without stealing
   existing left/right controls from menus. Draw all orbit traces before object
   glyphs: stellar glyphs can still be overwritten by a later trace. Moon
   visibility should not require its parent to be inside the viewport.
5. **Generation restrictions.** Local circumstellar generation still reserves
   only a few slots and requires a sufficiently wide companion (currently
   5 AU). This is a gameplay sampling policy, not a physical boundary. Wide A
   hosts are now eligible as well as B/C. Circumtriple orbits are supported by
   the screen but not populated as another planetary region. Model those
   regions deliberately rather than forcing every system to contain planets.

## Persistence

The user explicitly waived preservation of old generated world identities.
Galaxy generation is now version 7, which changes seeded systems throughout
the map, not just multiples. Save schema remains version 10. Generation-six
payloads are marked for the existing legacy-world restore path: portable ship
progress is retained, incompatible local surveys/markets/active contracts are
retired, and a vessel in local space is moved to hyperspace. Current-generation
orbital phases remain serializable using the existing star-angle records.

## Verification Results

New/extended tests cover descriptor isolation, repeatability, total COM,
inner/outer separations, moving hosts, station periods and outline centres,
system extents, moon Hill limits, impossible primary fallback regions,
host-specific stability, coeval companions, local spectral flux, lighting cache
refresh, moon readouts and generation-six migration.

The following completed successfully:

- Targeted regression suite: 152 tests across 18 files.
- Focused galaxy-map renderer regression: 12 tests.
- `npm run check`: function documentation, formatting, lint, app and test
  type-check, all 459 tests across 81 files, and production build.
- `git diff --check`.

The version-seven galaxy-map fingerprint was reviewed and updated to the
observed 6,208-pixel raster (`3605118430` hash); its focused test and the full
suite pass. The production build succeeds with Vite's existing warning that
the main JavaScript chunk exceeds 500 kB.

Manual browser inspection was not performed. Before treating the visual result
as fully reviewed, open a generated triple at both system zoom levels, inspect
an orbital view with two visible suns, and exercise depot approaches and
save/load in single and triple systems. Automated geometry, lighting, renderer,
and persistence regressions pass; these checks cover interactive presentation
that the unit harness cannot establish.
