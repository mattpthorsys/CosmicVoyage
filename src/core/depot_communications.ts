import { CONFIG } from '../config';
import { PRNG } from '../utils/prng';
import type { InfrastructureRegistry } from './infrastructure_registry';
import type { FrontierCatalogue, DepotContact } from './frontier_catalogue';
import type { DepotService } from './depot_service';
import type { StarbaseCommerceService } from './starbase_commerce';
import type { MissionProgressService } from './mission_progress';
import { DEPOT_SUPPLY_TARGETS } from './depot_contracts';
import { observatoryDistanceLy } from './observatory_types';
import {
  createCommunicationsSnapshot,
  COMMUNICATIONS_NOTICE_LIMIT,
  COMMUNICATIONS_CONTACT_LIMIT,
  COMMUNICATIONS_REPORT_LIFETIME_SECONDS,
  type CommunicationsSnapshot,
  type CommunicationsNotice,
  type DepotBroadcastReport,
} from './communications_types';

/** Owns bounded contact acquisition and persistent informational reports, never remote transactions. */
export class DepotCommunications {
  private state = createCommunicationsSnapshot();
  private generation = 0;
  private inFlight = false;
  private receiverPosition: { x: number; y: number } | null = null;
  private lastAttemptAt = -Infinity;
  private lastCompletedPosition = '';
  private lastNotificationAt = -Infinity;
  revision = 0;

  /** Shares real catalogue/infrastructure sources and readonly service telemetry without creating stock. */
  constructor(
    private readonly catalogue: FrontierCatalogue,
    private readonly infrastructure: InfrastructureRegistry,
    private readonly depots: DepotService,
    private readonly commerce: StarbaseCommerceService,
    private readonly missions: MissionProgressService
  ) {}

  /** Captures small independent inbox/read-state records, not entire systems or world inventories. */
  createSnapshot(): CommunicationsSnapshot {
    return structuredClone(this.state);
  }

  /** Restores validated read state and invalidates pending acquisition from the previous campaign. */
  restoreSnapshot(snapshot: CommunicationsSnapshot): void {
    this.cancel();
    this.state = structuredClone(snapshot);
    this.lastAttemptAt = -Infinity;
    this.lastCompletedPosition = '';
    this.lastNotificationAt = -Infinity;
    this.revision++;
  }

  /** Cancels worker results when travel changes location or the owning game is destroyed. */
  cancel(): void {
    this.generation++;
    this.inFlight = false;
    this.receiverPosition = null;
  }

  /** Returns newest unexpired reports first; old notices cannot mutate accepted contracts or receipts. */
  list(seconds: number): CommunicationsNotice[] {
    return this.state.notices
      .filter((notice) => notice.expiresAtSeconds > seconds)
      .sort((a, b) => b.receivedAtSeconds - a.receivedAtSeconds || a.sourceId.localeCompare(b.sourceId))
      .map((notice) => structuredClone(notice));
  }

  /** Marks only the report actually displayed in the foreground terminal. */
  markRead(sourceId: string): void {
    const notice = this.state.notices.find((entry) => entry.sourceId === sourceId);
    if (notice && !notice.read) {
      notice.read = true;
      this.revision++;
    }
  }

  /** Samples at most every two real seconds in motion, or every fifteen seconds at a fixed position. */
  async poll(x: number, y: number, seconds: number, nowMs: number): Promise<string | null> {
    const position = `${x},${y}`;
    this.receiverPosition = { x, y };
    if (
      this.inFlight ||
      nowMs - this.lastAttemptAt < 2000 ||
      (position === this.lastCompletedPosition && nowMs - this.lastAttemptAt < 15000)
    )
      return null;
    this.lastAttemptAt = nowMs;
    const count = await this.refresh(x, y, seconds);
    if (count === null || !count || nowMs - this.lastNotificationAt < 15000) return null;
    this.lastNotificationAt = nowMs;
    return `${count} frontier depot ${count === 1 ? 'report' : 'reports'} received / H Communications.`;
  }

