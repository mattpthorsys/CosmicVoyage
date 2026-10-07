import { Planet } from '../entities/planet';

export type SurfacePrefetchListener = (planet: Planet) => void;

/** Serializes predictive surface generation so the single worker queue is not superseded. */
export class SurfacePrefetchService {
  private readonly queued = new Set<Planet>();
  private readonly attempted = new WeakMap<Planet, number>();
  private queue: Array<{ planet: Planet; onPrepared?: SurfacePrefetchListener }> = [];
  private active = false;

  /** Queues each surface revision once, allowing new colony inputs to be prepared after invalidation. */
  enqueue(planets: Planet[], onPrepared?: SurfacePrefetchListener): void {
    for (const planet of planets) {
      if (
        planet.isSurfaceReady() ||
        planet.isSurfacePreparing() ||
        this.queued.has(planet) ||
        (this.attempted.has(planet) && this.attempted.get(planet) === planet.getSurfaceGenerationRevision())
      ) {
        continue;
      }
      this.queued.add(planet);
      this.queue.push({ planet, onPrepared });
    }
    void this.processQueue();
  }

  /** Processes one surface at a time to respect the worker provider's bounded queue. */
  private async processQueue(): Promise<void> {
    if (this.active) return;
    this.active = true;
    try {
      while (this.queue.length > 0) {
        const { planet, onPrepared } = this.queue.shift()!;
        this.queued.delete(planet);
        this.attempted.set(planet, planet.getSurfaceGenerationRevision());
        try {
          await planet.prepareSurfaceReady();
          onPrepared?.(planet);
        } catch {
          // Predictive work is best-effort. Explicit landing preparation can retry.
        }
      }
    } finally {
      this.active = false;
    }
  }
}
