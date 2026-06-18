# Rendering And UI

## Rendering Pipeline

```text
Game and feature controllers
  -> readonly UI and SceneViewModel data
  -> RendererFacade
  -> SceneRenderer
  -> ScreenBuffer
  -> Canvas
```

DOM status and command bars are updated separately through typed events.
Terminal and astrometric overlays draw directly on canvas after the main buffer.

## Scene Models

`SceneViewModel` is a discriminated union:

- `hyperspace`
- `system`
- `orbit`
- `surface`
- `starbase`

Create immutable player snapshots with `createPlayerViewSnapshot`. Do not pass
the mutable `Player` into new scene render paths.

## Screen Buffer

Use:

- `drawChar` and `drawString` for normal cells;
- `drawScaledChar` only for deliberate sub-cell detail;
- `renderDiff` when direct overlays do not require a full repaint;
- `renderFull` after resize or when direct canvas layers could leave artifacts.

Keep all coordinates in grid cells until direct-canvas overlay rendering.

## UI Models

Prepare menus and tables in `src/core`:

- table rows contain display cells, detail text, disabled state, and tones;
- controllers own selection and scroll offsets;
- renderers clip and draw models but do not perform business actions.

Every active action should be discoverable in one of:

- command strip;
- table footer;
- help reference;
- contextual terminal message.

## Overlays

Terminal overlay:

- short scan and contextual messages;
- typing and fade animation;
- marker tags for semantic colour.

Astrometric overlay:

- temporary target diagnostics;
- low-alpha thin-font labels;
- direct target lines and markers.

Because both draw directly onto canvas, changes to skip/full repaint logic need
render regression tests.

## Animation And Time

Animation may use frame time for presentation only. Generated-world output and
gameplay outcomes must not use render timing.

Accepted presentation timing includes:

- cursor blink;
- popup opening;
- typed terminal messages;
- orbital rotation display;
- astrometric fade;
- subtle command emphasis.

## Rendering Changes Checklist

1. Build or update a readonly model.
2. Keep gameplay decisions outside rendering.
3. Preserve grid alignment and clipping.
4. Check small canvas dimensions.
5. Update visual-regression signatures if appearance intentionally changes.
6. Run `npm run test:rendering` and then `npm run check`.
