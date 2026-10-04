import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import {
  HABITAT_VERSION,
  type BiosphereDefinition,
  type SpeciesDefinition,
} from '../../entities/biology/biology_types';
import { createEncounter } from '../../systems/surface_encounter_system';
import { PRNG } from '../../utils/prng';
import { biologyFixture } from './biology';

/** Supplies a canonical, nonaggressive consumer already at a real feeding resource within instrument range. */
export function ethologyFixture(siteId = 'ethology/site:4,4') {
  const generated = generateBiosphere(biologyFixture({ bodyId: '0,0,0/planet:0/bio3' }))!;
  const producer = generated.species[0];
  const consumer: SpeciesDefinition = {
    ...generated.species[1],
    behaviour: 'passive' as const,
    socialBehaviour: undefined,
    foragingGuild: 'grazer' as const,
    seeksShelter: true,
  };
  const site = {
    id: siteId,
    label: 'Ethology margin',
    x: 4,
    y: 4,
    habitat: {
      version: HABITAT_VERSION,
      kind: 'moist-margin' as const,
      description: 'Water-adjacent substrate.',
      relief: 0.02,
      waterDistanceCells: 1,
    },
  };
  const biosphere: BiosphereDefinition = { ...generated, species: [producer, consumer], sites: [site] };
  const field = createEncounter(biosphere, site);
  const sources = field.individuals.filter((actor) => actor.speciesId === producer.id);
  const consumers = field.individuals.filter((actor) => actor.speciesId === consumer.id);
  const source = sources[0];
  const actor = consumers[0];
  source.x = source.homeX = 10;
  source.y = source.homeY = 10;
  actor.x = actor.homeX = 11;
  actor.y = actor.homeY = 10;
  field.individuals = [source, actor];
  field.terrain = field.terrain.map((row) => row.replaceAll('#', '.'));
  field.patches = field.terrain.map((_row, y) => (y === 9 ? 's' : 'm').repeat(32));
  field.roverX = 18;
  field.roverY = 10;
  const phase = new PRNG(field.seed).seedNew(actor.id, 'activity-phase').randomInt(0, 5);
  const firstFeedingTick = ((2 - phase + 6) % 6) + 6;
  field.elapsedSeconds = (firstFeedingTick - 1) * 5;
  return { field, actor, source, producer, consumer, biosphere };
}
