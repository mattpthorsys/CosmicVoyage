export const DISCOVERY_LEVELS = [
  'detected',
  'classified',
  'observed',
  'surveyed',
  'mapped',
  'sampled',
] as const;

export type DiscoveryLevel = (typeof DISCOVERY_LEVELS)[number];

export type DiscoveryMethod =
  | 'passive'
  | 'long-range'
  | 'local-scan'
  | 'orbital-survey'
  | 'surface-map'
  | 'sample-analysis';

export interface DiscoveryRecord {
  level: DiscoveryLevel;
  confidence: number;
  observations: number;
  lastMethod: DiscoveryMethod;
}

/** Creates a normalized discovery record. */
export function createDiscoveryRecord(
  level: DiscoveryLevel = 'detected',
  confidence: number = 0,
  observations: number = 0,
  lastMethod: DiscoveryMethod = 'passive'
): DiscoveryRecord {
  return {
    level,
    confidence: clampConfidence(confidence),
    observations: Math.max(0, Math.floor(observations)),
    lastMethod,
  };
}

/** Returns the ordered rank of a discovery level. */
export function getDiscoveryRank(level: DiscoveryLevel): number {
  return DISCOVERY_LEVELS.indexOf(level);
}

/** Returns whether one discovery level meets or exceeds another. */
export function hasDiscoveryLevel(current: DiscoveryLevel, required: DiscoveryLevel): boolean {
  return getDiscoveryRank(current) >= getDiscoveryRank(required);
}

/** Returns the more advanced of two discovery levels. */
export function getHigherDiscoveryLevel(current: DiscoveryLevel, candidate: DiscoveryLevel): DiscoveryLevel {
  return hasDiscoveryLevel(current, candidate) ? current : candidate;
}

/** Merges a new observation into an existing discovery record without losing prior knowledge. */
export function advanceDiscoveryRecord(
  current: DiscoveryRecord,
  level: DiscoveryLevel,
  confidence: number,
  method: DiscoveryMethod
): DiscoveryRecord {
  return {
    level: getHigherDiscoveryLevel(current.level, level),
    confidence: Math.max(current.confidence, clampConfidence(confidence)),
    observations: current.observations + 1,
    lastMethod: method,
  };
}

/** Returns a compact player-facing label for a discovery level. */
export function formatDiscoveryLevel(level: DiscoveryLevel): string {
  switch (level) {
    case 'detected':
      return 'DETECTED';
    case 'classified':
      return 'CLASSIFIED';
    case 'observed':
      return 'OBSERVED';
    case 'surveyed':
      return 'ORBITALLY SURVEYED';
    case 'mapped':
      return 'SURFACE MAPPED';
    case 'sampled':
      return 'SAMPLED';
  }
}

/** Returns whether an unknown value is a valid discovery record. */
export function isDiscoveryRecord(value: unknown): value is DiscoveryRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Partial<DiscoveryRecord>;
  return (
    DISCOVERY_LEVELS.includes(record.level as DiscoveryLevel) &&
    typeof record.confidence === 'number' &&
    Number.isFinite(record.confidence) &&
    typeof record.observations === 'number' &&
    Number.isFinite(record.observations) &&
    typeof record.lastMethod === 'string'
  );
}

/** Restricts confidence values to the supported percentage range. */
function clampConfidence(confidence: number): number {
  return Math.max(0, Math.min(100, Math.round(confidence)));
}
