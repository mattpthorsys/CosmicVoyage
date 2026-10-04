import type {
  EncounterField,
  EncounterIndividual,
  SpeciesDefinition,
  BehaviourObservationKind,
} from '../entities/biology/biology_types';

interface DefensiveIntent {
  readonly goal: readonly [number, number] | null;
  readonly damage: number;
  readonly warning?: string;
}

/** Identifies undamaged source contacts without mistaking physiology or an AI timer for witnessed evidence. */
export function behaviourSources(
  field: EncounterField,
  species: SpeciesDefinition,
  kind: BehaviourObservationKind
): EncounterIndividual[] {
  const sources = field.individuals.filter(
    (actor) =>
      actor.speciesId === species.id &&
      actor.state === 'active' &&
      actor.injury === 0 &&
      actor.exposure === 0 &&
      !actor.sampled
  );
  if (kind === 'defensive-display')
    return ['territorial', 'ambush'].includes(species.behaviour) ? sources : [];
  if (kind === 'group-retreat')
    return species.socialBehaviour === 'group-retreat'
      ? sources.filter(
          (actor) =>
            actor.groupId &&
            sources.some(
              (other) =>
                other.id !== actor.id &&
                other.groupId === actor.groupId &&
                Math.hypot(other.x - actor.x, other.y - actor.y) <= 5
            )
        )
      : [];
  if (!field.patches || !species.foragingGuild || !['passive', 'skittish'].includes(species.behaviour))
    return [];
  if (kind === 'shelter-use')
    return species.seeksShelter && field.patches.some((row) => row.includes('s')) ? sources : [];
  const producers = field.individuals.filter(
    (actor) =>
      actor.state !== 'collected' &&
      actor.state !== 'dead' &&
      field.species.some((entry) => entry.id === actor.speciesId && entry.metabolism !== 'heterotroph')
  );
  return sources.filter((actor) =>
    producers.some((producer) => Math.hypot(producer.x - actor.homeX, producer.y - actor.homeY) <= 13)
  );
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
    feeding: 'feeding at substrate',
    sheltering: 'using substrate shelter',
    withdrawing: 'withdrawing',
    displaying: 'warning display / withdraw',
    defending: 'defending home range',
    returning: 'returning to home range',
  }[actor.activity];
}
