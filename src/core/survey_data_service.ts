import { CONFIG } from '../config';
import type { ResourceComponent } from './components';
import type { ObservatoryAddress, ObservatoryContact, ObservatoryObservation } from './observatory_types';
import {
  createSurveyDataSnapshot,
  parseSurveyObjectKey,
  surveyObjectKey,
  surveyAddressKey,
  SURVEY_EVIDENCE_LIMIT,
  SURVEY_RECEIPT_LIMIT,
  PUBLIC_CHART_LIMIT,
  SURVEY_BUYER_LIMIT,
  SURVEY_INITIAL_BUDGET,
  type SurveyDataSnapshot,
  type SurveyTier,
  type SurveyTarget,
  type SurveyMethod,
  type SurveyUploadQuote,
  type SurveyEvidence,
  type PublicChart,
} from './survey_data_types';

export interface SurveyUploadOutcome {
  surveyData: SurveyDataSnapshot;
  resources: ResourceComponent;
}

export interface SurveyUploadResult {
  ok: boolean;
  message: string;
  credits: number;
}

/** Owns compact measured evidence, navigation-only public charts and durable campaign-wide payments. */
export class SurveyDataService {
  private state = createSurveyDataSnapshot();
  private receiptCount = 0;
  revision = 0;

  /** Captures independent records so quote preparation and saving cannot mutate live evidence. */
  createSnapshot(): SurveyDataSnapshot {
    return structuredClone(this.state);
  }

  /** Restores validated evidence without replaying observations or creating research payments. */
  restoreSnapshot(snapshot: SurveyDataSnapshot): void {
    this.state = structuredClone(snapshot);
    this.receiptCount = Object.keys(snapshot.paid).length;
    this.revision++;
  }

  /** Returns compact presentation records without copying the potentially much larger receipt ledger. */
  listEvidence(): Array<{ key: string; evidence: Readonly<SurveyEvidence> }> {
    return Object.entries(this.state.evidence).map(([key, evidence]) => ({ key, evidence }));
  }

  /** Returns only navigation records; callers cannot mutate the persisted chart owner. */
  listCharts(): Array<{ key: string; chart: Readonly<PublicChart> }> {
    return Object.entries(this.state.charts).map(([key, chart]) => ({ key, chart }));
  }

  /** Reports actual scientific funding independently of materials and mission escrow. */
  availableCredits(stationId: string): number {
    return this.state.buyers[stationId]?.credits ?? 0;
  }

  /** Reports bounded storage pressure without exposing or copying payment receipts. */
  storageStatus(): { evidence: number; receipts: number } {
    return { evidence: Object.keys(this.state.evidence).length, receipts: this.receiptCount };
  }

  /** Establishes a finite, independent scientific budget once for a verified docked depot. */
  ensureBuyer(stationId: string, address: ObservatoryAddress): void {
    if (
      Object.hasOwn(this.state.buyers, stationId) ||
      Object.keys(this.state.buyers).length >= SURVEY_BUYER_LIMIT
    )
      return;
    this.state.buyers[stationId] = { address: { ...address }, credits: SURVEY_INITIAL_BUDGET };
    this.revision++;
  }

  /** Retains meaningful quality improvements; paid receipts survive both detail and evidence eviction. */
  record(
    address: ObservatoryAddress,
    target: SurveyTarget,
    label: string,
    tier: SurveyTier,
    method: SurveyMethod,
    seconds: number
  ): boolean {
    const key = surveyObjectKey(address, target);
    const previous = this.state.evidence[key];
    if (previous && previous.tier >= tier) return false;
    if (!previous && Object.keys(this.state.evidence).length >= SURVEY_EVIDENCE_LIMIT) {
      const removable = Object.keys(this.state.evidence).find(
        (id) => (this.state.paid[id] ?? 0) >= this.state.evidence[id].tier
      );
      if (!removable) return false;
      delete this.state.evidence[removable];
    }
    this.state.evidence[key] = { tier, label: label.slice(0, 160), at: seconds, method };
    this.revision++;
    return true;
  }

  /** Publishes only actually integrated stellar spectra, not registry or downloaded knowledge. */
  recordRemote(contact: ObservatoryContact, reading: ObservatoryObservation, seconds: number): void {
    if (
      contact.kind !== 'system' ||
      contact.system?.objectKind !== 'stellar' ||
      reading.equipmentClass <= 0 ||
      reading.quality < 0.35
    )
      return;
    const tier: SurveyTier = reading.quality >= 0.85 ? 3 : reading.quality >= 0.65 ? 2 : 1;
    this.record(contact, 'stars', contact.name, tier, 'remote-spectrum', seconds);
  }

