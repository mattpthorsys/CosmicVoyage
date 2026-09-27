import type { RgbColour } from '../colour';

/** Maps orbital radiance to display brightness while retaining its linear RGB ratios. */
export function toneMapOrbitRadiance(radiance: RgbColour, exposure: number): RgbColour {
  const luminance = radiance.r * 0.2126 + radiance.g * 0.7152 + radiance.b * 0.0722;
  if (!Number.isFinite(luminance) || luminance <= 0 || !Number.isFinite(exposure) || exposure <= 0)
    return { r: 0, g: 0, b: 0 };
  const mappedLuminance = -Math.expm1(-exposure * luminance);
  // Compress luminance once. Clipping each RGB component independently turns
  // strongly illuminated coloured worlds grey; shared scaling preserves hue.
  const scale = Math.min(mappedLuminance / luminance, 1 / Math.max(radiance.r, radiance.g, radiance.b));
  return {
    r: 255 * Math.max(0, radiance.r * scale) ** (1 / 2.2),
    g: 255 * Math.max(0, radiance.g * scale) ** (1 / 2.2),
    b: 255 * Math.max(0, radiance.b * scale) ** (1 / 2.2),
  };
}
