import { describe, expect, it, vi } from 'vitest';
import { EventManager } from '../../../core/event_manager';

interface TestEvents {
  changed: { value: number };
  ping: undefined;
}

describe('EventManager', () => {
  it('returns an idempotent disposer that removes the exact subscription', () => {
    const events = new EventManager<TestEvents>();
    const listener = vi.fn();
    const unsubscribe = events.subscribe('changed', listener);

    events.publish('changed', { value: 1 });
    unsubscribe();
    unsubscribe();
    events.publish('changed', { value: 2 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ value: 1 });
  });

  it('supports payload-free events without placeholder values', () => {
    const events = new EventManager<TestEvents>();
    const listener = vi.fn();
    events.subscribe('ping', listener);

    events.publish('ping');

    expect(listener).toHaveBeenCalledWith(undefined);
  });

  it('allows a listener to unsubscribe while an event is being delivered', () => {
    const events = new EventManager<TestEvents>();
    const visited: string[] = [];
    let unsubscribeSecond: () => void = () => undefined;
    events.subscribe('ping', () => {
      visited.push('first');
      unsubscribeSecond();
    });
    unsubscribeSecond = events.subscribe('ping', () => {
      visited.push('second');
    });

    events.publish('ping');
    events.publish('ping');

    expect(visited).toEqual(['first', 'second', 'first']);
  });
});