  /** Quotes only the incremental tier value, shared across every depot in this campaign. */
  quote(stationId: string, key: string): SurveyUploadQuote | null {
    const evidence = this.state.evidence[key];
    const buyer = this.state.buyers[stationId];
    if (!evidence || !buyer) return null;
    const paidTier = this.state.paid[key] ?? 0;
    const reward = Math.max(0, this.value(key, evidence.tier) - this.value(key, paidTier));
    const reason = !reward
      ? 'This evidence tier has already been paid.'
      : !Object.hasOwn(this.state.paid, key) && this.receiptCount >= SURVEY_RECEIPT_LIMIT
        ? 'Payment ledger full; existing receipts retained.'
        : reward > buyer.credits
          ? 'Sponsor funds insufficient; evidence remains unpaid.'
          : '';
    return {
      stationId,
      key,
      tier: evidence.tier,
      paidTier,
      reward,
      availableCredits: buyer.credits,
      reason,
      signature: JSON.stringify([stationId, key, evidence, paidTier, buyer.credits]),
    };
  }

  /** Checks a quote again, checkpoints its complete detached outcome, then applies one payment. */
  upload(
    quote: SurveyUploadQuote,
    player: { resources: ResourceComponent },
    checkpoint?: (outcome: SurveyUploadOutcome) => void
  ): SurveyUploadResult {
    const current = this.quote(quote.stationId, quote.key);
    if (
      !current ||
      current.signature !== quote.signature ||
      current.reward !== quote.reward ||
      current.reason
    )
      return {
        ok: false,
        message: current?.reason || 'Survey quote changed; review the current offer.',
        credits: 0,
      };
    const resources = { ...player.resources, credits: player.resources.credits + current.reward };
    if (!Number.isSafeInteger(resources.credits))
      return { ok: false, message: 'Account cannot accept this payment.', credits: 0 };
    const surveyData = this.createSnapshot();
    surveyData.paid[quote.key] = current.tier;
    surveyData.buyers[quote.stationId].credits -= current.reward;
    try {
      checkpoint?.({ surveyData, resources });
    } catch {
      return { ok: false, message: 'Checkpoint failed. Evidence and funds unchanged.', credits: 0 };
    }
    if (!Object.hasOwn(this.state.paid, quote.key)) this.receiptCount++;
    this.state = surveyData;
    this.revision++;
    player.resources = resources;
    return {
      ok: true,
      message: `${current.reward} Cr credited / quality tier ${current.tier} filed in the shared research ledger.`,
      credits: current.reward,
    };
  }

  /** Files a navigation chart separately; it cannot satisfy surveys, biological evidence or paid uploads. */
  download(
    address: ObservatoryAddress,
    name: string,
    seconds: number,
    checkpoint?: (snapshot: SurveyDataSnapshot) => void
  ): boolean {
    const key = surveyAddressKey(address);
    const snapshot = this.createSnapshot();
    if (!Object.hasOwn(snapshot.charts, key) && Object.keys(snapshot.charts).length >= PUBLIC_CHART_LIMIT)
      delete snapshot.charts[Object.keys(snapshot.charts)[0]];
    snapshot.charts[key] = { name: name.slice(0, 160), at: seconds };
    try {
      checkpoint?.(snapshot);
    } catch {
      return false;
    }
    this.state = snapshot;
    this.revision++;
    return true;
  }

  /** Values frontier science modestly; remoteness never creates an unbounded distance multiplier. */
  private value(key: string, tier: number): number {
    if (tier <= 0) return 0;
    const { address, target } = parseSurveyObjectKey(key);
    const table =
      target === 'system'
        ? [0, 55, 85, 110]
        : target.startsWith('planet:')
          ? [0, 90, 135, 165]
          : [0, 12, 25, 40];
    const range =
      Math.hypot(address.worldX - CONFIG.PLAYER_START_X, address.worldY - CONFIG.PLAYER_START_Y) *
      CONFIG.HYPERSPACE_CELL_LIGHT_YEARS;
    const frontier = Math.max(
      0,
      Math.min(1, (range - CONFIG.HUMAN_SETTLED_RADIUS_LY) / CONFIG.HUMAN_FRONTIER_RADIUS_LY)
    );
    return Math.round(table[tier] * (1 + frontier));
  }
}
