# Test Groups

Tests live under `src/tests` so focused work can run only the relevant domain.

- `core/surface`: planetary surface movement, scan cursor, rover surface interactions.
- `core/ship`: ship operations, terrain vehicle ship menu, ship-as-place panels.
- `core/navigation`: action availability, target/orbit UI, state transitions, scan formatting.
- `core/interface`: reusable UI controls, input handling, help, escape handling, render signatures.
- `core/people`: player, crew, missions, and notice board logic.
- `entities/planetary`: planet physics, temperature, scans, orbits, moons.
- `entities/stellar`: starbase and stellar environment models.
- `generation`: deterministic map/system/noise generation.
- `systems`: cargo and mining behavior.
- `rendering`: buffer, drawing, overlays, nebulae, starfields, visual regressions.
- `utils`: deterministic utilities and distance formatting.

Useful commands:

```bash
npm run test:surface
npm run test:ship
npm run test:navigation
npm run test:planetary
npm run test:rendering
npm run test:run
```

The Vitest setup lowers game logging to errors during tests so generation-heavy suites do not bury failures in routine simulation output.
