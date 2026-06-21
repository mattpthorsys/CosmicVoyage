import { describe, expect, it } from 'vitest';
import { SolarSystem } from '../../../entities/solar_system';
import { Starbase } from '../../../entities/starbase';
import { SystemDataGenerator } from '../../../generation/system_data_generator';
import { PRNG } from '../../../utils/prng';
import {
  formatMissionDetail,
  generateStarbaseMissions,
  generateStarbaseNotices,
  getMissionStatus,
  isMissionObjectiveCompletedByDiscovery,
} from '../../../core/mission_board';

/** Creates mission system. */
function createMissionSystem(): { system: SolarSystem; starbase: Starbase } {
  const seed = new PRNG('mission-board-regression');
  const generator = new SystemDataGenerator(seed);
  for (let y = -80; y <= 80; y++) {
    for (let x = -80; x <= 80; x++) {
      const props = generator.getSystemProperties(x, y);
      if (!props.exists) continue;
      const system = new SolarSystem(props, x, y, seed);
      const planets = system.planets.filter((planet) => planet !== null);
      if (planets.length > 0) {
        return {
          system,
          starbase: system.starbase ?? new Starbase('mission-board', system.systemPRNG, system.name),
        };
      }
    }
  }
  throw new Error('Expected a generated system with planets.');
}

describe('mission board generation', () => {
  it('generates deterministic notices and missions for a starbase', () => {
    const first = createMissionSystem();
    const second = createMissionSystem();

    expect(generateStarbaseNotices(first.starbase, first.system)).toEqual(
      generateStarbaseNotices(second.starbase, second.system)
    );
    expect(generateStarbaseMissions(first.starbase, first.system)).toEqual(
      generateStarbaseMissions(second.starbase, second.system)
    );
  });

  it('formats mission status and details for the starbase table', () => {
    const { system, starbase } = createMissionSystem();
    const mission = generateStarbaseMissions(starbase, system)[0];
    const acceptedMissionIds = new Set<string>([mission.id]);
    const completedMissionIds = new Set<string>();
    const status = getMissionStatus(mission, {
      acceptedMissionIds,
      readyMissionIds: new Set(),
      completedMissionIds,
    });

    expect(status).toBe('ACTIVE');
    expect(formatMissionDetail(mission, status)).toContain(mission.title);
  });

  it('matches scan completion against the mission target only', () => {
    const { system, starbase } = createMissionSystem();
    const mission = generateStarbaseMissions(starbase, system).find((candidate) =>
      candidate.objectives.some((objective) => objective.targetType === 'planet')
    );
    if (!mission) throw new Error('Expected at least one planet scan mission.');

    const objective = mission.objectives.find((candidate) => candidate.targetType === 'planet');
    if (!objective) throw new Error('Expected a planet objective.');
    const target = system.planets.find((planet) => planet?.name === objective.targetName);
    const other = system.planets.find((planet) => planet && planet.name !== objective.targetName);
    if (!target) throw new Error('Expected mission target in generated system.');

    expect(isMissionObjectiveCompletedByDiscovery(objective, target, 'sampled')).toBe(true);
    expect(isMissionObjectiveCompletedByDiscovery(objective, target, 'observed')).toBe(
      objective.requiredDiscoveryLevel === 'observed'
    );
    if (other) expect(isMissionObjectiveCompletedByDiscovery(objective, other, 'sampled')).toBe(false);
  });
});
