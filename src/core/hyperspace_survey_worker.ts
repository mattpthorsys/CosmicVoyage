import { SystemDataGenerator } from '../generation/system_data_generator';
import { PRNG } from '../utils/prng';
import {
  HyperspaceSurveyCellData,
  HyperspaceSurveyCellRequest,
  LocalHyperspaceSurveyCellProvider,
} from './hyperspace_survey_cell_provider';
import { NebulaColourSampler } from '../rendering/nebula_colour_sampler';
import {
  createHyperspaceTile,
  HyperspaceTileRequest,
  HyperspaceTileSample,
} from '../rendering/hyperspace_tile_generation';

interface HyperspaceSurveyWorkerRequest {
  id: number;
  kind: 'cells' | 'tiles';
  seed: string;
  requests: HyperspaceSurveyCellRequest[] | HyperspaceTileRequest[];
}

interface HyperspaceSurveyWorkerResponse {
  id: number;
  kind: 'cells' | 'tiles';
  ok: boolean;
  cells?: HyperspaceSurveyCellData[];
  tiles?: HyperspaceTileSample[];
  error?: string;
}

interface WorkerGenerationContext {
  cellProvider: LocalHyperspaceSurveyCellProvider;
  nebulaSampler: NebulaColourSampler;
}

const contextsBySeed = new Map<string, WorkerGenerationContext>();

/** Returns shared deterministic generation state for a game seed. */
function getContext(seed: string): WorkerGenerationContext {
  const cached = contextsBySeed.get(seed);
  if (cached) return cached;
  const context = {
    cellProvider: new LocalHyperspaceSurveyCellProvider(new SystemDataGenerator(new PRNG(seed))),
    nebulaSampler: new NebulaColourSampler(`${seed}_nebula`),
  };
  contextsBySeed.set(seed, context);
  return context;
}

self.onmessage = (event: MessageEvent<HyperspaceSurveyWorkerRequest>) => {
  const { id, kind, seed, requests } = event.data;
  try {
    const context = getContext(seed);
    if (kind === 'cells') {
      const cells = (requests as HyperspaceSurveyCellRequest[]).map(({ worldX, worldY }) =>
        context.cellProvider.getCellData(worldX, worldY)
      );
      postMessage({ id, kind, ok: true, cells } satisfies HyperspaceSurveyWorkerResponse);
      return;
    }

    const tiles = (requests as HyperspaceTileRequest[]).map(({ worldX, worldY, rangeCells }) => {
      const cell = context.cellProvider.getCellData(worldX, worldY);
      const bg = context.nebulaSampler.sample(worldX, worldY);
      return {
        worldX,
        worldY,
        rangeCells,
        tile: createHyperspaceTile(bg, cell.system, cell.phenomenon, worldX, worldY, rangeCells),
      };
    });
    postMessage({ id, kind, ok: true, tiles } satisfies HyperspaceSurveyWorkerResponse);
  } catch (error) {
    postMessage({
      id,
      kind,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies HyperspaceSurveyWorkerResponse);
  }
};
