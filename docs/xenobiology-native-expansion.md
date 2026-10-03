# Native Life And Comparative Expeditions

Implementation checkpoints and verification results for the four additions
authorised after mission highlighting.

## Checkpoints

1. Native families: implemented and verified. Native worlds generate
   three to five inherited structural groups with two habitat specialisations
   each. Introduced colony species retain their familiar definitions. Biology
   generation is version 2; existing stored actors and specimens are preserved.
2. Visual anatomy: implemented and verified. Native silhouettes inherit
   family pigment, limb arrangement, posture and structural ridges, with distinct
   movement poses and a prepared defensive pose. The existing six-by-four raster
   footprint and four-colour limit stay fixed. Dossiers show observed external
   anatomy without revealing ancestry before analysis.
3. Readable behaviour: implemented and verified. Threats use direct
   visibility, warn without injuring during the initiating action, and have
   bounded home ranges. Territorial organisms hold a visible display before
   defending, disengage when the rover withdraws, then return home. Benign
   contacts alternate resting/foraging; dossiers and sensors report visible
   activity. Reading still advances neither actors nor recovery timers.
4. Comparative expeditions: implemented and verified. Staffed stations
   can issue a small/large tissue pair and a two-habitat analysis pair using real
   available contacts or acquired site records. Delivery validates every
   contribution before consuming any cargo or paying once. The existing shared
   scientific-demand ledger still governs marginal value. Journal and science
   log show each outstanding contribution; `B` chooses distinct mission
   destinations. Save schema 14 migrates earlier stored fields/evidence/cargo.

Checkpoints: `28c5f12` native families, `64b1721` anatomy, `17bfaa9`
activity/defence, and `45f53c3` guaranteed native movement poses. The comparative
checkpoint contains its regression cases and browser walkthrough extension.
Verification fixes are recorded in the follow-up commit.

## Generation Policy

Occurrence, diversity, community weights and mass budgets are conservative
gameplay priors, not measured probabilities for alien life. The existing
liquid-water and landability gates still apply. Low-oxygen communities remain
small and non-predatory; oxygen supply, gravity and temperature constrain mobile
mass. Age does not automatically produce intelligent or increasingly complex
life. This does not simulate evolution or change atmospheric oxygen production.

Related forms share a covering, sensory plan, symmetry and external anatomy.
Species specialise by habitat; sparse fields sample suitable producers and
consumers using bounded abundance weights. Pigment and appendage details are
external appearance, not evidence of an inferred phylogeny. Names are display
labels; species, source and contribution identities remain authoritative.

## Verification Results

- `npm run check` passed documentation-comment checks, formatting, lint, app and
  test typechecks, all 112 test files / 754 tests, and the production build.
- Focused native/comparative regressions passed: 16 files / 131 tests.
- The real-font browser walkthrough passed without console errors. It verified
  partial-delivery refusal preserves cargo, complete paired delivery consumes
  both specimens and pays exactly once, and the habitat-pair journal selects
  the second landing site without landing immediately. The generated colony
  provided the contrasting habitat (`secondHabitatNavigation: true`).
- Desktop and narrow-width captures were visually reviewed. Completion state,
  small/large mass data, destination choice and the narrow journal layout
  remained readable; no modal leakage, stale destination pixels or sprite
  rendering regression was observed. Native family/anatomy variety is covered
  by generation and renderer tests, not by the managed-colony browser scene.
- Verification exposed a save-restore bug: active encounters were accepted only
  when their body ID ended in `/bio1`, rejecting valid version-2 snapshots.
  Save validation now accepts legacy version-1 and current biology IDs, with
  regression coverage for both and for rejecting a mismatched saved location.
- Production build succeeds. Vite reports the minified application bundle at
  approximately 810.48 kB, above its 500 kB advisory threshold.

The browser captures are in `/tmp/cosmic-xenobiology`, including
`comparative-partial-journal.png`, `comparative-complete-science-log.png`,
`comparative-second-habitat.png`, `narrow-comparative-journal.png` and
`comparative-study-settled.png`.

To repeat the focused regressions and full project gate:

```bash
./node_modules/.bin/vitest --run src/tests/generation/native_biosphere.test.ts src/tests/generation/biosphere_generator.test.ts src/tests/generation/habitat.test.ts src/tests/systems/organism_behaviour.test.ts src/tests/systems/surface_encounter.test.ts src/tests/systems/individual_variation.test.ts src/tests/rendering/encounter_assets.test.ts src/tests/rendering/surface_encounter_renderer.test.ts src/tests/core/comparative_biology.test.ts src/tests/core/biological_contracts.test.ts src/tests/core/biological_mission_guidance.test.ts src/tests/core/mission_progress.test.ts src/tests/core/mission_journal.test.ts src/tests/core/mission_journal_integration.test.ts src/tests/core/science_log.test.ts src/tests/core/interface/save_game.test.ts
npm run check
```

To repeat the real-font browser walkthrough, start Vite on an available port
and set `COSMIC_URL` accordingly. The successful run used:

```bash
COSMIC_URL=http://127.0.0.1:5175/ PLAYWRIGHT_MODULE=/home/mpalmer/.cache/ms-playwright-go/1.57.0/package node scripts/check_xenobiology_browser.cjs
```

The browser fixture uses a sessile contact for repeatable sampling in the
contract-delivery segment; species, field identity and cargo flow remain real.

## Personal Expedition

1. Use new/unvisited habitats for newly generated native families. Old visited
   fields keep their saved population. Native life remains occasional on suitable
   liquid-water worlds; the starting managed colony is reliable for learning.
2. At a staffed station accept **Comparative size reference** or
   **Comparative habitat profile** when offered. No suitable contacts means no
   offer; no population is manufactured to meet a contract.
3. Open `J` in orbit. For a habitat pair, `B` cycles the two destinations.
   `Enter` selects the chosen landing site; a later `Enter` lands normally.
4. In the local field, `V` confirms species identity. `D` shows size, anatomy,
   visible activity and requirement mismatches. Green `+` markers identify
   remaining contributions, not every vaguely similar creature.
5. For size comparison, approach within 7.5 m and use `S` on a SMALL and a LARGE
   individual of the same requested species at the advertised habitat. Each
   tissue sample needs at least 60% quality; neither requires stasis. These are
   relative sizes, not necessarily juvenile/adult stages.
6. For habitat comparison, use `A` within 25 m at each advertised habitat.
   Detailed analysis elsewhere cannot supply the missing site packet. `X`
   compares the acquired contributions and reports what remains outstanding.
7. Read the defensive posture and withdraw from home territory to disengage.
   Reading menus does not advance attacks, movement or recovery.
8. Return to the issuer's **Research** or READY **Missions** entry. Deliver the
   whole pair once: 1,000 Cr for tissue comparison or 1,100 Cr for habitat
   comparison, plus only remaining ordinary research value. Attempting partial
   delivery removes nothing. Ordinary Sell does not fulfil either contract.

Verification is complete. Personal playtesting is still useful for expedition
pacing and reward balance, which automated checks cannot establish.
