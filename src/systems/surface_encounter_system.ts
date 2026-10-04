import { Path } from 'rot-js';
import { PRNG } from '../utils/prng';
import type { CargoComponent } from '../core/components';
import { SpecimenCargoSystem } from './specimen_cargo_system';
import { stunOutcome } from '../entities/biology/stun_model';
import {
  canShareRoverCell,
  individualPhysicalProfile,
  isMicrobialPatch,
  MICROBIAL_SAMPLE_MASS_KG,
  MICROBIAL_CASSETTE_VOLUME_M3,
} from '../entities/biology/biology_rules';
import { defensiveIntent } from './organism_behaviour';
import { habitatForagingIntent } from './organism_foraging';
import { createHabitatPatches, habitatCommunity } from '../entities/biology/habitat';
import { propaguleAvailability, PROPAGULE_VOLUME_M3 } from '../entities/biology/propagules';
import {
  ENCOUNTER_HEIGHT,
  ENCOUNTER_WIDTH,
  type BiologySite,
  type BiosphereDefinition,
  type EncounterField,
  type EncounterIndividual,
  type EvidenceLevel,
  type SpeciesDefinition,
  type SpecimenContainer,
  type SpecimenKind,
  type StunPower,
  type BehaviourWitness,
  type BehaviourObservationKind,
} from '../entities/biology/biology_types';

export type EncounterCommand =
  | { kind: 'move'; dx: number; dy: number }
  | { kind: 'observe' | 'analyse' | 'sample' | 'collect' | 'shoot' | 'harvest'; targetId: string }
  | { kind: 'stun'; targetId: string; power: StunPower }
  | { kind: 'wait' };

export interface EncounterResult {
  behaviourWitnesses?: BehaviourWitness[];
  message: string;
  elapsedSeconds: number;
  damage: number;
  evidence?: { species: SpeciesDefinition; level: EvidenceLevel; collected: boolean };
}

