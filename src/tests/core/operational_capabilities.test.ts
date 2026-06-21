import { describe, expect, it } from 'vitest';
import { createStartingCrew } from '../../core/crew';
import { getOperationalCapabilities } from '../../core/operational_capabilities';
import { createDefaultShipModifications } from '../../core/ship_modifications';

describe('operational capabilities', () => {
  it('turns crew skill and survey equipment into bounded gameplay modifiers', () => {
    const crew = createStartingCrew('capability-test');
    const ship = createDefaultShipModifications();
    const baseline = getOperationalCapabilities(crew, ship);

    crew.forEach((member) => {
      member.skills.astroscience = 10;
      member.skills.geology = 10;
      member.skills.navigation = 10;
      member.skills.engineering = 10;
    });
    ship.surveyEquipmentClass = 3;
    const improved = getOperationalCapabilities(crew, ship);

    expect(improved.scanConfidenceBonus).toBeGreaterThan(baseline.scanConfidenceBonus);
    expect(improved.miningThroughputMultiplier).toBeGreaterThan(baseline.miningThroughputMultiplier);
    expect(improved.hyperspaceFuelMultiplier).toBeLessThan(baseline.hyperspaceFuelMultiplier);
    expect(improved.scanConfidenceBonus).toBeLessThanOrEqual(24);
  });
});
