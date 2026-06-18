# Game Design Principles

## Experience Goal

The game should convey scale, isolation, scientific curiosity, and operation of
a small capable vessel in an indifferent universe. Progress comes through
navigation, observation, planning, resource management, and discovery rather
than constant combat.

## Design Pillars

### Deterministic exploration

The world should feel persistent. Revisiting coordinates with the same seed
must reveal the same systems, bodies, resources, and local opportunities.

### Plausible science

Simplifications are acceptable, but rules should remain internally coherent and
recognizably connected to astronomy, geology, atmosphere, heat, gravity, and
orbital mechanics.

### Instrument readability

The interface should expose enough information to make decisions without
turning into a dense spreadsheet. Important actions must be discoverable.

### Quiet pacing

Use empty space, rare phenomena, subtle motion, and meaningful contacts. Do not
fill every cell with content or every moment with alerts.

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
