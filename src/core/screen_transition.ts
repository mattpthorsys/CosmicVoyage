export type ScreenTransitionPhase = 'inactive' | 'prelude' | 'fade-out' | 'commit' | 'waiting' | 'fade-in';
export type ScreenTransitionEvent<Intent> =
  | { readonly kind: 'commit'; readonly intent: Intent }
  | {
      readonly kind: 'complete';
    };

/** Emits one operation at blackout and uses visual seconds independently of the simulation clock. */
export class ScreenTransition<Intent> {
  phase: ScreenTransitionPhase = 'inactive';
  private elapsed = 0;
  private intent: Intent | undefined;
  private preludeSeconds = 1.1;
  private reducedMotion = false;
  private skipRequested = false;
  private readonly fadeSeconds = 0.45;

  /** Reports exclusive transition ownership until fade-in has finished. */
  get isActive(): boolean {
    return this.phase !== 'inactive';
  }

  /** Returns the overlay opacity without changing any gameplay state. */
  get opacity(): number {
    if (this.reducedMotion) return 0;
    if (this.phase === 'commit' || this.phase === 'waiting') return 1;
    const progress = Math.min(1, Math.max(0, this.elapsed / this.fadeSeconds));
    const smooth = progress * progress * (3 - 2 * progress);
    return this.phase === 'fade-out' ? smooth : this.phase === 'fade-in' ? 1 - smooth : 0;
  }

  /** Starts an operation with a visible prelude and an optional motion-reduced presentation. */
  start(intent: Intent, options: { preludeSeconds?: number; reducedMotion?: boolean } = {}): void {
    this.intent = intent;
    this.preludeSeconds = Math.max(0, options.preludeSeconds ?? 1.1);
    this.reducedMotion = options.reducedMotion ?? false;
    this.skipRequested = false;
    this.elapsed = 0;
    this.phase = 'prelude';
  }

  /** Skips presentation while preserving the operation and its final acknowledgement. */
  skip(): void {
    if (this.isActive) this.skipRequested = true;
  }

  /** Advances bounded visual phases and emits an operation only once, even on large or skipped frames. */
  update(deltaSeconds: number): ScreenTransitionEvent<Intent> | undefined {
    if (!this.isActive || this.phase === 'waiting') return;
    let remaining = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    if (this.skipRequested && this.phase !== 'fade-in') this.phase = 'commit';
    for (let step = 0; step < 4; step++) {
      if (this.phase === 'commit') {
        const intent = this.intent;
        this.intent = undefined;
        this.phase = 'waiting';
        if (intent !== undefined) return { kind: 'commit', intent };
        return;
      }
      const duration =
        this.phase === 'prelude'
          ? this.preludeSeconds
          : this.reducedMotion || this.skipRequested
            ? 0
            : this.fadeSeconds;
      const advance = Math.min(remaining, Math.max(0, duration - this.elapsed));
      this.elapsed += advance;
      remaining -= advance;
      if (this.elapsed < duration) return;
      this.elapsed = 0;
      if (this.phase === 'prelude') this.phase = 'fade-out';
      else if (this.phase === 'fade-out') this.phase = 'commit';
      else if (this.phase === 'fade-in') {
        this.reset();
        return { kind: 'complete' };
      }
    }
  }

  /** Releases the blackout after the outer owner has committed its validated operation. */
  resume(): void {
    if (this.phase !== 'waiting') return;
    this.phase = 'fade-in';
    this.elapsed = 0;
  }

  /** Cancels presentation after failure or restore without repeating a previously emitted operation. */
  reset(): void {
    this.phase = 'inactive';
    this.intent = undefined;
    this.elapsed = 0;
    this.skipRequested = false;
  }
}
