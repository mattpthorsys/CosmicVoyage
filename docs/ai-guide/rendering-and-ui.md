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

The game canvas has three ordered layers:

- the main terminal-cell canvas;
- the transparent orbital sub-cell raster canvas;
- the transparent HUD and terminal-overlay canvas.

Keep orbital mini-pixels on the raster canvas. Sending them through the main
canvas defeats differential cell rendering and causes a full repaint at the
animation rate.

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

Half-cell blocks are pooled, written into a reusable two-pixels-per-cell
`ImageData`, and composited once with nearest-neighbour scaling. Preserve this
batching path for dense planetary graphics; do not replace it with per-pixel
`fillRect` calls.

## Orbital Planet Rendering

Gas- and ice-giant weather is deterministic, body-fixed source data. Bake the
procedural bands, storms, and ribbons once through `GiantAtmosphereRenderer`,
then rotate by changing texture longitude and apply view lighting separately.
Nearby orbital bodies are prepared during the existing predictive surface
prefetch window and one giant texture is built per browser idle callback.

The globe projection cache contains screen-space samples and antialiased limb
coverage for each supported radius. The landing-map raster is also cached per
body and resolution. Invalidate projection caches after resize and rebuild a
landing map when its prepared heightmap identity changes.

Do not perform any of the following inside a per-frame planet-pixel loop:

- procedural weather generation or deterministic string hashing;
- palette parsing;
- atmosphere-composition sorting;
- sixteen complete texture samples for edge antialiasing;
- allocation of temporary coordinate arrays or interpolation closures.

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

Simulation delta remains capped after pauses, but orbital presentation uses the
uncapped monotonic frame delta. This prevents a machine rendering below ten FPS
from slowing the apparent physical rotation rate.

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

Use `F3` to inspect `PREP`, `CANVAS`, and `ORBIT RASTER` timings. Sustained
orbital frames should remain below the 16.7 ms budget required for 60 FPS.
