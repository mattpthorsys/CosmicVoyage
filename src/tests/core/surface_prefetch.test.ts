import { describe, expect, it, vi } from 'vitest';
import { SurfacePrefetchService } from '../../core/surface_prefetch';
import { Planet } from '../../entities/planet';

/** Creates a deferred planet surface fixture. */
function createDeferredPlanet(name: string) {
  let resolve!: () => void;
  const ready = vi.fn(() => false);
  const preparing = vi.fn(() => false);
  const prepare = vi.fn(
    () =>
      new Promise<void>((complete) => {
        resolve = complete;
      })
  );
  const planet = Object.assign(Object.create(Planet.prototype), {
    name,
    isSurfaceReady: ready,
    isSurfacePreparing: preparing,
    prepareSurfaceReady: prepare,
  }) as Planet;
  return { planet, prepare, resolve: () => resolve() };
}

describe('surface prefetch service', () => {
  it('prepares queued surfaces serially without superseding the worker queue', async () => {
    const first = createDeferredPlanet('First');
    const second = createDeferredPlanet('Second');
    const service = new SurfacePrefetchService();

    service.enqueue([first.planet, second.planet]);
    await Promise.resolve();

    expect(first.prepare).toHaveBeenCalledOnce();
    expect(second.prepare).not.toHaveBeenCalled();

    first.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(second.prepare).toHaveBeenCalledOnce();

    second.resolve();
    await Promise.resolve();
  });

  it('deduplicates repeated predictive requests for the same planet', async () => {
    const fixture = createDeferredPlanet('Repeated');
    const service = new SurfacePrefetchService();

    service.enqueue([fixture.planet, fixture.planet]);
    service.enqueue([fixture.planet]);
    await Promise.resolve();

    expect(fixture.prepare).toHaveBeenCalledOnce();
    fixture.resolve();
    await Promise.resolve();
  });
});
