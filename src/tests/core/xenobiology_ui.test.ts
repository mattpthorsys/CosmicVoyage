import { describe, expect, it } from 'vitest';
import { XenobiologyService } from '../../core/xenobiology_service';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { biologyFixture } from '../fixtures/biology';
import { createEncounter } from '../../systems/surface_encounter_system';
import { SurfaceEncounterController } from '../../core/modes/surface_encounter_controller';
import { biologyDashboard, createEncounterView, speciesDescription } from '../../core/xenobiology_ui';
import { surfaceCoordinates, surfaceLongitudeDelta } from '../../utils/surface_coordinates';

describe('xenobiology interface', () => {
  it('does not disclose chemistry, behaviour or clade before suitable observations', () => {
    const species = generateBiosphere(biologyFixture())!.species[1],
      service = new XenobiologyService();
    expect(speciesDescription(species, service).join(' ')).not.toContain(species.chemistry);
    service.observe(species, 2);
    expect(speciesDescription(species, service).join(' ')).toContain(species.chemistry);
    expect(speciesDescription(species, service).join(' ')).not.toContain(species.lineage);
    service.observe(species, 3);
    expect(speciesDescription(species, service).join(' ')).toContain(species.lineage);
  });
  it('wraps dossier information rather than truncating it', () => {
    const line = 'A long biological description containing meaningful observations and scientific value';
    const output = biologyDashboard([line], 20).map((row) => row.segments[0].text);
    expect(output.every((row) => row.length <= 20)).toBe(true);
    expect(output.join(' ')).toBe(line);
  });
  it('keeps menu navigation and weapon preparation separate from simulation commands', () => {
    const biosphere = generateBiosphere(biologyFixture())!,
      field = createEncounter(biosphere, { id: 'site', label: 'Site', x: 1, y: 1 });
    const controller = new SurfaceEncounterController();
    expect(controller.input(new Set(['ENTER_SYSTEM']), field)).toBeUndefined();
    expect(controller.input(new Set(['MOVE_DOWN']), field)).toBeUndefined();
    expect(field.elapsedSeconds).toBe(0);
    expect(controller.interaction.kind).toBe('menu');
    controller.input(new Set(['QUIT']), field);
    expect(controller.input(new Set(['MOVE_UP']), field)).toEqual({
      kind: 'command',
      command: { kind: 'move', dx: 0, dy: -1 },
    });
  });
  it('excludes collected actors and provides detached coordinates for rendering', () => {
    const biosphere = generateBiosphere(biologyFixture())!,
      field = createEncounter(biosphere, { id: 'site', label: 'Site', x: 1, y: 1 });
    field.individuals[0].state = 'collected';
    const view = createEncounterView(field, null, new XenobiologyService(), 1, 0, 100, '0/50', 'Ready');
    expect(view.actors.some((actor) => actor.id === field.individuals[0].id)).toBe(false);
    field.roverX = 1;
    expect(view.rover.x).toBe(16);
  });
  it('uses cyclic longitude and bounded latitude consistently', () => {
    expect(surfaceCoordinates(-1, -1, 16)).toEqual({ x: 15, y: 0 });
    expect(surfaceCoordinates(16, 16, 16)).toEqual({ x: 0, y: 15 });
    expect(surfaceLongitudeDelta(15, 0, 16)).toBe(1);
  });
});
