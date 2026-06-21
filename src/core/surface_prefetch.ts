import { Planet } from '../entities/planet';

export type SurfacePrefetchListener = (planet: Planet) => void;

/** Serializes predictive surface generation so the single worker queue is not superseded. */
export class SurfacePrefetchService {
  private readonly queued = new Set<Planet>();
  private readonly attempted = new WeakSet<Planet>();
  private queue: Array<{ planet: Planet; onPrepared?: SurfacePrefetchListener }> = [];
  private active = false;

  /** Adds unprepared planets to the predictive generation queue in priority order. */
  enqueue(planets: Planet[], onPrepared?: SurfacePrefetchListener): void {
    for (const planet of planets) {
      if (
        planet.isSurfaceReady() ||
        planet.isSurfacePreparing() ||
        this.queued.has(planet) ||
        this.attempted.has(planet)
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
        this.attempted.add(planet);
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
