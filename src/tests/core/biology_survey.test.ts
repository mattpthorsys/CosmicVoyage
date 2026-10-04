import { describe, expect, it } from 'vitest';
import { biologySurveyReport, biologySurveySummary, habitatLandingPreview } from '../../core/biology_survey';
import { createDiscoveryRecord } from '../../core/discovery';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { createXenobiologySnapshot } from '../../entities/biology/biology_types';
import { createEncounter } from '../../systems/surface_encounter_system';
import { XenobiologyService } from '../../core/xenobiology_service';
import { biologyFixture } from '../fixtures/biology';

describe('biological landing survey', () => {
  it('keeps undetected worlds unresolved and distinguishes potential signatures from surface identification', () => {
    const biosphere = generateBiosphere(biologyFixture())!;
    const detected = createDiscoveryRecord();
    expect(biologySurveySummary(detected, biosphere)).toBe(biologySurveySummary(detected, null));
    expect(biologySurveySummary(createDiscoveryRecord('observed', 75), biosphere)).toContain('Possible');
    const report = biologySurveyReport(detected, biosphere, createXenobiologySnapshot(), {
      temperatureK: 294,
      pressureBar: 1,
    });
    expect(report.join(' ')).not.toContain('X');
    expect(report.join(' ')).not.toContain(biosphere.species[0].name);
  });

  it('retains visited status and counts only evidence acquired at the selected site without mutating it', () => {
    const biosphere = generateBiosphere(biologyFixture())!;
    const site = { id: 'survey-site', x: 12, y: 30, label: 'Rock margin' };
    const service = new XenobiologyService();
    service.snapshot.fields[site.id] = createEncounter(biosphere, site);
    const species = biosphere.species[0];
    service.observe(species, 3, {
      systemName: 'Fixture',
      worldX: 0,
      worldY: 0,
      systemSlot: 0,
      bodyPath: 'planet:0',
      bodyName: 'Fixture',
      surface: { ...site, siteId: site.id },
    });
    const before = service.createSnapshot();
    expect(habitatLandingPreview(site, service.snapshot).join(' ')).toContain('1 observed taxa / 1 analysed');
    expect(habitatLandingPreview({ ...site, id: 'elsewhere' }, service.snapshot).join(' ')).toContain(
      'UNVISITED'
    );
    const report = biologySurveyReport(
      createDiscoveryRecord('surveyed', 100),
      {
        ...biosphere,
        sites: [site],
      },
      service.snapshot,
      { temperatureK: 294, pressureBar: 1 },
      site
    );
    expect(report.join(' ')).toContain('SELECTED LANDING HABITAT');
    expect(report.join(' ')).not.toContain(species.name);
    expect(service.createSnapshot()).toEqual(before);
  });
});
