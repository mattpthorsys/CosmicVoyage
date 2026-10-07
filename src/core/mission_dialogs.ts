import {
  biologicalReferenceDescription,
  getHeavyHaulObjective,
  isBiologicalMissionObjective,
  type StarbaseMission,
} from './mission_board';
import { formatHaulDuration, type HaulManifestAction, type HaulManifestData } from './haul_manifest';
import type { HaulHomeboundRoute, HaulJourneyReceipt } from './heavy_haul_types';
import type { TerminalDialogSpec } from './terminal_dialog';
import type { TextDashboardLine, TextTone } from './text_ui';
import { DEPLOYED_DEPOT_NOTICE } from '../entities/starbase';
import type { HomeboundQuote, HomeboundQuoteResult, PreparedHomeboundJourney } from './homebound_journey';

export type MissionDialogIntent =
  | { readonly kind: 'accept-mission'; readonly mission: StarbaseMission; readonly stationId: string }
  | { readonly kind: 'haul-action'; readonly action: HaulManifestAction; readonly mission: StarbaseMission }
  | { readonly kind: 'view-haul'; readonly mission?: StarbaseMission }
  | { readonly kind: 'homebound-route'; readonly route: HaulHomeboundRoute }
  | { readonly kind: 'offer-homebound'; readonly assetId: string }
  | { readonly kind: 'begin-homebound'; readonly assetId: string; readonly quote: HomeboundQuote };

/** Adds one semantic terminal paragraph, preserving its tone through responsive wrapping. */
function line(text: string, tone: TextTone = 'normal', heading = false): TextDashboardLine {
  return { segments: [{ text, tone, font: heading ? 'thick' : 'thin' }] };
}

/** Makes deferred return navigation available after the paid contract leaves the mission journal. */
export function createHomeboundRouteDialog(
  route: HaulHomeboundRoute,
  distanceLy: number
): TerminalDialogSpec<MissionDialogIntent> {
  return {
    title: 'HOMEBOUND NAVIGATION',
    kind: 'confirmation',
    defaultYes: true,
    intent: { kind: 'homebound-route', route },
    lines: [
      line(route.stationName, 'cyan', true),
      line(`X ${route.systemAddress.worldX} / Y ${route.systemAddress.worldY}`, 'green'),
      line(`Range ${distanceLy.toFixed(1)} light-years`, 'amber'),
      line('Return untowed using normal reactor fuel.'),
      line('Set the homeward destination and follow its bearing in hyperspace.', 'muted'),
      line('In the home system, approach assist selects the issuing port.', 'muted'),
      line('Set course for home?', 'green'),
    ],
  };
}

/** Presents unloaded travel, normal-fuel costs and sleep capacity before an automatic return. */
export function createHomeboundVoyageDialog(
  route: HaulHomeboundRoute,
  assetId: string,
  result: HomeboundQuoteResult,
  currentFuel: number
): TerminalDialogSpec<MissionDialogIntent> {
  const quote = result.quote;
  return {
    title: 'AUTOMATIC RETURN VOYAGE',
    kind: result.ok ? 'confirmation' : 'message',
    caution: !result.ok,
    defaultYes: true,
    intent: result.ok ? { kind: 'begin-homebound', assetId, quote: result.quote } : undefined,
    lines: [
      line(route.stationName, 'cyan', true),
      line(`X ${route.systemAddress.worldX} / Y ${route.systemAddress.worldY}`, 'green'),
      ...(quote
        ? [
            line(
              `Range ${quote.distanceLy.toFixed(1)} light-years / travel ${formatHaulDuration(quote.durationSeconds)}`,
              'amber'
            ),
            line(
              `Reactor fuel ${quote.fuelUnits.toFixed(1)} units / ${currentFuel.toFixed(1)} aboard`,
              'green'
            ),
            line(
              quote.requiredBerths
                ? `Hypersleep ${quote.requiredBerths} crew / ${quote.functionalBerths} functional berths`
                : 'Crew remain on duty.',
              'cyan'
            ),
          ]
        : []),
      line('Autopilot handles transit and stages the ship near the original port.', 'muted'),
      line('The calendar advances; ship fuel is consumed. No external tow or second payment.', 'muted'),
      ...(!result.ok
        ? result.reasons.map((reason) => line(reason, 'red'))
        : [line('Begin automatic return now?', 'green')]),
    ],
  };
}

