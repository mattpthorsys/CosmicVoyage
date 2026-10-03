import { describe, expect, it } from 'vitest';
import { MissionJournal, type MissionJournalEntry } from '../../core/mission_journal';
import type { StarbaseMission } from '../../core/mission_board';
import { getMissionLandingBody, resolveMissionNavigation } from '../../core/mission_navigation';
import { MissionProgressService } from '../../core/mission_progress';
import type { Planet } from '../../entities/planet';
import type { SolarSystem } from '../../entities/solar_system';
import type { BiosphereDefinition } from '../../entities/biology/biology_types';

/** Creates an accepted-contract read model with a typed moon habitat destination. */
function entry(id = 'reference'): MissionJournalEntry {
  const mission: StarbaseMission = {
    id,
    title: 'Habitat reference specimen',
    type: 'xenobiology',
    issuer: 'Survey Office',
    summary: 'Collect a live regional reference.',
    detail: 'Use stasis and deliver one sealed container to the issuing station.',
    rewardCredits: 900,
    risk: 'Low',
    originStarbaseId: 'port',
    originStarbaseName: 'Sol Relay',
    systemName: 'Sol',
    systemAddress: { worldX: -72, worldY: -73, systemSlot: 1 },
    objectives: [
      {
        id: 'live',
        kind: 'specimen',
        targetName: 'Grazing organism',
        targetLabel: 'Live reference from the sheltered habitat',
        speciesId: 'grazer',
        siteId: 'moon-habitat',
        requiredKind: 'live',
        minimumQuality: 0.75,
        location: {
          bodyPath: 'planet:0/moon:0',
          bodyName: 'Luna',
          surface: { x: 123, y: 456, siteId: 'moon-habitat', label: 'Sheltered habitat' },
        },
      },
    ],
  };
  return { mission, status: 'ACTIVE', completed: 0, total: 1 };
}

/** Represents fresh keyboard input independently of held movement keys. */
function input(...actions: string[]) {
  return {
    wasActionJustPressed: (action: string) => actions.includes(action),
    wasAnyKeyJustPressed: () => actions.length > 0,
  };
}

/** Joins rendered spans for readable assertions without discarding them in the production model. */
function text(journal: MissionJournal, entries: MissionJournalEntry[], cols = 100) {
  return journal
    .createModel(entries, cols, 35, true)
    .dashboard!.map((line) => line.segments.map((span) => span.text).join(''))
    .join('\n');
}

describe('mission terminal', () => {
  it('shows actionable coordinates, requirements and delivery details, using the two established fonts', () => {
    const journal = new MissionJournal();
    const entries = [entry()];
    const output = text(journal, entries);
    expect(output).toContain('X -72  Y -73 / contact 2');
    expect(output).toContain('Body: Luna');
    expect(output).toContain('X 123  Y 456');
    expect(output).toContain('LIVE / quality at least 75%');
    expect(output).toContain('Return to: Sol Relay');
    expect(output).toContain('900 Cr + remaining research value');
    const model = journal.createModel(entries, 100, 35, true);
    expect(
      model.dashboard!.some((line) =>
        line.segments.some((span) => span.font === 'thick' && span.tone === 'cyan')
      )
    ).toBe(true);
    expect(
      model.dashboard!.some((line) =>
        line.segments.some((span) => span.font === 'thin' && span.tone === 'green')
      )
    ).toBe(true);
    expect(model.footer!.join(' ')).toContain('ENTER select landing site');
    expect(journal.createModel(entries, 100, 35, false).footer!.join(' ')).not.toContain('ENTER');
  });

  it('wraps narrow dashboards and controls without dropping text or leaving an empty final page', () => {
    const journal = new MissionJournal();
    const entries = [entry()];
    const model = journal.createModel(entries, 32, 24, true);
    expect(
      model.dashboard!.every((line) => line.segments.reduce((sum, span) => sum + span.text.length, 0) <= 20)
    ).toBe(true);
    expect(model.footer!.every((line) => line.length <= 20)).toBe(true);
    expect(text(journal, entries, 32).replace(/\s+/g, ' ')).toContain('live regional reference');
    journal.viewOffset = 9999;
    const clamped = journal.createModel(entries, 32, 24, true);
    expect(clamped.viewOffset + clamped.visibleRowCount).toBe(clamped.dashboard!.length);
  });

  it.each(['ENTER_SYSTEM', 'QUIT', 'MOVE_RIGHT', 'PAGE_DOWN', 'UNBOUND'])(
    'consumes %s to finish revealing before performing any action',
    (action) => {
      const journal = new MissionJournal();
      const entries = [entry(), entry('second')];
      journal.open('ship-menu');
      expect(
        journal.input(input(action), entries, journal.createModel(entries, 100, 24, true))
      ).toBeUndefined();
      expect(journal.reveal.isActive).toBe(false);
      expect(journal.selection).toBe(0);
      expect(journal.viewOffset).toBe(0);
      expect(journal.returnTo).toBe('ship-menu');
    }
  );

  it('cycles contracts separately from scrolling, then returns explicit close or landing intents', () => {
    const journal = new MissionJournal();
    const entries = [entry(), entry('second')];
    journal.open('none');
    journal.reveal.complete();
    let model = journal.createModel(entries, 100, 24, true);
    journal.input(input('PAGE_DOWN'), entries, model);
    expect(journal.viewOffset).toBe(model.visibleRowCount);
    journal.input(input('MOVE_UP'), entries, model);
    expect(journal.viewOffset).toBe(model.visibleRowCount - 1);
    journal.input(input('MOVE_LEFT'), entries, model);
    expect(journal.selected(entries)?.mission.id).toBe('second');
    expect(journal.viewOffset).toBe(0);
    journal.reveal.complete();
    model = journal.createModel(entries, 100, 24, true);
    expect(journal.input(input('ENTER_SYSTEM'), entries, model)).toBe('landing');
    expect(journal.input(input('QUIT'), entries, model)).toBe('close');
    expect(journal.input(input('MISSION_JOURNAL'), entries, model)).toBe('close');
  });

  it('handles empty journals and ready contracts honestly', () => {
    const journal = new MissionJournal();
    journal.selection = 99;
    expect(text(journal, [])).toContain('NO ACTIVE CONTRACTS');
    expect(journal.selection).toBe(0);
    expect(text(journal, [{ ...entry(), status: 'READY', completed: 1 }])).toContain('Delivery ready.');
  });
});

