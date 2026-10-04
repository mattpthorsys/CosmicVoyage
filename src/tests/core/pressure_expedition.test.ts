import { describe, expect, it } from 'vitest';
import { PRNG } from '../../utils/prng';
import { pressureBiologyFixture } from '../fixtures/biology';
import { generatePressureCommunity } from '../../entities/biology/pressure_biosphere';
import type { BiosphereDefinition } from '../../entities/biology/biology_types';
import { validateSpecies, validateXenobiology } from '../../entities/biology/biology_validation';
import { PRESERVATION_KITS, preservationKit } from '../../entities/biology/preservation';
import { createEncounter, SurfaceEncounterSystem } from '../../systems/surface_encounter_system';
import { SpecimenCargoSystem, stasisCompatibility } from '../../systems/specimen_cargo_system';
import { createDefaultCargo } from '../../core/components';
import {
  createDefaultShipModifications,
  createShipyardUpgradeOptions,
  installShipyardUpgrade,
} from '../../core/ship_modifications';
import { createPressureExpedition } from '../../core/pressure_expedition';
import { createBiologicalContracts, deliverBiologicalContract } from '../../core/biological_contracts';
import { XenobiologyService } from '../../core/xenobiology_service';
import { MissionProgressService } from '../../core/mission_progress';
import { createBiologicalDossier, createEncounterView } from '../../core/xenobiology_ui';

/** Uses production community/encounter generation while fixing catalogue knowledge and approach range. */
function fixture() {
  const e = pressureBiologyFixture();
  const bio: BiosphereDefinition = {
    id: e.bodyId,
    bodyName: e.bodyName,
    origin: e.origin,
    species: generatePressureCommunity(e, new PRNG(e.seed)).map((species) => ({
      ...species,
      recognised: true,
    })),
    sites: [
      {
        id: `${e.bodyId}/site:4,4`,
        x: 4,
        y: 4,
        label: 'Water margin',
        habitat: {
          version: 1,
          kind: 'moist-margin',
          description: 'Verified liquid-water margin',
          relief: 0.02,
          waterDistanceCells: 1,
        },
      },
    ],
  };
  const field = createEncounter(bio, bio.sites[0]);
  const target = field.individuals[0];
  field.individuals = [target];
  target.x = target.homeX = 15;
  target.y = target.homeY = 21;
  const research = new XenobiologyService();
  research.snapshot.fields[field.site.id] = field;
  return {
    bio,
    field,
    target,
    research,
    cargo: createDefaultCargo(10),
    shipCargo: createDefaultCargo(10),
    system: new SurfaceEncounterSystem(),
    station: { id: 'pressure-port', name: 'Pressure Port', kind: 'starbase' as const },
  };
}

