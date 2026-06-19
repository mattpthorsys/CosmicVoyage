import { PRNG } from '../utils/prng';

export const CREW_SKILLS = [
  'astroscience',
  'navigation',
  'engineering',
  'medicine',
  'communication',
  'geology',
  'spaceCombat',
  'handCombat',
  'guns',
  'piloting',
  'survival',
  'trade',
] as const;

export type CrewSkill = (typeof CREW_SKILLS)[number];
export type CrewRace = 'Human';

export interface CrewMember {
  id: string;
  name: string;
  race: CrewRace;
  role: string;
  hitPoints: number;
  maxHitPoints: number;
  durability: number;
  level: number;
  experience: number;
  trainingPoints: number;
  salary: number;
  hireCost: number;
  skills: Record<CrewSkill, number>;
  skillCaps: Record<CrewSkill, number>;
}

export const CREW_SKILL_LABELS: Record<CrewSkill, string> = {
  astroscience: 'Astroscience',
  navigation: 'Navigation',
  engineering: 'Engineering',
  medicine: 'Medicine',
  communication: 'Communication',
  geology: 'Geology',
  spaceCombat: 'Space Combat',
  handCombat: 'Hand Combat',
  guns: 'Guns',
  piloting: 'Piloting',
  survival: 'Survival',
  trade: 'Trade',
};

const FIRST_NAMES = [
  'Anja',
  'Tomas',
  'Mara',
  'Eli',
  'Niko',
  'Ila',
  'Ren',
  'Sera',
  'Vale',
  'Oren',
  'Juno',
  'Mika',
  'Sanne',
  'Idris',
  'Lena',
  'Kiran',
];

const LAST_NAMES = [
  'Venn',
  'Kade',
  'Rusk',
  'Anik',
  'Sato',
  'Mire',
  'Hale',
  'Sor',
  'Nadir',
  'Volk',
  'Eren',
  'Prax',
  'Orlow',
  'Dain',
  'Kest',
  'Maru',
];

const HUMAN_CAPS: Record<CrewSkill, number> = createSkillRecord(10);

interface CrewArchetype {
  role: string;
  focus: CrewSkill[];
  baseSkills: Partial<Record<CrewSkill, number>>;
  durability: [number, number];
}

const ARCHETYPES: CrewArchetype[] = [
  {
    role: 'Astroscientist',
    focus: ['astroscience', 'communication'],
    baseSkills: { astroscience: 5, communication: 3, navigation: 2, geology: 2 },
    durability: [2, 4],
  },
  {
    role: 'Navigator',
    focus: ['navigation', 'piloting'],
    baseSkills: { navigation: 5, piloting: 4, astroscience: 2, communication: 2 },
    durability: [2, 4],
  },
  {
    role: 'Medic',
    focus: ['medicine', 'communication'],
    baseSkills: { medicine: 5, communication: 4, survival: 2, astroscience: 1 },
    durability: [2, 4],
  },
  {
    role: 'Engineer',
    focus: ['engineering', 'survival'],
    baseSkills: { engineering: 5, geology: 2, piloting: 2, spaceCombat: 1 },
    durability: [3, 5],
  },
  {
    role: 'Geologist',
    focus: ['geology', 'astroscience'],
    baseSkills: { geology: 5, astroscience: 3, survival: 2, engineering: 1 },
    durability: [3, 5],
  },
  {
    role: 'Comms Officer',
    focus: ['communication', 'trade'],
    baseSkills: { communication: 5, trade: 3, astroscience: 2, medicine: 1 },
    durability: [2, 4],
  },
  {
    role: 'Security',
    focus: ['spaceCombat', 'guns'],
    baseSkills: { spaceCombat: 4, guns: 4, handCombat: 3, survival: 2 },
    durability: [4, 6],
  },
];

/** Creates skill record. */
export function createSkillRecord(value: number = 0): Record<CrewSkill, number> {
  return CREW_SKILLS.reduce(
    (record, skill) => {
      record[skill] = value;
      return record;
    },
    {} as Record<CrewSkill, number>
  );
}

/** Creates starting crew. */
export function createStartingCrew(seed: string | number): CrewMember[] {
  const prng = new PRNG(`starting_crew_${String(seed)}`);
  const crew = [
    createCrewMember('start-nav', ARCHETYPES[1], prng, 2),
    createCrewMember('start-science', ARCHETYPES[0], prng, 2),
    createCrewMember('start-medic', ARCHETYPES[2], prng, 2),
  ];
  ensureHelpfulStartingCoverage(crew);
  return crew;
}

/** Generates recruit candidates. */
export function generateRecruitCandidates(
  starbaseName: string,
  seed: string | number,
  count: number = 6
): CrewMember[] {
  const prng = new PRNG(`recruits_${String(seed)}_${starbaseName}`);
  const candidates: CrewMember[] = [];
  for (let i = 0; i < count; i++) {
    const archetype = ARCHETYPES[prng.randomInt(0, ARCHETYPES.length - 1)];
    candidates.push(
      createCrewMember(`hire-${slug(starbaseName)}-${i}`, archetype, prng, prng.randomInt(1, 3))
    );
  }
  return candidates;
}

/** Awards experience to crew members whose roles match the completed activity. */
export function awardCrewExperience(crew: CrewMember[], skill: CrewSkill, amount: number): CrewMember[] {
  if (amount <= 0) return [];
  const eligible = crew
    .filter((member) => member.skills[skill] > 0)
    .sort((a, b) => b.skills[skill] - a.skills[skill] || a.experience - b.experience);
  const recipients = eligible.slice(0, Math.max(1, Math.min(2, eligible.length)));
  recipients.forEach((member) => addExperience(member, Math.round(amount)));
  return recipients;
}

