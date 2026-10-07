import { CONFIG } from '../config';
import type { ObservatoryAddress } from './observatory_types';
import type { DepotSnapshot } from './depot_types';

export const SURVEY_EVIDENCE_LIMIT = 4096;
export const SURVEY_RECEIPT_LIMIT = 16384;
export const PUBLIC_CHART_LIMIT = 512;
export const SURVEY_BUYER_LIMIT = 2048;
export const SURVEY_INITIAL_BUDGET = 2400;
export type SurveyTier = 1 | 2 | 3;
export type SurveyTarget =
  | 'system'
  | 'stars'
  | `star:${'A' | 'B' | 'C'}`
  | `planet:${number}`
  | `planet:${number}/moon:${number}`;
export type SurveyMethod =
  | 'remote-spectrum'
  | 'local-scan'
  | 'orbital-survey'
  | 'surface-map'
  | 'sample-analysis';

export interface SurveyEvidence {
  tier: SurveyTier;
  at: number;
  method: SurveyMethod;
  label: string;
}

export interface PublicChart {
  name: string;
  at: number;
}

export interface SurveyBuyer {
  address: ObservatoryAddress;
  credits: number;
}

export interface SurveyDataSnapshot {
  evidence: Record<string, SurveyEvidence>;
  paid: Record<string, SurveyTier>;
  charts: Record<string, PublicChart>;
  buyers: Record<string, SurveyBuyer>;
}

export interface SurveyUploadQuote {
  stationId: string;
  key: string;
  tier: SurveyTier;
  paidTier: number;
  reward: number;
  availableCredits: number;
  reason: string;
  signature: string;
}

/** Creates a detached, empty evidence ledger; public charts never enter measured evidence. */
export function createSurveyDataSnapshot(): SurveyDataSnapshot {
  return { evidence: {}, paid: {}, charts: {}, buyers: {} };
}

/** Encodes complete object identity without repeating addresses in every compact evidence entry. */
export function surveyObjectKey(address: ObservatoryAddress, target: SurveyTarget): string {
  return `${surveyAddressKey(address)}|${target}`;
}

/** Uses the same coordinate domain as reachable navigation, including the resolved contact slot. */
export function surveyAddressKey(address: ObservatoryAddress): string {
  return `${address.worldX},${address.worldY},${address.systemSlot}`;
}

/** Decodes canonical addresses and rejects aliases such as leading zeroes or unreachable slots. */
export function parseSurveyAddress(key: string): ObservatoryAddress {
  const parts = key.split(',');
  const address = { worldX: Number(parts[0]), worldY: Number(parts[1]), systemSlot: Number(parts[2]) };
  if (
    parts.length !== 3 ||
    !Number.isSafeInteger(address.worldX) ||
    !Number.isSafeInteger(address.worldY) ||
    !Number.isInteger(address.systemSlot) ||
    address.systemSlot < 0 ||
    address.systemSlot >= CONFIG.GALACTIC_MAX_RESOLVED_SYSTEMS_PER_CELL ||
    surveyAddressKey(address) !== key
  )
    throw new Error('Invalid survey address.');
  return address;
}

/** Separates system, integrated stellar, companion and body surveys at a full stable address. */
export function parseSurveyObjectKey(key: string): { address: ObservatoryAddress; target: SurveyTarget } {
  const parts = key.split('|');
  if (
    parts.length !== 2 ||
    !/^(system|stars|star:[ABC]|planet:(0|[1-9]\d*)(\/moon:(0|[1-9]\d*))?)$/.test(parts[1])
  )
    throw new Error('Invalid survey object identity.');
  return { address: parseSurveyAddress(parts[0]), target: parts[1] as SurveyTarget };
}

/** Rejects malformed records, future evidence and station funding detached from a real depot owner. */
export function validateSurveyDataSnapshot(
  value: unknown,
  seconds: number,
  depots: DepotSnapshot
): asserts value is SurveyDataSnapshot {
  if (!isMap(value)) throw new Error('Invalid survey exchange data.');
  const state = value as unknown as SurveyDataSnapshot;
  const limits = {
    evidence: SURVEY_EVIDENCE_LIMIT,
    paid: SURVEY_RECEIPT_LIMIT,
    charts: PUBLIC_CHART_LIMIT,
    buyers: SURVEY_BUYER_LIMIT,
  };
  for (const [field, limit] of Object.entries(limits)) {
    const map = state[field as keyof SurveyDataSnapshot];
    if (!isMap(map) || Object.keys(map).length > limit)
      throw new Error(`Survey ${field} exceeds its storage limit.`);
  }
  for (const [key, tier] of Object.entries(state.paid)) {
    parseSurveyObjectKey(key);
    if (!isTier(tier)) throw new Error('Invalid survey payment tier.');
  }
  for (const [key, record] of Object.entries(state.evidence)) {
    parseSurveyObjectKey(key);
    if (
      !record ||
      !isTier(record.tier) ||
      !validTime(record.at, seconds) ||
      !validName(record.label) ||
      !['remote-spectrum', 'local-scan', 'orbital-survey', 'surface-map', 'sample-analysis'].includes(
        record.method
      )
    )
      throw new Error('Invalid measured survey evidence.');
    if (record.method === 'remote-spectrum' && !key.endsWith('|stars'))
      throw new Error('Remote spectra are not local surveys.');
  }
  for (const [key, chart] of Object.entries(state.charts)) {
    parseSurveyAddress(key);
    if (!chart || !validName(chart.name) || !validTime(chart.at, seconds))
      throw new Error('Invalid public navigation chart.');
  }
  for (const [id, buyer] of Object.entries(state.buyers)) {
    if (
      !buyer ||
      !buyer.address ||
      !Object.hasOwn(depots, id) ||
      !Number.isSafeInteger(buyer.credits) ||
      buyer.credits < 0 ||
      buyer.credits > SURVEY_INITIAL_BUDGET ||
      surveyAddressKey(buyer.address) !== surveyAddressKey(depots[id].address)
    )
      throw new Error('Invalid survey sponsor account.');
    parseSurveyAddress(surveyAddressKey(buyer.address));
  }
}

/** Accepts only plain keyed maps, never arrays or prototype-bearing identities. */
function isMap(value: unknown): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every((key) => !['__proto__', 'constructor', 'prototype'].includes(key))
  );
}

/** Restricts evidence and settlement tiers to three discrete quality thresholds. */
function isTier(value: unknown): value is SurveyTier {
  return value === 1 || value === 2 || value === 3;
}

/** Rejects missing display identities and unbounded imported text. */
function validName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 160;
}

/** Observation epochs belong to the current campaign's elapsed simulation clock. */
function validTime(value: number, seconds: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= seconds;
}