describe('specialised preservation expedition', () => {
  it('uses exact typed capabilities in shipyard and handling, never treating arbitrary classes as omnipotent', () => {
    const f = fixture(),
      species = f.field.species[0];
    expect(stasisCompatibility(species, 1)).toContain('Pressure outside');
    expect(stasisCompatibility(species, 2)).toContain('native substrate');
    expect(stasisCompatibility(species, 3)).toBeNull();
    expect(stasisCompatibility(species, 99)).toContain('No stasis');
    expect(preservationKit(99)).toBeUndefined();
    expect(
      stasisCompatibility({ ...species, preservation: { solvent: 'ammonia', retainsSubstrate: true } }, 3)
    ).toContain('Solvent chemistry');
    expect(() =>
      validateSpecies({ ...species, preservation: { solvent: 'magic', retainsSubstrate: true } })
    ).toThrow();
    const ship = createDefaultShipModifications(),
      occupied = ship.specialBaysOccupied;
    const upgrades = createShipyardUpgradeOptions(ship).filter((option) =>
      option.id.startsWith('shipyard:stasis:')
    );
    expect(upgrades.map((option) => option.cost)).toEqual(PRESERVATION_KITS.map((kit) => kit.cost));
    expect(upgrades[2].workOrder).toContain('30 bar');
    expect(installShipyardUpgrade(ship, 'shipyard:stasis:3')).toContain('Installed');
    expect(ship.stasisClass).toBe(3);
    expect(ship.specialBaysOccupied).toBe(occupied);
    expect(installShipyardUpgrade(ship, 'shipyard:stasis:99')).toBe('Unknown preservation kit.');
    expect(ship.stasisClass).toBe(3);
    expect(
      createShipyardUpgradeOptions(ship)
        .filter((option) => option.id.startsWith('shipyard:stasis:'))
        .every((option) => option.disabled)
    ).toBe(true);
  });

  it('refuses incompatible live collection atomically but still permits tissue, then preserves a live sample through transfer', () => {
    const f = fixture(),
      before = structuredClone(f.field);
    for (const kit of [1, 2]) {
      expect(
        f.system.act(f.field, { kind: 'collect', targetId: f.target.id }, f.cargo, kit).elapsedSeconds
      ).toBe(0);
      expect(f.field).toEqual(before);
      expect(f.cargo.specimens).toEqual([]);
    }
    expect(f.system.act(f.field, { kind: 'sample', targetId: f.target.id }, f.cargo, 1).elapsedSeconds).toBe(
      5
    );
    expect(f.target.state).toBe('active');
    expect(f.cargo.specimens![0].kind).toBe('tissue');
    expect(f.system.act(f.field, { kind: 'collect', targetId: f.target.id }, f.cargo, 3).elapsedSeconds).toBe(
      5
    );
    const live = f.cargo.specimens!.find((container) => container.kind === 'live')!;
    f.research.collected(live.species);
    expect(() => validateXenobiology(f.research.snapshot, f.cargo.specimens!)).not.toThrow();
    const carriers = new SpecimenCargoSystem(),
      cargoBefore = structuredClone(f.cargo);
    expect(carriers.transfer(f.cargo, f.shipCargo, live.id, 2)).toContain('native substrate');
    expect(f.cargo).toEqual(cargoBefore);
    expect(f.shipCargo.specimens).toEqual([]);
    expect(carriers.transfer(f.cargo, f.shipCargo, live.id, 3)).toBeNull();
    expect(f.shipCargo.specimens).toEqual([live]);
    expect(f.cargo.specimens).toHaveLength(1);
    const forged = {
      ...live,
      species: { ...live.species, preservation: { solvent: 'water' as const, retainsSubstrate: false } },
    };
    expect(() => validateXenobiology(f.research.snapshot, [forged])).toThrow('preservation does not match');
    const full = createDefaultCargo(10);
    full.specimens = Array.from({ length: 6 }, (_, index) => ({ ...live, id: `slot-${index}` }));
    expect(carriers.add(full, live, 3)).toContain('slots occupied');
    expect(full.specimens).toHaveLength(6);
  });

  it('offers real alternatives and pays a finite pressure request once only for genuine live provenance', () => {
    const f = fixture();
    const offers = createBiologicalContracts(
      f.station,
      'Fixture',
      [f.bio],
      f.research.snapshot.fields,
      [],
      f.research
    );
    const mission = offers.find((entry) => entry.id.endsWith('pressure-reference'))!;
    expect(mission.rewardCredits).toBe(1600);
    expect(mission.detail).toContain('4,200 Cr');
    expect(offers.some((entry) => entry.objectives[0].kind === 'biology-data')).toBe(true);
    expect(
      offers.some(
        (entry) => entry.objectives[0].kind === 'specimen' && entry.objectives[0].requiredKind === 'tissue'
      )
    ).toBe(true);
    expect(
      createPressureExpedition(
        { ...f.station, kind: 'automated-depot' },
        'Fixture',
        [f.bio],
        {},
        [],
        f.research
      )
    ).toEqual([]);
    const progress = new MissionProgressService();
    progress.accept(mission);
    const context = { station: f.station, holds: [f.cargo], resources: { credits: 1000 } };
    expect(deliverBiologicalContract(progress, f.research, context, mission.id).ok).toBe(false);
    f.system.act(f.field, { kind: 'collect', targetId: f.target.id }, f.cargo, 3);
    const live = f.cargo.specimens![0];
    f.research.collected(live.species);
    const quote = f.research.quote(live.species, live).credits;
    const genuine = live.species;
    live.species = { ...genuine, preservation: { solvent: 'water', retainsSubstrate: false } };
    expect(deliverBiologicalContract(progress, f.research, context, mission.id).ok).toBe(false);
    expect(context.resources.credits).toBe(1000);
    live.species = genuine;
    expect(deliverBiologicalContract(progress, f.research, context, mission.id).ok).toBe(true);
    expect(context.resources.credits).toBe(2600 + quote);
    expect(f.cargo.specimens).toHaveLength(0);
    expect(deliverBiologicalContract(progress, f.research, context, mission.id).ok).toBe(false);
    expect(context.resources.credits).toBe(2600 + quote);
    expect(
      createPressureExpedition(f.station, 'Fixture', [f.bio], f.research.snapshot.fields, [], f.research)
    ).toEqual([]);
  });

  it('does not give unexplored species identities away and reveals actionable preservation advice after observation', () => {
    const f = fixture();
    f.field.species = f.field.species.map((species) => ({ ...species, recognised: false }));
    const species = f.field.species.find((entry) => entry.id === f.target.speciesId)!;
    expect(
      createPressureExpedition(f.station, 'Fixture', [f.bio], f.research.snapshot.fields, [], f.research)
    ).toEqual([]);
    const presentation = {
      power: 1 as const,
      stasisClass: 2,
      integrity: 100,
      cargo: { usedM3: 0, capacityM3: 10 },
      message: '',
    };
    expect(createEncounterView(f.field, f.target.id, f.research, presentation).scanner.join(' ')).toContain(
      'Preservation unverified'
    );
    f.research.observe(species, 2);
    expect(
      createPressureExpedition(f.station, 'Fixture', [f.bio], f.research.snapshot.fields, [], f.research)
    ).toHaveLength(1);
    expect(createEncounterView(f.field, f.target.id, f.research, presentation).scanner.join(' ')).toContain(
      'native substrate'
    );
    f.research.observe(species, 3);
    const dossier = createBiologicalDossier(species, f.research, 24);
    expect(
      dossier.every((line) => line.segments.reduce((sum, span) => sum + span.text.length, 0) <= 24)
    ).toBe(true);
    expect(
      dossier
        .flatMap((line) => line.segments)
        .map((span) => span.text)
        .join(' ')
    ).toContain('pressure-preserving native substrate');
  });
});
