import { describe, expect, it } from 'vitest';
import { classifyHabitat, createHabitatPatches, habitatCommunity } from '../../entities/biology/habitat';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { biologyFixture } from '../fixtures/biology';
import type { SurfaceData } from '../../entities/planet/surface_generator';
import { createEncounter, SurfaceEncounterSystem } from '../../systems/surface_encounter_system';
import { createDefaultCargo } from '../../core/components';
import { createXenobiologySnapshot } from '../../entities/biology/biology_types';
import { validateXenobiology } from '../../entities/biology/biology_validation';

/** Supplies numeric terrain/liquid fixtures without invoking planetary generation or rendering. */
function surface(): SurfaceData {
  return {
    heightmap: Array.from({ length: 9 }, () => Array.from({ length: 9 }, () => 100)),
    heightLevelColors: null,
    rgbPaletteCache: null,
    surfaceElementMap: null,
    liquidOverlay: {
      kind: 'water',
      label: 'Water',
      seaLevel: 90,
      coverage: 0.3,
      colour: '#123456',
      reflectiveColour: '#abcdef',
      coastalVegetation: null,
    },
  };
}

/** Creates a canonical new-profile field with producer patches and a grazing group. */
function fieldFixture() {
  const terrain = surface();
  terrain.heightmap![4][3] = 80;
  const habitat = classifyHabitat(terrain, 4, 4, true)!;
  const biosphere = generateBiosphere(biologyFixture())!;
  return createEncounter(biosphere, { id: 'habitat-test', x: 4, y: 4, label: 'Water margin', habitat });
}

describe('habitat communities', () => {
  it('uses real water proximity, not colour, and refuses submerged cells', () => {
    const terrain = surface();
    terrain.heightmap![4][3] = 80;
    expect(classifyHabitat(terrain, 4, 4, true)?.kind).toBe('moist-margin');
    expect(classifyHabitat(terrain, 3, 4, true)).toBeNull();
    expect(classifyHabitat(terrain, 4, 4, false)?.kind).not.toBe('moist-margin');
    terrain.liquidOverlay!.colour = '#ffffff';
    expect(classifyHabitat(terrain, 4, 4, true)?.waterDistanceCells).toBe(1);
  });
  it('wraps longitude while keeping latitude bounded', () => {
    const terrain = surface();
    terrain.heightmap![0][8] = 80;
    expect(classifyHabitat(terrain, 0, 0, true)?.waterDistanceCells).toBe(1);
    expect(classifyHabitat(terrain, 4, 4, true)?.kind).toBe('exposed-ground');
  });
  it('generates reproducible patches and distinct site compositions', () => {
    const biosphere = generateBiosphere(biologyFixture())!;
    expect(createHabitatPatches('patches', 'moist-margin')).toEqual(
      createHabitatPatches('patches', 'moist-margin')
    );
    expect(habitatCommunity(biosphere, 'moist-margin').map((entry) => entry.id)).not.toEqual(
      habitatCommunity(biosphere, 'exposed-ground').map((entry) => entry.id)
    );
    const field = fieldFixture();
    expect(field).toEqual(fieldFixture());
    expect(new Set(field.individuals.map((entry) => entry.speciesId)).size).toBe(3);
    const producers = field.individuals.filter(
      (actor) => field.species.find((entry) => entry.id === actor.speciesId)!.metabolism !== 'heterotroph'
    );
    expect(producers).toHaveLength(4);
    expect(producers.every((actor) => field.patches![actor.y][actor.x] === 'm')).toBe(true);
  });
  it('coordinates a local retreat and preserves its state across suspension/restoration', () => {
    const field = fieldFixture();
    const group = field.individuals.filter((entry) => entry.groupId);
    expect(group).toHaveLength(3);
    field.individuals = group;
    field.terrain = field.terrain.map((row) => row.replaceAll('#', '.'));
    for (const [index, actor] of group.entries()) {
      actor.x = 8 + index;
      actor.y = 10;
    }
    field.roverX = 9;
    field.roverY = 14;
    const system = new SurfaceEncounterSystem();
    const result = system.act(field, { kind: 'wait' }, createDefaultCargo(10), 1);
    expect(result.damage).toBe(0);
    expect(result.message).toContain('Group withdrawal');
    expect(group.every((actor) => actor.y < 10 && actor.retreatUntil! > field.elapsedSeconds)).toBe(true);
    const snapshot = createXenobiologySnapshot();
    snapshot.fields[field.site.id] = field;
    expect(() => validateXenobiology(snapshot, [])).not.toThrow();
    const restored = JSON.parse(JSON.stringify(field)) as typeof field;
    system.act(field, { kind: 'wait' }, createDefaultCargo(10), 1);
    system.act(restored, { kind: 'wait' }, createDefaultCargo(10), 1);
    expect(restored).toEqual(field);
  });
  it('rejects corrupt group and patch metadata', () => {
    const field = fieldFixture();
    const snapshot = createXenobiologySnapshot();
    snapshot.fields[field.site.id] = field;
    field.patches![0] = 'invalid';
    expect(() => validateXenobiology(snapshot, [])).toThrow('patches');
    field.patches = createHabitatPatches(field.site.id, 'moist-margin');
    field.individuals[0].groupId = 'invented-group';
    field.individuals[0].retreatUntil = 15;
    expect(() => validateXenobiology(snapshot, [])).toThrow('group');
  });
});
