import { Path } from 'rot-js';
import type {
  BiologicalActivity,
  EncounterField,
  EncounterIndividual,
  SpeciesDefinition,
} from '../entities/biology/biology_types';
import { PRNG } from '../utils/prng';

export interface ForagingIntent {
  readonly goal: readonly [number, number] | null;
  readonly activity: BiologicalActivity;
}

/** Finds a reachable resource or shelter without inventing hunger, consuming producers or spawning food. */
export function habitatForagingIntent(
  field: EncounterField,
  actor: EncounterIndividual,
  species: SpeciesDefinition,
  tick: number
): ForagingIntent | null {
  if (!species.foragingGuild || !field.patches) return null;
  const phase = new PRNG(field.seed).seedNew(actor.id, 'activity-phase').randomInt(0, 5);
  const resting = (tick + phase) % 6 < 2;
  if (resting && !species.seeksShelter) return { goal: null, activity: 'resting' };
  const producers = field.individuals.filter(
    (other) =>
      other.state !== 'collected' &&
      other.state !== 'dead' &&
      field.species.some((entry) => entry.id === other.speciesId && entry.metabolism !== 'heterotroph')
  );
  const candidates: Array<readonly [number, number]> = [];
  for (let y = 1; y < field.terrain.length - 1; y++)
    for (let x = 1; x < field.terrain[y].length - 1; x++) {
      if (Math.hypot(x - actor.homeX, y - actor.homeY) > 8 || !passable(field, actor, x, y)) continue;
      const patch = field.patches[y][x];
      const suitable = resting
        ? patch === 's'
        : species.foragingGuild === 'grazer'
          ? producers.some((other) => Math.hypot(other.x - x, other.y - y) <= 1.5)
          : (patch === 'm' || patch === 's') &&
            producers.some((other) => Math.hypot(other.x - x, other.y - y) <= 5);
      if (suitable) candidates.push([x, y]);
    }
  candidates.sort(
    (a, b) =>
      Math.hypot(a[0] - actor.x, a[1] - actor.y) - Math.hypot(b[0] - actor.x, b[1] - actor.y) ||
      a[1] - b[1] ||
      a[0] - b[0]
  );
  // Actor budgets are small; test the nearest few destinations, not every tile or a global food web.
  for (const [x, y] of candidates.slice(0, 8)) {
    if (x === actor.x && y === actor.y) return { goal: null, activity: resting ? 'sheltering' : 'feeding' };
    const route: Array<[number, number]> = [];
    new Path.AStar(x, y, (cx, cy) => passable(field, actor, cx, cy), { topology: 4 }).compute(
      actor.x,
      actor.y,
      (cx, cy) => route.push([cx, cy])
    );
    if (route.length > 1) return { goal: [x, y], activity: resting ? 'returning' : 'foraging' };
  }
  return { goal: null, activity: 'resting' };
}

/** Keeps feeding and shelter destinations inside the real collision rules and leaves the exit clear. */
function passable(field: EncounterField, actor: EncounterIndividual, x: number, y: number): boolean {
  return (
    field.terrain[y]?.[x] === '.' &&
    !(x === 16 && y === 21) &&
    !(x === field.roverX && y === field.roverY) &&
    !field.individuals.some(
      (other) => other.id !== actor.id && other.state !== 'collected' && other.x === x && other.y === y
    )
  );
}
