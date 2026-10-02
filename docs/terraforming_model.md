# Terraforming Model

Terraforming is a generated human settlement project on a suitable pre-existing
terrestrial body. The planet keeps its mass, gravity, orbit, spin, catalogue
identity, mineral inventory, and geological terrain. Managed air, water, climate,
and ecology are separate environmental properties.

## Suitability

Completed open-air colonies require a mature, long-lived main-sequence host,
Rock/Oceanic/Frozen/CarbonRich terrestrial geology, a stable orbit, 0.68-1.38 g,
and at least 6.5 km/s escape velocity. Partial projects allow 0.42-1.62 g but
still require at least 5 km/s escape velocity and use sealed settlements.
These gravity and escape cutoffs are conservative game screens, not universal
physical limits. Unstable, molten, stripped-giant, giant, and exotic ocean targets
are rejected. Rejection sampling and the constrained fallback use the same rules.

The conservative habitable-zone polynomial follows
[Kopparapu et al. (2014)](https://arxiv.org/abs/1404.5292) over its calibrated
2600-7200 K stellar range. Its cold outer edge can require a CO2-rich atmosphere;
it does not promise a breathable Earth-like climate. Completed colonies therefore
also require 0.8-1.15 Earth instellation across their orbital illumination bounds.
Binary and triple screens use conservative distance extrema, including stellar
eccentricity, rather than the initial view of the system. Independent extrema
can reject a viable configuration; this is not an N-body or climate simulation.

## Managed Climate And Air

The reference energy balance is
`sigma * Teffective^4 = S * (1 - BondAlbedo) / 4 + orbitalAssistance`.
For multiple stars, the reference flux is the midpoint of the conservative
illumination envelope, not a calculated orbital time average. Temperature ranges
also include excursions to both illumination bounds.
Greenhouse warming is calibrated to Earth's approximately 255 K effective and
288 K surface temperatures, as described by
[NASA's energy-budget account](https://science.nasa.gov/earth/earth-observatory/climate-and-earths-energy-budget/).
Its weak pressure/gravity scaling approximates atmospheric column mass. This
does not replace spectral transfer, clouds, circulation, or a carbon-cycle model.
Completed climates target 284-291 K, with albedo restricted to 0.2-0.4 and orbital
assistance limited to 40 W/m2 of globally averaged absorbed energy. Required
reflectors or shades and their radiative contribution are shown in the dossier.
Such planet-scale engineering is a speculative capability of the game's society.
Tidal locking increases potential day/night contrast; heat transport can occur
naturally through an atmosphere and oceans. Weak magnetic fields trigger escape
monitoring, not an assumption that an artificial magnetic shield is mandatory.

Partial climates follow incident energy and their developing atmosphere; cold
projects can retain frozen water. Their protected pioneer ecology does not imply
global vegetation. All gas fractions sum to 100%, including humidity tied to
temperature and saturation pressure. Dry targets explicitly require imported
water and buffer gases: available volatiles are a real limitation, as illustrated
by [NASA's Mars terraforming assessment](https://www.nasa.gov/news-release/mars-terraforming-not-possible-using-present-day-technology/).

Breathable completion requires a normalized mixture of supported gases, normoxic
inspired oxygen after airway humidification, oxygen below the enrichment/fire
screen, and CO2 below 0.004 bar. Unknown or toxic species fail the screen. The
oxygen/CO2 screening draws on
[NASA's human-system atmosphere guidance](https://www.nasa.gov/reference/6-0-natural-and-induced-environments-vol-2/);
it does not establish that every altitude, local climate, or trace exposure is safe.

## Surface Consistency

Managed water coverage is passed numerically to surface generation. Liquid
overlays require temperature above freezing and pressure sufficient to prevent
boiling. This mean-climate approximation does not resolve seasonal or equatorial
thawing. Only completed open ecosystems tint global coastal vegetation.
Applying a new profile invalidates environmental surface caches. Version checks
prevent a worker result from an older environment from overwriting the new one.
Terrain generation continues to use the natural atmospheric history, preserving
crater and landform identity when the managed environment changes.
