import { COLONY_WORLD_NAMES } from '../constants/colony_names';
import { PRNG } from '../utils/prng';

/** Selects and reserves a deterministic colony name not already used around the same star. */
export function reserveColonyWorldName(prng: PRNG, namesUsedByStar: Set<string>): string {
  const startIndex = prng.randomInt(0, COLONY_WORLD_NAMES.length - 1);
  for (let offset = 0; offset < COLONY_WORLD_NAMES.length; offset++) {
    const candidate = COLONY_WORLD_NAMES[(startIndex + offset) % COLONY_WORLD_NAMES.length];
    if (namesUsedByStar.has(candidate)) continue;
    namesUsedByStar.add(candidate);
    return candidate;
  }

  // A system cannot currently exhaust the catalogue, but retain uniqueness if that model expands.
  const baseName = COLONY_WORLD_NAMES[startIndex];
  let suffix = 2;
  while (namesUsedByStar.has(`${baseName} ${suffix}`)) suffix++;
  const candidate = `${baseName} ${suffix}`;
  namesUsedByStar.add(candidate);
  return candidate;
}