describe('mission destination resolution', () => {
  /** Builds an identity-focused orbital family without invoking terrain generation. */
  function system() {
    const moon = { name: 'Luna', moons: [] } as unknown as Planet;
    const parent = { name: 'Terra', moons: [moon] } as unknown as Planet;
    const other = { name: 'Mars', moons: [] } as unknown as Planet;
    return {
      moon,
      parent,
      other,
      system: {
        name: 'Sol',
        starX: -72,
        starY: -73,
        systemSlot: 1,
        planets: [parent, other],
      } as unknown as SolarSystem,
    };
  }

  it('resolves moons by saved path and rejects a different system slot or orbital family', () => {
    const fixture = system();
    const mission = entry().mission;
    expect(getMissionLandingBody(mission, fixture.system, fixture.parent)).toBe(fixture.moon);
    expect(getMissionLandingBody(mission, fixture.system, fixture.other)).toBeNull();
    expect(
      getMissionLandingBody(mission, { ...fixture.system, systemSlot: 0 } as SolarSystem, fixture.parent)
    ).toBeNull();
    expect(
      getMissionLandingBody(mission, { ...fixture.system, starX: 1 } as SolarSystem, fixture.parent)
    ).toBeNull();
    mission.objectives[0].location!.bodyName = 'Wrong moon';
    expect(getMissionLandingBody(mission, fixture.system, fixture.parent)).toBeNull();
  });

  it('backfills older contracts from real habitat identities, without parsing display labels or altering objectives', () => {
    const fixture = system();
    const mission = entry().mission;
    delete mission.systemAddress;
    delete mission.objectives[0].location;
    mission.objectives[0].targetLabel = 'Descriptive text without coordinates';
    const biosphere = {
      id: 'moon-biology',
      bodyName: 'Luna',
      sites: [{ id: 'moon-habitat', x: 123, y: 456, label: 'Sheltered habitat' }],
    } as unknown as BiosphereDefinition;
    const progress = new MissionProgressService();
    progress.accept(mission);
    progress.resolveNavigation(fixture.system, [biosphere]);
    const resolved = progress.getActiveMissions()[0];
    expect(resolved.systemAddress).toEqual({ worldX: -72, worldY: -73, systemSlot: 1 });
    expect(resolved.objectives[0].location?.surface).toEqual({
      x: 123,
      y: 456,
      siteId: 'moon-habitat',
      label: 'Sheltered habitat',
    });
    expect(resolved.objectives[0].targetLabel).toBe(mission.objectives[0].targetLabel);
    expect(resolved.objectives[0].location?.bodyPath).toBe('planet:0/moon:0');
    expect(mission.objectives[0].location).toBeUndefined();
    const restored = new MissionProgressService();
    restored.restoreSnapshot(progress.createSnapshot());
    expect(restored.getActiveMissions()).toEqual(progress.getActiveMissions());
    expect(
      resolveMissionNavigation(resolved, { ...fixture.system, starX: 8 } as SolarSystem, [biosphere])
    ).toBe(resolved);
  });

  it('reports any-site mapping requirements without inventing habitat coordinates', () => {
    const fixture = system();
    const mission: StarbaseMission = {
      ...entry().mission,
      type: 'survey',
      objectives: [
        {
          id: 'map',
          kind: 'scan',
          targetName: 'Luna',
          targetLabel: 'Map a surface site',
          targetType: 'planet',
          requiredDiscoveryLevel: 'mapped',
        },
      ],
    };
    const resolved = resolveMissionNavigation(mission, fixture.system);
    expect(resolved.objectives[0].location).toEqual({ bodyPath: 'planet:0/moon:0', bodyName: 'Luna' });
    expect(getMissionLandingBody(resolved, fixture.system, fixture.parent)).toBeNull();
    expect(text(new MissionJournal(), [{ ...entry(), mission: resolved }])).toContain(
      'Landing: any accessible surface site.'
    );
  });
});
