import type { SurveyDataService } from './survey_data_service';
import type { FrontierCatalogueContact } from './frontier_catalogue';
import { frontierLine, type FrontierTerminalEntry } from './frontier_terminal';
import {
  parseSurveyAddress,
  parseSurveyObjectKey,
  surveyAddressKey,
  type SurveyUploadQuote,
} from './survey_data_types';
import type { TerminalDialogSpec } from './terminal_dialog';

export interface SurveyDialogIntent {
  readonly kind: 'survey-upload';
  readonly quote: SurveyUploadQuote;
}

/** Converts genuine evidence and incremental offers to terminal records without awarding credits. */
export function createSurveyUploadEntries(
  service: SurveyDataService,
  stationId: string
): FrontierTerminalEntry[] {
  return service
    .listEvidence()
    .map(({ key, evidence }) => {
      const quote = service.quote(stationId, key);
      const { address, target } = parseSurveyObjectKey(key);
      const category =
        target === 'system'
          ? 'LOCAL SYSTEM SURVEY'
          : target.startsWith('planet:')
            ? 'ORBITAL / TERRAIN SURVEY'
            : 'STELLAR ASTROMETRY';
      return {
        id: key,
        title: evidence.label,
        status: quote?.reason ? (quote.reward ? 'UNFUNDED' : 'FILED') : `${quote?.reward ?? 0} Cr`,
        tone: quote?.reason ? ('muted' as const) : ('green' as const),
        lines: [
          frontierLine(category, 'cyan', true),
          frontierLine(
            `X ${address.worldX} / Y ${address.worldY} / contact ${address.systemSlot + 1}`,
            'amber'
          ),
          frontierLine(
            `Measured tier ${evidence.tier} / ${evidence.method} / day ${(evidence.at / 86400).toFixed(1)}`,
            'green'
          ),
          frontierLine(
            `Previously paid tier ${quote?.paidTier ?? 0} / additional ${quote?.reward ?? 0} Cr`,
            'amber'
          ),
          frontierLine(
            quote?.reason || 'New scientific evidence / upload available.',
            quote?.reason ? 'muted' : 'green'
          ),
          frontierLine(
            'Contract premiums are separate; base evidence is paid once across all depots.',
            'muted'
          ),
        ],
      };
    })
    .sort((a, b) => Number(b.tone === 'green') - Number(a.tone === 'green') || a.id.localeCompare(b.id));
}

/** Lists nearby public catalogue entries and retained charts as navigation information only. */
export function createPublicChartEntries(
  service: SurveyDataService,
  contacts: readonly FrontierCatalogueContact[]
): FrontierTerminalEntry[] {
  const filed = new Map(service.listCharts().map(({ key, chart }) => [key, chart]));
  const sources = new Map(contacts.slice(0, 64).map((contact) => [surveyAddressKey(contact), contact]));
  for (const [key, chart] of filed)
    if (!sources.has(key))
      sources.set(key, {
        ...parseSurveyAddress(key),
        name: chart.name,
        spectralType: 'charted',
        stationKind: null,
        distanceLy: 0,
      });
  return [...sources].map(([key, contact]) => ({
    id: key,
    title: contact.name,
    status: filed.has(key) ? 'FILED' : 'PUBLIC',
    tone: filed.has(key) ? 'green' : 'cyan',
    lines: [
      frontierLine('PUBLIC NAVIGATION CHART', 'cyan', true),
      frontierLine(`X ${contact.worldX} / Y ${contact.worldY} / contact ${contact.systemSlot + 1}`, 'amber'),
      frontierLine(`Catalogue class: ${contact.spectralType}`, 'green'),
      frontierLine('Download: no charge / navigation reference only.', 'green'),
      frontierLine('No planetary survey, biological evidence or resale value is acquired.', 'muted'),
      frontierLine(
        filed.has(key)
          ? 'Chart filed / A marks its destination.'
          : 'Enter files this chart in ship navigation.',
        'cyan'
      ),
    ],
  }));
}

/** Shows an exact incremental payment before authorising a checkpointed upload. */
export function createSurveyUploadDialog(
  quote: SurveyUploadQuote,
  label: string
): TerminalDialogSpec<SurveyDialogIntent> {
  return {
    title: quote.reason ? 'SURVEY UPLOAD UNAVAILABLE' : 'AUTHORISE SURVEY UPLOAD',
    kind: quote.reason ? 'message' : 'confirmation',
    defaultYes: false,
    intent: quote.reason ? undefined : { kind: 'survey-upload', quote },
    lines: [
      frontierLine(label, 'cyan', true),
      frontierLine(`Quality tier ${quote.tier} / previously funded tier ${quote.paidTier}`, 'green'),
      frontierLine(`Payment: ${quote.reward} Cr / sponsor balance: ${quote.availableCredits} Cr`, 'amber'),
      frontierLine(
        quote.reason || 'File this improvement in the shared scientific ledger?',
        quote.reason ? 'amber' : 'green'
      ),
      frontierLine('Evidence remains aboard. The same base tier cannot be sold at another depot.', 'muted'),
    ],
  };
}