  /** Acquires verified natural candidates and delivered assets inside one configured physical radius. */
  async refresh(x: number, y: number, seconds: number): Promise<number | null> {
    const generation = ++this.generation;
    this.inFlight = true;
    this.receiverPosition = { x, y };
    try {
      const contacts = await this.catalogue.search(
        x,
        y,
        CONFIG.DEPOT_COMMUNICATIONS_RADIUS_LY,
        () => generation === this.generation
      );
      if (!contacts || generation !== this.generation) return null;
      const depots = new Map<string, DepotContact>();
      for (const contact of contacts.filter((entry) => entry.stationKind === 'automated-depot').slice(0, 8)) {
        if (generation !== this.generation) return null;
        const depot = this.catalogue.verifyDepot(contact);
        if (depot) depots.set(depot.stationId, depot);
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
      if (generation !== this.generation) return null;
      // Finish bounded acquisition during ordinary movement; only retain carriers inside the latest receiver radius.
      const receiver = this.receiverPosition ?? { x, y };
      for (const depot of this.infrastructure.getDepotContacts(
        receiver.x,
        receiver.y,
        CONFIG.DEPOT_COMMUNICATIONS_RADIUS_LY
      ))
        depots.set(depot.stationId, depot);
      const acquired = [...depots.values()]
        .filter(
          (depot) =>
            observatoryDistanceLy(receiver.x, receiver.y, depot.address) <=
            CONFIG.DEPOT_COMMUNICATIONS_RADIUS_LY
        )
        .sort(
          (a, b) =>
            observatoryDistanceLy(receiver.x, receiver.y, a.address) -
              observatoryDistanceLy(receiver.x, receiver.y, b.address) ||
            a.stationId.localeCompare(b.stationId)
        )
        .slice(0, 32);
      const count = this.receive(acquired, seconds);
      this.lastCompletedPosition = `${x},${y}`;
      return count;
    } finally {
      if (generation === this.generation) {
        this.inFlight = false;
      }
    }
  }

  /** Retains one current report per source; stable content and unread status survive repeated carrier acquisition. */
  receive(contacts: readonly DepotContact[], seconds: number): number {
    let changed = 0;
    this.state.notices = this.state.notices.filter((notice) => notice.expiresAtSeconds > seconds);
    for (const contact of contacts) {
      const report = this.readTelemetry(contact.stationId, seconds);
      // Individual units vary on ordinary trade. Only shortage identities and actual board content trigger a new alert.
      const fingerprint = JSON.stringify([
        report.telemetry,
        report.shortages.map((item) => item.itemKey),
        report.boardRevision,
        report.jobs.map((job) => job.id),
      ]);
      const revision = `r1-${(new PRNG(fingerprint).seed >>> 0).toString(16)}`;
      const old = this.state.notices.find((notice) => notice.sourceId === contact.stationId);
      const previous = this.state.heard[contact.stationId];
      const isNew = !previous || previous.revision !== revision;
      if (isNew) changed++;
      const notice: CommunicationsNotice = {
        sourceId: contact.stationId,
        name: contact.name.slice(0, 160),
        address: { ...contact.address },
        revision,
        report,
        receivedAtSeconds: seconds,
        expiresAtSeconds: seconds + COMMUNICATIONS_REPORT_LIFETIME_SECONDS,
        read: old && !isNew ? old.read : false,
      };
      this.state.notices = this.state.notices.filter((entry) => entry.sourceId !== contact.stationId);
      this.state.notices.push(notice);
      this.state.heard[contact.stationId] = { revision, at: seconds };
    }
    while (this.state.notices.length > COMMUNICATIONS_NOTICE_LIMIT) {
      const read = this.state.notices.findIndex((notice) => notice.read);
      this.state.notices.splice(read < 0 ? 0 : read, 1);
    }
    while (Object.keys(this.state.heard).length > COMMUNICATIONS_CONTACT_LIMIT) {
      const protectedIds = new Set(this.state.notices.map((notice) => notice.sourceId));
      const oldest = Object.entries(this.state.heard)
        .filter(([id]) => !protectedIds.has(id))
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!oldest) break;
      delete this.state.heard[oldest[0]];
    }
    this.revision++;
    return changed;
  }

  /** Reports only existing stocks and prepared offers; an unvisited carrier promises no invented reserves. */
  private readTelemetry(stationId: string, seconds: number): DepotBroadcastReport {
    const record = this.depots.getRecord(stationId);
    if (!record)
      return { telemetry: 'carrier', issuedAtSeconds: seconds, shortages: [], jobs: [], boardRevision: 0 };
    const shortages = Object.entries(DEPOT_SUPPLY_TARGETS)
      .filter(([key, target]) => this.commerce.getStock(stationId, key) < target)
      .map(([key, target]) => ({ itemKey: key, units: this.commerce.getStock(stationId, key), target }));
    const jobs = (record.jobs?.offers ?? [])
      .filter((mission) => this.missions.getStatus(mission) === 'AVAILABLE')
      .map((mission) => ({
        id: mission.id,
        title: mission.title.slice(0, 160),
        rewardCredits: mission.rewardCredits,
      }))
      .slice(0, 3);
    return {
      telemetry: 'stored',
      issuedAtSeconds: record.lastUpdatedSeconds,
      shortages,
      jobs,
      boardRevision: record.jobs?.revision ?? 0,
    };
  }
}
