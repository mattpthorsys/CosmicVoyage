import type {
  BiosphereDefinition,
  EncounterField,
  SpecimenContainer,
} from '../entities/biology/biology_types';
import type { Starbase } from '../entities/starbase';
import type { CargoComponent, ResourceComponent } from './components';
import { createEncounter } from '../systems/surface_encounter_system';
import { stasisCompatibility } from '../systems/specimen_cargo_system';
import { matchesSpecimenObjective, type StarbaseMission } from './mission_board';
import type { MissionProgressService } from './mission_progress';
import type { XenobiologyService } from './xenobiology_service';

export interface BiologicalDeliveryContext {
  readonly station: Pick<Starbase, 'id' | 'name' | 'kind'>;
  readonly holds: readonly CargoComponent[];
  readonly resources: Pick<ResourceComponent, 'credits'>;
}

export type BiologicalDeliveryResult =
  | { readonly ok: false; readonly message: string }
  | { readonly ok: true; readonly message: string; readonly credits: number; readonly containerId: string };

/** Offers one finite habitat-reference request only when a real compatible specimen remains obtainable. */
export function createBiologicalContract(
  station: Pick<Starbase, 'id' | 'name' | 'kind'>,
  systemName: string,
  biospheres: readonly BiosphereDefinition[],
  fields: Readonly<Record<string, EncounterField>>,
  owned: readonly SpecimenContainer[] = []
): StarbaseMission | null {
  if (station.kind === 'automated-depot') return null;
  const sites = biospheres
    .flatMap((biosphere) => biosphere.sites.map((site) => ({ biosphere, site })))
    .filter(({ site }) => !!site.habitat)
    .sort(
      (a, b) =>
        Number(b.site.habitat?.kind === 'moist-margin') - Number(a.site.habitat?.kind === 'moist-margin') ||
        a.site.id.localeCompare(b.site.id)
    );
  for (const { biosphere, site } of sites) {
    const field = fields[site.id] ?? createEncounter(biosphere, site);
    const species = [...field.species]
      .sort((a, b) => Number(!!b.socialBehaviour) - Number(!!a.socialBehaviour))
      .find(
        (entry) =>
          entry.recognised &&
          !stasisCompatibility(entry, 1) &&
          (field.individuals.some(
            (actor) =>
              actor.speciesId === entry.id &&
              ['active', 'stunned'].includes(actor.state) &&
              actor.injury <= 0.7
          ) ||
            owned.some(
              (container) =>
                container.siteId === site.id &&
                container.species.id === entry.id &&
                container.kind === 'live' &&
                container.quality >= 0.75
            ))
      );
    if (!species) continue;
    const id = station.id
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    return {
      id: `${id}:mission:bio-reference`,
      title: 'Habitat reference specimen',
      type: 'xenobiology',
      issuer: 'Xenobiology Survey Office',
      summary: `Live ${species.name} from ${biosphere.bodyName}, X${site.x} Y${site.y}.`,
      detail: `${site.label}: ${site.habitat!.description} A regional reference is needed, not a new-species claim. Basic stasis compatible. Minimum specimen quality 75%. Deliver one sealed live container to ${station.name}; 900 Cr contract fee plus remaining ordinary research value. Tissue or dead material does not satisfy this request.`,
      rewardCredits: 900,
      risk: ['territorial', 'ambush'].includes(species.behaviour) ? 'Med' : 'Low',
      originStarbaseId: station.id,
      originStarbaseName: station.name,
      systemName,
      objectives: [
        {
          id: 'live-reference',
          kind: 'specimen',
          targetName: species.name,
          targetLabel: `Live ${species.name} / ${biosphere.bodyName} / X${site.x} Y${site.y} / quality >=75%`,
          speciesId: species.id,
          siteId: site.id,
          requiredKind: 'live',
          minimumQuality: 0.75,
        },
      ],
    };
  }
  return null;
}

/** Validates all delivery owners before settling one whole specimen and publishing no intermediate effects. */
export function deliverBiologicalContract(
  progress: MissionProgressService,
  research: XenobiologyService,
  context: BiologicalDeliveryContext,
  missionId: string
): BiologicalDeliveryResult {
  const mission = progress.getMission(missionId);
  if (!mission || mission.objectives.length !== 1 || mission.objectives[0].kind !== 'specimen')
    return { ok: false, message: 'No active biological delivery request.' };
  if (context.station.kind === 'automated-depot')
    return { ok: false, message: 'No scientific receiving staff at this depot.' };
  if (
    mission.originStarbaseId
      ? mission.originStarbaseId !== context.station.id
      : mission.originStarbaseName !== context.station.name
  )
    return { ok: false, message: `Deliver the live reference to ${mission.originStarbaseName}.` };
  const objective = mission.objectives[0];
  const containers = context.holds.flatMap((hold) => hold.specimens ?? []);
  const container = containers.find((entry) => matchesSpecimenObjective(objective, entry));
  if (!container)
    return {
      ok: false,
      message: 'Requested live specimen is not aboard, or its habitat/quality does not match.',
    };
  if (containers.filter((entry) => entry.id === container.id).length !== 1)
    return { ok: false, message: 'Specimen ownership is ambiguous; delivery refused.' };
  const field = research.snapshot.fields[container.siteId];
  const source = field?.individuals.find((actor) => actor.id === container.sourceId);
  if (
    !source ||
    source.state !== 'collected' ||
    source.speciesId !== container.species.id ||
    field.bodyId !== container.species.bodyId ||
    (research.evidence(container.species.id)?.level ?? 0) < 2
  )
    return { ok: false, message: 'Specimen collection provenance cannot be confirmed.' };
  const contribution = `${container.sourceId}:${container.kind}`;
  if (research.snapshot.demand[container.species.id]?.contributions.includes(contribution))
    return { ok: false, message: 'This specimen has already been submitted.' };
  // No callbacks run between preparation and commit. Every ordinary refusal occurs above.
  const settled = progress.handIn(missionId, context.station.name, context.station.id, container);
  if (!settled) return { ok: false, message: 'Contract delivery is not ready for settlement.' };
  const researchCredits = research.submit(container.species, container, true);
  for (const hold of context.holds)
    hold.specimens = (hold.specimens ?? []).filter((entry) => entry.id !== container.id);
  const credits = settled.rewardCredits + researchCredits;
  context.resources.credits += credits;
  return {
    ok: true,
    credits,
    containerId: container.id,
    message: `Live reference accepted: ${container.species.name}. Contract ${settled.rewardCredits} Cr + research ${researchCredits} Cr.`,
  };
}
