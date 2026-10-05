/** Existing accelerated calendar: four real hours represent one Julian year. */
export const SIMULATED_SECONDS_PER_REAL_SECOND = (365.25 * 24 * 60 * 60) / (4 * 60 * 60);

export interface SimulationTimeSnapshot {
  readonly gameClockElapsedSeconds: number;
  readonly bulkAdvanceSeconds: number;
}

/** Converts frame seconds once; invalid frame deltas retain the old zero-advance behaviour. */
export function frameToSimulatedSeconds(realSeconds: number): number {
  return Number.isFinite(realSeconds) && realSeconds > 0
    ? realSeconds * SIMULATED_SECONDS_PER_REAL_SECOND
    : 0;
}

/** Prepares a calendar jump without advancing frames, AI, markets, or any live owner. */
export function prepareBulkTimeAdvance(
  current: SimulationTimeSnapshot,
  durationSeconds: number
): SimulationTimeSnapshot {
  if (
    !Number.isFinite(current.gameClockElapsedSeconds) ||
    current.gameClockElapsedSeconds < 0 ||
    !Number.isFinite(current.bulkAdvanceSeconds) ||
    current.bulkAdvanceSeconds < 0 ||
    current.bulkAdvanceSeconds > current.gameClockElapsedSeconds ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  )
    throw new Error('Invalid bulk time advance.');
  const gameClockElapsedSeconds = current.gameClockElapsedSeconds + durationSeconds;
  const bulkAdvanceSeconds = current.bulkAdvanceSeconds + durationSeconds;
  if (
    gameClockElapsedSeconds > Number.MAX_SAFE_INTEGER / 1000 ||
    bulkAdvanceSeconds > Number.MAX_SAFE_INTEGER / 1000
  )
    throw new Error('Voyage exceeds the supported calendar range.');
  return { gameClockElapsedSeconds, bulkAdvanceSeconds };
}

/** Reduces long journeys modulo one orbit before calculating phase, avoiding huge intermediate angles. */
export function advanceOrbitalAngle(angle: number, seconds: number, periodSeconds: number): number {
  if (seconds === 0) return angle;
  if (!(periodSeconds > 0) || !Number.isFinite(periodSeconds)) return angle;
  const turn = Math.PI * 2;
  return ((angle % turn) + turn + (turn * (seconds % periodSeconds)) / periodSeconds) % turn;
}
