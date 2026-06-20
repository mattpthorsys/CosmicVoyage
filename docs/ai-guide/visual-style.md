# Visual Style

## Identity

Cosmic Voyage should look like a practical CGA-era spacecraft instrument:
black space, square-grid typography, restrained signal colours, sparse motion,
and scientifically motivated astronomical texture.

The broader visual mood is deep, lonely space: an immense, ancient environment
seen through the instruments of one small but capable vessel. Darkness and
distance are active parts of the composition.

## Cinematic And Atmospheric Direction

### Slow revelation

Scenes should reveal themselves gradually. Use silhouettes, crescents, sparse
stars, faint optical effects, emerging terrain, and slow camera movement to let
the player discover the composition rather than presenting every element at
once.

Empty black space is intentional. A view does not need an object in every
region, and a menu does not need to explain every system before the player
begins.

### Title-screen identity

The title screen is a deliberate cinematic extension of the game rather than a
separate modern website interface.

- `COSMIC VOYAGE` appears as the dominant large title.
- Minimal, widely spaced options appear beneath it.
- Supporting save or option details appear on focus instead of cluttering the
  primary composition.
- The astronomical backdrop is a slowly rotating fixed celestial panorama.
- Dim amber optical bands, black space, restrained blue nebulae, stellar light,
  crescent worlds, and tasteful lens effects establish the mood.
- A complete camera rotation must remain smooth and continuous, without a
  visible loop discontinuity.

Late-1970s science-fiction cinematography may inform the restraint, darkness,
optical warmth, and gradual reveal, but the result must remain original rather
than reproduce a particular film or sequence.

### Astronomical credibility

Physical coherence is part of the visual style:

- bodies, stars, nebulae, and optical sources in one panorama must share a
  consistent projection;
- fixed distant objects do not drift independently as the camera rotates;
- planetary and lunar phases follow their angular relationship to the star;
- illuminated terrain faces the light source;
- bodies correctly occult stars and objects behind both their lit and unlit
  regions;
- moons associated with a giant should occupy a credible orbital plane;
- visually dramatic arrangements must remain geometrically defensible.

Do not guess phases or lighting because a particular crescent looks attractive.
Calculate the geometry, then compose within those constraints.

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

### Emotional colour language

- Amber suggests distant warmth, age, navigation, sparse human presence, and
  optical scattering.
- Cyan and green suggest reliable instrumentation, measured information, and
  operational competence.
- Blue suggests cold distant structure, especially restrained nebular haze and
  remote phenomena.
- Red indicates genuine danger, failure, or emergency only.
- White is reserved for rare intensity, direct stellar light, or critical
  focus.

Deep black remains dominant. Brightness carries meaning and should be rationed.

Astronomical colours must follow physical type:

- stars by spectral class;
- planets by composition and atmosphere;
- nebulae by emission/reflection/dark/remnant class;
- gas and ice giants with horizontal banding and restrained storms.

Use semantic tokens from `text_palette.ts`, `CONFIG`, and `GLYPHS` before adding
new values.

## Astronomical Surface Character

- Rocky bodies should show generated terrain, crater bowls and rims, troughs,
  maria, and mineral variation.
- Terrain relief should affect lighting through sun-dependent surface normals,
  not exist only as a painted light-and-dark texture.
- Gas giants should retain broad pixelated bands, restrained turbulence, and
  composition-appropriate colours.
- Nearby astronomical bodies in the same scene should use a coherent pixel
  scale and smoothing policy.
- Pixelation should look intentional and stable. Avoid sharp vector-like moons
  beside visibly pixelated planets.
- Surface detail must not introduce latitude, longitude, or diagonal striping
  unless the physical body type justifies it.

Actual displaced silhouettes are optional and should be used only when their
benefit survives the scene's pixel scale. Bump or terrain-normal lighting is
usually preferable for distant bodies.

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

### Cinematic motion language

- Camera movement is slow, smooth, continuous, and mechanically stable.
- Fixed distant celestial objects move across the screen only because the
  camera orientation changes.
- All fixed panorama layers use the same angular camera motion.
- Independent parallax, drift, popping, or unexplained disappearance is a
  rendering fault unless the object is physically moving.
- Bodies should glide through the viewport edge according to their angular
  radius rather than appearing when their centre crosses a culling boundary.
- Animation should imply scale and observation, not urgency or spectacle.

## Lighting And Optical Effects

Light should feel scarce. Black space is the baseline, while strong light is
reserved for stars, illuminated terrain, active controls, and important
signals.

- Planetary and lunar lighting follows a shared star direction.
- Crater rims, bowls, hills, and troughs may affect local illumination through
  terrain-normal lighting.
- Optical haze, sunbeams, and lens effects are translucent presentation layers,
  not physical objects in the celestial scene.
- Broad amber bands may overlay astronomical objects when representing lens
  scattering, but they must remain diffuse and restrained.
- Stellar haze should not wash out foreground optical bands or erase body
  detail.
- Lens flare should be tasteful, sparse, and tied to a visible bright source.
- Avoid large opaque glow fields, excessive bloom, and saturated flare chains.

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

## Information Restraint

- Preserve mystery on title and travel screens.
- Reveal contextual details on focus, selection, scan, or instrument request.
- Keep the primary composition readable and uncluttered.
- Put explanation in scans, discoveries, logs, and operational details rather
  than decorative blurbs.
- Do not expose background implementation concepts such as procedural seeds
  unless they have a meaningful player-facing purpose.

## Visual Anti-Patterns

Do not introduce:

- generic neon or synthwave space styling;
- dense, uniform star wallpaper;
- arbitrary planet phases or decorative astronomical arrangements;
- excessive bloom, lens flare, saturation, particles, or grain;
- modern glossy menus, rounded cards, gradients used as interface decoration,
  or website-like visual hierarchy;
- constant independent motion across multiple scene layers;
- visual busyness added solely to fill empty space;
- cinematic effects that conflict with physical lighting or the CGA instrument
  identity.

The root [`STYLE_GUIDE.md`](../../STYLE_GUIDE.md) contains additional palette
examples and remains compatible with this condensed operational guide.
