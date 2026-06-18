# Project Overview

## Product

Cosmic Voyage is a browser-based TypeScript space-exploration game rendered as
a sparse CGA terminal. It combines deterministic procedural astronomy,
scientifically motivated generation, keyboard-first interaction, and
instrument-like text interfaces.

The player moves through five principal locations:

1. `hyperspace`: interstellar grid travel and long-range survey.
2. `system`: local travel among stars, planets, moons, and starbases.
3. `orbit`: body selection, scan review, and landing-site selection.
4. `planet`: surface travel, scanning, mining, rover operations, and launch.
5. `starbase`: trade, refueling, missions, shipyard work, crew, and notices.

## Technology

- TypeScript with strict type checking.
- Vite for development and production bundling.
- Vitest with `happy-dom` for tests.
- Canvas-based character-cell rendering.
- Web workers for surface generation, nebula colour sampling, and hyperspace
  survey work.
- `rot-js` as the only runtime dependency.

Preferred runtime versions are pinned in `package.json`:

- Node.js 20.5.1
- npm 9.8.0

## Product Priorities

When requirements compete, prefer:

1. Deterministic and correct behavior.
2. Clear keyboard interaction and discoverable controls.
3. Scientific plausibility.
4. Readable terminal presentation.
5. Performance sufficient for smooth browser play.
6. Additional visual richness.

## Current Architectural Direction

`Game` remains the runtime coordinator, but feature logic is being extracted
into focused components. Recent examples are:

- `StarbaseCommerceService`: starbase market and refueling rules.
- `StarbaseController`: starbase section, selection, scrolling, and screen
  composition.
- `InterfaceModeController`: mutually exclusive modal interface state.
- `SceneViewModel`: immutable per-frame rendering inputs.
- Typed `EventManager`: cross-component notifications with explicit payloads
  and reliable lifecycle disposal.

Continue this direction. Do not move extracted business logic back into
`Game`.

## Important Repository Commands

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm run test:run
npm run build
npm run check
```

`npm run check` is the normal completion gate. It runs lint, application and
test type checking, all tests, and the production build.
