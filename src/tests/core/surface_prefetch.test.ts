import { describe, expect, it, vi } from 'vitest';
import { SurfacePrefetchService } from '../../core/surface_prefetch';
import { Planet } from '../../entities/planet';

/** Creates a deferred planet surface fixture. */
function createDeferredPlanet(name: string) {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  let revision = 0;
  const ready = vi.fn(() => false);
  const preparing = vi.fn(() => false);
  const prepare = vi.fn(
    () =>
      new Promise<void>((complete, fail) => {
        resolve = complete;
        reject = fail;
      })
  );
  const planet = Object.assign(Object.create(Planet.prototype), {
    name,
    isSurfaceReady: ready,
    isSurfacePreparing: preparing,
    prepareSurfaceReady: prepare,
    getSurfaceGenerationRevision: () => revision,
  }) as Planet;
  return {
    planet,
    prepare,
    ready,
    resolve: () => resolve(),
    reject: () => reject(new Error('Unavailable worker')),
    /** Models changed colony inputs after the original preparation attempt. */
    revise() {
      revision++;
    },
  };
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

  it('prepares invalidated colony data again and publishes the newly prepared revision', async () => {
    const f = createDeferredPlanet('Changing colony');
    const prepared = vi.fn();
    const service = new SurfacePrefetchService();
    service.enqueue([f.planet], prepared);
    f.resolve();
    await vi.waitFor(() => expect(prepared).toHaveBeenCalledOnce());
    f.ready.mockReturnValue(true);
    service.enqueue([f.planet], prepared);
    expect(f.prepare).toHaveBeenCalledOnce();
    f.revise();
    f.ready.mockReturnValue(false);
    service.enqueue([f.planet], prepared);
    expect(f.prepare).toHaveBeenCalledTimes(2);
    f.resolve();
    await vi.waitFor(() => expect(prepared).toHaveBeenCalledTimes(2));
  });

  it('bounds retries after a worker failure while allowing a new surface revision to try again', async () => {
    const f = createDeferredPlanet('Failed colony');
    const prepared = vi.fn();
    const service = new SurfacePrefetchService();
    service.enqueue([f.planet], prepared);
    f.reject();
    await Promise.resolve();
    service.enqueue([f.planet], prepared);
    expect(f.prepare).toHaveBeenCalledOnce();
    expect(prepared).not.toHaveBeenCalled();
    f.revise();
    service.enqueue([f.planet], prepared);
    expect(f.prepare).toHaveBeenCalledTimes(2);
    f.resolve();
    await vi.waitFor(() => expect(prepared).toHaveBeenCalledOnce());
  });

  it('records the current inputs when a colony changes while waiting behind another body', async () => {
    const first = createDeferredPlanet('First');
    const queued = createDeferredPlanet('Queued colony');
    const service = new SurfacePrefetchService();
    service.enqueue([first.planet, queued.planet]);
    queued.revise();
    first.resolve();
    await vi.waitFor(() => expect(queued.prepare).toHaveBeenCalledOnce());
    queued.resolve();
    await Promise.resolve();
    service.enqueue([queued.planet]);
    expect(queued.prepare).toHaveBeenCalledOnce();
  });
});
