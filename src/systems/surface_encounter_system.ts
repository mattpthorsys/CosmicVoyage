import { Path } from 'rot-js';
import { PRNG } from '../utils/prng';
import type { CargoComponent } from '../core/components';
import { SpecimenCargoSystem } from './specimen_cargo_system';
import { stunOutcome } from '../entities/biology/stun_model';
import { canShareRoverCell } from '../entities/biology/biology_rules';
import {
  ENCOUNTER_HEIGHT,
  ENCOUNTER_WIDTH,
  type BiologySite,
  type BiosphereDefinition,
  type EncounterField,
  type EncounterIndividual,
  type EvidenceLevel,
  type SpeciesDefinition,
  type StunPower,
} from '../entities/biology/biology_types';

export type EncounterCommand =
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'observe' | 'analyse' | 'sample' | 'collect' | 'shoot'; targetId: string }
  | { kind: 'stun'; targetId: string; power: StunPower }
  | { kind: 'wait' };

export interface EncounterResult {
  message: string;
  elapsedSeconds: number;
  damage: number;
  evidence?: { species: SpeciesDefinition; level: EvidenceLevel; collected: boolean };
}

/** Creates a bounded, connected local patch independently of regional terrain/resource random streams. */
export function createEncounter(biosphere: BiosphereDefinition, site: BiologySite): EncounterField {
  const prng = new PRNG(site.id).seedNew('field');
  // Keep the central/entry corridor clear so every expedition has a reachable return route.
  const terrain = Array.from({ length: ENCOUNTER_HEIGHT }, (_, y) =>
    Array.from({ length: ENCOUNTER_WIDTH }, (_, x) =>
      x === 0 || y === 0 || x === ENCOUNTER_WIDTH - 1 || y === ENCOUNTER_HEIGHT - 1
        ? '#'
        : x === 16 || y === 21
          ? '.'
          : prng.random() < 0.055
            ? '#'
            : '.'
    ).join('')
  );
  const individuals: EncounterIndividual[] = [];
  for (let index = 0; index < 10; index++) {
    const x = 4 + ((index * 5) % 24);
    const y = 5 + ((index * 3) % 13);
    terrain[y] = terrain[y].substring(0, x) + '.' + terrain[y].substring(x + 1);
    // Guarantee a route from the observation corridor to each spawned contact.
    for (let cx = Math.min(x, 16); cx <= Math.max(x, 16); cx++)
      terrain[y] = terrain[y].substring(0, cx) + '.' + terrain[y].substring(cx + 1);
    individuals.push({
      id: `${site.id}/individual:${index}`,
      speciesId: biosphere.species[index % biosphere.species.length].id,
      x,
      y,
      homeX: x,
      homeY: y,
      state: 'active',
      exposure: 0,
      injury: 0,
      recoveryAt: 0,
      sampled: false,
      alerted: false,
    });
  }
  return {
    site,
    bodyId: biosphere.id,
    seed: site.id,
    species: [...biosphere.species],
    terrain,
    individuals,
    roverX: 16,
    roverY: 21,
    elapsedSeconds: 0,
    turn: 0,
  };
}

/** Returns a field's immutable species definition for one individual. */
export function individualSpecies(field: EncounterField, individual: EncounterIndividual): SpeciesDefinition {
  const species = field.species.find((item) => item.id === individual.speciesId);
  if (!species) throw new Error('Encounter individual references an unknown species.');
  return species;
}

/** Determines sensor/weapon visibility along a short obstacle-tested ray. */
export function encounterVisible(field: EncounterField, individual: EncounterIndividual): boolean {
  if (
    individual.state === 'collected' ||
    Math.hypot(individual.x - field.roverX, individual.y - field.roverY) > 14
  )
    return false;
  // Sample the short ray at sub-cell intervals; this is visibility, not a new navigation engine.
  const dx = individual.x - field.roverX,
    dy = individual.y - field.roverY;
  const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
  for (let step = 1; step < steps; step++) {
    const x = Math.round(field.roverX + (dx * step) / steps),
      y = Math.round(field.roverY + (dy * step) / steps);
    if (field.terrain[y]?.[x] === '#') return false;
  }
  return true;
}

/** Resolves one validated command and advances all local actors on deterministic five-second ticks. */
export class SurfaceEncounterSystem {
  private readonly specimens = new SpecimenCargoSystem();

