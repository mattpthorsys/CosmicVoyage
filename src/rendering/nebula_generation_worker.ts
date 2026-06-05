import { NebulaColourRequest, NebulaColourSample, NebulaColourSampler } from './nebula_colour_sampler';

interface NebulaWorkerRequest {
  id: number;
  requests: NebulaColourRequest[];
}

interface NebulaWorkerResponse {
  id: number;
  ok: boolean;
  samples?: NebulaColourSample[];
  error?: string;
}

const sampler = new NebulaColourSampler();

self.onmessage = (event: MessageEvent<NebulaWorkerRequest>) => {
  const { id, requests } = event.data;
  try {
    const samples = requests.map(({ worldX, worldY }) => ({
      worldX,
      worldY,
      colour: sampler.sample(worldX, worldY),
    }));
    postMessage({ id, ok: true, samples } satisfies NebulaWorkerResponse);
  } catch (error) {
    postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies NebulaWorkerResponse);
  }
};
