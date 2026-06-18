# Change Workflow

## Before Editing

1. Read the relevant files from this guide.
2. Inspect the current implementation and its tests.
3. Identify the state owner and dependency direction.
4. Check the working tree. Preserve unrelated user changes.
5. State the behavior and invariants that must remain stable.

## Choosing A Location

Put code in:

- a controller when it owns transient interaction state or navigation;
- a service when it implements cohesive business rules;
- a system when it mutates one gameplay subsystem;
- a model builder when it prepares readonly presentation data;
- an entity/generator when it defines generated-world rules;
- a renderer only when it draws prepared data.

Avoid adding more feature logic to `Game` or `SceneRenderer` if a focused module
can own it.

## Implementing

1. Make the smallest coherent behavior-preserving change.
2. Add function documentation comments for every created or touched function.
3. Add inline reasoning comments in difficult logic.
4. Keep generated seeds and ordering stable unless intentionally migrating.
5. Add focused tests before relying on broad regression suites.
6. Update this guide if ownership or conventions change.

## Verification

Run a focused suite while iterating:

```bash
npm run test:surface
npm run test:ship
npm run test:navigation
npm run test:interface
npm run test:people
npm run test:planetary
npm run test:generation
npm run test:systems
npm run test:rendering
```

Before committing broad work:

```bash
npm run check
git diff --check
git status --short
```

The Vite chunk-size warning is currently informational. New changes should not
materially increase the main bundle without justification.

## Commit Scope

- Commit one coherent stage at a time.
- Use an imperative subject that explains the architectural or behavioral
  outcome.
- Do not include generated `dist` files.
- Do not mix unrelated cleanup into feature changes.
- Mention deterministic output changes explicitly.

## Refactoring Existing Large Files

When extracting from `Game` or `SceneRenderer`:

1. Identify a cohesive feature with stable inputs and outputs.
2. Create direct tests for the new component.
3. Delegate from the old owner before deleting old logic.
4. Keep event publication and UI orchestration at the outer boundary.
5. Run all regression tests.
6. Remove compatibility aliases only after tests stop depending on them.
