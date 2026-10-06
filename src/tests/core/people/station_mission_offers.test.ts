import { describe, expect, it, vi } from 'vitest';
import { CONFIG } from '../../../config';
import { Game } from '../../../core/game';
import { MissionProgressService } from '../../../core/mission_progress';
import { Player } from '../../../core/player';
import { generateStarbaseMissions, type StarbaseMission } from '../../../core/mission_board';
import { getStationMissionProfile, selectStationMissionOffers } from '../../../core/station_mission_offers';
import { Starbase } from '../../../entities/starbase';
import { PRNG } from '../../../utils/prng';
import { haulSystemFixture } from '../../fixtures/heavy_haul_journeys';

const address = { worldX: 500, worldY: 200, systemSlot: 0 };

/** Supplies ample validly typed offers without generating terrain or populations for budget tests. */
function candidates(station: Starbase): StarbaseMission[] {
  return (['survey', 'charting', 'recovery', 'xenobiology', 'heavy-haul'] as const).flatMap((type) =>
    Array.from({ length: 4 }, (_, index) => ({
      id: `${station.id}:${type}:${index}`,
      type,
      title: `${type} ${index}`,
      issuer: 'Office',
      originStarbaseId: station.id,
      originStarbaseName: station.name,
      systemName: 'Test system',
      summary: 'Offer',
      detail: 'Briefing',
      rewardCredits: 600,
      risk: 'Low' as const,
      objectives: [],
    }))
  );
}

describe('station mission priorities', () => {
  it('bounds each category and is independent of candidate order and board reopening', () => {
    const station = new Starbase('priority-port', new PRNG('priorities'), 'Port');
    const pool = candidates(station);
    const offers = selectStationMissionOffers('priorities', station, address, pool);
    const profile = getStationMissionProfile('priorities', station.id, address);
    expect(offers.filter((mission) => mission.type === 'xenobiology')).toHaveLength(profile.xenobiology);
    expect(offers.filter((mission) => mission.type === 'heavy-haul')).toHaveLength(profile.heavyHaul);
    expect(
      offers.filter((mission) => ['survey', 'charting', 'recovery'].includes(mission.type))
    ).toHaveLength(profile.survey);
    expect(offers.length).toBeLessThanOrEqual(5);
    expect(selectStationMissionOffers('priorities', station, address, [...pool].reverse())).toEqual(offers);
    expect(selectStationMissionOffers('priorities', station, address, pool)).toEqual(offers);
    expect(pool).toHaveLength(20);
  });

  it('gives other stations different priorities and reserves the generous starting board', () => {
    const profiles = Array.from({ length: 12 }, (_, index) =>
      getStationMissionProfile('priorities', `port-${index}`, address)
    );
    expect(new Set(profiles.map((profile) => JSON.stringify(profile))).size).toBe(3);
    const hub = {
      worldX: CONFIG.PLAYER_START_X + CONFIG.STARTING_HUB_OFFSET_X,
      worldY: CONFIG.PLAYER_START_Y + CONFIG.STARTING_HUB_OFFSET_Y,
      systemSlot: 0,
    };
    expect(getStationMissionProfile('priorities', 'hub-port', hub)).toEqual({
      starter: true,
      survey: 2,
      xenobiology: 2,
      heavyHaul: 3,
    });
  });

  it('never adds imaginary biology offers or enables an automated mission office', () => {
    const station = new Starbase('priority-port', new PRNG('priorities'), 'Port');
    const pool = candidates(station).filter((mission) => mission.type !== 'xenobiology');
    expect(
      selectStationMissionOffers('priorities', station, address, pool).every(
        (mission) => mission.type !== 'xenobiology'
      )
    ).toBe(true);
    const depot = new Starbase('depot', new PRNG('priorities'), 'Port', 'automated-depot');
    expect(selectStationMissionOffers('priorities', depot, address, candidates(depot))).toEqual([]);
  });

  it('keeps accepted contracts visible with canonical terms despite a port offer limit', () => {
    const system = haulSystemFixture(address, null, true);
    const station = system.starbase!;
    Object.assign(station, { kind: 'starbase', capabilities: { ...station.capabilities, missions: true } });
    const progress = new MissionProgressService();
    const originals = generateStarbaseMissions(station, system);
    for (const mission of originals)
      progress.accept({ ...mission, title: `Accepted ${mission.title}`, rewardCredits: 123 });
    const game = Object.assign(Object.create(Game.prototype), {
      player: new Player(),
      gameSeedPRNG: new PRNG('priorities'),
      stateManager: { currentSystem: system },
      _missionProgress: progress,
      _haulOffers: { list: () => [] },
      _surfacePrefetch: { enqueue: vi.fn() },
      getBiosphere: () => null,
    }) as { getCurrentStarbaseMissions(station: Starbase): StarbaseMission[] };
    const listed = game.getCurrentStarbaseMissions(station);
    expect(listed).toHaveLength(originals.length);
    for (const mission of listed) {
      expect(mission.title).toMatch(/^Accepted /);
      expect(mission.rewardCredits).toBe(123);
    }
  });
});
