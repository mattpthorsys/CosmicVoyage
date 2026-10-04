import { describe, expect, it } from 'vitest';
import { XenobiologyService } from '../../core/xenobiology_service';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { biologyFixture } from '../fixtures/biology';
import { createEncounter } from '../../systems/surface_encounter_system';
import { SurfaceEncounterController } from '../../core/modes/surface_encounter_controller';
import {
  biologyDashboard,
  createEncounterView,
  speciesDescription,
  createBiologicalDossier,
  organismBrief,
  specimenSaleRows,
} from '../../core/xenobiology_ui';
import { surfaceCoordinates, surfaceLongitudeDelta } from '../../utils/surface_coordinates';

describe('xenobiology interface', () => {
  it('keeps zero-value containers inspectable in Sell without mutating scientific demand', () => {
    const species = { ...generateBiosphere(biologyFixture())!.species[0], baselineSamples: 6 };
    const service = new XenobiologyService();
    service.collected(species);
    const container = {
      id: 'c1',
      sourceId: 'a1',
      siteId: 's1',
      species,
      kind: 'live' as const,
      quality: 1,
      volumeM3: 0.3,
    };
    const before = service.createSnapshot();
    const row = specimenSaleRows([container], service, true, 'rover')[0];
    expect(row.id).toBe('sample:c1');
    expect(row.cells).toEqual([species.name, '1', '0', 'live specimen']);
    expect(row.detail).toContain('stowed rover');
    expect(row.detail).toContain('No additional scientific demand');
    expect(row.disabled).toBe(true);
    expect(service.createSnapshot()).toEqual(before);
  });
  it('quotes whole specimens at scientific prices but cannot offer them to an uncrewed depot', () => {
    const species = {
      ...generateBiosphere(biologyFixture())!.species[1],
      recognised: false,
      baselineSamples: 0,
    };
    const service = new XenobiologyService();
    service.collected(species);
    const container = {
      id: 'c1',
      sourceId: 'a1',
      siteId: 's1',
      species,
      kind: 'live' as const,
      quality: 0.8,
      volumeM3: 0.6,
    };
    const row = specimenSaleRows([container], service, true)[0];
    expect(Number(row.cells[2])).toBe(service.quote(species, container).credits);
    expect(row.disabled).toBe(false);
    expect(row.detail).toContain('whole container');
    const unavailable = specimenSaleRows([container], service, false)[0];
    expect(unavailable.cells[2]).toBe('0');
    expect(unavailable.disabled).toBe(true);
    expect(unavailable.detail).toContain('No scientific receiving staff');
  });
  it('does not disclose chemistry, behaviour or clade before suitable observations', () => {
    const species = generateBiosphere(biologyFixture())!.species[1],
      service = new XenobiologyService();
    expect(speciesDescription(species, service).join(' ')).not.toContain(species.chemistry);
    service.observe(species, 2);
    expect(speciesDescription(species, service).join(' ')).toContain(species.chemistry);
    expect(speciesDescription(species, service).join(' ')).not.toContain(species.lineage);
    service.observe(species, 3);
    expect(speciesDescription(species, service).join(' ')).toContain(species.organisation);
    expect(speciesDescription(species, service).join(' ')).not.toContain(species.lineage);
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
  it('holds lethal confirmation across idle frames and unrelated input until explicitly confirmed', () => {
    const field = createEncounter(generateBiosphere(biologyFixture())!, {
      id: 'confirm',
      label: 'Confirm',
      x: 1,
      y: 1,
    });
    const controller = new SurfaceEncounterController();
    const target = controller.target(field)!;
    controller.input(new Set(['BIOLOGY_SHOOT']), field);
    const before = structuredClone(field);
    for (let frame = 0; frame < 60; frame++) expect(controller.input(new Set(), field)).toBeUndefined();
    expect(controller.input(new Set(['MOVE_RIGHT', 'CYCLE_TARGET']), field)).toBeUndefined();
    expect(controller.interaction).toEqual({ kind: 'confirm', targetId: target.id });
    expect(field).toEqual(before);
    expect(controller.input(new Set(['ENTER_SYSTEM']), field)).toEqual({
      kind: 'command',
      command: { kind: 'shoot', targetId: target.id },
    });
    expect(controller.interaction.kind).toBe('drive');
  });
  it('cancels lethal confirmation without firing or advancing field time', () => {
    const field = createEncounter(generateBiosphere(biologyFixture())!, {
      id: 'cancel',
      label: 'Cancel',
      x: 1,
      y: 1,
    });
    const controller = new SurfaceEncounterController();
    controller.input(new Set(['BIOLOGY_SHOOT']), field);
    expect(controller.input(new Set(['QUIT', 'ENTER_SYSTEM']), field)).toBeUndefined();
    expect(controller.interaction.kind).toBe('drive');
    expect(field.elapsedSeconds).toBe(0);
  });
  it('uses the bottom action menu, with cargo and all capture hotkeys, rather than another popup', () => {
    const biosphere = generateBiosphere(biologyFixture())!,
      field = createEncounter(biosphere, { id: 'site', label: 'Site', x: 1, y: 1 });
    const controller = new SurfaceEncounterController(),
      service = new XenobiologyService();
    controller.input(new Set(['ENTER_SYSTEM']), field);
    expect(controller.createModal(field, service, 30, 45, [])).toBeUndefined();
    const menu = controller.createCommandBar(field);
    expect(menu.selectedButtonId).toBe('observe');
    expect(menu.buttons.map((button) => button.key)).toContain('O');
    expect(menu.buttons.map((button) => button.key)).toEqual([
      'V',
      'A',
      'T',
      'S',
      'C',
      'K',
      'W',
      'D',
      'N',
      'I',
      'O',
      'J',
      'X',
      'Esc',
    ]);
    controller.input(new Set(['MOVE_RIGHT']), field);
    expect(controller.createCommandBar(field).selectedButtonId).toBe('analyse');
    controller.input(new Set(['QUIT']), field);
    controller.input(new Set(['TARGET_MENU']), field);
    const record = controller.createModal(field, service, 30, 45, [])!;
    expect(record.footer?.join(' ')).toContain('PGUP/DN page');
    expect(record.footer?.every((line) => line.length <= 20)).toBe(true);
    expect(field.elapsedSeconds).toBe(0);
  });
  it('excludes collected actors and provides detached coordinates for rendering', () => {
    const biosphere = generateBiosphere(biologyFixture())!,
      field = createEncounter(biosphere, { id: 'site', label: 'Site', x: 1, y: 1 });
    field.individuals[0].state = 'collected';
    const view = createEncounterView(field, null, new XenobiologyService(), {
      power: 1,
      stasisClass: 1,
      integrity: 100,
      cargo: { usedM3: 12.5, capacityM3: 50 },
      message: 'Ready',
      crew: [{ name: 'Test Pilot', hitPoints: 17, maxHitPoints: 30 }],
    });
    expect(view.actors.some((actor) => actor.id === field.individuals[0].id)).toBe(false);
    field.roverX = 1;
    expect(view.rover.x).toBe(16);
    expect(view.cargo.percent).toBe(25);
    expect(view.crew[0].hitPoints).toBe(17);
  });
  it('colour-codes report sections, values and risks, retaining evidence gates after wrapping', () => {
    const species = generateBiosphere(biologyFixture())!.species[1],
      service = new XenobiologyService();
    service.observe(species, 1);
    let report = createBiologicalDossier(species, service, 18);
    expect(
      report
        .flatMap((line) => line.segments)
        .map((span) => span.text)
        .join(' ')
    ).not.toContain(species.senses);
    expect(organismBrief(species, 0)).not.toContain(species.role);
    service.observe(species, 3);
    report = createBiologicalDossier(species, service, 48);
    const spans = report.flatMap((line) => line.segments);
    expect(new Set(spans.map((span) => span.tone)).size).toBeGreaterThanOrEqual(5);
    expect(spans.some((span) => span.text.includes(species.senses))).toBe(true);
    expect(
      report.every((line) => line.segments.reduce((length, span) => length + span.text.length, 0) <= 48)
    ).toBe(true);
    expect(organismBrief(species, 2).toLowerCase()).toContain(species.behaviour);
  });
  it('keeps hotkey capture and modal weapon preparation separate from movement', () => {
    const field = createEncounter(generateBiosphere(biologyFixture())!, {
      id: 'site',
      label: 'Site',
      x: 1,
      y: 1,
    });
    const controller = new SurfaceEncounterController();
    expect(controller.input(new Set(['ROVER_CARGO']), field)).toEqual({ kind: 'cargo' });
    expect(controller.input(new Set(['SHIP_MENU']), field)).toEqual({ kind: 'operations' });
    controller.input(new Set(['TRADE']), field);
    expect(controller.interaction.kind).toBe('power');
    const before = field.roverX;
    controller.input(new Set(['MOVE_LEFT']), field);
    expect(field.roverX).toBe(before);
    expect(controller.power).toBe(0);
  });
  it('uses cyclic longitude and bounded latitude consistently', () => {
    expect(surfaceCoordinates(-1, -1, 16)).toEqual({ x: 15, y: 0 });
    expect(surfaceCoordinates(16, 16, 16)).toEqual({ x: 0, y: 15 });
    expect(surfaceLongitudeDelta(15, 0, 16)).toBe(1);
  });
});
