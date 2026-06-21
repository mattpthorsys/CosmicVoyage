import { describe, expect, it } from 'vitest';
import { MissionProgressService } from '../../core/mission_progress';
import { StarbaseMission } from '../../core/mission_board';
import { Planet } from '../../entities/planet';
import { SolarSystem } from '../../entities/solar_system';
import { SystemDataGenerator } from '../../generation/system_data_generator';
import { PRNG } from '../../utils/prng';

/** Returns a generated planet suitable for mission progression tests. */
function createPlanet(): Planet {
  const prng = new PRNG('mission-progress-service');
  const generator = new SystemDataGenerator(prng);
  for (let y = -30; y <= 30; y++) {
    for (let x = -30; x <= 30; x++) {
      const properties = generator.getSystemProperties(x, y);
      if (!properties.exists) continue;
      const system = new SolarSystem(properties, x, y, prng);
      const planet = system.planets.find((candidate): candidate is Planet => candidate !== null);
      if (planet) return planet;
    }
  }
  throw new Error('Expected a generated planet.');
}

describe('mission progression service', () => {
  it('requires the objective discovery tier before completing a mission', () => {
    const planet = createPlanet();
    const mission: StarbaseMission = {
      id: 'survey-test',
      title: 'Survey test',
      type: 'survey',
      issuer: 'Test',
      summary: 'Test',
      detail: 'Test',
      rewardCredits: 100,
      risk: 'Low',
      originStarbaseName: 'Test Base',
      systemName: 'Test System',
      objective: {
        kind: 'scan',
        targetName: planet.name,
        targetLabel: `Survey ${planet.name}`,
        targetType: 'planet',
        requiredDiscoveryLevel: 'surveyed',
      },
    };
    const progress = new MissionProgressService();

    expect(progress.accept(mission)).toBe(true);
    expect(progress.completeForDiscovery(planet, 'Test System', 'observed')).toEqual([]);
    expect(progress.completeForDiscovery(planet, 'Test System', 'surveyed')).toEqual([mission]);
    expect(progress.getStatus(mission)).toBe('COMPLETE');
  });
});
