import { SystemDataGenerator } from '../generation/system_data_generator';
import { PRNG } from '../utils/prng';
import {
  HyperspaceSurveyCellData,
  HyperspaceSurveyCellRequest,
  LocalHyperspaceSurveyCellProvider,
} from './hyperspace_survey_cell_provider';

interface HyperspaceSurveyWorkerRequest {
  id: number;
  seed: string;
  requests: HyperspaceSurveyCellRequest[];
}

interface HyperspaceSurveyWorkerResponse {
  id: number;
  ok: boolean;
  cells?: HyperspaceSurveyCellData[];
  error?: string;
}

const providersBySeed = new Map<string, LocalHyperspaceSurveyCellProvider>();

function getProvider(seed: string): LocalHyperspaceSurveyCellProvider {
  const cached = providersBySeed.get(seed);
  if (cached) return cached;
  const provider = new LocalHyperspaceSurveyCellProvider(new SystemDataGenerator(new PRNG(seed)));
  providersBySeed.set(seed, provider);
  return provider;
}

self.onmessage = (event: MessageEvent<HyperspaceSurveyWorkerRequest>) => {
  const { id, seed, requests } = event.data;
  try {
    const provider = getProvider(seed);
    const cells = requests.map(({ worldX, worldY }) => provider.getCellData(worldX, worldY));
    postMessage({ id, ok: true, cells } satisfies HyperspaceSurveyWorkerResponse);
  } catch (error) {
    postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies HyperspaceSurveyWorkerResponse);
  }
};

