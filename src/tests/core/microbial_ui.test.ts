import { describe, expect, it } from 'vitest';
import { microbialBiosphereFixture } from '../fixtures/biology';
import { createEncounter, createCollectionContainer } from '../../systems/surface_encounter_system';
import { XenobiologyService } from '../../core/xenobiology_service';
import { SurfaceEncounterController } from '../../core/modes/surface_encounter_controller';
import {
  createBiologicalDossier,
  createEncounterView,
  specimenRows,
  specimenSaleRows,
} from '../../core/xenobiology_ui';
import { habitatLandingPreview } from '../../core/biology_survey';
import type { TextDashboardLine } from '../../core/text_ui';
import { createBiologicalContracts } from '../../core/biological_contracts';

/** Isolates a close contact without bypassing typed generator traits or real controller visibility. */
function fixture() {
  const biosphere = microbialBiosphereFixture();
  const field = createEncounter(biosphere, biosphere.sites[0]);
  const target = field.individuals[0];
  field.individuals = [target];
  target.x = 15;
  target.y = 21;
  const species = field.species.find((entry) => entry.id === target.speciesId)!;
  const service = new XenobiologyService();
  service.snapshot.fields[field.site.id] = field;
  return { biosphere, field, target, species, service };
}

/** Joins wrapped spans for assertions while retaining colour/font checks on the original model. */
function reportText(lines: readonly TextDashboardLine[]): string {
  return lines.flatMap((line) => line.segments.map((span) => span.text)).join(' ');
}

describe('microbial identification and field controls', () => {
  it.each([24, 72])(
    'reveals cellular structure only after analysis and scopes conclusions locally at width %s',
    (width) => {
      const { species, service } = fixture();
      service.observe(species, 2);
      expect(reportText(createBiologicalDossier(species, service, width))).not.toContain('SINGLE-CELLED');
      service.observe(species, 3);
      const report = createBiologicalDossier(species, service, width);
      expect(reportText(report)).toContain('SINGLE-CELLED COMMUNITY');
      expect(reportText(report)).toContain('Not a census of the whole planet');
      expect(reportText(report)).toContain('not the entire patch');
      expect(reportText(report)).not.toContain('Capture Assessment');
      expect(
        report.every((line) => line.segments.reduce((length, span) => length + span.text.length, 0) <= width)
      ).toBe(true);
      expect(
        report.some((line) => line.segments.some((span) => span.tone === 'green' && span.font === 'thin'))
      ).toBe(true);
    }
  );

  it('disables weapon controls and shortcuts without changing the field or entering a weapon popup', () => {
    const { field } = fixture();
    const before = structuredClone(field);
    const controller = new SurfaceEncounterController();
    const menu = controller.createCommandBar(field);
    expect(menu.buttons.find((button) => button.id === 'stun')?.enabled).toBe(false);
    expect(menu.buttons.find((button) => button.id === 'shoot')?.enabled).toBe(false);
    expect(menu.buttons.find((button) => button.id === 'sample')?.label).toBe('Material');
    expect(controller.input(new Set(['BIOLOGY_SHOOT']), field)).toBeUndefined();
    expect(controller.input(new Set(['TRADE']), field)).toBeUndefined();
    expect(controller.interaction.kind).toBe('drive');
    expect(controller.input(new Set(['ROVER_CARGO']), field)).toEqual({ kind: 'cargo' });
    expect(field).toEqual(before);
  });

  it('shows aggregate biomass and separate material/viable values, not animal capture probabilities', () => {
    const { field, target, species, service } = fixture();
    service.observe(species, 3);
    const view = createEncounterView(field, target.id, service, {
      power: 1,
      stasisClass: 1,
      integrity: 100,
      cargo: { usedM3: 0, capacityM3: 1 },
      message: '',
    });
    expect(view.targetMass).toContain('patch');
    expect(view.targetMass).toContain('aggregate biomass');
    expect(view.brief).toContain('Single-celled');
    expect(view.scanner.join(' ')).toContain('material');
    expect(view.scanner.join(' ')).toContain('viable');
    expect(view.scanner.join(' ')).not.toContain('Mortality');
  });

  it('labels sealed samples in cargo and Sell, including zero-demand samples', () => {
    const { field, target, species, service } = fixture();
    service.collected(species);
    const specimen = createCollectionContainer(field, target, 'live');
    expect(specimenRows([specimen], service)[0].detail).toContain('5 g representative material');
    const sale = specimenSaleRows([specimen], service, true)[0];
    expect(sale.cells[3]).toBe('viable microbial sample');
    service.submit(species, specimen);
    const retained = specimenSaleRows([specimen], service, true)[0];
    expect(retained.cells[2]).toBe('0');
    expect(retained.disabled).toBe(true);
  });

  it('reports only acquired local cellular evidence and offers appropriate sampling contracts', () => {
    const { biosphere, field, species, service } = fixture();
    field.species = field.species.map((entry) => ({ ...entry, recognised: true }));
    expect(habitatLandingPreview(field.site, service.snapshot).join(' ')).not.toContain('single-celled');
    service.observe(species, 3, {
      systemName: 'Fixture',
      worldX: 0,
      worldY: 0,
      systemSlot: 0,
      bodyName: 'Fixture',
      bodyPath: 'planet:0',
      surface: { x: 1, y: 1, siteId: field.site.id, label: field.site.label },
    });
    expect(habitatLandingPreview(field.site, service.snapshot).join(' ')).toContain(
      'single-celled taxa resolved here'
    );
    const offers = createBiologicalContracts(
      { id: 'microbial-port', name: 'Microbial Port', kind: 'starbase' },
      'Fixture',
      [biosphere],
      service.snapshot.fields,
      [],
      service
    );
    expect(offers.some((offer) => offer.title.includes('microbial material'))).toBe(true);
    expect(offers.some((offer) => offer.title === 'Comparative size reference')).toBe(false);
  });
});