  /** Commits effects before advancing time; ordinary refusals consume neither time nor random numbers. */
  act(
    field: EncounterField,
    command: EncounterCommand,
    cargo: CargoComponent,
    stasisClass: number
  ): EncounterResult {
    const result: EncounterResult = { message: '', elapsedSeconds: 0, damage: 0 };
    const target =
      'targetId' in command
        ? field.individuals.find((item) => item.id === command.targetId && item.state !== 'collected')
        : undefined;
    if ('targetId' in command && (!target || !encounterVisible(field, target)))
      return { ...result, message: 'No visible biological target.' };
    const species = target ? individualSpecies(field, target) : undefined;
    const range = target ? Math.hypot(target.x - field.roverX, target.y - field.roverY) : 0;
    if (command.kind === 'move') {
      if (Math.abs(command.dx) > 1 || Math.abs(command.dy) > 1 || (!command.dx && !command.dy))
        return { ...result, message: 'Invalid local step.' };
      const x = field.roverX + command.dx,
        y = field.roverY + command.dy;
      if (
        field.terrain[y]?.[x] !== '.' ||
        field.individuals.some(
          (item) =>
            item.state !== 'collected' &&
            item.x === x &&
            item.y === y &&
            !canShareRoverCell(individualSpecies(field, item))
        )
      )
        return { ...result, message: 'Local route obstructed.' };
      if (
        command.dx &&
        command.dy &&
        (field.terrain[field.roverY]?.[x] !== '.' || field.terrain[y]?.[field.roverX] !== '.')
      )
        return { ...result, message: 'Cannot cross the obstacle corner.' };
      field.roverX = x;
      field.roverY = y;
      result.elapsedSeconds = 5 * Math.hypot(command.dx, command.dy);
      result.message = 'Local rover step.';
    } else if (command.kind === 'wait') {
      result.elapsedSeconds = 10;
      result.message = 'Observing local activity.';
    } else if (target && species) {
      if (command.kind === 'observe' || command.kind === 'analyse') {
        if (command.kind === 'analyse' && range > 5)
          return { ...result, message: 'Detailed analysis requires range <=25 m.' };
        result.evidence = {
          species,
          level: command.kind === 'analyse' ? 3 : range <= 8 ? 2 : 1,
          collected: false,
        };
        result.message =
          command.kind === 'analyse' ? 'Biochemical analysis resolved.' : 'Biological observation recorded.';
        result.elapsedSeconds = command.kind === 'analyse' ? 10 : 5;
      } else if (command.kind === 'collect' || command.kind === 'sample') {
        if (range > 1.5) return { ...result, message: 'Approach within 7.5 m for physical sampling.' };
        if (command.kind === 'sample' && target.sampled)
          return { ...result, message: 'This individual has already supplied a tissue sample.' };
        if (
          command.kind === 'collect' &&
          target.state === 'active' &&
          species.behaviour !== 'sessile' &&
          !canShareRoverCell(species)
        )
          return { ...result, message: 'Organism must be incapacitated before collection.' };
        const kind = command.kind === 'sample' ? 'tissue' : target.state === 'dead' ? 'dead' : 'live';
        const container = {
          id: `${target.id}/${kind}`,
          sourceId: target.id,
          siteId: field.site.id,
          species,
          kind,
          quality: Math.max(0.2, 1 - target.injury * 0.35),
          volumeM3: kind === 'tissue' ? 0.1 : Math.ceil((0.2 + species.massKg / 250) * 10) / 10,
        } as const;
        const refusal = this.specimens.add(cargo, container, stasisClass);
        if (refusal) return { ...result, message: refusal };
        if (command.kind === 'sample') target.sampled = true;
        else target.state = 'collected';
        result.evidence = { species, level: 3, collected: true };
        result.message = `${kind === 'live' ? 'Live organism sealed in stasis' : kind === 'dead' ? 'Intact remains secured' : 'Tissue sample sealed'}.`;
        result.elapsedSeconds = 5;
      } else {
        if (range > 8) return { ...result, message: 'Weapon range <=40 m.' };
        if (target.state === 'dead') return { ...result, message: 'Target is already dead.' };
        if (command.kind === 'shoot') {
          target.state = 'dead';
          target.injury = 1;
          result.message = 'Lethal discharge; intact remains available.';
        } else if (command.kind === 'stun') {
          if (species.susceptibility === 0)
            return {
              ...result,
              message: 'Sessile biology has no applicable stun profile; sample or collect instead.',
            };
          const outcome = stunOutcome(species, command.power, target.exposure, target.injury, range * 5);
          const roll = new PRNG(field.seed).seedNew('shot', target.id, field.turn).random();
          target.exposure++;
          target.injury += outcome.dead * 0.3;
          if (roll < outcome.dead) {
            target.state = 'dead';
            result.message = 'Stun overload caused mortality.';
          } else if (roll < outcome.dead + outcome.stunned) {
            target.state = 'stunned';
            target.recoveryAt = field.elapsedSeconds + outcome.recoverySeconds;
            result.message = 'Organism incapacitated; recovery clock running.';
          } else result.message = 'Incapacitation failed; exposure recorded.';
          target.alerted = true;
        }
        result.elapsedSeconds = 2;
      }
    }
    if (result.elapsedSeconds > 0) this.advance(field, result);
    return result;
  }

