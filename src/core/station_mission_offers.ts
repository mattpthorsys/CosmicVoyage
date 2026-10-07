import { CONFIG } from '../config';
import { PRNG } from '../utils/prng';
import type { Starbase } from '../entities/starbase';
import type { MissionSystemAddress, StarbaseMission } from './mission_board';

export interface StationMissionProfile {
  readonly starter: boolean;
  readonly survey: number;
  readonly xenobiology: number;
  readonly heavyHaul: number;
}

/** Keeps station priorities independent of board reopening, player upgrades and the world PRNG. */
export function getStationMissionProfile(
  seed: string,
  stationId: string,
  address: MissionSystemAddress
): StationMissionProfile {
  const starter =
    address.systemSlot === 0 &&
    address.worldX === CONFIG.PLAYER_START_X + CONFIG.STARTING_HUB_OFFSET_X &&
    address.worldY === CONFIG.PLAYER_START_Y + CONFIG.STARTING_HUB_OFFSET_Y;
  if (starter) return { starter, survey: 2, xenobiology: 2, heavyHaul: 3 };
  const focus = new PRNG(`${seed}:station-priorities:v1:${stationId}`).randomInt(0, 2);
  return [
    { starter, survey: 3, xenobiology: 1, heavyHaul: 1 },
    { starter, survey: 1, xenobiology: 3, heavyHaul: 1 },
    { starter, survey: 1, xenobiology: 1, heavyHaul: 2 },
  ][focus];
}

/** Limits new offers only; the caller must merge canonical accepted contracts after this selection. */
export function selectStationMissionOffers(
  seed: string,
  station: Starbase,
  address: MissionSystemAddress,
  candidates: readonly StarbaseMission[]
): StarbaseMission[] {
  if (!station.capabilities.missions || station.kind === 'automated-depot') return [];
  const profile = getStationMissionProfile(seed, station.id, address);
  const groups = [
    { limit: profile.survey, types: ['survey', 'charting', 'recovery'] },
    { limit: profile.xenobiology, types: ['xenobiology'] },
    { limit: profile.heavyHaul, types: ['heavy-haul'] },
  ];
  return groups.flatMap(({ limit, types }) =>
    candidates
      .filter((mission) => types.includes(mission.type))
      .map((mission) => ({
        mission,
        rank: new PRNG(`${seed}:station-offer:v1:${station.id}:${mission.id}`).random(),
      }))
      .sort((a, b) => a.rank - b.rank || a.mission.id.localeCompare(b.mission.id))
      .slice(0, limit)
      .map(({ mission }) => mission)
  );
}
