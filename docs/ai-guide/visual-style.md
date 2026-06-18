# Visual Style

## Identity

Cosmic Voyage should look like a practical CGA-era spacecraft instrument:
black space, square-grid typography, restrained signal colours, sparse motion,
and scientifically motivated astronomical texture.

## Typography

Primary:

```text
"PxPlus_IBM_CGA", "Courier New", Courier, monospace
```

Thin overlays:

```text
"PxPlus_IBM_CGAthin", "Courier New", Courier, monospace
```

Use uppercase instrument headings and short technical wording. Canvas layouts
must remain grid-first.

## Colour Roles

- Black: dominant background and empty space.
- Cyan: structure, focus, station identity, active panels.
- Green: terminal text, scan solutions, ordinary instrument output.
- Amber/gold: keys, resources, actionable attention, coordinates.
- Red: failure, danger, emergency, fatal conditions.
- Grey/dim teal: disabled or supporting structure.

Astronomical colours must follow physical type:

- stars by spectral class;
- planets by composition and atmosphere;
- nebulae by emission/reflection/dark/remnant class;
- gas and ice giants with horizontal banding and restrained storms.

Use semantic tokens from `text_palette.ts`, `CONFIG`, and `GLYPHS` before adding
new values.

## Glyph Language

- Box-drawing characters: operational panels.
- Solid and shaded blocks: physical surfaces and luminous bodies.
- Centered dot: faint stars.
- `*`: bright stars or explicit attention.
- `@` and directional glyphs: player vessel.
- `#`: starbase.

Do not introduce emoji, rounded modern icons, glossy cards, or website-like
components.

## Layout

- Travel views generally center the player.
- System views show bodies, restrained orbital traces, and compact targeting.
- Surface views use bounded terrain with supporting instrumentation.
- Orbit and starbase views are centered operational panels.
- Lists use headings, aligned columns, selection highlighting, detail lines,
  and text scrollbars.

Controls must remain visible through command strips or footers.

## Motion

Motion should communicate activity:

- scanning;
- typing;
- target focus;
- orbital rotation;
- alert state;
- panel opening.

Avoid decorative perpetual motion or bright saturated effects.

## Copy Tone

Prefer concise instrument language:

```text
ORBITAL BODY LOCK
SCAN SUMMARY
LOCAL MASS SIGNATURE: NIL
LANDING SOLUTION
SURVEY HOLD
```

Avoid marketing copy, jokes that break tone, or verbose tutorial paragraphs in
the playfield.

The root [`STYLE_GUIDE.md`](../../STYLE_GUIDE.md) contains additional palette
examples and remains compatible with this condensed operational guide.
