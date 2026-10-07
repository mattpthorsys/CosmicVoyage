import { afterEach, describe, expect, it, vi } from 'vitest';
import { RendererFacade } from '../../rendering/renderer_facade';
import type { Planet } from '../../entities/planet';

const originalIdleRequest = Object.getOwnPropertyDescriptor(window, 'requestIdleCallback');
const originalIdleCancel = Object.getOwnPropertyDescriptor(window, 'cancelIdleCallback');

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const [name, descriptor] of [
    ['requestIdleCallback', originalIdleRequest],
    ['cancelIdleCallback', originalIdleCancel],
  ] as const) {
    if (descriptor) Object.defineProperty(window, name, descriptor);
    else Reflect.deleteProperty(window, name);
  }
});

/** Isolates the facade's production scheduler without requiring a browser layout or prepared terrain. */
function assetFacade() {
  const warm = vi.fn<(planets: readonly Planet[]) => void>();
  const clear = vi.fn();
  const unsubscribe = vi.fn();
  const facade = Object.assign(Object.create(RendererFacade.prototype), {
    sceneRenderer: { prepareOrbitAssets: warm, clearCaches: clear },
    orbitAssetQueue: new Set<Planet>(),
    orbitAssetPreparationHandle: null,
    destroyed: false,
    layoutInvalidated: false,
    hudResizeFrame: null,
    eventUnsubscribers: [unsubscribe],
  }) as RendererFacade;
  // The scheduler uses body identity only; rendering is deliberately replaced
  // at its boundary so these cases cannot generate surfaces or warm textures.
  const first = Object.create(null) as Planet;
  const second = Object.create(null) as Planet;
  const third = Object.create(null) as Planet;
  return { facade, warm, clear, unsubscribe, first, second, third };
}

/** Installs a controllable browser idle queue so cancellation and one-body scheduling can be inspected. */
function idleQueue() {
  let nextId = 0;
  const pending = new Map<number, IdleRequestCallback>();
  const request = vi.fn((callback: IdleRequestCallback) => {
    pending.set(++nextId, callback);
    return nextId;
  });
  const cancel = vi.fn((id: number) => {
    pending.delete(id);
  });
  Object.defineProperty(window, 'requestIdleCallback', { configurable: true, value: request });
  Object.defineProperty(window, 'cancelIdleCallback', { configurable: true, value: cancel });
  return {
    pending,
    request,
    cancel,
    /** Runs one callback and leaves any subsequent body for a later idle interval. */
    runNext(): void {
      const [id, callback] = pending.entries().next().value!;
      pending.delete(id);
      callback({ didTimeout: false, timeRemaining: () => 10 });
    },
  };
}

describe('orbital asset preparation lifecycle', () => {
  it('deduplicates bodies and yields between prepared textures', () => {
    const queue = idleQueue();
    const f = assetFacade();
    f.facade.prepareOrbitAssets([f.first, f.first, f.second]);
    f.facade.prepareOrbitAssets([f.second]);
    expect(queue.pending.size).toBe(1);
    expect(f.warm).not.toHaveBeenCalled();
    queue.runNext();
    expect(f.warm.mock.calls).toEqual([[[f.first]]]);
    expect(queue.pending.size).toBe(1);
    queue.runNext();
    expect(f.warm.mock.calls).toEqual([[[f.first]], [[f.second]]]);
    expect(queue.pending.size).toBe(0);
  });

  it('cancels old-world work and permits a fresh queue after a discontinuous arrival', () => {
    const queue = idleQueue();
    const f = assetFacade();
    f.facade.prepareOrbitAssets([f.first, f.second]);
    f.facade.invalidateWorldScene();
    expect(queue.cancel).toHaveBeenCalledWith(1);
    expect(queue.pending.size).toBe(0);
    expect(f.clear).toHaveBeenCalledOnce();
    expect(f.facade.consumeLayoutInvalidation()).toBe(true);
    f.facade.prepareOrbitAssets([f.third]);
    queue.runNext();
    expect(f.warm.mock.calls).toEqual([[[f.third]]]);
  });

  it('releases queued work and cannot schedule or warm bodies after destruction', () => {
    const queue = idleQueue();
    const f = assetFacade();
    f.facade.prepareOrbitAssets([f.first, f.second]);
    const callback = [...queue.pending.values()][0];
    f.facade.destroy();
    expect(queue.pending.size).toBe(0);
    expect(queue.cancel).toHaveBeenCalledWith(1);
    expect(f.unsubscribe).toHaveBeenCalledOnce();
    // Even a callback delivered by an imperfect host after cancellation must
    // respect the renderer's disposal boundary.
    callback({ didTimeout: true, timeRemaining: () => 0 });
    f.facade.prepareOrbitAssets([f.third]);
    expect(f.warm).not.toHaveBeenCalled();
    expect(queue.request).toHaveBeenCalledOnce();
  });

  it('cancels timeout-based warming on both arrival and disposal when idle callbacks are unavailable', () => {
    vi.useFakeTimers();
    Object.defineProperty(window, 'requestIdleCallback', { configurable: true, value: undefined });
    const f = assetFacade();
    f.facade.prepareOrbitAssets([f.first, f.second]);
    f.facade.invalidateWorldScene();
    vi.runAllTimers();
    expect(f.warm).not.toHaveBeenCalled();
    f.facade.prepareOrbitAssets([f.third]);
    vi.runAllTimers();
    expect(f.warm.mock.calls).toEqual([[[f.third]]]);
    f.facade.prepareOrbitAssets([f.first]);
    f.facade.destroy();
    vi.runAllTimers();
    expect(f.warm).toHaveBeenCalledOnce();
  });
});
