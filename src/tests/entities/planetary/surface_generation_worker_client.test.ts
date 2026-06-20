import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkerSurfaceGenerationProvider } from '../../../entities/planet/surface_generation_worker_client';
import { SurfaceGenerationRequest } from '../../../entities/planet/surface_generator';
import { MineralRichness } from '../../../constants/resources';

class FakeWorker {
  static instances: FakeWorker[] = [];

  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();

  /** Records each fake worker created by the provider. */
  constructor() {
    FakeWorker.instances.push(this);
  }

  /** Delivers a successful worker response to the provider. */
  respond(id: number, data: object): void {
    this.onmessage?.({ data: { id, ok: true, data } } as MessageEvent);
  }
}

/** Creates a minimal deterministic surface-generation request. */
function request(seed: string): SurfaceGenerationRequest {
  return {
    planetType: 'Rock',
    mapSeed: `${seed}-map`,
    prngSeed: seed,
    atmosphere: {
      density: 'Standard',
      pressure: 1,
      composition: { Nitrogen: 80, Oxygen: 20 },
    },
    planetAbundance: {},
    profile: {
      mineralRichness: MineralRichness.AVERAGE,
      baseMinerals: 1,
      metallicityFeH: 0,
      surfaceTemp: 280,
      hydrosphere: 'None',
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeWorker.instances = [];
});

describe('WorkerSurfaceGenerationProvider scheduling', () => {
  it('keeps only the newest queued request while one generation is active', async () => {
    vi.stubGlobal('Worker', FakeWorker);
    const provider = new WorkerSurfaceGenerationProvider();

    const first = provider.generateSurfaceDataAsync(request('first'));
    const second = provider.generateSurfaceDataAsync(request('second'));
    const third = provider.generateSurfaceDataAsync(request('third'));
    const secondResult = second.catch((error: Error) => error.message);
    const worker = FakeWorker.instances[0];

    expect(worker.postMessage).toHaveBeenCalledTimes(1);
    expect(worker.postMessage.mock.calls[0][0].request.prngSeed).toBe('first');
    expect(await secondResult).toContain('superseded');

    worker.respond(1, { marker: 'first' });
    await first;

    expect(worker.postMessage).toHaveBeenCalledTimes(2);
    expect(worker.postMessage.mock.calls[1][0].request.prngSeed).toBe('third');

    worker.respond(3, { marker: 'third' });
    await third;
  });
});
