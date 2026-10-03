/** Wraps longitude and clamps latitude using the shared regional surface convention. */
export function surfaceCoordinates(x: number, y: number, size: number): { x: number; y: number } {
  const length = Math.max(1, Math.floor(size));
  return {
    x: ((Math.floor(x) % length) + length) % length,
    y: Math.max(0, Math.min(length - 1, Math.floor(y))),
  };
}

/** Returns the shortest signed longitude displacement between regional cells. */
export function surfaceLongitudeDelta(from: number, to: number, size: number): number {
  return ((((to - from + size * 1.5) % size) + size) % size) - size / 2;
}
