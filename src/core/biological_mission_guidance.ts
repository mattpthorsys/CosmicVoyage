import type {
  EncounterField,
  EncounterIndividual,
  SpeciesDefinition,
} from '../entities/biology/biology_types';
import { individualPhysicalProfile, individualSizeClass } from '../entities/biology/biology_rules';
import { stasisCompatibility } from '../systems/specimen_cargo_system';
import type { BiologicalReference, MissionStatus, StarbaseMission } from './mission_board';
import type { TextDashboardLine } from './text_ui';

export type BiologicalReferenceTrait = keyof BiologicalReference | 'name';

export interface BiologicalFieldRequest {
  readonly mission: StarbaseMission;
  readonly status: MissionStatus;
  readonly completedObjectiveIds?: readonly string[];
}

export interface BiologicalMissionGuidance {
  readonly eligible: boolean;
  readonly confirmed: boolean;
  readonly traits: readonly BiologicalReferenceTrait[];
  readonly lines: readonly TextDashboardLine[];
  readonly summary?: TextDashboardLine;
}

/** Copies the office's observable reference traits, excluding hidden chemistry and individual condition. */
export function createBiologicalReference(species: SpeciesDefinition): BiologicalReference {
  return {
    symmetry: species.symmetry,
    bodyForm: species.bodyForm,
    locomotion: species.locomotion,
    metabolism: species.metabolism,
    role: species.role,
    behaviour: species.behaviour,
  };
}

/** Compares acquired traits and exact provenance; similar anatomy alone never confirms a species. */
export function assessBiologicalRequests(
  species: SpeciesDefinition,
  level: number,
  requests: readonly BiologicalFieldRequest[],
  contact: { field: EncounterField; target: EncounterIndividual; stasisClass: number }
): BiologicalMissionGuidance {
  const traits = new Set<BiologicalReferenceTrait>();
  const lines: TextDashboardLine[] = [];
  const requirements = new Set<string>();
  let eligible = false,
    confirmed = false;
  if (level < 1) return { eligible, confirmed, traits: [], lines };
  const canonical = contact.field.species.find((entry) => entry.id === species.id) ?? species;
  const observed: readonly BiologicalReferenceTrait[] =
    level >= 2
      ? ['symmetry', 'bodyForm', 'locomotion', 'metabolism', 'behaviour', 'role']
      : ['symmetry', 'bodyForm', 'locomotion', 'metabolism'];
  for (const { mission, status, completedObjectiveIds } of requests) {
    if (status !== 'ACTIVE' && status !== 'READY') continue;
    for (const objective of mission.objectives) {
      if (objective.kind === 'scan') continue;
      const sameSite = objective.siteId === contact.field.site.id;
      const reference = objective.reference;
      const compared = reference
        ? observed.filter((key) => key !== 'name' && reference[key] !== undefined)
        : [];
      const matching = compared.filter(
        (key) => reference && key !== 'name' && species[key] === reference[key]
      );
      if (level < 2) {
        // Preliminary similarities are useful leads, but the hidden species ID is not consulted here.
        if (!sameSite || !compared.length || matching.length !== compared.length) continue;
        matching.forEach((key) => traits.add(key));
        lines.push({
          segments: [
            {
              text: `POSSIBLE REFERENCE / ${objective.targetName}. Observe to confirm species.`,
              tone: 'amber',
              font: 'thin',
            },
          ],
        });
        continue;
      }
      if (species.id !== objective.speciesId) continue;
      confirmed = true;
      traits.add('name');
      (reference ? matching : observed).forEach((key) => traits.add(key));
      let reason: string | null = null;
      if (!sameSite)
        reason = `Other habitat required: ${objective.location?.surface?.label ?? 'see mission coordinates'}`;
      else if (status === 'READY')
        reason =
          objective.kind === 'biology-data'
            ? 'Analysis recorded; return to issuer'
            : 'Reference aboard; return to issuer';
      else if (completedObjectiveIds?.includes(objective.id))
        reason =
          objective.kind === 'biology-data'
            ? 'Analysis recorded; other contributions still needed'
            : 'Contribution aboard; other contributions still needed';
      else if (contact.target.state === 'collected') reason = 'Individual already collected';
      else if (objective.kind === 'specimen') {
        const quality = Math.max(0.2, 1 - contact.target.injury * 0.35);
        if (objective.sizeClass && individualSizeClass(contact.target.sizeScale) !== objective.sizeClass)
          reason = `${objective.sizeClass.toUpperCase()} individual required; observed ${individualSizeClass(contact.target.sizeScale).toUpperCase()}`;
        else if (
          objective.mineralisation &&
          (contact.target.mineralisation ?? 'standard') !== objective.mineralisation
        )
          reason = `${objective.mineralisation.toUpperCase()} covering required`;
        else if (quality < objective.minimumQuality)
          reason = `Quality ${Math.round(quality * 100)}%; minimum ${Math.round(objective.minimumQuality * 100)}%`;
        else if (objective.requiredKind === 'tissue' && contact.target.sampled)
          reason = 'This individual has already been sampled';
        else if (objective.requiredKind === 'live') {
          if (contact.target.state === 'dead') reason = 'Dead organism; live reference required';
          else
            reason = stasisCompatibility(
              individualPhysicalProfile(canonical, contact.target.sizeScale, contact.target.mineralisation),
              contact.stasisClass
            );
        }
      }
      const canContribute = reason === null;
      eligible ||= canContribute;
      const requirement =
        objective.kind === 'biology-data'
          ? 'FIELD ANALYSIS'
          : `${objective.mineralisation ? `${objective.mineralisation.toUpperCase()} ` : ''}${objective.sizeClass ? `${objective.sizeClass.toUpperCase()} ` : ''}${objective.requiredKind.toUpperCase()} REFERENCE`;
      if (canContribute)
        requirements.add(
          objective.kind === 'biology-data'
            ? 'ANALYSIS'
            : `${objective.mineralisation ? `${objective.mineralisation.toUpperCase()} ` : ''}${objective.sizeClass ? `${objective.sizeClass.toUpperCase()} ` : ''}${objective.requiredKind.toUpperCase()}`
        );
      lines.push({
        segments: [
          {
            text: `${canContribute ? '+ MISSION MATCH' : 'SPECIES MATCH'} / ${requirement} / ${reason ?? mission.title}`,
            tone: canContribute ? 'match' : 'amber',
            font: 'thin',
          },
        ],
      });
    }
  }
  const summary = eligible
    ? {
        segments: [
          {
            text: `+ MISSION TARGET / ${[...requirements].join(' + ')}`,
            tone: 'match' as const,
            font: 'thin' as const,
          },
        ],
      }
    : lines[0];
  return { eligible, confirmed, traits: [...traits], lines, summary };
}
