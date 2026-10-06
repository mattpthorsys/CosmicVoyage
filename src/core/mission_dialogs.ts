import {
  biologicalReferenceDescription,
  getHeavyHaulObjective,
  isBiologicalMissionObjective,
  type StarbaseMission,
} from './mission_board';
import { formatHaulDuration, type HaulManifestAction, type HaulManifestData } from './haul_manifest';
import type { HaulJourneyReceipt } from './heavy_haul_types';
import type { TerminalDialogSpec } from './terminal_dialog';
import type { TextDashboardLine, TextTone } from './text_ui';

export type MissionDialogIntent =
  | { readonly kind: 'accept-mission'; readonly mission: StarbaseMission; readonly stationId: string }
  | { readonly kind: 'haul-action'; readonly action: HaulManifestAction; readonly mission: StarbaseMission }
  | { readonly kind: 'view-haul'; readonly mission?: StarbaseMission };

/** Adds one semantic terminal paragraph, preserving its tone through responsive wrapping. */
function line(text: string, tone: TextTone = 'normal', heading = false): TextDashboardLine {
  return { segments: [{ text, tone, font: heading ? 'thick' : 'thin' }] };
}

/** Presents the actual offer and biological reference before accepting a normal mission. */
export function createMissionAcceptanceDialog(
  mission: StarbaseMission,
  stationId: string
): TerminalDialogSpec<MissionDialogIntent> {
  return {
    title: 'ACCEPT MISSION',
    kind: 'confirmation',
    intent: { kind: 'accept-mission', mission, stationId },
    defaultYes: true,
    lines: [
      line(mission.title, 'cyan', true),
      line(mission.summary),
      ...mission.objectives.map((objective) =>
        line(
          isBiologicalMissionObjective(objective)
            ? biologicalReferenceDescription(objective)
            : objective.targetLabel,
          'cyan'
        )
      ),
      line(`Payment ${mission.rewardCredits.toLocaleString()} Cr / ${mission.risk} risk`, 'amber'),
      line(`Issued by ${mission.originStarbaseName}`, 'muted'),
      line('Add this contract to your active missions?', 'green'),
    ],
  };
}

/** Keeps acceptance or refusal visible without paying the contract before its objectives are fulfilled. */
export function createMissionStatusDialog(
  mission: StarbaseMission,
  message: string,
  ok: boolean
): TerminalDialogSpec<MissionDialogIntent> {
  return {
    title: ok ? 'MISSION ACTIVE' : 'ACTION REFUSED',
    kind: 'message',
    caution: !ok,
    lines: [
      line(mission.title, 'cyan', true),
      line(message, ok ? 'green' : 'red'),
      ...(ok
        ? [line('Mission coordinates and objectives are available in the mission journal.', 'muted')]
        : []),
    ],
  };
}

/** Converts each haul operation into an explicit choice with its practical consequence visible. */
export function createHaulActionDialog(
  mission: StarbaseMission,
  action: HaulManifestAction,
  data: HaulManifestData
): TerminalDialogSpec<MissionDialogIntent> {
  const objective = getHeavyHaulObjective(mission)!;
  const titles: Record<HaulManifestAction, string> = {
    accept: 'ACCEPT HAUL',
    couple: 'ATTACH TOW',
    depart: 'BEGIN VOYAGE',
    deploy: 'DEPLOY TOW',
    recover: 'RECOVER TOW',
  };
  const lines = [line(mission.title, 'cyan', true)];
  if (action === 'recover') {
    lines.push(
      line('Contractor recovery removes the package and support tank.', 'amber'),
      line('No payment. This offer will be permanently retired.', 'red')
    );
  } else if (action === 'deploy') {
    lines.push(
      line(`${objective.targetName} / ${objective.destination.systemName}`, 'green'),
      line(`Complete delivery and receive ${mission.rewardCredits.toLocaleString()} Cr.`, 'amber'),
      line('Release the tow and its contractor tank to the installation.')
    );
  } else {
    lines.push(line(`${objective.targetName} / ${objective.package.wetMassKg.toLocaleString()} kg`, 'amber'));
    if (action === 'couple') {
      lines.push(
        line('Attach the package and sealed support tank.'),
        line('Ship manoeuvring will be slower while towing.', 'amber')
      );
    } else {
      lines.push(line(`Destination ${objective.destination.systemName}`, 'green'));
      if (data.quote.quote) {
        lines.push(
          line(`Travel ${formatHaulDuration(data.quote.quote.durationSeconds)}`, 'amber'),
          line(
            data.quote.quote.requiredBerths
              ? `${data.quote.quote.requiredBerths} crew require hypersleep.`
              : 'Crew remain on duty.'
          )
        );
      }
      if (action === 'accept') {
        lines.push(line(`Escrow ${mission.rewardCredits.toLocaleString()} Cr / paid at deployment`, 'amber'));
      } else {
        lines.push(
          line('The voyage advances the calendar immediately.'),
          line('Contractor support powers transit; normal reactor fuel is preserved.', 'green')
        );
      }
      if (!data.quote.ok) lines.push(...data.quote.reasons.map((reason) => line(reason, 'red')));
    }
  }
  return {
    title: titles[action],
    kind: 'confirmation',
    lines,
    intent: { kind: 'haul-action', action, mission },
    defaultYes: action !== 'recover',
    caution: action === 'recover',
  };
}

