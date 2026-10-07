import { parseSurveyAddress, surveyAddressKey } from './survey_data_types';
import type { ObservatoryAddress } from './observatory_types';

export const COMMUNICATIONS_NOTICE_LIMIT = 128;
export const COMMUNICATIONS_CONTACT_LIMIT = 512;
export const COMMUNICATIONS_REPORT_LIFETIME_SECONDS = 30 * 86400;

export interface DepotBroadcastJob {
  id: string;
  title: string;
  rewardCredits: number;
}

export interface DepotBroadcastReport {
  telemetry: 'carrier' | 'stored';
  issuedAtSeconds: number;
  shortages: Array<{ itemKey: string; units: number; target: number }>;
  jobs: DepotBroadcastJob[];
  boardRevision: number;
}

export interface CommunicationsNotice {
  sourceId: string;
  name: string;
  address: ObservatoryAddress;
  revision: string;
  report: DepotBroadcastReport;
  receivedAtSeconds: number;
  expiresAtSeconds: number;
  read: boolean;
}

export interface CommunicationsSnapshot {
  notices: CommunicationsNotice[];
  heard: Record<string, { revision: string; at: number }>;
}

/** Starts a new inbox without revealing depots outside the ship's physical communications reach. */
export function createCommunicationsSnapshot(): CommunicationsSnapshot {
  return { notices: [], heard: {} };
}

/** Validates finite bounded informational notices independently of contracts and scientific receipts. */
export function validateCommunicationsSnapshot(
  value: unknown,
  seconds: number
): asserts value is CommunicationsSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid communications inbox.');
  const state = value as CommunicationsSnapshot;
  if (
    !Array.isArray(state.notices) ||
    state.notices.length > COMMUNICATIONS_NOTICE_LIMIT ||
    !state.heard ||
    typeof state.heard !== 'object' ||
    Array.isArray(state.heard) ||
    Object.keys(state.heard).length > COMMUNICATIONS_CONTACT_LIMIT
  )
    throw new Error('Communications storage limit exceeded.');
  const sources = new Set<string>();
  for (const notice of state.notices) {
    if (
      !notice ||
      !validId(notice.sourceId) ||
      sources.has(notice.sourceId) ||
      !validText(notice.name, 160) ||
      !validRevision(notice.revision) ||
      !validTime(notice.receivedAtSeconds, seconds) ||
      !Number.isFinite(notice.expiresAtSeconds) ||
      notice.expiresAtSeconds !== notice.receivedAtSeconds + COMMUNICATIONS_REPORT_LIFETIME_SECONDS ||
      typeof notice.read !== 'boolean'
    )
      throw new Error('Invalid depot broadcast.');
    sources.add(notice.sourceId);
    if (!notice.address) throw new Error('Missing depot broadcast address.');
    parseSurveyAddress(surveyAddressKey(notice.address));
    const report = notice.report;
    if (
      !report ||
      !['carrier', 'stored'].includes(report.telemetry) ||
      !validTime(report.issuedAtSeconds, notice.receivedAtSeconds) ||
      !Number.isSafeInteger(report.boardRevision) ||
      report.boardRevision < 0 ||
      !Array.isArray(report.shortages) ||
      report.shortages.length > 5 ||
      report.shortages.some(
        (item) =>
          !item ||
          !['REPAIR_SPARES', 'MEDICAL_SUPPLIES', 'TITANIUM_TRUSS', 'HELIUM_3', 'DEUTERIUM_PELLETS'].includes(
            item.itemKey
          ) ||
          !Number.isSafeInteger(item.units) ||
          !Number.isSafeInteger(item.target) ||
          item.units < 0 ||
          item.target <= item.units ||
          item.target > 100
      ) ||
      new Set(report.shortages.map((item) => item.itemKey)).size !== report.shortages.length ||
      !Array.isArray(report.jobs) ||
      report.jobs.length > 3
    )
      throw new Error('Invalid depot status telemetry.');
    if (
      report.telemetry === 'carrier' &&
      (report.jobs.length || report.shortages.length || report.boardRevision !== 0)
    )
      throw new Error('Unvisited depot carriers cannot invent stock or jobs.');
    const jobs = new Set<string>();
    for (const job of report.jobs) {
      if (
        !job ||
        !validId(job.id) ||
        jobs.has(job.id) ||
        !validText(job.title, 160) ||
        !Number.isSafeInteger(job.rewardCredits) ||
        job.rewardCredits < 0
      )
        throw new Error('Invalid advertised robot job.');
      jobs.add(job.id);
    }
    const heard = state.heard[notice.sourceId];
    if (!heard || heard.revision !== notice.revision || heard.at !== notice.receivedAtSeconds)
      throw new Error('Depot inbox contact revision is inconsistent.');
  }
  for (const [id, heard] of Object.entries(state.heard)) {
    if (!validId(id) || !heard || !validRevision(heard.revision) || !validTime(heard.at, seconds))
      throw new Error('Invalid heard depot identity.');
  }
}

/** Bounds station/mission identities and excludes keys that could alter a restored map's prototype. */
function validId(value: unknown): value is string {
  return validText(value, 512) && !['__proto__', 'constructor', 'prototype'].includes(value);
}

/** Uses compact content fingerprints rather than saved report strings as contact revisions. */
function validRevision(value: unknown): boolean {
  return typeof value === 'string' && /^r1-[0-9a-f]{1,8}$/.test(value);
}

/** Restricts received/issued epochs to the elapsed campaign clock. */
function validTime(value: number, seconds: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= seconds;
}

/** Keeps imported terminal text finite and nonempty. */
function validText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
}
