import { HAUL_MAX_DURATION_SECONDS } from '../constants/heavy_haul';
import type { StarbaseMission } from './mission_board';
import {
  sameHaulAddress,
  type HaulEndpoint,
  type HeavyHaulObjective,
  type HeavyHaulSnapshot,
  type InfrastructureRecord,
} from './heavy_haul_types';

/** Checks immutable external-package definitions before acceptance, quotation, or restoration. */
export function validateHeavyHaulObjective(value: unknown): asserts value is HeavyHaulObjective {
  const objective = record(value, 'objective');
  if (objective.kind !== 'haul' || objective.location !== undefined) fail('objective kind or location');
  for (const key of ['id', 'targetName', 'targetLabel']) text(objective[key], key);
  const pickup = objective.pickup;
  const destination = objective.destination;
  validateEndpoint(pickup);
  validateEndpoint(destination);
  if (objective.resupply !== undefined) {
    const resupply = record(objective.resupply, 'resupply target');
    validateAddress(resupply.systemAddress);
    text(resupply.stationId, 'resupply station');
  }
  const payload = record(objective.package, 'package');
  text(payload.id, 'package id');
  if (!['navigation-buoy', 'automated-depot'].includes(String(payload.installationKind)))
    fail('installation kind');
  if (!['compact', 'module', 'large'].includes(String(payload.sizeClass))) fail('package size');
  number(payload.dryMassKg, 'dry mass', true);
  number(payload.wetMassKg, 'wet mass', true);
  number(payload.supportFuelCapacityUnits, 'support capacity', true);
  number(payload.commissioningFuelAllowanceUnits, 'commissioning allowance');
  if (payload.installationKind !== 'automated-depot' && payload.commissioningFuelAllowanceUnits !== 0)
    fail('buoy commissioning allowance');
  if ((payload.wetMassKg as number) < (payload.dryMassKg as number)) fail('wet mass below dry mass');
  integerRange(payload.minimumEngineClass, 1, 5, 'required drive class');
  integerRange(payload.minimumCouplerClass, 1, 3, 'required coupler class');
  const route = record(objective.route, 'route');
  if (route.kind === 'local') {
    number(route.distanceM, 'local transfer distance', true);
    if (!sameHaulAddress(pickup.systemAddress, destination.systemAddress))
      fail('local route crosses systems');
  } else if (route.kind === 'interstellar') {
    if (sameHaulAddress(pickup.systemAddress, destination.systemAddress))
      fail('interstellar route has no distance');
  } else fail('route kind');
  if (pickup.siteId === destination.siteId) fail('identical pickup and deployment sites');
}

