# Cosmic Voyage Style Guide

Cosmic Voyage uses a minimal cosmic terminal style: black space, CGA-era glyphs, sparse colour, and instrument-like overlays. The interface should feel like a practical navigation computer rather than a decorative retro theme.

This guide is derived from the current rendering code in `src/config.ts`, `src/constants.ts`, and `src/rendering/`.

## Core Principles

- Preserve the black-space baseline. Most screens should start from `#000000` and use colour only to carry state, object identity, or physical texture.
- Treat the display as a character grid. Layouts are built from cells, boxes, tables, glyphs, and short readouts, not freeform panels.
- Keep the cosmic view restrained. Stars, nebulae, planets, and overlays should be legible but not loud.
- Prefer useful instrumentation over decoration. Every line, cursor, bracket, table, and marker should communicate something.
- Use motion sparingly. Typing, cursor blink, subtle overlay fade, orbital rotation, and starbase brackets are enough.
- Favour scientific plausibility. Colour and texture should suggest real astronomical phenomena before visual drama.

## Typography

Primary font:

```text
"PxPlus_IBM_CGA", "Courier New", Courier, monospace
```

Thin overlay font:

```text
"PxPlus_IBM_CGAthin", "Courier New", Courier, monospace
```

Rules:

- Use square cells. The renderer assumes `CHAR_ASPECT_RATIO: 1.0`.
- Keep typography compact. The base character size is `8px * CHAR_SCALE`.
- Use uppercase labels for instrument headings: `NAV TARGETS`, `SCAN SUMMARY`, `ORBITAL VIEW`.
- Use short technical wording. Prefer `RANGE 0.342 AU`, `SCAN PENDING`, `SURVEY HOLD` over prose-heavy UI copy.
- Avoid proportional UI text inside the canvas. DOM bars may use the same CGA font, but canvas views must remain grid-first.

## Glyph Language

Core glyphs come from `GLYPHS` in `src/constants.ts`.

```text
Box:          U+2500/U+2502/U+250C/U+2510/U+2514/U+2518
Solid block:  U+2588
Shades:       U+2591, U+2592, U+2593
Dim star:     U+00B7
Medium star:  U+2022
Bright star:  *
Player:       @, with directional ^ v < >
Orbit:        .
Starbase:     #
```

Rules:

- Use box drawing for operational panels and bounded readouts.
- Use shaded block glyphs for illuminated/physical surfaces, star discs, and atmospheric texture.
- Use the centered dot `U+00B7` for dim stars instead of a full stop.
- Use `*` only for bright stars or explicit attention points.
- Do not introduce emoji, pictograms, or rounded UI symbols. They break the instrument style.

## Colour System

### Foundation

```text
Space/background: #000000
Default foreground: #FFFFFF
Transparent: transparent
```

Black is the dominant colour. Every brighter colour should be rare enough to retain signal value.

### Instrument Cyan And Green

Primary station/system UI:

```text
Starbase cyan:      #00FFFF
Panel cyan:         #00C8FF
Heading cyan:       #8CFFFF
Readout mint:       #9FFFE0
Muted frame green:  #006A6A
Terminal green:     #00AA66
Highlight green:    #00FF66
Dim terminal green: #007755
Command bg:         #001010
```

Usage:

- Cyan marks structures, active panels, headings, station identity, selected tabs, and landing focus.
- Green marks terminal/instrument text, scan output, navigational solutions, and inactive operational text.
- Very dark cyan/green backgrounds are allowed for command strips and selected foreground contrast.

### Amber And Warning Colours

```text
Status amber:     #FFA500
Heading amber:    #FFC864
Highlight gold:   #FFD700
Alert yellow:     #FFD66B
Warning olive:    #A5A533
Emergency red:    #FF0033 / #DC143C
Disabled grey:    #506060
```

Usage:

- Amber/gold indicates actionable keys, footers, coordinates, credits, fuel, and cursor attention.
- Red is reserved for failure, emergency, or fatal render/update states.
- Disabled text should be visibly present but quiet.

### Astronomical Colours

Stars:

```text
O/B: blue-white
A/F/G: white to yellow-white
K/M: amber to orange
```

Nebulae:

```text
Emission:   muted deep red/brown
Reflection: muted blue/cyan
Dark cloud: near-black brown/grey
Planetary/remnant: restrained cyan/red shell hints
```

Planets:

```text
Molten:   black-red to orange/yellow
Rock:     greyscale mineral range
Oceanic:  deep blue to pale blue
Lunar:    greyscale regolith
GasGiant: browns, tans, creams
IceGiant: deep blue to pale cyan
Frozen:   pale cyan/white/grey
```