/** Shows crew preparation only when the certified voyage actually requires hypersleep. */
export function createHaulPrelude(data: HaulManifestData): TerminalDialogSpec<MissionDialogIntent> {
  const quote = data.quote.quote;
  return {
    title: quote?.requiredBerths ? 'HYPERSLEEP' : 'TOW TRANSFER',
    kind: 'progress',
    lines: [
      line(
        quote?.requiredBerths ? `${quote.requiredBerths} crew entering hypersleep.` : 'Crew on duty.',
        'green'
      ),
      line(`Transit ${formatHaulDuration(quote?.durationSeconds ?? 0)}`, 'amber'),
      line(quote?.requiredBerths ? 'Berths secured.' : 'Transfer ready.', 'cyan'),
      line('Support online.', 'muted'),
    ],
  };
}

/** Uses the committed receipt, distinguishing arrival from final deployment and payment. */
export function createHaulArrivalDialog(
  data: HaulManifestData & { readonly receipt: HaulJourneyReceipt },
  sleepingCrew: number
): TerminalDialogSpec<MissionDialogIntent> {
  const objective = data.mission && getHeavyHaulObjective(data.mission);
  return {
    title: 'HAUL ARRIVAL',
    kind: 'message',
    dismissIntent: { kind: 'view-haul', mission: data.mission },
    lines: [
      line(objective?.targetName ?? 'External package', 'cyan', true),
      line(`Towed to ${objective?.destination.systemName ?? 'the destination system'}.`, 'green'),
      line(`Elapsed ${formatHaulDuration(data.receipt.durationSeconds)}`, 'amber'),
      line(`Departed ${data.departureDate}`, 'muted'),
      line(`Arrived ${data.arrivalDate}`, 'green'),
      line(sleepingCrew ? `${sleepingCrew} crew awakened from hypersleep.` : 'Crew remained on duty.'),
      line(
        `Support used ${data.receipt.supportFuelConsumedUnits.toFixed(0)} units / reactor ${data.normalFuel.toFixed(0)} units preserved.`,
        'green'
      ),
      line('Approach the deployment contact, then deploy to complete delivery and receive payment.', 'amber'),
    ],
  };
}

/** Gives successful delivery and refusal their own persistent, unambiguous acknowledgement. */
export function createHaulResultDialog(
  mission: StarbaseMission,
  action: HaulManifestAction,
  result: { readonly ok: boolean; readonly message: string }
): TerminalDialogSpec<MissionDialogIntent> {
  const objective = getHeavyHaulObjective(mission)!;
  if (!result.ok)
    return {
      title: 'ACTION REFUSED',
      kind: 'message',
      caution: true,
      lines: [line(mission.title, 'cyan', true), line(result.message, 'red')],
    };
  const titles: Record<HaulManifestAction, string> = {
    accept: 'HAUL ACCEPTED',
    couple: 'TOW ATTACHED',
    depart: 'HAUL ARRIVAL',
    deploy: 'TOW DELIVERED',
    recover: 'TOW RECOVERED',
  };
  return {
    title: titles[action],
    kind: 'message',
    lines:
      action === 'deploy'
        ? [
            line(objective.targetName, 'cyan', true),
            line(`Delivered and deployed at ${objective.destination.systemName}.`, 'green'),
            line(`Payment ${mission.rewardCredits.toLocaleString()} Cr credited.`, 'amber'),
            line('Tow released. Contractor support tank stays with the installation.'),
            line(
              objective.package.installationKind === 'automated-depot'
                ? 'Depot open for trade, fuel and basic repairs.'
                : 'Navigation buoy is now available as a permanent target.',
              'green'
            ),
          ]
        : [
            line(mission.title, 'cyan', true),
            line(result.message, action === 'recover' ? 'amber' : 'green'),
            ...(action === 'accept'
              ? [line('Undock and use Route / approach to reach the pickup contact.')]
              : []),
            ...(action === 'couple'
              ? [
                  line(
                    objective.route.kind === 'interstellar'
                      ? 'Use Route / approach to reach the departure point, then begin the voyage.'
                      : 'Tow secured. Begin the voyage here to reach the local deployment contact.'
                  ),
                ]
              : []),
          ],
  };
}
