import { observatoryDistanceLy } from './observatory_types';
import type { CommunicationsNotice } from './communications_types';
import { frontierLine, type FrontierTerminalEntry } from './frontier_terminal';
import { getTradeItemInfo } from './starbase_commerce';

/** Formats actual depot contacts, timestamps and saved telemetry without remotely accepting jobs or doing work. */
export function createCommunicationsEntries(
  notices: readonly CommunicationsNotice[],
  x: number,
  y: number,
  seconds: number
): FrontierTerminalEntry[] {
  return notices.map((notice) => ({
    id: notice.sourceId,
    title: notice.name,
    status: notice.read ? 'READ' : 'NEW',
    tone: notice.read ? 'muted' : 'green',
    lines: [
      frontierLine('AUTONOMOUS LOGISTICS CARRIER', 'cyan', true),
      frontierLine(
        `X ${notice.address.worldX} / Y ${notice.address.worldY} / contact ${notice.address.systemSlot + 1}`,
        'amber'
      ),
      frontierLine(
        `Range ${observatoryDistanceLy(x, y, notice.address).toFixed(1)} ly / received day ${(notice.receivedAtSeconds / 86400).toFixed(1)}`,
        'green'
      ),
      frontierLine(
        `Report age ${Math.max(0, (seconds - notice.report.issuedAtSeconds) / 86400).toFixed(1)} days`,
        'amber'
      ),
      frontierLine('SERVICES', 'cyan', true),
      frontierLine('Trade / basic hull & rover repair / reactor loading / robotic medicine', 'green'),
      frontierLine('Robot contracts / astrometric exchange / finite supplies and sponsor funds', 'green'),
      ...(notice.report.telemetry === 'carrier'
        ? [frontierLine('Carrier verified / stock and job telemetry available on docking.', 'muted')]
        : [
            frontierLine('LAST STORED SUPPLY TELEMETRY', 'cyan', true),
            ...(notice.report.shortages.length
              ? notice.report.shortages.map((item) =>
                  frontierLine(
                    `${getTradeItemInfo(item.itemKey)?.name ?? item.itemKey}: ${item.units} / ${item.target} m^3`,
                    'amber'
                  )
                )
              : [frontierLine('No shortages reported at last local update.', 'green')]),
            frontierLine('ADVERTISED WORK', 'cyan', true),
            ...(notice.report.jobs.length
              ? notice.report.jobs.map((job) =>
                  frontierLine(`${job.title} / ${job.rewardCredits} Cr`, 'green')
                )
              : [frontierLine('No unaccepted work in the last stored board.', 'muted')]),
            frontierLine(
              'Stored telemetry can be stale; local docking refreshes stocks and quotes.',
              'muted'
            ),
          ]),
      frontierLine('Enter marks this system in navigation / local transactions require docking.', 'cyan'),
    ],
  }));
}