/** Spends training resources to improve a crew member skill. */
export function trainCrewSkill(member: CrewMember, skill: CrewSkill): { success: boolean; message: string } {
  if (member.trainingPoints <= 0) {
    return { success: false, message: `${member.name} has no training points available.` };
  }
  if (member.skills[skill] >= member.skillCaps[skill]) {
    return {
      success: false,
      message: `${member.name} has reached the ${CREW_SKILL_LABELS[skill]} learning cap.`,
    };
  }
  member.skills[skill] += 1;
  member.trainingPoints -= 1;
  return {
    success: true,
    message: `${member.name} trained ${CREW_SKILL_LABELS[skill]} to ${member.skills[skill]}.`,
  };
}

/** Returns crew skill total. */
export function getCrewSkillTotal(crew: CrewMember[], skill: CrewSkill): number {
  return crew.reduce((sum, member) => sum + member.skills[skill], 0);
}

/** Returns best crew skill. */
export function getBestCrewSkill(crew: CrewMember[], skill: CrewSkill): number {
  return crew.reduce((best, member) => Math.max(best, member.skills[skill]), 0);
}

/** Returns next level experience. */
export function getNextLevelExperience(level: number): number {
  return 100 + Math.max(0, level - 1) * 75;
}

/** Formats top skills. */
export function formatTopSkills(member: CrewMember, limit: number = 3): string {
  return CREW_SKILLS.map((skill) => ({ skill, value: member.skills[skill] }))
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value || CREW_SKILL_LABELS[a.skill].localeCompare(CREW_SKILL_LABELS[b.skill]))
    .slice(0, limit)
    .map((entry) => `${shortSkillLabel(entry.skill)} ${entry.value}`)
    .join(' ');
}

/** Creates crew member. */
function createCrewMember(id: string, archetype: CrewArchetype, prng: PRNG, level: number): CrewMember {
  const skills = createSkillRecord(0);
  for (const skill of CREW_SKILLS) skills[skill] = prng.randomInt(0, 1);
  Object.entries(archetype.baseSkills).forEach(([skill, value]) => {
    skills[skill as CrewSkill] = Math.max(skills[skill as CrewSkill], value ?? 0);
  });
  archetype.focus.forEach((skill) => {
    skills[skill] = Math.min(HUMAN_CAPS[skill], skills[skill] + prng.randomInt(0, level));
  });

  const durability = prng.randomInt(archetype.durability[0], archetype.durability[1]);
  const maxHitPoints = 18 + durability * 3 + prng.randomInt(0, 5);
  const skillTotal = Object.values(skills).reduce((sum, value) => sum + value, 0);
  return {
    id,
    name: `${FIRST_NAMES[prng.randomInt(0, FIRST_NAMES.length - 1)]} ${LAST_NAMES[prng.randomInt(0, LAST_NAMES.length - 1)]}`,
    race: 'Human',
    role: archetype.role,
    hitPoints: maxHitPoints,
    maxHitPoints,
    durability,
    level,
    experience: 0,
    trainingPoints: Math.max(0, level - 1),
    salary: 20 + level * 8 + Math.floor(skillTotal / 2),
    hireCost: 120 + level * 90 + skillTotal * 12,
    skills,
    skillCaps: { ...HUMAN_CAPS },
  };
}

/** Adds experience. */
function addExperience(member: CrewMember, amount: number): void {
  member.experience += Math.max(0, Math.round(amount));
  while (member.experience >= getNextLevelExperience(member.level)) {
    member.experience -= getNextLevelExperience(member.level);
    member.level += 1;
    member.trainingPoints += 2;
    member.maxHitPoints += 1 + Math.floor(member.durability / 3);
    member.hitPoints = member.maxHitPoints;
  }
}

/** Ensures helpful starting coverage. */
function ensureHelpfulStartingCoverage(crew: CrewMember[]): void {
  const required: Partial<Record<CrewSkill, number>> = {
    communication: 5,
    navigation: 5,
    astroscience: 5,
    medicine: 5,
    engineering: 2,
  };
  for (const [skill, minimum] of Object.entries(required)) {
    const crewSkill = skill as CrewSkill;
    if (getCrewSkillTotal(crew, crewSkill) >= (minimum ?? 0)) continue;
    const best = crew.sort((a, b) => b.skills[crewSkill] - a.skills[crewSkill])[0];
    best.skills[crewSkill] = Math.min(
      best.skillCaps[crewSkill],
      best.skills[crewSkill] + ((minimum ?? 0) - getCrewSkillTotal(crew, crewSkill))
    );
  }
}

/** Returns the compact display label for a crew skill. */
function shortSkillLabel(skill: CrewSkill): string {
  const labels: Record<CrewSkill, string> = {
    astroscience: 'Astro',
    navigation: 'Nav',
    engineering: 'Eng',
    medicine: 'Med',
    communication: 'Comms',
    geology: 'Geo',
    spaceCombat: 'Spc',
    handCombat: 'Hand',
    guns: 'Guns',
    piloting: 'Pilot',
    survival: 'Surv',
    trade: 'Trade',
  };
  return labels[skill];
}

/** Converts display text into a stable identifier fragment. */
function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
