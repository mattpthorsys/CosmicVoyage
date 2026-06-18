# Determinism And Generation

## Core Rule

Given the same game seed, coordinates, stable entity identity, and physical
inputs, generated output must be identical.

Generation must not depend on:

- render frame count;
- `performance.now()` or `Date.now()`;
- scan order;
- menu navigation;
- test execution order;
- async worker completion order;
- mutation of a shared PRNG by unrelated features.

## Seed Derivation

Use `PRNG.seedNew()` with descriptive stable labels:

```ts
const planetPrng = systemPrng.seedNew(`planet_${planetName}`);
const sitePrng = planetPrng.seedNew(`mine_${x}_${y}`);
```

Seed labels are persisted behavior. Renaming or reordering seed derivations can
change the universe and requires deliberate regression updates.

## Generation Stages

```text
seed + world coordinates
  -> SystemDataGenerator map properties
  -> stellar architecture and environment
  -> SolarSystem body generation
  -> Planet characteristics
  -> atmosphere / temperature / resources
  -> surface request
  -> sync or worker surface provider
```

Keep physical calculations deterministic and independent. Prefer passing
explicit generated characteristics into entities instead of allowing
constructors to consume shared random state unpredictably.

## Workers

Worker-backed and synchronous providers must accept serializable request
objects and return equivalent results:

- surface generation;
- nebula colour generation;
- hyperspace survey cells.

Do not send class instances or functions through worker messages. Keep request
and response contracts explicit.

## Caches

Caches may improve performance but must not alter results.

- Cache keys must include every input affecting output.
- Eviction order may affect performance only.
- Resize-related render caches should be cleared explicitly.
- Do not cache mutable references when callers can change them.

## Surface Generation

Planet surface data includes:

- heightmap;
- height-level colours;
- RGB palette;
- resource/deposit map;
- liquid overlay.

Avoid triggering expensive generation from innocent property reads. The
long-term direction is explicit preparation followed by side-effect-free
access.

## Testing Determinism

Use fingerprints containing stable, meaningful outputs rather than object
identity. Test that:

- repeated generation matches;
- scan/runtime order does not change surfaces;
- worker and synchronous generation match;
- representative types remain physically plausible;
- intentional generation changes update expectations explicitly.
