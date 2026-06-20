# Cosmic Voyage AI Development Guide

This directory is the central technical guide for AI agents and human
contributors changing Cosmic Voyage. Read this file first, then load only the
documents relevant to the task.

## Required Reading By Task

| Task | Read |
| --- | --- |
| Any code change | [project-overview.md](project-overview.md), [code-style.md](code-style.md), [change-workflow.md](change-workflow.md) |
| Core gameplay or state | [architecture.md](architecture.md), [gameplay-and-state.md](gameplay-and-state.md) |
| Procedural generation | [determinism-and-generation.md](determinism-and-generation.md), [testing.md](testing.md) |
| Rendering or UI | [rendering-and-ui.md](rendering-and-ui.md), [visual-style.md](visual-style.md) |
| Game design or content | [game-design.md](game-design.md), [visual-style.md](visual-style.md) |
| Tests or regression fixes | [testing.md](testing.md), [change-workflow.md](change-workflow.md) |
| Finding code ownership | [code-map.md](code-map.md) |

## Non-Negotiable Rules

1. Preserve deterministic generation. The same seed and stable inputs must
   produce the same world regardless of render timing, scan order, or menu use.
2. Every function and method must have a nearby documentation comment that
   describes what it does. Add or improve these comments whenever a function is
   created or modified.
3. Difficult logic must also contain inline comments explaining invariants,
   non-obvious formulas, ordering constraints, or reasons for unusual code.
4. Comments must explain purpose and reasoning. Do not narrate obvious syntax.
5. Renderers draw prepared models; they should not decide gameplay outcomes.
6. New feature logic should live in focused controllers, services, systems, or
   model builders rather than making `Game` larger.
7. Use typed commands, events, and discriminated unions instead of arbitrary
   strings or `any`.
8. Add focused tests for changed behavior and run `npm run check` before
   considering broad work complete.
9. Preserve the sparse CGA terminal visual identity and scientific tone.
10. Do not silently change generated-world outputs. Treat those changes as
    migrations and update deterministic fingerprints intentionally.
11. Treat darkness, empty space, restrained motion, and gradual revelation as
    deliberate parts of the game's mood rather than gaps to fill.
12. Astronomical credibility is part of the visual style. Calculate projection,
    phases, lighting, occultation, and motion instead of arranging them by eye.

## Source Of Truth

The code is authoritative when documentation and implementation disagree.
Update this guide in the same change whenever architecture, ownership, commands,
visual conventions, or verification steps change.

The older root documents remain useful summaries:

- [`README.md`](../../README.md)
- [`ARCHITECTURE.md`](../../ARCHITECTURE.md)
- [`STYLE_GUIDE.md`](../../STYLE_GUIDE.md)
- [`src/tests/README.md`](../../src/tests/README.md)

This directory should be treated as the consolidated operational guide.
