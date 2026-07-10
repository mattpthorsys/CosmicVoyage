import { describe, expect, it } from 'vitest';
import { COLONY_WORLD_NAMES } from '../../../constants/colony_names';
import { reserveColonyWorldName } from '../../../entities/colony_naming';
import { PRNG } from '../../../utils/prng';

/** Generates a deterministic sequence of names reserved around one test star. */
function generateReservedNames(count: number): string[] {
  const root = new PRNG('colony-name-sequence');
  const namesUsedByStar = new Set<string>();
  return Array.from({ length: count }, (_, index) =>
    reserveColonyWorldName(root.seedNew(`planet-${index}`), namesUsedByStar)
  );
}

describe('terraformed colony naming', () => {
  it('provides a large catalogue without duplicate source names', () => {
    expect(COLONY_WORLD_NAMES.length).toBeGreaterThan(250);
    expect(new Set(COLONY_WORLD_NAMES).size).toBe(COLONY_WORLD_NAMES.length);
  });

  it('is deterministic and never reserves one name twice around the same star', () => {
    const first = generateReservedNames(120);
    const rebuilt = generateReservedNames(120);

    expect(rebuilt).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
  });
});