/** Checks compact persistent ledgers and their references to canonical accepted/completed contracts. */
export function validateHeavyHaulSnapshot(
  value: unknown,
  activeMissions: Readonly<Record<string, StarbaseMission>>,
  completedMissionIds: readonly string[],
  gameClockSeconds: number
): asserts value is HeavyHaulSnapshot {
  number(gameClockSeconds, 'clock time');
  const snapshot = record(value, 'state');
  const retired = stringArray(snapshot.retiredMissionIds, 'retired missions');
  const receipts = record(snapshot.journeyReceipts, 'journey receipts');
  if (Object.keys(receipts).length > 2048) fail('too many journey receipts');
  for (const [operationId, value] of Object.entries(receipts)) {
    const receipt = record(value, 'journey receipt');
    text(receipt.operationId, 'operation id');
    text(receipt.missionId, 'receipt mission id');
    if (receipt.operationId !== operationId || operationId !== `${receipt.missionId}:transit`)
      fail('receipt identity');
    number(receipt.departureSeconds, 'departure time');
    number(receipt.arrivalSeconds, 'arrival time');
    number(receipt.durationSeconds, 'journey duration', true);
    number(receipt.supportFuelConsumedUnits, 'journey support consumption');
    const departure = receipt.departureSeconds as number;
    const arrival = receipt.arrivalSeconds as number;
    const duration = receipt.durationSeconds as number;
    if (
      duration > HAUL_MAX_DURATION_SECONDS ||
      arrival > gameClockSeconds ||
      Math.abs(arrival - departure - duration) > 1e-3
    )
      fail('journey chronology');
    if (
      !activeMissions[receipt.missionId as string] &&
      !completedMissionIds.includes(receipt.missionId as string) &&
      !retired.includes(receipt.missionId as string)
    )
      fail('orphan journey receipt');
  }
  const haulMissions = Object.values(activeMissions).filter((mission) => mission.type === 'heavy-haul');
  if (haulMissions.length > 1) fail('multiple active contracts');
  if (retired.some((id) => !!activeMissions[id] || completedMissionIds.includes(id)))
    fail('retired contract still active or paid');
  if (snapshot.activeTow === null) {
    if (haulMissions.length) fail('accepted contract has no tow record');
    return;
  }
  const tow = record(snapshot.activeTow, 'active tow');
  text(tow.missionId, 'tow mission id');
  text(tow.packageId, 'tow package id');
  if (!['awaiting-pickup', 'attached', 'arrived'].includes(String(tow.stage))) fail('tow stage');
  number(tow.remainingSupportFuelUnits, 'remaining support fuel');
  const mission = haulMissions.find((entry) => entry.id === tow.missionId);
  const objective = mission?.objectives[0];
  if (!mission || mission.objectives.length !== 1 || objective?.kind !== 'haul')
    fail('tow contract reference');
  validateHeavyHaulObjective(objective);
  if (
    objective.package.id !== tow.packageId ||
    (tow.remainingSupportFuelUnits as number) > objective.package.supportFuelCapacityUnits
  )
    fail('tow package or support reference');
  if (tow.stage === 'arrived') {
    text(tow.journeyOperationId, 'arrival operation');
    const receipt = record(receipts[tow.journeyOperationId as string], 'arrival receipt');
    if (receipt.missionId !== tow.missionId) fail('arrival receipt contract');
    if (
      Math.abs(
        objective.package.supportFuelCapacityUnits -
          (receipt.supportFuelConsumedUnits as number) -
          (tow.remainingSupportFuelUnits as number)
      ) > 1e-6
    )
      fail('support ledger does not match receipt');
  } else if (
    tow.journeyOperationId !== null ||
    receipts[`${tow.missionId}:transit`] !== undefined ||
    tow.remainingSupportFuelUnits !== objective.package.supportFuelCapacityUnits
  ) {
    fail('untravelled package already consumed support');
  }
}

/** Validates future commissioning records without materialising or regenerating any natural systems. */
export function validateInfrastructureRecords(
  value: unknown,
  gameClockSeconds: number,
  bulkAdvanceSeconds: number,
  completedMissionIds: readonly string[]
): asserts value is InfrastructureRecord[] {
  if (!Array.isArray(value) || value.length > 2048) fail('infrastructure registry');
  const assets = new Set<string>();
  const contracts = new Set<string>();
  for (const item of value) {
    const asset = record(item, 'installation');
    text(asset.assetId, 'asset id');
    text(asset.sourceMissionId, 'source contract');
    if (asset.assetId !== `haul-installation:${asset.sourceMissionId}`) fail('installation identity');
    text(asset.systemName, 'installation system name');
    validateAddress(asset.systemAddress);
    validateOrbit(asset.orbit);
    number(asset.commissionedAtSeconds, 'commissioning time');
    if (asset.homeboundRoute !== undefined) {
      const route = record(asset.homeboundRoute, 'homebound route');
      validateAddress(route.systemAddress);
      text(route.stationName, 'homebound port name');
      if (route.stationId !== null) text(route.stationId, 'homebound port id');
    }
    if (asset.homeboundReceipt !== undefined) {
      if (!asset.homeboundRoute) fail('return receipt has no homebound port');
      const receipt = record(asset.homeboundReceipt, 'homebound receipt');
      if (receipt.operationId !== `${asset.assetId}:return`) fail('homebound receipt identity');
      number(receipt.departureSeconds, 'homebound departure');
      number(receipt.arrivalSeconds, 'homebound arrival');
      number(receipt.durationSeconds, 'homebound duration', true);
      number(receipt.fuelConsumedUnits, 'homebound fuel');
      if (
        (receipt.departureSeconds as number) < (asset.commissionedAtSeconds as number) ||
        (receipt.arrivalSeconds as number) > gameClockSeconds ||
        (receipt.durationSeconds as number) > HAUL_MAX_DURATION_SECONDS ||
        Math.abs(
          (receipt.arrivalSeconds as number) -
            (receipt.departureSeconds as number) -
            (receipt.durationSeconds as number)
        ) > 1e-3
      )
        fail('homebound receipt time');
    }
    if (!['navigation-buoy', 'automated-depot'].includes(String(asset.kind)))
      fail('deployed installation kind');
    number(asset.lastAppliedBulkSeconds, 'installation bulk watermark');
    number(asset.commissioningFuelRemainingUnits, 'commissioning fuel allowance');
    if (
      (asset.commissionedAtSeconds as number) > gameClockSeconds ||
      (asset.lastAppliedBulkSeconds as number) > bulkAdvanceSeconds
    )
      fail('installation epoch');
    if (
      assets.has(asset.assetId as string) ||
      contracts.has(asset.sourceMissionId as string) ||
      !completedMissionIds.includes(asset.sourceMissionId as string)
    )
      fail('duplicate installation or unpaid source contract');
    if (asset.kind !== 'automated-depot' && asset.commissioningFuelRemainingUnits !== 0)
      fail('buoy fuel allowance');
    assets.add(asset.assetId as string);
    contracts.add(asset.sourceMissionId as string);
  }
}

