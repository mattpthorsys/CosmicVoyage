# Observatory And Distant Survey

## Playing

`F` opens the full-screen Observatory. It is also available from the interstellar
command bar and Ship Operations. Without equipment the navigation catalogue still
lists nearby detectable stars; planetary spectroscopy requires a paid refit.

Buy an Observatory Suite in an inhabited starbase's Shipyard. Class I costs
3,600 Cr, Class II 9,200 Cr, and Class III 19,800 Cr. The initial installation
uses one free special-purpose bay. Later classes replace it without consuming
another bay. The existing Survey Suite and biological stasis remain independent.

| Instrument | Catalogue Search | Atmospheric Reach | Stellar Detection Gain |
| ---------- | ---------------- | ----------------- | ---------------------- |
| Unfitted   | 36 ly            | none              | baseline               |
| Class I    | 60 ly            | 24 ly             | 20 percent             |
| Class II   | 84 ly            | 40 ly             | 40 percent             |
| Class III  | 112 ly           | 60 ly             | 60 percent             |

These are nominal gameplay limits, not universal detection radii. Source brightness,
instrument damage, local interstellar-medium efficiency and angular separation
constrain observations. Travel retains its existing stellar colours and faint-object
fade effects; the extra range belongs to detection and the instrument catalogue.

- Up/Down selects contacts.
- Tab selects a filter group; Left/Right changes that group's filter.
- Signal, host and survey filters combine, rather than replacing one another.
- BIO SIGNALS includes both spectral candidates and catalogued native/managed biospheres;
  CATALOGUED BIO restricts the list to documented biospheres.
- S cycles range, scientific-interest and name sorting.
- PgUp/PgDn scrolls the selected scientific report without moving the target.
- V records a deliberate exposure, up to three integrations per observing setup.
- Enter marks the selected destination; C clears the destination.
- Esc or F returns to travel or the Operations menu that opened the instrument.

The text writes out quickly. The first key during that effect completes the text,
without also performing an action. Browsing pauses simulation. Each new deliberate
integration advances the game clock by five simulated minutes, with no real-time
waiting. Repeated completed integrations do not reroll the evidence or award rewards.

The plot retains matching stars' travel glyphs and colours, uses physically equal
horizontal and vertical scale, brackets the selected contact, and marks the ship
with `+`. Narrow terminals omit the plot and devote the screen to contacts and the
wrapped report. The travel telemetry displays the marked destination, its coordinates,
bearing and remaining projected distance. Marking never teleports or enters a system.

## Evidence And Exploration

Nearby targets receive bounded preliminary spectroscopy when the instrument opens.
Subsequent sweeps prioritize previously unmeasured contacts, so reopening progresses
through coverage instead of only repeating the same nearest targets. Registered facility
carriers are also eligible within catalogue reach, even beyond atmospheric reach.
Charted facility targets remain available around optically faint hosts; a chart entry
alone does not establish a carrier or a living biosphere without physical validation.
An installed suite also processes at most two nearby visible stellar contacts between
travel frames, throttled to avoid making movement expensive. More distant or unsampled
contacts remain listed as unmeasured. Explicit observation can investigate them.

Biological results distinguish unmeasured, insufficient sensitivity, no diagnostic
signal, candidate, strong candidate and catalogued biosphere. None of the first five
states is a confirmed presence/absence verdict. Strong refers to corroborating evidence,
not a calibrated probability of life. Water alone is habitability context, not proof.

Atmospheric gas features come from the actual effective atmosphere. Surface reflectance
uses a modest producer-cover proxy derived from the same biosphere generator as surface
encounters. Mineral surfaces can mimic that feature. Thick atmospheres suppress the
surface contribution; gas-giant chemistry is not treated as a terrestrial biosignature.
Only light-powered producers contribute biological pigment coverage. Microbial-only
communities can supply that signature without atmospheric oxygen; chemical producers
do not automatically create an edge. Spectral strength never establishes community
complexity. See [Microbial Worlds](xenobiology-microbial-worlds.md).
Stellar output, close-in glare, companion contamination, distance and exposure affect
measurement quality. No unrelated distant-life roll is introduced.

Managed life is catalogued only when an actual colony-linked starbase documents a completed,
physically viable introduced biosphere. That registry knowledge is independent of which
world has the strongest spectrum, and does not require detecting a faint planetary spectrum.
The report identifies the documented world separately from any different resolved spectral
source. Terraforming without such registry evidence can still produce spectral candidates,
subject to normal sensitivity limits. Previously observed native/introduced biology imports its saved
surface provenance. Remote candidate readings do not reveal organisms, habitat coordinates,
species novelty or specimen value, and do not advance orbital/surface mission objectives.

Technology distinguishes registered human facility carriers, unidentified narrowband
sources, unmeasured contacts and nondetection. The existing rare `ancient-signal` sources
are presented as unidentified artificial-source candidates: their age, origin and
civilisation are not asserted. No additional alien-civilisation generator is implied.

## Architecture And Limits

- `observatory_types.ts`: capability limits, addresses, snapshots and import validation.
- `observatory_service.ts`: bounded worker batches, cache ownership, cancellation,
  physical-summary caching, passive processing and persistent evidence/destination.
- `observatory_measurements.ts`: deterministic physical evidence and interpretation.
- `observatory.ts`: combined filters, selection, scrolling and readonly screen model.
- `observatory_renderer.ts`: full-screen terminal and sparse local stellar plot.
- `Game`: input, save, clock, command-strip and feature-controller composition.

Searches are circular physical-radius queries independent of screen dimensions. Filters
apply before paging and do not secretly prune an unfiltered nearest-N catalogue. Worker
results and synchronous fallback use the same descriptors. Catalogue acquisition never
materializes planets; only selected/bounded observation targets materialize a physical
system, with a 48-system cache and no terrain preparation. Search and passive work are
cancelled when the interface closes or the game stops. Observations are capped at 4,096.

The optional `observatory` save section is additive to save version 17. Existing saves
without it start with an empty instrument record. Purchases persist in the ship's optional
`observatoryClass`, defaulting to zero. Imported record addresses, enums, finite values,
features, body paths and equipment classes are validated. Galaxy migration retires
incompatible instrument evidence along with other local discovery records.

Only system slot zero is listed: ordinary travel cannot yet enter other projected-cell
slots. Binary/triple classification uses the actual architecture and a simple angular
resolution threshold, not the number of unrelated stars projected into a cell.

This is an intentionally bounded instrument approximation, not synthetic spectral line
fitting, atmospheric retrieval, three-dimensional astrometry or an ecosystem simulation.
Cloud obscuration and producer cover are proxies; local ISM is not integrated along the
entire line of sight. Moon spectra use their planet's stellar separation and are not a
full planet/moon deblending model. Lookback labels use projected navigation distance;
the universe does not regenerate a historical civilisation state for each observation.

## Verification

Focused tests cover equipment/bay occupancy, physical consistency, distance/exposure,
combined filters, unknown versus nondetection, cancellation, saved evidence, formatting,
font roles and complete occlusion of prior graphics. `scripts/check_observatory_browser.cjs`
checks the production application through save import, keyboard and command-bar controls,
desktop/mobile screenshots, nonblank canvases, paused time, exposures, destinations and
save round-trip. Run the complete project checks as well to detect unrelated graphics,
input, shipyard and save regressions.

Implementation commits are deliberately separated from verification at the user's request;
the new tests and browser checks have not yet been run.