/** Creates a bounded, connected local patch independently of regional terrain/resource random streams. */
export function createEncounter(biosphere: BiosphereDefinition, site: BiologySite): EncounterField {
  const prng = new PRNG(site.id).seedNew('field');
  const patches = site.habitat ? createHabitatPatches(site.id, site.habitat.kind) : undefined;
  // Keep the central/entry corridor clear so every expedition has a reachable return route.
  const terrain = Array.from({ length: ENCOUNTER_HEIGHT }, (_, y) =>
    Array.from({ length: ENCOUNTER_WIDTH }, (_, x) =>
      x === 0 || y === 0 || x === ENCOUNTER_WIDTH - 1 || y === ENCOUNTER_HEIGHT - 1
        ? '#'
        : x === 16 || y === 21
          ? '.'
          : prng.random() < (patches ? (patches[y][x] === 's' ? 0.13 : 0.035) : 0.055)
            ? '#'
            : '.'
    ).join('')
  );
  // Fields without a habitat profile retain their original composition and save semantics.
  if (site.habitat && patches) {
    return {
      site,
      bodyId: biosphere.id,
      seed: site.id,
      species: [...biosphere.species],
      terrain,
      patches,
      individuals: createHabitatPopulation(biosphere, site, terrain, patches),
      roverX: 16,
      roverY: 21,
      elapsedSeconds: 0,
      turn: 0,
    };
  }
  const individuals: EncounterIndividual[] = [];
  for (let index = 0; index < (biosphere.complexity === 'microbial-only' ? 4 : 10); index++) {
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

/** Places a sparse producer-dominated community in reachable, ecologically appropriate local patches. */
function createHabitatPopulation(
  biosphere: BiosphereDefinition,
  site: BiologySite,
  terrain: string[],
  patches: string[]
): EncounterIndividual[] {
  if (!site.habitat) return [];
  const community = habitatCommunity(biosphere, site.habitat.kind);
  const selection = new PRNG(site.id).seedNew('native-community');
  const producers = community.filter((species) => species.metabolism !== 'heterotroph');
  const producer = biosphere.origin === 'native' ? weightedSpecies(producers, selection) : producers[0];
  const availableConsumers = community.filter((species) => species.metabolism === 'heterotroph');
  const firstConsumer = weightedSpecies(availableConsumers, selection);
  const consumers =
    biosphere.origin === 'native'
      ? [
          firstConsumer,
          weightedSpecies(
            availableConsumers.filter((entry) => entry !== firstConsumer),
            selection
          ),
        ].filter((entry): entry is SpeciesDefinition => !!entry)
      : availableConsumers;
  if (!producer) return [];
  const sparse = site.habitat.kind === 'exposed-ground' || site.habitat.kind === 'upland-ground';
  const microbialOnly = biosphere.species.every(isMicrobialPatch);
  const population = [
    ...Array.from({ length: microbialOnly ? 2 : sparse ? 3 : 4 }, () => producer),
    ...Array.from({ length: microbialOnly || sparse ? 1 : 3 }, () => consumers[0]).filter(
      (species) => !!species
    ),
    ...consumers.slice(1, 2),
  ];
  const individuals: EncounterIndividual[] = [];
  for (const [index, species] of population.entries()) {
    const prng = new PRNG(site.id).seedNew('community', index);
    const patch =
      (site.habitat.kind === 'moist-margin' || site.habitat.kind === 'rocky-margin') &&
      species !== consumers[1]
        ? 'm'
        : sparse
          ? 'o'
          : 's';
    const cells: Array<{ x: number; y: number }> = [];
    for (let y = 3; y < 19; y++)
      for (let x = 3; x < ENCOUNTER_WIDTH - 3; x++) {
        if (patches[y][x] !== patch || individuals.some((actor) => actor.x === x && actor.y === y)) continue;
        if (
          species.socialBehaviour &&
          individuals.some((actor) => actor.speciesId === species.id) &&
          !individuals.some(
            (actor) => actor.speciesId === species.id && Math.hypot(actor.x - x, actor.y - y) <= 4
          )
        )
          continue;
        cells.push({ x, y });
      }
    // Give a sparse microbial expedition one nearby, reachable pigment-film contact to investigate.
    const cell =
      microbialOnly && index === 0
        ? cells.sort((a, b) => Math.hypot(a.x - 16, a.y - 21) - Math.hypot(b.x - 16, b.y - 21))[0]
        : prng.choice(cells);
    if (!cell) continue;
    const { x, y } = cell;
    const ordinal = individuals.filter((actor) => actor.speciesId === species.id).length;
    const massScale =
      [0.45, 1, 1.65][ordinal % 3] * new PRNG(site.id).seedNew('individual-size', index).random(0.94, 1.06);
    const mineralisation =
      biosphere.origin === 'native' && species.structuralMaterial && species.structuralMaterial !== 'organic'
        ? new PRNG(site.id).seedNew('individual-covering', index).random() < 0.22
          ? 'reinforced'
          : 'standard'
        : undefined;
    // The existing low-energy anaerobic content remains small even at the top of its size distribution.
    const sizeScale =
      species.respiration === 'anaerobic'
        ? Math.min(massScale, 3 / (species.massKg * (mineralisation === 'reinforced' ? 1.15 : 1)))
        : massScale;
    // Join each contact to the observation corridor, regardless of illustrative outcrop placement.
    for (let cx = Math.min(x, 16); cx <= Math.max(x, 16); cx++)
      terrain[y] = terrain[y].substring(0, cx) + '.' + terrain[y].substring(cx + 1);
    individuals.push({
      id: `${site.id}/individual:${index}`,
      speciesId: species.id,
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
      groupId: species.socialBehaviour ? `${site.id}/group:${species.id}` : undefined,
      retreatUntil: species.socialBehaviour ? 0 : undefined,
      sizeScale,
      mineralisation,
    });
  }
  return individuals;
}

/** Samples finite community weights without rewarding rare taxa or disturbing generation outside biology. */
function weightedSpecies(species: readonly SpeciesDefinition[], prng: PRNG): SpeciesDefinition | undefined {
  let roll = prng.random() * species.reduce((total, entry) => total + (entry.relativeAbundance ?? 1), 0);
  return species.find((entry) => (roll -= entry.relativeAbundance ?? 1) < 0);
}

/** Returns a field's immutable species definition for one individual. */
export function individualSpecies(field: EncounterField, individual: EncounterIndividual): SpeciesDefinition {
  const species = field.species.find((item) => item.id === individual.speciesId);
  if (!species) throw new Error('Encounter individual references an unknown species.');
  return species;
}

/** Resolves effective dimensions for handling, outcomes and presentation while leaving catalogue traits canonical. */
export function individualProfile(field: EncounterField, individual: EncounterIndividual): SpeciesDefinition {
  return individualPhysicalProfile(
    individualSpecies(field, individual),
    individual.sizeScale,
    individual.mineralisation
  );
}

/** Builds the same sealed contribution for cargo previews and the actual collection transaction. */
export function createCollectionContainer(
  field: EncounterField,
  target: EncounterIndividual,
  kind: SpecimenKind
): SpecimenContainer {
  const profile = individualProfile(field, target);
  return {
    id: `${target.id}/${kind}`,
    sourceId: target.id,
    siteId: field.site.id,
    species: individualSpecies(field, target),
    kind,
    quality: Math.max(0.2, 1 - target.injury * 0.35),
    materialMassKg: isMicrobialPatch(profile) ? MICROBIAL_SAMPLE_MASS_KG : undefined,
    volumeM3: isMicrobialPatch(profile)
      ? MICROBIAL_CASSETTE_VOLUME_M3
      : kind === 'propagule'
        ? PROPAGULE_VOLUME_M3
        : kind === 'tissue'
          ? 0.1
          : Math.ceil((0.2 + profile.massKg / 250) * 10) / 10,
    sizeScale: target.sizeScale,
    mineralisation: target.mineralisation,
  };
}

/** Determines sensor/weapon visibility along a short obstacle-tested ray. */
export function encounterVisible(field: EncounterField, individual: EncounterIndividual): boolean {
  const species = individualSpecies(field, individual);
  const radius = isMicrobialPatch(species) ? (species.surfaceExpression === 'pigmented-film' ? 8 : 3) : 14;
  if (
    individual.state === 'collected' ||
    Math.hypot(individual.x - field.roverX, individual.y - field.roverY) > radius
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
    const profile = target ? individualProfile(field, target) : undefined;
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
            !canShareRoverCell(individualProfile(field, item))
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
    } else if (target && species && profile) {
      if (isMicrobialPatch(species) && (command.kind === 'shoot' || command.kind === 'stun'))
        return { ...result, message: 'Microbial patches are sampled, not weapon targets.' };
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
      } else if (command.kind === 'collect' || command.kind === 'sample' || command.kind === 'harvest') {
        if (range > 1.5) return { ...result, message: 'Approach within 7.5 m for physical sampling.' };
        if (command.kind === 'harvest') {
          const refusal = propaguleAvailability(species, target);
          if (refusal) return { ...result, message: refusal };
        }
        if (command.kind === 'sample' && target.sampled)
          return {
            ...result,
            message: isMicrobialPatch(species)
              ? 'This patch has already supplied its material sample.'
              : 'This individual has already supplied a tissue sample.',
          };
        if (
          command.kind === 'collect' &&
          target.state === 'active' &&
          species.behaviour !== 'sessile' &&
          !canShareRoverCell(profile)
        )
          return { ...result, message: 'Organism must be incapacitated before collection.' };
        const kind =
          command.kind === 'harvest'
            ? 'propagule'
            : command.kind === 'sample'
              ? 'tissue'
              : target.state === 'dead'
                ? 'dead'
                : 'live';
        const container = createCollectionContainer(field, target, kind);
        const refusal = this.specimens.add(cargo, container, stasisClass);
        if (refusal) return { ...result, message: refusal };
        if (command.kind === 'harvest') target.propagulesHarvested = true;
        else if (command.kind === 'sample') target.sampled = true;
        else target.state = 'collected';
        result.evidence = { species, level: 3, collected: true };
        result.message = isMicrobialPatch(species)
          ? `${kind === 'live' ? 'Viable microbial material sealed in stasis' : 'Microbial material sample sealed'}; 5 g material in a 0.1 m^3 cassette. ${kind === 'live' ? 'Viable sampling contact exhausted; surrounding substrate left intact.' : 'Patch remains in place; one material sample per source.'}`
          : `${kind === 'propagule' ? 'Viable buds sealed in stasis; parent left intact' : kind === 'live' ? 'Live organism sealed in stasis' : kind === 'dead' ? 'Intact remains secured' : 'Tissue sample sealed'}.`;
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
          const outcome = stunOutcome(profile, command.power, target.exposure, target.injury, range * 5);
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
    if (result.elapsedSeconds > 0)
      this.advance(field, result, ['move', 'wait', 'observe', 'analyse'].includes(command.kind));
    return result;
  }

  /** Updates bounded local behaviour in stable identity order, never using render or travel-clock time. */
  private advance(field: EncounterField, result: EncounterResult, passiveObservation: boolean): void {
    const previous = field.elapsedSeconds;
    const newlyAlerted = new Set<string>();
    field.elapsedSeconds += result.elapsedSeconds;
    field.turn++;
    for (let tick = Math.floor(previous / 5) + 1; tick <= Math.floor(field.elapsedSeconds / 5); tick++) {
      const moved = new Set<string>();
      this.alertGroups(field, tick * 5, result);
      for (const individual of [...field.individuals].sort((a, b) => a.id.localeCompare(b.id))) {
        if (individual.state === 'stunned' && individual.recoveryAt <= tick * 5) {
          individual.state = 'active';
          individual.alerted = false;
          individual.displayUntil = undefined;
        }
        if (individual.state !== 'active') continue;
        const species = individualProfile(field, individual);
        const distance = Math.hypot(individual.x - field.roverX, individual.y - field.roverY);
        const sensed = encounterVisible(field, individual);
        const defense = defensiveIntent(field, individual, species, tick * 5, sensed, newlyAlerted);
        if (
          defense?.warning &&
          !result.message.includes('display') &&
          !result.message.includes('Threat posture')
        )
          result.message += ` ${defense.warning}`;
        if (defense?.damage) {
          result.damage += defense.damage;
          if (!result.message.includes('strikes rover')) result.message += ' Organism strikes rover armour.';
        }
        if (defense && !defense.goal) continue;
        if (species.behaviour === 'sessile') individual.activity = 'attached';
        if (
          species.behaviour === 'sessile' ||
          (species.behaviour === 'ambush' && !individual.alerted) ||
          (species.respiration === 'anaerobic' && tick % 4 !== 0)
        )
          continue;
        const prng = new PRNG(field.seed).seedNew(individual.id, 'behaviour', tick);
        let gx = individual.x + prng.randomInt(-1, 1),
          gy = individual.y + prng.randomInt(-1, 1);
        let arrivedActivity: 'feeding' | 'sheltering' | undefined;
        const retreating = individual.groupId && (individual.retreatUntil ?? 0) > tick * 5;
        if (defense?.goal) {
          [gx, gy] = defense.goal;
        } else if (retreating || (species.behaviour === 'skittish' && sensed && distance < 6)) {
          individual.activity = 'withdrawing';
          gx = individual.x + Math.sign(individual.x - field.roverX) * 4;
          gy = individual.y + Math.sign(individual.y - field.roverY) * 4;
        } else {
          const foraging = habitatForagingIntent(field, individual, species, tick);
          if (foraging) {
            individual.activity = foraging.activity;
            if (!foraging.goal) continue;
            [gx, gy] = foraging.goal;
            arrivedActivity = foraging.activity === 'returning' ? 'sheltering' : 'feeding';
          } else {
            const phase = new PRNG(field.seed).seedNew(individual.id, 'activity-phase').randomInt(0, 5);
            individual.activity = (tick + phase) % 6 < 2 ? 'resting' : 'foraging';
            if (individual.activity === 'resting') continue;
          }
        }
        if (
          !defense &&
          !retreating &&
          !species.foragingGuild &&
          individual.groupId &&
          individual.activity === 'foraging'
        ) {
          const neighbours = field.individuals.filter(
            (other) =>
              other.id !== individual.id && other.state === 'active' && other.groupId === individual.groupId
          );
          if (neighbours.length) {
            const centreX = neighbours.reduce((sum, actor) => sum + actor.x, 0) / neighbours.length;
            const centreY = neighbours.reduce((sum, actor) => sum + actor.y, 0) / neighbours.length;
            if (Math.hypot(centreX - individual.x, centreY - individual.y) > 4) {
              gx = Math.round(centreX);
              gy = Math.round(centreY);
            }
          }
        }
        if (
          Math.hypot(individual.x - individual.homeX, individual.y - individual.homeY) > 7 &&
          distance > 6 &&
          !retreating &&
          !defense
        ) {
          gx = individual.homeX;
          gy = individual.homeY;
          arrivedActivity = undefined;
        }
        gx = Math.max(1, Math.min(ENCOUNTER_WIDTH - 2, gx));
        gy = Math.max(1, Math.min(ENCOUNTER_HEIGHT - 2, gy));
        const route: Array<[number, number]> = [];
        const path = new Path.AStar(
          gx,
          gy,
          (x, y) =>
            field.terrain[y]?.[x] === '.' &&
            !(x === 16 && y === 21) &&
            !field.individuals.some(
              (other) =>
                other.id !== individual.id && other.state !== 'collected' && other.x === x && other.y === y
            ),
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
          if (arrivedActivity && individual.x === gx && individual.y === gy)
            individual.activity = arrivedActivity;
          moved.add(individual.id);
        }
      }
      if (passiveObservation) this.recordVisibleActivity(field, result, moved, tick * 5);
    }
    // Evaluate exact recovery deadlines even when a short command does not cross a behaviour tick.
    for (const individual of field.individuals)
      if (individual.state === 'stunned' && individual.recoveryAt <= field.elapsedSeconds) {
        individual.state = 'active';
        individual.alerted = false;
        individual.displayUntil = undefined;
      }
  }

  /** Records actual uninjured activity in the instrument's 40 m sightline, never inferred AI intentions. */
  private recordVisibleActivity(
    field: EncounterField,
    result: EncounterResult,
    moved: ReadonlySet<string>,
    elapsedSeconds: number
  ): void {
    const visible = field.individuals.filter(
      (actor) =>
        actor.state === 'active' &&
        actor.injury === 0 &&
        actor.exposure === 0 &&
        !actor.sampled &&
        Math.hypot(actor.x - field.roverX, actor.y - field.roverY) <= 8 &&
        encounterVisible(field, actor)
    );
    for (const actor of visible) {
      let kind: BehaviourObservationKind | undefined;
      let individualIds = [actor.id];
      if (actor.activity === 'feeding') kind = 'feeding';
      else if (actor.activity === 'sheltering') kind = 'shelter-use';
      else if (actor.activity === 'displaying') kind = 'defensive-display';
      else if (actor.activity === 'withdrawing' && actor.groupId && moved.has(actor.id)) {
        individualIds = visible
          .filter(
            (other) =>
              other.groupId === actor.groupId && other.activity === 'withdrawing' && moved.has(other.id)
          )
          .map((other) => other.id)
          .sort();
        if (individualIds.length >= 2) kind = 'group-retreat';
      }
      if (
        !kind ||
        result.behaviourWitnesses?.some(
          (entry) => entry.species.id === actor.speciesId && entry.observation.kind === kind
        )
      )
        continue;
      (result.behaviourWitnesses ??= []).push({
        species: individualSpecies(field, actor),
        observation: { kind, siteId: field.site.id, individualIds, elapsedSeconds },
      });
    }
  }

  /** Shares a nearby sensed disturbance before any member moves, keeping actor order irrelevant. */
  private alertGroups(field: EncounterField, timeSeconds: number, result: EncounterResult): void {
    const sentinels = field.individuals.filter(
      (actor) =>
        actor.state === 'active' &&
        actor.groupId &&
        Math.hypot(actor.x - field.roverX, actor.y - field.roverY) < 6 &&
        encounterVisible(field, actor)
    );
    let newlyRetreating = false;
    for (const actor of field.individuals) {
      if (
        actor.state !== 'active' ||
        !actor.groupId ||
        !sentinels.some(
          (sentinel) =>
            sentinel.groupId === actor.groupId && Math.hypot(sentinel.x - actor.x, sentinel.y - actor.y) <= 8
        )
      )
        continue;
      newlyRetreating ||= (actor.retreatUntil ?? 0) <= timeSeconds;
      actor.retreatUntil = timeSeconds + 15;
    }
    if (newlyRetreating && !result.message.includes('Group withdrawal'))
      result.message += ' Group withdrawal: nearby grazers retreat together.';
  }
}