/** Requires a named, enterable endpoint with explicit orbit data. */
function validateEndpoint(value: unknown): asserts value is HaulEndpoint {
  const endpoint = record(value, 'endpoint');
  text(endpoint.systemName, 'endpoint system name');
  text(endpoint.siteId, 'endpoint site id');
  validateAddress(endpoint.systemAddress);
  validateOrbit(endpoint.orbit);
}

/** Keeps first-version endpoints on integer grid cells and the currently enterable stellar slot. */
function validateAddress(value: unknown): void {
  const address = record(value, 'system address');
  if (
    !Number.isSafeInteger(address.worldX) ||
    !Number.isSafeInteger(address.worldY) ||
    address.systemSlot !== 0
  )
    fail('system address: only enterable slot zero is supported');
}

/** Rejects inconsistent host tags; actual orbital stability remains a world-query responsibility. */
function validateOrbit(value: unknown): void {
  const orbit = record(value, 'orbit');
  const host = record(orbit.host, 'orbit host');
  number(orbit.radiusM, 'orbit radius', true);
  number(orbit.angleRad, 'orbit angle');
  if ((orbit.angleRad as number) >= 2 * Math.PI) fail('orbit angle range');
  if (host.kind === 'circumstellar') {
    if (!['A', 'B', 'C'].includes(String(host.starId))) fail('stellar host');
  } else if (!['barycentric', 'circumbinary'].includes(String(host.kind)) || host.starId !== undefined) {
    fail('orbit host');
  }
}

/** Narrows a JSON object and rejects arrays/null before accessing its fields. */
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(label);
  return value as Record<string, unknown>;
}

/** Requires finite nonnegative quantities and optionally strictly positive values. */
function number(value: unknown, label: string, positive = false): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || (positive ? value <= 0 : value < 0))
    fail(label);
}

/** Checks equipment classes without rounding corrupt save values. */
function integerRange(value: unknown, min: number, max: number, label: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) fail(label);
}

/** Requires bounded identifiers/text, excluding keys that alias object prototypes. */
function text(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 256 ||
    ['__proto__', 'constructor', 'prototype'].includes(value)
  )
    fail(label);
}

/** Checks unique durable cancellation IDs with a bounded history. */
function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > 4096) fail(label);
  value.forEach((id) => text(id, label));
  if (new Set(value).size !== value.length) fail(label);
  return value as string[];
}

/** Throws one consistent contextual error at untrusted data boundaries. */
function fail(label: string): never {
  throw new Error(`Invalid heavy-haul ${label}.`);
}
