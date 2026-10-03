# Xenobiology Expansion: Verification Handoff

Implementation is checkpointed in stages. Verification completed 2026-10-03.

## Verification Results

- Focused xenobiology and rendering coverage: 14 files, 120 tests passed.
- `npm run check`: documentation comments, formatting, lint, app and test
  typechecks, 108 test files / 716 tests, and production build all passed.
- Browser walkthrough passed with no console errors. It exercised the paused
  science log, desktop and narrow captures, live delivery, and analysis/tissue
  settlement. Captures are in `/tmp/cosmic-xenobiology`.
- Visual review confirmed the science log layers over the field and that both
  fonts load at desktop and narrow widths. The Vite build reports its main
  minified JavaScript chunk at 787.81 kB, above the 500 kB advisory threshold;
  the build succeeds.

The browser fixture completed live, analysis and tissue contributions and
verified the alternative contract fees and single settlement. This does not
replace a personal playthrough for expedition pacing or economy balance.

## Personal Playthrough

1. Use an unvisited habitat or start a new voyage. Saved fields retain their
   original actors and sizes. The starting colony, one cell east of the new
   voyage start, provides reliable managed life and scientific receiving staff.
2. Visit its Missions board. Accept the live reference, biochemical profile,
   and tissue reference when offered. `J` shows their coordinates and actual
   requirements. Different requests can target different habitats.
3. In orbit, select a contract in `J`, wait for the fast reveal or finish it
   with a key, then Enter selects its habitat. Enter again lands. Deploy the
   Terrain Vehicle and press `B` to investigate.
4. Use Tab to select contacts and `V` to observe. Compare small/typical/large
   individuals of the same species. `D` shows size and handling; `T` lets you
   compare dose predictions, and Escape cancels without firing.
5. For the profile request, use `A` within 25 m. For tissue, use `S` within
   7.5 m. For a live reference, stun a larger mobile organism if necessary,
   approach it, and collect through `O` Cargo. Basic stasis is still included.
6. Press `X`: browse species with Left/Right or Tab, scroll with Up/Down or
   Page Up/Page Down, change filters with `S`, and cycle recorded habitats
   with `B`. Verify the clock and creatures remain still while reading.
7. Return to orbit and use the science log's Enter to select a recorded return
   site. It must select a cursor, never land immediately or change systems.
8. Return to the issuing port. Deliver each request through Research or
   Missions. Analysis requires no cargo; tissue consumes one tissue container;
   live delivery consumes one live container. Verify the fees are 450/550/900
   Cr plus only remaining ordinary research value, and cannot be paid again.
9. Save/resume and check that origins, evidence, individual size, collected
   actors and completed requests persist. Try a narrower browser window to
   check wrapping, scrolling and modal layering.

Habitat availability follows the planet's actual numeric terrain. A world is
not guaranteed to have every habitat class. Compare water margins, broken
rock beside water, sheltered outcrops, open substrate and elevated substrate
where they exist. The science log never lists unencountered species.

## Automated Checks

Begin with the focused new/domain suites:

```bash
npx vitest --run src/tests/core/science_log.test.ts src/tests/core/mission_journal.test.ts src/tests/core/mission_journal_integration.test.ts src/tests/core/biological_contracts.test.ts src/tests/core/xenobiology_service.test.ts src/tests/core/xenobiology_ui.test.ts src/tests/core/xenobiology_integration.test.ts src/tests/core/interface/save_game.test.ts src/tests/generation/biosphere_generator.test.ts src/tests/generation/habitat.test.ts src/tests/systems/individual_variation.test.ts src/tests/systems/surface_encounter.test.ts src/tests/rendering/encounter_assets.test.ts src/tests/rendering/surface_encounter_renderer.test.ts
npm run check
```

Then run the real-font browser flow with the existing server. If port 5174
is no longer running, start Vite on an available port and update COSMIC_URL.

```bash
COSMIC_URL=http://127.0.0.1:5174/ PLAYWRIGHT_MODULE=/home/mpalmer/.cache/ms-playwright-go/1.57.0/package node scripts/check_xenobiology_browser.cjs
```

The script includes desktop/narrow science-log captures, paused time and
layering assertions, original live delivery, and analysis/tissue settlement
through real keys. Inspect captures under `/tmp/cosmic-xenobiology`, especially
`desktop-science-log.png`, `narrow-science-log.png`,
`science-log-analysis-and-tissue.png` and `research-alternative-contracts.png`.
Check for clipped text, sprite leakage, overlapping menu/footer text and
unreadable small contacts. Add size-class and new habitat captures if the
existing screenshots do not expose them adequately.

Fix failures in their actual owner. In particular, preserve unrelated visual
regressions, atomic refusal/transaction tests and source lifecycle validation.
New source size must agree with container size; species evidence stays
canonical. Version-12 storage migrates into version 13. A scan at another
colony cannot establish a requested site's detailed evidence. Ordinary sales
must still list zero-value specimens and must not complete acquisition requests.

Automated success does not establish long-session economy balance or whether
the expeditions are enjoyable.
