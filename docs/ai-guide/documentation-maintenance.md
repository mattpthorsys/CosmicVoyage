# Documentation Maintenance

## When To Update This Guide

Update the relevant files in this directory when changing:

- module ownership or dependency direction;
- game states or transitions;
- input actions or controls;
- event payloads;
- generation seeds or worker contracts;
- rendering pipeline or visual tokens;
- test commands or completion criteria;
- code-commenting conventions;
- game-design principles.

## Writing Documentation

- Describe current behavior, not patch history.
- Link to source paths rather than copying large code sections.
- State invariants and ownership explicitly.
- Include units and deterministic constraints.
- Keep examples short and compile-like.
- Avoid promises about unfinished features.

## Preventing Drift

During review, compare:

1. `README.md` for product and setup.
2. `ARCHITECTURE.md` for the high-level chart.
3. `STYLE_GUIDE.md` for expanded visual detail.
4. `docs/ai-guide` for operational development rules.

If they conflict, update all affected summaries in the same commit.

## AI Context Budget

Do not load every document for every task. Start with
[`README.md`](README.md), then follow the task routing table. This keeps context
focused while retaining a single discoverable documentation directory.