  /** Updates bounded local behaviour in stable identity order, never using render or travel-clock time. */
  private advance(field: EncounterField, result: EncounterResult): void {
    const previous = field.elapsedSeconds;
    const newlyAlerted = new Set<string>();
    field.elapsedSeconds += result.elapsedSeconds;
    field.turn++;
    for (let tick = Math.floor(previous / 5) + 1; tick <= Math.floor(field.elapsedSeconds / 5); tick++) {
      for (const individual of [...field.individuals].sort((a, b) => a.id.localeCompare(b.id))) {
        if (individual.state === 'stunned' && individual.recoveryAt <= tick * 5) individual.state = 'active';
        if (individual.state !== 'active') continue;
        const species = individualSpecies(field, individual);
        const distance = Math.hypot(individual.x - field.roverX, individual.y - field.roverY);
        const dangerous = species.behaviour === 'territorial' || species.behaviour === 'ambush';
        if (dangerous && distance < (species.behaviour === 'ambush' ? 2 : 4)) {
          if (!individual.alerted) {
            individual.alerted = true;
            newlyAlerted.add(individual.id);
            result.message += ' Defensive display detected.';
          } else if (distance < 1.6 && !newlyAlerted.has(individual.id)) {
            result.damage += species.massKg > 10 ? 8 : 3;
            if (!result.message.includes('strikes rover'))
              result.message += ' Organism strikes rover armour.';
          }
        }
        if (
          species.behaviour === 'sessile' ||
          (species.behaviour === 'ambush' && !individual.alerted) ||
          (species.respiration === 'anaerobic' && tick % 4 !== 0)
        )
          continue;
        const prng = new PRNG(field.seed).seedNew(individual.id, 'behaviour', tick);
        let gx = individual.x + prng.randomInt(-1, 1),
          gy = individual.y + prng.randomInt(-1, 1);
        if (species.behaviour === 'skittish' && distance < 7) {
          gx = individual.x + Math.sign(individual.x - field.roverX) * 4;
          gy = individual.y + Math.sign(individual.y - field.roverY) * 4;
        } else if (dangerous && individual.alerted && distance < 6) {
          gx = field.roverX;
          gy = field.roverY;
        }
        if (
          Math.hypot(individual.x - individual.homeX, individual.y - individual.homeY) > 7 &&
          distance > 6
        ) {
          gx = individual.homeX;
          gy = individual.homeY;
        }
        gx = Math.max(1, Math.min(ENCOUNTER_WIDTH - 2, gx));
        gy = Math.max(1, Math.min(ENCOUNTER_HEIGHT - 2, gy));
        const route: Array<[number, number]> = [];
        const path = new Path.AStar(
          gx,
          gy,
          (x, y) => field.terrain[y]?.[x] === '.' && !(x === 16 && y === 21),
          { topology: 4 }
        );
        path.compute(individual.x, individual.y, (x, y) => route.push([x, y]));
        const next = route[1];
        if (
          next &&
          field.terrain[next[1]]?.[next[0]] === '.' &&
          !(next[0] === 16 && next[1] === 21) &&
          !(next[0] === field.roverX && next[1] === field.roverY) &&
          !field.individuals.some(
            (other) =>
              other.id !== individual.id &&
              other.state !== 'collected' &&
              other.x === next[0] &&
              other.y === next[1]
          )
        ) {
          individual.x = next[0];
          individual.y = next[1];
        }
      }
    }
    // Evaluate exact recovery deadlines even when a short command does not cross a behaviour tick.
    for (const individual of field.individuals)
      if (individual.state === 'stunned' && individual.recoveryAt <= field.elapsedSeconds)
        individual.state = 'active';
  }
}
