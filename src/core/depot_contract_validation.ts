import { TRADE_COMMODITIES } from '../constants';
import type { DepotSnapshot } from './depot_types';
import type { MissionSystemAddress, StarbaseMission } from './mission_board';
import { DEPOT_JOB_BUDGET, DEPOT_JOB_INTERVAL_SECONDS, DEPOT_SUPPLY_TARGETS } from './depot_contracts';
import type { MissionProgressSnapshot } from './mission_progress';

/** Checks bounded terminal strings at the save boundary rather than trusting imported job descriptions. */
function validText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 2048;
}

/** Validates only the deliberately narrow robot board; biological and haul contracts retain their own owners. */
export function validateDepotJobDefinition(
  mission: StarbaseMission,
  stationId: string,
  address: MissionSystemAddress
): void {
  if (
    !mission ||
    typeof mission !== 'object' ||
    mission.sponsor !== 'robotic-depot' ||
    mission.originStarbaseId !== stationId ||
    ![
      mission.id,
      mission.title,
      mission.issuer,
      mission.summary,
      mission.detail,
      mission.originStarbaseName,
      mission.systemName,
    ].every(validText) ||
    !mission.systemAddress ||
    mission.systemAddress.worldX !== address.worldX ||
    mission.systemAddress.worldY !== address.worldY ||
    mission.systemAddress.systemSlot !== address.systemSlot ||
    mission.risk !== 'Low' ||
    !Number.isSafeInteger(mission.rewardCredits) ||
    !Array.isArray(mission.objectives) ||
    mission.objectives.length !== 1
  )
    throw new Error('Invalid funded robot contract.');
  const objective = mission.objectives[0];
  if (!objective || ![objective.id, objective.targetName, objective.targetLabel].every(validText))
    throw new Error('Invalid robot objective.');
  const prefix = `depot-job:${stationId}:`;
  if (!mission.id.startsWith(prefix)) throw new Error('Invalid robot offer identity.');
  const revision = mission.id.slice(prefix.length).split(':')[0];
  if (
    !Number.isSafeInteger(Number(revision)) ||
    Number(revision) <= 0 ||
    String(Number(revision)) !== revision
  )
    throw new Error('Invalid robot offer revision.');
  if (objective.kind === 'delivery') {
    if (
      mission.type !== 'supply' ||
      !Object.hasOwn(DEPOT_SUPPLY_TARGETS, objective.itemKey) ||
      objective.stationId !== stationId ||
      !Number.isInteger(objective.quantity) ||
      objective.quantity < 1 ||
      objective.quantity > 6 ||
      objective.location !== undefined ||
      objective.id !== 'supply-handoff' ||
      mission.id !== `${prefix}${revision}:supply:${objective.itemKey}` ||
      mission.rewardCredits !== objective.quantity * TRADE_COMMODITIES[objective.itemKey].baseValue * 2 + 80
    )
      throw new Error('Invalid robot supply terms.');
  } else if (objective.kind === 'scan') {
    if (
      mission.type !== 'survey' ||
      objective.id !== 'local-survey' ||
      mission.id !== `${prefix}${revision}:survey` ||
      mission.rewardCredits !== 420 ||
      objective.targetType !== 'planet' ||
      objective.requiredDiscoveryLevel !== 'surveyed' ||
      !objective.location ||
      typeof objective.location !== 'object' ||
      !validText(objective.location.bodyPath) ||
      !/^planet:\d+(\/moon:\d+)?$/.test(objective.location.bodyPath) ||
      objective.location.bodyName !== objective.targetName ||
      objective.location.surface !== undefined
    )
      throw new Error('Invalid robot survey terms.');
  } else throw new Error('Unsupported robot objective.');
}

/** Reconciles sponsor escrow with the canonical accepted ledger; malformed imports cannot create unfunded rewards. */
export function validateDepotContracts(
  depots: DepotSnapshot,
  progress: Pick<
    MissionProgressSnapshot,
    'activeMissions' | 'acceptedMissionIds' | 'completedMissionIds' | 'readyMissionIds'
  >,
  gameClockSeconds: number
): void {
  const missions = progress.activeMissions;
  for (const record of Object.values(depots)) {
    const jobs = record.jobs;
    if (jobs === null) continue;
    if (
      !jobs ||
      typeof jobs !== 'object' ||
      Array.isArray(jobs) ||
      !Number.isSafeInteger(jobs.availableCredits) ||
      jobs.availableCredits < 0 ||
      jobs.availableCredits > DEPOT_JOB_BUDGET ||
      !Number.isSafeInteger(jobs.revision) ||
      jobs.revision < 1 ||
      !Number.isFinite(jobs.nextRefreshSeconds) ||
      jobs.nextRefreshSeconds < record.initialisedAtSeconds ||
      jobs.nextRefreshSeconds > gameClockSeconds + DEPOT_JOB_INTERVAL_SECONDS ||
      !Array.isArray(jobs.offers) ||
      jobs.offers.length > 3 ||
      !jobs.reservedCredits ||
      typeof jobs.reservedCredits !== 'object' ||
      Array.isArray(jobs.reservedCredits)
    )
      throw new Error('Invalid depot sponsor ledger.');
    const ids = new Set<string>();
    for (const offer of jobs.offers) {
      validateDepotJobDefinition(offer, record.stationId, record.address);
      if (!offer.id.startsWith(`depot-job:${record.stationId}:${jobs.revision}:`))
        throw new Error('Depot offer belongs to another board revision.');
      if (ids.has(offer.id)) throw new Error('Duplicate depot job.');
      ids.add(offer.id);
    }
    if (
      jobs.offers.filter((offer) => offer.type === 'supply').length > 2 ||
      jobs.offers.filter((offer) => offer.type === 'survey').length > 1
    )
      throw new Error('Depot board exceeds job limits.');
    let reserved = 0;
    const accepted = Object.entries(jobs.reservedCredits);
    if (accepted.length > 3) throw new Error('Too many depot reservations.');
    for (const [id, credits] of accepted) {
      const mission = missions[id];
      if (
        !mission ||
        mission.id !== id ||
        !Number.isSafeInteger(credits) ||
        credits !== mission.rewardCredits
      )
        throw new Error('Depot escrow has no matching accepted contract.');
      validateDepotJobDefinition(mission, record.stationId, record.address);
      reserved += credits;
    }
    if (
      reserved + jobs.availableCredits > DEPOT_JOB_BUDGET ||
      accepted.filter(([id]) => missions[id].type === 'supply').length > 2 ||
      accepted.filter(([id]) => missions[id].type === 'survey').length > 1
    )
      throw new Error('Depot sponsor funds or job slots exceeded.');
  }
  for (const mission of Object.values(missions)) {
    if (mission.sponsor !== undefined && mission.sponsor !== 'robotic-depot')
      throw new Error('Invalid mission sponsor.');
    if (mission.sponsor === 'robotic-depot') {
      if (
        !progress.acceptedMissionIds.includes(mission.id) ||
        progress.completedMissionIds.includes(mission.id) ||
        (mission.type === 'supply' && progress.readyMissionIds.includes(mission.id))
      )
        throw new Error('Invalid funded mission progression.');
      const record = mission.originStarbaseId && depots[mission.originStarbaseId];
      if (!record || !record.jobs || record.jobs.reservedCredits[mission.id] !== mission.rewardCredits)
        throw new Error('Accepted depot contract is not funded.');
    } else if (
      mission.type === 'supply' ||
      mission.objectives.some((objective) => objective.kind === 'delivery')
    )
      throw new Error('Cargo delivery has no robot sponsor.');
  }
}