Rules:

- Keep nebulae faint and blended into black. They should read as distant structure, not a bright backdrop.
- Planet colours should match type and atmosphere. Do not recolour a body just to create contrast.
- Gas and ice giants should use horizontal band logic with mild turbulence and occasional storms.

## Layout

### Canvas Views

- The player is generally centered in travel views.
- Hyperspace fills the whole canvas with stars and sparse nebula colour.
- System travel uses a subtle dim starfield, orbital traces, visible bodies, and a compact target HUD.
- Surface travel uses a bounded viewport centered on the screen, with supporting HUD/legend information.
- Starbase and orbit screens are operational panels, centered in the terminal field.

### Panels

Panel style:

```text
Outer frame: dark background with cyan/teal border
Inner panel: no decorative fill beyond black/space
Heading: uppercase label placed into the border line
Separators: '-' or muted frame colour
Content: aligned columns, short rows, clipped text
Footer: controls/resources in amber or pale blue
```

Rules:

- Use clear rectangular boxes for modal operational surfaces.
- Keep panel width responsive but bounded. Current starbase width caps around 112 cells; orbit caps around 126.
- Do not nest decorative cards. Use boxes only when they represent a real instrument or table.
- Do not use rounded corners, shadows, or modern card styling.

### Tables And Lists

- Every list should have column headings.
- Active rows use dark text on bright green/cyan selection background.
- Inactive rows use terminal green or disabled grey.
- Scroll position should be represented with a right-side text scrollbar when rows exceed the visible area.
- Page Up and Page Down should move by the visible row count.
- Escape/Backspace should cancel or retreat from the current panel.

## Overlays

### Terminal Overlay

Terminal messages use the thin CGA font, green-on-transparent text, type-in animation, and fade-out.

Marker tags:

```text
<h>heading</h>
<hl>highlight</hl>
[-W-]warning</w>
<e>emergency</e>
```

Rules:

- Use terminal messages for scans, hints, and contextual ship-computer output.
- Keep messages short and scannable.
- Use the cursor only while text is actively typing.

### Astrometric Overlay

Astrometric overlays are dim, temporary, and diagnostic.

Rules:

- Use thin CGA font.
- Use subdued green/cyan text with low alpha and modest glow.
- Connect labels to targets with simple line segments and a `+` target mark.
- Starbase markers in hyperspace are dim blue-green parentheses around the star, not bright gameplay icons.
- Overlay content should never dominate the main scene.

## Motion And Timing

Accepted motion:

- Terminal type-in and fade.
- Popup open/close scale.
- Cursor blink for active alerts.
- Orbit sphere rotation.
- Astrometric line draw/fade.
- Dim starbase bracket oscillation.

Rules:

- Motion must communicate state or scanning activity.
- Avoid constant decorative animation in static panels.
- Keep blinking slow enough to attract attention without becoming irritating.

## Copy And Tone

Use concise technical language:

```text
HYPERSPATIAL CONTACT
ORBITAL BODY LOCK
SURFACE NAV SOLUTION
SCAN SUMMARY
LANDING SOLUTION
SURVEY HOLD
LOCAL MASS SIGNATURE: NIL
```

Rules:

- Prefer instrument nouns and measured values.
- Use uppercase labels for headings, mixed case for readable descriptions.
- Avoid jokes, modern UI marketing language, or verbose tutorials inside the playfield.
- Controls belong in command strips, footers, and help overlays.

## Implementation Rules

- Reuse `CONFIG` colours and `GLYPHS` before adding new visual tokens.
- Add new colours only when they have a clear semantic role.
- Keep new render code grid-aligned and deterministic.
- Test visual distribution when changing generated fields such as starfields, nebulae, or atmosphere rendering.
- Preserve full-canvas repainting when drawing direct canvas overlays, unless those overlays are moved into the cell buffer.
- Keep generated visuals physically plausible: star colour by spectral class, nebula colour by type, planet colour by type and atmosphere.

## Do Not Do

- Do not add glossy UI, rounded cards, gradients, or decorative modern HUD ornaments.
- Do not make nebulae bright, saturated, or poster-like.
- Do not use large hero typography or menu screens that feel like a website.
- Do not use colour as decoration when a glyph, label, or value would communicate better.
- Do not make controls invisible. Hotkeys are fine, but active controls must be shown in command strips, footers, or contextual help.
- Do not replace the CGA grid with arbitrary pixel art unless the whole renderer is being intentionally redesigned.
