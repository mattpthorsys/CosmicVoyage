import { describe, expect, it } from 'vitest';
import { ScreenTransition } from '../../../core/screen_transition';

describe('visual blackout operation boundary', () => {
  it('shows preparation, reaches blackout, emits one operation and fades in after acknowledgement', () => {
    const transition = new ScreenTransition<string>();
    transition.start('voyage', { preludeSeconds: 1 });
    expect(transition.update(0.9)).toBeUndefined();
    expect(transition.phase).toBe('prelude');
    expect(transition.opacity).toBe(0);
    transition.update(0.1);
    transition.update(0.2);
    expect(transition.opacity).toBeGreaterThan(0);
    expect(transition.opacity).toBeLessThan(1);
    expect(transition.update(0.3)).toEqual({ kind: 'commit', intent: 'voyage' });
    expect(transition.opacity).toBe(1);
    expect(transition.update(100)).toBeUndefined();
    transition.resume();
    expect(transition.update(0.5)).toEqual({ kind: 'complete' });
    expect(transition.isActive).toBe(false);
    expect(transition.opacity).toBe(0);
  });

  it('skips visuals without skipping, repeating or immediately acknowledging the operation', () => {
    const transition = new ScreenTransition<string>();
    transition.start('voyage');
    transition.skip();
    expect(transition.update(0)).toEqual({ kind: 'commit', intent: 'voyage' });
    transition.skip();
    expect(transition.update(0)).toBeUndefined();
    transition.resume();
    expect(transition.update(0)).toEqual({ kind: 'complete' });
    expect(transition.update(100)).toBeUndefined();
  });

  it('respects reduced motion and cancels safely after a failed checkpoint', () => {
    const transition = new ScreenTransition<string>();
    transition.start('voyage', { preludeSeconds: 0, reducedMotion: true });
    expect(transition.update(0)).toEqual({ kind: 'commit', intent: 'voyage' });
    expect(transition.opacity).toBe(0);
    transition.reset();
    expect(transition.isActive).toBe(false);
    expect(transition.update(100)).toBeUndefined();
  });

  it('bounds opacity and waits for the owner on a large visual frame', () => {
    const transition = new ScreenTransition<string>();
    transition.start('voyage');
    expect(transition.update(1e9)).toEqual({ kind: 'commit', intent: 'voyage' });
    expect(transition.phase).toBe('waiting');
    expect(transition.opacity).toBe(1);
    expect(transition.update(Number.NaN)).toBeUndefined();
    transition.resume();
    expect(transition.update(1e9)).toEqual({ kind: 'complete' });
  });
});
