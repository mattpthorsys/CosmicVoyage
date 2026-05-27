import { describe, expect, it } from 'vitest';
import {
  createStartingCrew,
  generateRecruitCandidates,
  getCrewSkillTotal,
  trainCrewSkill,
  awardCrewExperience,
  getNextLevelExperience,
} from '../../../core/crew';

describe('crew generation and progression', () => {
  it('creates deterministic starting crew with essential operating coverage', () => {
    const first = createStartingCrew('crew-regression');
    const second = createStartingCrew('crew-regression');

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
    expect(getCrewSkillTotal(first, 'communication')).toBeGreaterThanOrEqual(5);
    expect(getCrewSkillTotal(first, 'navigation')).toBeGreaterThanOrEqual(5);
    expect(getCrewSkillTotal(first, 'astroscience')).toBeGreaterThanOrEqual(5);
    expect(getCrewSkillTotal(first, 'medicine')).toBeGreaterThanOrEqual(5);
  });

  it('levels crew from relevant task experience and grants training points', () => {
    const crew = createStartingCrew('crew-xp');
    const navigator = crew.find((member) => member.skills.navigation > 0);
    if (!navigator) throw new Error('Expected a navigator-capable crew member.');

    const initialLevel = navigator.level;
    const initialPoints = navigator.trainingPoints;
    awardCrewExperience(crew, 'navigation', getNextLevelExperience(navigator.level));

    expect(navigator.level).toBe(initialLevel + 1);
    expect(navigator.trainingPoints).toBe(initialPoints + 2);
  });

  it('spends training points without exceeding human learning caps', () => {
    const [member] = createStartingCrew('crew-training');
    member.trainingPoints = 2;
    member.skills.engineering = 9;

    expect(trainCrewSkill(member, 'engineering').success).toBe(true);
    expect(member.skills.engineering).toBe(10);
    expect(trainCrewSkill(member, 'engineering').success).toBe(false);
    expect(member.skills.engineering).toBe(10);
  });

  it('generates deterministic starbase recruits separate from the starting roster', () => {
    const first = generateRecruitCandidates('Test Starbase Delta', 'crew-recruits');
    const second = generateRecruitCandidates('Test Starbase Delta', 'crew-recruits');

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
    expect(first.every((candidate) => candidate.hireCost > 0 && candidate.maxHitPoints > 0)).toBe(true);
  });
});
