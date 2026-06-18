# Testing Guide

## Test Structure

Tests under `src/tests` mirror gameplay domains:

- `core/interface`
- `core/navigation`
- `core/people`
- `core/ship`
- `core/surface`
- `entities/planetary`
- `entities/stellar`
- `generation`
- `rendering`
- `systems`
- `utils`

## Test Strategy

Prefer, in order:

1. Pure-function unit tests.
2. Direct controller, service, system, or model-builder tests.
3. Entity and deterministic-generation tests.
4. Rendering buffer/signature regression tests.
5. Partial `Game` harnesses only while legacy orchestration remains unextracted.

Do not use `any` merely to reach private implementation. Extract a focused
component or test observable behavior when practical.

## Required Coverage

For gameplay changes, test:

- success;
- expected refusal/failure;
- boundary quantities and empty collections;
- state mutation;
- emitted effect/result payloads;
- determinism where generation is involved.

For UI controllers, test:

- selection clamping;
- scroll offsets;
- section or mode transitions;
- cancel behavior;
- small visible-row counts;
- prepared screen model.

For rendering, test:

- representative visual signatures;
- deterministic output;
- clipping and dimensions;
- colour/glyph distribution where exact snapshots are too brittle.

## Commands

```bash
npm run test:surface
npm run test:ship
npm run test:navigation
npm run test:interface
npm run test:people
npm run test:entities
npm run test:planetary
npm run test:stellar
npm run test:generation
npm run test:systems
npm run test:rendering
npm run test:utils
npm run test:run
```

Full completion gate:

```bash
npm run check
```

## Deterministic Fixtures

Use fixed descriptive seeds in tests. Avoid current time and uncontrolled
randomness. Fingerprints should include values that represent behavior rather
than incidental object layout.

## Test Comments

Test helper functions are subject to the project commenting standard. Document
non-trivial harness setup and explain unusual fixtures or physical assumptions.