/** Announces hypersleep only when the unloaded return is long enough to require it. */
export function createHomeboundPrelude(
  journey: PreparedHomeboundJourney
): TerminalDialogSpec<MissionDialogIntent> {
  return {
    title: journey.quote.requiredBerths ? 'HYPERSLEEP / HOMEBOUND' : 'HOMEBOUND TRANSIT',
    kind: 'progress',
    lines: [
      line(journey.route.stationName, 'cyan', true),
      line(
        journey.quote.requiredBerths
          ? `${journey.quote.requiredBerths} crew entering hypersleep.`
          : 'Crew on duty / autopilot engaged.',
        'green'
      ),
      line(`Transit ${formatHaulDuration(journey.quote.durationSeconds)}`, 'amber'),
      line('Ship reactor online / untowed return.', 'muted'),
    ],
  };
}

/** Keeps successful automatic arrival, elapsed time and normal-fuel use visible until acknowledged. */
export function createHomeboundArrivalDialog(
  journey: PreparedHomeboundJourney,
  departureDate: string,
  arrivalDate: string
): TerminalDialogSpec<MissionDialogIntent> {
  return {
    title: 'HOME PORT ARRIVAL',
    kind: 'message',
    lines: [
      line(journey.route.stationName, 'cyan', true),
      line('Automatic return complete / home port selected for docking.', 'green'),
      line(`Elapsed ${formatHaulDuration(journey.receipt.durationSeconds)}`, 'amber'),
      line(`Departed ${departureDate}`, 'muted'),
      line(`Arrived ${arrivalDate}`, 'green'),
      line(
        journey.quote.requiredBerths
          ? `${journey.quote.requiredBerths} crew awakened from hypersleep.`
          : 'Crew remained on duty.'
      ),
      line(
        `Reactor fuel used ${journey.receipt.fuelConsumedUnits.toFixed(1)} / ${journey.save.player.resources.fuel.toFixed(1)} remaining`,
        'green'
      ),
    ],
  };
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
      ...(mission.sponsor === 'robotic-depot' && mission.systemAddress
        ? [
            line(
              `Destination X ${mission.systemAddress.worldX} / Y ${mission.systemAddress.worldY} / contact ${mission.systemAddress.systemSlot + 1}`,
              'green'
            ),
            line('Payment reserved in sponsor escrow; claim through Missions.', 'amber'),
          ]
        : []),
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
      line('Tow remains attached: planetary orbits and independent travel unlock after deployment.', 'amber'),
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
    kind: action === 'deploy' && objective.route.kind === 'interstellar' ? 'confirmation' : 'message',
    defaultYes: false,
    intent:
      action === 'deploy' && objective.route.kind === 'interstellar'
        ? { kind: 'offer-homebound', assetId: `haul-installation:${mission.id}` }
        : undefined,
    lines:
      action === 'deploy'
        ? [
            line(objective.targetName, 'cyan', true),
            line(`Delivered and deployed at ${objective.destination.systemName}.`, 'green'),
            line(`Payment ${mission.rewardCredits.toLocaleString()} Cr credited.`, 'amber'),
            line('Tow released. Contractor support tank stays with the installation.'),
            line(
              objective.package.installationKind === 'automated-depot'
                ? 'Depot open for trade, finite fuel, basic repairs and robotic medical care.'
                : 'Navigation buoy is now available as a permanent target.',
              'green'
            ),
            ...(objective.package.installationKind === 'automated-depot'
              ? [line(DEPLOYED_DEPOT_NOTICE, 'amber')]
              : []),
            ...(objective.route.kind === 'interstellar'
              ? [
                  line(`Optional route home marked: ${mission.originStarbaseName}.`, 'cyan'),
                  line('Return untowed using normal reactor fuel, or continue exploring.'),
                  line('Return now? No defers it to Ship Operations / Homebound Travel.', 'green'),
                ]
              : []),
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
