import type {
  EncounterField,
  EncounterIndividual,
  SpeciesDefinition,
} from '../entities/biology/biology_types';

interface DefensiveIntent {
  readonly goal: readonly [number, number] | null;
  readonly damage: number;
  readonly warning?: string;
}

/** Chooses a bounded threat response, leaving obstacle routing and the explicit action clock to the encounter. */
export function defensiveIntent(
  field: EncounterField,
  actor: EncounterIndividual,
  species: SpeciesDefinition,
  tickSeconds: number,
  sensed: boolean,
  warnedThisCommand: Set<string>
): DefensiveIntent | null {
  if (!['territorial', 'ambush'].includes(species.behaviour)) return null;
  const distance = Math.hypot(actor.x - field.roverX, actor.y - field.roverY);
  const territory = species.behaviour === 'territorial' ? 4 : 6;
  const homeRange = Math.hypot(field.roverX - actor.homeX, field.roverY - actor.homeY);
  const threatened =
    sensed &&
    homeRange <= territory &&
    distance < (species.behaviour === 'territorial' ? 6 : actor.alerted ? 6 : 2);
  if (!threatened) {
    actor.alerted = false;
    actor.displayUntil = undefined;
    const returning = Math.hypot(actor.x - actor.homeX, actor.y - actor.homeY) > 0;
    actor.activity = returning ? 'returning' : 'resting';
    return { goal: returning ? [actor.homeX, actor.homeY] : null, damage: 0 };
  }
  if (!actor.alerted || actor.displayUntil === undefined) {
    actor.alerted = true;
    actor.activity = 'displaying';
    actor.displayUntil = field.elapsedSeconds + 5;
    warnedThisCommand.add(actor.id);
    return {
      goal: null,
      damage: 0,
      warning:
        species.behaviour === 'territorial'
          ? 'Defensive display: withdraw from its home territory.'
          : 'Threat posture detected: back away from the contact.',
    };
  }
  if (tickSeconds < actor.displayUntil || warnedThisCommand.has(actor.id)) {
    actor.activity = 'displaying';
    return { goal: null, damage: 0 };
  }
  actor.activity = 'defending';
  return {
    goal: [field.roverX, field.roverY],
    damage: distance < 1.6 ? (species.massKg > 10 ? 8 : 3) : 0,
  };
}

/** Reports directly visible activity rather than revealing an unobserved species classification. */
export function organismActivity(actor: EncounterIndividual): string {
  if (actor.state !== 'active' || !actor.activity) return actor.state;
  return {
    attached: 'attached to substrate',
    resting: 'resting',
    foraging: 'foraging',
    withdrawing: 'withdrawing',
    displaying: 'warning display / withdraw',
    defending: 'defending home range',
    returning: 'returning to home range',
  }[actor.activity];
}
