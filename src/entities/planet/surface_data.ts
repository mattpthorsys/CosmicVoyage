import type { SurfaceData } from './surface_generator';

type ReadySurfaceSource = {
  getSurfaceDataIfReady?: () => SurfaceData | null;
};

/** Reads already-generated surface data without invoking Planet accessors or starting generation. */
export function readReadySurfaceData(source: ReadySurfaceSource): SurfaceData | null {
  const cached = source.getSurfaceDataIfReady?.() ?? null;
  if (cached) return cached;

  // Tests and adapters may provide surface data as own properties instead of a Planet cache.
  const record = source as ReadySurfaceSource & Record<string, unknown>;
  /** Returns whether the source explicitly contains a cached surface property. */
  const hasOwn = (property: string): boolean => Object.prototype.hasOwnProperty.call(record, property);
  if (
    !hasOwn('heightmap') &&
    !hasOwn('heightLevelColors') &&
    !hasOwn('rgbPaletteCache') &&
    !hasOwn('surfaceElementMap') &&
    !hasOwn('surfaceLiquid') &&
    !hasOwn('liquidOverlay')
  ) {
    return null;
  }

  return {
    heightmap: hasOwn('heightmap') ? (record.heightmap as SurfaceData['heightmap']) : null,
    heightLevelColors: hasOwn('heightLevelColors')
      ? (record.heightLevelColors as SurfaceData['heightLevelColors'])
      : null,
    rgbPaletteCache: hasOwn('rgbPaletteCache')
      ? (record.rgbPaletteCache as SurfaceData['rgbPaletteCache'])
      : null,
    surfaceElementMap: hasOwn('surfaceElementMap')
      ? (record.surfaceElementMap as SurfaceData['surfaceElementMap'])
      : null,
    liquidOverlay: hasOwn('liquidOverlay')
      ? (record.liquidOverlay as SurfaceData['liquidOverlay'])
      : hasOwn('surfaceLiquid')
        ? (record.surfaceLiquid as SurfaceData['liquidOverlay'])
        : null,
  };
}
