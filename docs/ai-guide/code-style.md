# Code Style And Commenting Standard

## TypeScript Style

- Use strict TypeScript and preserve explicit domain types.
- Prefer `type` for unions and aliases; prefer `interface` for extensible object
  contracts.
- Use discriminated unions for state variants and operation results.
- Avoid `any`. Use `unknown` at untrusted boundaries and narrow it.
- Avoid unsafe assertions. If one is unavoidable, comment the invariant that
  makes it safe.
- Use `readonly` for immutable inputs and frame models.
- Use `const` unless reassignment is required.
- Prefer small pure functions for calculations and formatting.
- Keep side effects at application boundaries.
- Import constants from focused modules under `src/constants`.

## Mandatory Function Comments

Every function and method must have a nearby documentation comment describing
what it does. This includes:

- exported and non-exported functions;
- constructors;
- public, protected, and private methods;
- callbacks assigned as class fields when their purpose is not self-evident;
- worker message handlers;
- test helpers with non-trivial setup.

Use concise JSDoc-style comments immediately above the function:

```ts
/** Returns the maximum purchasable cargo after stock, space, and credit limits. */
function calculatePurchaseLimit(...): number {
  // ...
}
```

Document inputs, outputs, side effects, thrown errors, determinism requirements,
or units when those facts are not obvious from the signature.

When modifying an existing uncommented function, add or improve its
documentation as part of the same change. Existing undocumented functions are
technical debt, not precedent.

## Difficult-Code Comments

Non-obvious code must also contain inline comments close to the relevant logic.
Comment:

- why a formula or constant is used;
- coordinate units and wrapping behavior;
- deterministic seed derivation;
- required event or mutation ordering;
- cache invalidation;
- worker fallback behavior;
- rendering-layer constraints;
- scientific approximations;
- deliberate compatibility behavior.

Good:

```ts
// Derive the deposit seed from stable coordinates so extraction order cannot
// change the total yield available at another location.
const sitePrng = planet.systemPRNG.seedNew(`mine_${x}_${y}`);
```

Bad:

```ts
// Increment x.
x++;
```

Comments must describe current intent. Remove stale history such as “NEW,”
“FIXED,” “remains the same,” or notes copied from an earlier patch.

## Naming

- Classes and types: `PascalCase`.
- Functions, methods, variables: `camelCase`.
- Constants: use the convention of the containing module.
- Boolean names should read as predicates: `isReady`, `hasTarget`,
  `canPurchase`.
- Include units where ambiguity is dangerous: `radiusM`, `ageGyr`,
  `periodSeconds`.
- Use domain names rather than generic names such as `data`, `thing`, or
  `manager2`.

## Function Design

- A function should have one coherent responsibility.
- Prefer returning explicit result objects over mutating several unrelated
  owners.
- Separate calculation from publication or rendering.
- Avoid hidden expensive work in getters.
- Do not access DOM or canvas from domain services.
- Do not generate randomness inside rendering.
- Inject clocks, providers, or seeds when behavior must be testable.

## Error Handling

- Throw when an invariant is broken and the caller cannot continue safely.
- Return a typed failure/result when failure is an expected gameplay outcome.
- Include context in logs without exposing massive generated structures.
- Do not swallow worker or generation errors silently.
- Fatal frame-loop and rendering errors may stop the game after publishing a
  visible status.

## Formatting And Lint

The repository uses ESLint and TypeScript, not an automated formatter. Match the
surrounding style and keep diffs focused.

Before completion:

```bash
npm run lint
npm run typecheck
```
