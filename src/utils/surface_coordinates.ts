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

/** Converts the shared Mercator map to degrees, treating its duplicated seam as the same longitude. */
export function surfaceMapDegrees(
  x: number,
  y: number,
  width: number,
  height = width
): { latitude: number; longitude: number } {
  const period = Math.max(1, width - 1);
  const nativeX = ((x % period) + period) % period;
  const latitudeY = Math.max(0, Math.min(height - 1, y));
  return {
    latitude:
      (Math.atan(Math.sinh((0.5 - latitudeY / Math.max(1, height - 1)) * Math.PI * 2)) * 180) / Math.PI,
    longitude: (nativeX / period) * 360 - 180,
  };
}
