import { describe, expect, it } from 'vitest';
import {
  createHaulActionDialog,
  createHaulPrelude,
  createHaulArrivalDialog,
  createHaulResultDialog,
  createHomeboundRouteDialog,
} from '../../../core/mission_dialogs';
import { formatHaulDuration, type HaulManifestData } from '../../../core/haul_manifest';
import { getHeavyHaulObjective } from '../../../core/mission_board';
import { quoteHeavyHaul } from '../../../core/tow_performance';
import { TerminalDialog, type TerminalDialogSpec } from '../../../core/terminal_dialog';
import {
  heavyHaulContextFixture,
  heavyHaulMissionFixture,
  heavyHaulReceiptFixture,
} from '../../fixtures/heavy_haul_contracts';

/** Builds dialog inputs from the same certified terms and receipt used by the haul service. */
function readout(kind: 'local' | 'heavy') {
  const mission = heavyHaulMissionFixture(kind),
    context = heavyHaulContextFixture();
  const quote = quoteHeavyHaul(getHeavyHaulObjective(mission)!, context);
  const receipt = heavyHaulReceiptFixture(mission, context);
  const data: HaulManifestData & { receipt: typeof receipt } = {
    mission,
    quote,
    receipt,
    stage: 'arrived',
    normalFuel: 450,
    maximumFuel: 500,
    remainingSupport: 10,
    departureDate: '01 Jan 3015',
    arrivalDate: 'Recorded arrival',
    staging: 'Deployment pending',
  };
  return { mission, data };
}

/** Reads semantic message text independently of subsequent grid wrapping. */
function messageText(spec: TerminalDialogSpec<unknown>): string {
  return spec.lines
    .flatMap((line) => line.segments)
    .map((span) => span.text)
    .join(' ');
}

describe('mission and haul notices', () => {
  it('announces hypersleep only for a voyage that requires crew berths', () => {
    const local = createHaulPrelude(readout('local').data);
    const remote = createHaulPrelude(readout('heavy').data);
    expect(local.title).toBe('TOW TRANSFER');
    expect(messageText(local)).toContain('Crew on duty');
    expect(remote.title).toBe('HYPERSLEEP');
    expect(messageText(remote)).toContain('3 crew entering hypersleep');
    const dialog = new TerminalDialog();
    dialog.open(remote);
    const narrow = dialog.createModel(24, 16);
    expect(narrow.lineCount).toBe(narrow.visibleRows);
  });

  it('reports the receipt duration and pending deployment separately from paid delivery', () => {
    const f = readout('heavy');
    const arrival = createHaulArrivalDialog(f.data, 3);
    expect(messageText(arrival)).toContain(formatHaulDuration(f.data.receipt.durationSeconds));
    expect(messageText(arrival)).toContain('then deploy');
    expect(messageText(arrival)).not.toContain('credited');
    expect(arrival.dismissIntent).toMatchObject({ kind: 'view-haul' });
    const delivery = createHaulResultDialog(f.mission, 'deploy', { ok: true, message: 'Commissioned.' });
    expect(delivery.title).toBe('TOW DELIVERED');
    expect(messageText(delivery)).toContain('5,800 Cr credited');
    expect(messageText(delivery)).toContain('Depot open for trade');
    expect(messageText(delivery)).toContain('awaiting staff and resource arrival');
  });

  it('shows homebound coordinates and normal-fuel travel before selecting the return route', () => {
    const route = {
      systemAddress: { worldX: -10, worldY: 20, systemSlot: 0 },
      stationId: 'issuer',
      stationName: 'Home Starbase Delta',
    };
    const spec = createHomeboundRouteDialog(route, 350);
    expect(spec.intent).toEqual({ kind: 'homebound-route', route });
    expect(spec.kind).toBe('confirmation');
    expect(messageText(spec)).toContain('X -10 / Y 20');
    expect(messageText(spec)).toContain('350.0 light-years');
    expect(messageText(spec)).toContain('normal reactor fuel');
    expect(messageText(spec)).toContain('issuing port');
  });

  it('does not claim successful delivery on failure, and makes recovery an explicit default-No choice', () => {
    const f = readout('heavy');
    const refusal = createHaulResultDialog(f.mission, 'deploy', {
      ok: false,
      message: 'Approach the deployment contact.',
    });
    expect(refusal.title).toBe('ACTION REFUSED');
    expect(messageText(refusal)).not.toContain('credited');
    const recovery = createHaulActionDialog(f.mission, 'recover', f.data);
    expect(recovery.defaultYes).toBe(false);
    expect(recovery.caution).toBe(true);
    expect(messageText(recovery)).toContain('No payment');
  });
});
