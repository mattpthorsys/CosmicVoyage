# Game Design Principles

## Experience Goal

The game should convey scale, isolation, scientific curiosity, and operation of
a small capable vessel in an indifferent universe. Progress comes through
navigation, observation, planning, resource management, and discovery rather
than constant combat.

## Mood And Emotional Direction

Cosmic Voyage depicts a small, capable vessel moving through an immense and
physically coherent universe. Its beauty comes from darkness, distance,
measured light, and gradual discovery.

### Deep, lonely space

Space should feel vast, quiet, ancient, and indifferent. Empty areas are
intentional composition rather than missing content. Do not fill every view
with stars, bodies, phenomena, messages, or activity merely to make it seem
busy.

Contacts and discoveries should be sufficiently rare that they retain meaning.
The player should feel prepared and capable, but never as though the universe
was arranged for their convenience.

### Slow revelation

Prefer gradual disclosure over immediate explanation. A scene may emerge
through camera movement, faint illumination, silhouette, instrument readings,
or a scan resolving over time.

Menus and title screens should suggest the nature of the world before
describing it. Contextual information may appear when an option or object is
focused, while the primary composition remains sparse.

### Industrial retro-futurism

The interface belongs to a serious working spacecraft. CGA typography,
technical labels, controls, and displays should feel functional, dependable,
and integrated into the vessel rather than applied as playful retro
decoration.

Prefer measured readouts, instrumentation, restrained effects, and concise
operational language. Avoid nostalgia for its own sake, novelty computer
language, or visual jokes that make the ship feel like a game interface rather
than a machine.

### Competence without comfort

The vessel and its instruments should communicate engineering competence.
Navigation solutions, scans, and controls are precise and useful. That
competence does not make space safe, familiar, or welcoming.

Tension should arise from distance, limited resources, uncertainty, physical
conditions, and the consequences of decisions rather than constant alarms or
manufactured urgency.

## Design Pillars

### Deterministic exploration

The world should feel persistent. Revisiting coordinates with the same seed
must reveal the same systems, bodies, resources, and local opportunities.

### Plausible science

Simplifications are acceptable, but rules should remain internally coherent and
recognizably connected to astronomy, geology, atmosphere, heat, gravity, and
orbital mechanics.

Scientific credibility is also part of the visual and emotional design.
Planetary phases, illumination, occultation, orbital relationships, terrain,
and astronomical scale should be calculated from coherent rules rather than
arranged solely for visual effect. Dramatic compositions are welcome when they
remain geometrically defensible.

### Instrument readability

The interface should expose enough information to make decisions without
turning into a dense spreadsheet. Important actions must be discoverable.

Information should arrive through the appropriate instrument, scan, menu
detail, or discovery. Avoid decorative exposition and large blocks of
unrequested explanation in the playfield.

### Quiet pacing

Use empty space, rare phenomena, subtle motion, and meaningful contacts. Do not
fill every cell with content or every moment with alerts.

Motion should imply enormous scale rather than speed. Slow continuous camera
movement, restrained orbital motion, scanning, and measured interface feedback
fit the game. Restless particles, arbitrary object drift, frequent blinking,
and perpetual decorative animation do not.

### Layered travel

Each spatial scale should feel distinct:

- hyperspace: strategic cell movement and uncertain contacts;
- system: measured approach and orbital relationships;
- orbit: body inspection and landing planning;
- surface: local terrain, fuel, cargo, and extraction;
- starbase: logistics and longer-term preparation.

## Adding Features

New features should answer:

1. Which spatial mode owns the interaction?
2. What information lets the player make a meaningful decision?
3. How is the action discovered?
4. What persistent state changes?
5. How is deterministic generation preserved?
6. Does the feature support the scientific and terminal tone?
7. Does it preserve mystery instead of explaining or displaying everything at
   once?
8. Is its motion, lighting, and composition physically motivated?

## Balance And Economy

Keep units explicit:

- cargo in cubic metres;
- distance in metres/AU/light-time or hyperspace cells;
- fuel in reactor units;
- credits as integer station currency;
- temperature in kelvin;
- gravity relative to Earth where shown.

Markets may vary deterministically by station identity. Resource availability
should reflect planetary type and stellar environment rather than arbitrary
loot rarity.

## Incomplete Features

The code includes deliberate placeholders for future repairs, storage, probes,
special-purpose bays, and equipment. Disabled rows should clearly say they are
offline or reserved. Do not present placeholder behavior as complete.

## Thematic Anti-Patterns

Avoid:

- generic neon or synthwave space presentation;
- dense star wallpaper and uniformly busy backgrounds;
- arbitrary planetary phases, moon placement, or decorative orbital layouts;
- excessive bloom, lens flare, saturation, particles, or screen noise;
- modern glossy menus, rounded cards, and ornamental interface chrome;
- cute, jokey, or marketing-oriented copy that breaks the instrument tone;
- filling deliberate darkness or silence because a scene appears too empty;
- cinematic effects that contradict astronomical geometry or undermine the
  terminal identity.
