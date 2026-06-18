import { AU_IN_METERS } from '../../constants/physics';
import { GLYPHS } from '../../constants/visual';
import { Planet } from '../../entities/planet';
import { adjustBrightness, interpolateColour, rgbToHex, RgbColour } from '../colour';

export type GiantAtmosphereSample = {
  colour: string;
  brightness: number;
  storm: number;
  texture: number;
  edge: number;
};

export type GiantVisualFamily = 'jovian' | 'saturnian' | 'uranian' | 'neptunian' | 'hot' | 'cold';
type GiantStormTone = 'bright' | 'warm' | 'dark';

export type GiantCloudRibbonSample = {
  strength: number;
  tint: RgbColour;
};

export interface GiantVisualProfile {
  family: GiantVisualFamily;
  palette: RgbColour[];
  bandCount: number;
  bandSharpness: number;
  edgeRaggedness: number;
  streakDensity: number;
  streakContrast: number;
  stormCount: number;
  stormTint: RgbColour;
  stormTone: GiantStormTone;
  contrast: number;
  haze: number;
}

export class GiantAtmosphereRenderer {
  sample(
    planet: Planet,
    palette: RgbColour[],
    longitude01: number,
    latitude01: number,
    phase01: number
  ): GiantAtmosphereSample {
    const profile = this.getProfile(planet, palette);
    const safePalette = profile.palette;
    const turbulence = this.getTurbulenceFactor(planet);
    const isIceGiant = planet.type === 'IceGiant';
    const lat = Math.max(0, Math.min(1, latitude01));
    const lon = this.wrapUnit(longitude01);
    const equatorDistance = Math.abs(lat - 0.5) * 2;
    const jetStrength = (1 - equatorDistance * 0.35) * turbulence * profile.edgeRaggedness;
    const phase = phase01 * Math.PI * 2;
    const shearedLon = this.wrapUnit(lon + phase01 * (0.025 + turbulence * 0.035));

    const boundaryNoise =
      Math.sin(shearedLon * Math.PI * (2.2 + profile.edgeRaggedness * 1.6) + phase * 0.18) * 0.7 +
      Math.sin(shearedLon * Math.PI * (7.5 + profile.streakDensity * 3.5) + lat * Math.PI * 2.3) * 0.3;
    const wave1 = Math.sin(lat * Math.PI * profile.bandCount + boundaryNoise * jetStrength * 0.62);
    const wave2 = Math.sin(
      lat * Math.PI * (profile.bandCount * 0.5 + 1.7) + shearedLon * Math.PI * 2.4 - phase * 0.14
    );
    const fineWave =
      Math.sin(shearedLon * Math.PI * (18 + profile.streakDensity * 22) + lat * Math.PI * 19 + phase * 0.18) *
      Math.sin(lat * Math.PI * (profile.bandCount + 5)) *
      turbulence *
      profile.edgeRaggedness;
    const bandDisplacement =
      wave1 * (0.008 + profile.edgeRaggedness * 0.011) +
      wave2 * 0.007 +
      fineWave * (isIceGiant ? 0.004 : 0.009);
    const bandPosition = Math.max(0, Math.min(0.999, lat + bandDisplacement));
    const colourFloat = bandPosition * (safePalette.length - 1);
    const index1 = Math.max(0, Math.min(safePalette.length - 1, Math.floor(colourFloat)));
    const index2 = Math.max(0, Math.min(safePalette.length - 1, index1 + 1));
    const bandEdge = Math.abs(wave1);
    const colourMix = Math.max(0, Math.min(1, colourFloat - index1 + fineWave * 0.07));
    let base = interpolateColour(safePalette[index1], safePalette[index2], colourMix);

    const streak = this.sampleCloudStreaks(planet, shearedLon, lat, profile, phase01);
    if (Math.abs(streak) > 0.001) base = adjustBrightness(base, 1 + streak);

    const ribbon = this.sampleCloudRibbons(planet, shearedLon, lat, profile, phase01, turbulence);
    if (ribbon.strength > 0.001) base = interpolateColour(base, ribbon.tint, ribbon.strength);

    const storm = this.sampleStormField(planet, shearedLon, lat, phase01, turbulence, profile);
    const mottling =
      Math.sin(shearedLon * Math.PI * (30 + profile.streakDensity * 18) + lat * Math.PI * 11 - phase * 0.16) *
        0.026 +
      Math.sin(
        shearedLon * Math.PI * (65 + profile.edgeRaggedness * 24) + lat * Math.PI * 41 + phase * 0.21
      ) *
        0.016;
    const polarDimming = equatorDistance * (isIceGiant ? 0.04 : 0.08);
    const bandContrast = profile.contrast * Math.sin(lat * Math.PI * profile.bandCount);
    let brightness = 0.96 + bandContrast + mottling * turbulence * profile.edgeRaggedness - polarDimming;
    brightness += storm * (profile.stormTone === 'dark' ? -0.2 : isIceGiant ? 0.11 : 0.18);
    brightness = brightness * (1 - profile.haze * 0.18) + (1 + profile.haze * 0.04) * profile.haze * 0.18;

    if (storm > 0.08) {
      base = interpolateColour(
        base,
        profile.stormTint,
        Math.min(0.5, storm * (profile.stormTone === 'dark' ? 0.32 : 0.48))
      );
    }

    const final = adjustBrightness(base, Math.max(0.5, Math.min(1.38, brightness)));
    return {
      colour: rgbToHex(final.r, final.g, final.b),
      brightness,
      storm,
      texture:
        Math.abs(fineWave) +
        bandEdge * 0.45 +
        Math.abs(streak) * 1.8 +
        ribbon.strength * 1.4 +
        Math.max(0, storm) * 0.85 +
        turbulence * Math.abs(mottling) * 5,
      edge: bandEdge,
    };
  }

  getGlyph(sample: GiantAtmosphereSample): string {
    if (sample.storm > 0.22 || sample.texture > 0.95) return GLYPHS.SHADE_DARK;
    if (sample.texture > 0.62 || sample.edge > 0.82) return GLYPHS.SHADE_MEDIUM;
    if (sample.texture > 0.32 || sample.brightness < 0.78) return GLYPHS.SHADE_LIGHT;
    return ' ';
  }

  getTurbulenceFactor(planet: Planet): number {
    const tempStress = Math.max(0, Math.min(1, (planet.surfaceTemp - 120) / 520));
    const proximityStress = Math.max(0, Math.min(1, (1.6e11 - planet.orbitDistance) / 1.3e11));
    const massStress = Math.max(0, Math.min(1, (planet.gravity - 1.2) / 2.8));
    const typeFactor = planet.type === 'GasGiant' ? 0.22 : 0.11;
    const heatResponse = planet.type === 'GasGiant' ? 0.34 : 0.24;
    return Math.max(
      0.05,
      Math.min(0.9, typeFactor + tempStress * heatResponse + proximityStress * 0.3 + massStress * 0.2)
    );
  }

  getProfile(planet: Planet, fallbackPalette: RgbColour[]): GiantVisualProfile {
    const family = this.getFamily(planet);
    const palette = this.getPalette(family, fallbackPalette);
    const hotBias = this.getHeatBias(planet);
    switch (family) {
      case 'hot':
        return { family, palette, bandCount: 11, bandSharpness: 0.72, edgeRaggedness: 0.62, streakDensity: 0.54, streakContrast: 0.16, stormCount: 4, stormTint: { r: 210, g: 190, b: 170 }, stormTone: 'warm', contrast: 0.08, haze: 0.38 };
      case 'saturnian':
        return { family, palette, bandCount: 22, bandSharpness: 0.48, edgeRaggedness: 0.34, streakDensity: 0.62, streakContrast: 0.08, stormCount: 3, stormTint: { r: 255, g: 244, b: 210 }, stormTone: 'bright', contrast: 0.055, haze: 0.32 };
      case 'uranian':
        return { family, palette, bandCount: 7, bandSharpness: 0.28, edgeRaggedness: 0.16, streakDensity: 0.08, streakContrast: 0.035, stormCount: 1, stormTint: { r: 210, g: 250, b: 255 }, stormTone: 'bright', contrast: 0.025, haze: 0.62 };
      case 'neptunian':
        return { family, palette, bandCount: 10, bandSharpness: 0.44, edgeRaggedness: 0.32, streakDensity: 0.28, streakContrast: 0.09, stormCount: 3, stormTint: { r: 34, g: 52, b: 90 }, stormTone: 'dark', contrast: 0.055, haze: 0.32 };
      case 'cold':
        return { family, palette, bandCount: planet.type === 'IceGiant' ? 8 : 13, bandSharpness: 0.34, edgeRaggedness: 0.22, streakDensity: 0.16, streakContrast: 0.055, stormCount: planet.type === 'IceGiant' ? 1 : 2, stormTint: planet.type === 'IceGiant' ? { r: 200, g: 238, b: 250 } : { r: 230, g: 222, b: 200 }, stormTone: 'bright', contrast: 0.045, haze: 0.45 };
      default:
        return { family, palette, bandCount: 15 + Math.round(hotBias * 3), bandSharpness: 0.72, edgeRaggedness: 0.68, streakDensity: 0.48, streakContrast: 0.14, stormCount: 6, stormTint: { r: 255, g: 232, b: 190 }, stormTone: 'warm', contrast: 0.105, haze: 0.18 };
    }
  }

  sampleCloudRibbons(
    planet: Planet,
    longitude01: number,
    latitude01: number,
    profile: GiantVisualProfile,
    phase01: number,
    turbulence: number
  ): GiantCloudRibbonSample {
    const heatBias = this.getHeatBias(planet);
    const isIceGiant = planet.type === 'IceGiant';
    const baseCount =
      profile.family === 'hot'
        ? 5
        : profile.family === 'saturnian'
          ? 4
          : profile.family === 'jovian' || profile.family === 'neptunian'
            ? 3
            : 2;
    const ribbonCount = baseCount + (heatBias > 0.62 ? 1 : 0);
    let strongest = 0;
    let tint = isIceGiant ? { r: 218, g: 246, b: 255 } : { r: 246, g: 239, b: 220 };

    for (let index = 0; index < ribbonCount; index++) {
      const seed = `${planet.name}:${profile.family}:cloud-ribbon:${index}`;
      const baseLatitude = 0.12 + this.hashUnit(seed + ':lat') * 0.76;
      const width = 0.0028 + this.hashUnit(seed + ':width') * (isIceGiant ? 0.006 : 0.008);
      const direction = index % 2 === 0 ? 1 : -1;
      const drift = direction * phase01 * (0.004 + turbulence * 0.008);
      const warpedLatitude =
        baseLatitude +
        Math.sin(
          (longitude01 + drift) * Math.PI * (2 + this.hashUnit(seed + ':wave') * 4) +
            this.hashUnit(seed + ':phase') * Math.PI * 2
        ) *
          width *
          (0.35 + turbulence * 0.9);
      const latDistance = Math.abs(latitude01 - warpedLatitude);
      if (latDistance > width * 2.4) continue;

      const centreLongitude = this.wrapUnit(this.hashUnit(seed + ':lon') + drift);
      const arcRadius = 0.12 + this.hashUnit(seed + ':length') * 0.34;
      const longitudeDistance = Math.abs(this.shortestUnitDelta(longitude01, centreLongitude));
      const arcEnvelope = 1 - this.smoothstep(arcRadius * 0.72, arcRadius, longitudeDistance);
      if (arcEnvelope <= 0) continue;

      const longitudinalBreaks =
        0.68 +
        0.32 *
          Math.sin(
            longitude01 * Math.PI * (8 + this.hashUnit(seed + ':segments') * 14) +
              this.hashUnit(seed + ':break-phase') * Math.PI * 2
          );
      const latitudeEnvelope = Math.exp(-Math.pow(latDistance / Math.max(0.0001, width), 2) * 2.6);
      const strength = Math.min(
        0.42,
        latitudeEnvelope * arcEnvelope * longitudinalBreaks * (0.42 + turbulence * 0.24 + heatBias * 0.22)
      );
      if (strength <= strongest) continue;

      strongest = strength;
      if (isIceGiant) {
        const blueBias = this.hashUnit(seed + ':tint');
        tint = { r: Math.round(210 + blueBias * 28), g: Math.round(238 + blueBias * 15), b: 255 };
      } else {
        const tone = this.hashUnit(seed + ':tint');
        tint =
          tone < 0.34
            ? { r: 250, g: 246, b: 230 }
            : tone < 0.67
              ? { r: 244, g: 224, b: 188 }
              : { r: 232, g: 205, b: 174 };
      }
    }
    return { strength: strongest, tint };
  }

  private sampleStormField(
    planet: Planet,
    longitude01: number,
    latitude01: number,
    phase01: number,
    turbulence: number,
    profile: GiantVisualProfile
  ): number {
    const isIceGiant = planet.type === 'IceGiant';
    let field = 0;
    for (let index = 0; index < profile.stormCount; index++) {
      const seed = `${planet.name}:${planet.type}:storm:${index}`;
      const direction = index % 2 === 0 ? 1 : -1;
      const drift = direction * phase01 * (0.006 + this.hashUnit(seed + ':drift') * 0.016);
      const stormLon = this.wrapUnit(this.hashUnit(seed + ':lon') + drift);
      const stormLat =
        0.12 +
        this.hashUnit(seed + ':lat') * 0.76 +
        Math.sin(phase01 * Math.PI * 2 + index) * turbulence * 0.006;
      const rx = (isIceGiant ? 0.035 : 0.055) + this.hashUnit(seed + ':rx') * (isIceGiant ? 0.04 : 0.085);
      const ry = (isIceGiant ? 0.009 : 0.014) + this.hashUnit(seed + ':ry') * (isIceGiant ? 0.014 : 0.03);
      const lonDelta = this.shortestUnitDelta(longitude01, stormLon) / rx;
      const latDelta = (latitude01 - stormLat) / ry;
      const oval = Math.max(0, 1 - lonDelta * lonDelta - latDelta * latDelta);
      if (oval <= 0) continue;
      const spiral = Math.sin(lonDelta * 5.4 + latDelta * 2.2 + this.hashUnit(seed + ':spin') * Math.PI * 2);
      const eye = Math.max(0, 1 - lonDelta * lonDelta * 8 - latDelta * latDelta * 8);
      const strength =
        (0.35 + this.hashUnit(seed + ':strength') * 0.65) *
        turbulence *
        (0.65 + profile.edgeRaggedness * 0.45);
      field += Math.pow(oval, 1.8) * strength * (0.55 + spiral * 0.18) - eye * strength * 0.18;
    }
    return Math.max(-0.15, Math.min(1, field));
  }

  private sampleCloudStreaks(
    planet: Planet,
    longitude01: number,
    latitude01: number,
    profile: GiantVisualProfile,
    phase01: number
  ): number {
    if (profile.streakDensity <= 0.04) return 0;
    const seed = `${planet.name}:${profile.family}:streak:${Math.floor(latitude01 * profile.bandCount * 2.4)}`;
    const broken = this.hashUnit(seed + ':break');
    const segment =
      Math.sin((longitude01 + phase01 * 0.012) * Math.PI * (18 + broken * 30) + broken * Math.PI * 2) *
      Math.sin(
        longitude01 * Math.PI * (5 + profile.streakDensity * 8) +
          this.hashUnit(seed + ':phase') * Math.PI * 2
      );
    const gate = this.smoothstep(0.42 + profile.streakDensity * 0.16, 0.94, Math.abs(segment));
    if (gate <= 0) return 0;
    const latitudeEnvelope =
      1 - Math.min(1, Math.abs(latitude01 - 0.5) * (profile.family === 'uranian' ? 2.8 : 1.7));
    const sign = this.hashUnit(seed + ':light') > 0.45 ? 1 : -1;
    return sign * gate * profile.streakContrast * profile.streakDensity * Math.max(0.15, latitudeEnvelope);
  }

  private getFamily(planet: Planet): GiantVisualFamily {
    if (this.getHeatBias(planet) > 0.72) return 'hot';
    if (planet.type === 'IceGiant') {
      return (planet.surfaceTemp ?? 0) > 95 || this.hashUnit(`${planet.name}:ice-family`) > 0.52
        ? 'neptunian'
        : 'uranian';
    }
    if ((planet.surfaceTemp ?? 0) < 105 && this.hashUnit(`${planet.name}:cold-family`) > 0.35) return 'cold';
    return this.hashUnit(`${planet.name}:gas-family`) > 0.58 ? 'saturnian' : 'jovian';
  }

  private getHeatBias(planet: Planet): number {
    const temp = Number.isFinite(planet.surfaceTemp) ? planet.surfaceTemp : 140;
    const orbitAu =
      Number.isFinite(planet.orbitDistance) && planet.orbitDistance > 0 ? planet.orbitDistance / AU_IN_METERS : 5;
    return Math.max(
      Math.max(0, Math.min(1, (temp - 115) / 520)),
      Math.max(0, Math.min(1, (1.4 - orbitAu) / 1.2))
    );
  }

  private getPalette(family: GiantVisualFamily, fallbackPalette: RgbColour[]): RgbColour[] {
    const palettes: Record<GiantVisualFamily, string[]> = {
      jovian: ['#5B3A28', '#A36B3A', '#E0B067', '#F1DCA8', '#B37C48', '#6C4633'],
      saturnian: ['#796442', '#BCA66C', '#E2D098', '#EFE2B8', '#C9AA67', '#8B754E'],
      uranian: ['#7ABEC2', '#9FD9D5', '#C3ECE7', '#8BD0CF', '#63AEB9'],
      neptunian: ['#1A3D78', '#245CAA', '#2E7AC8', '#75B8E0', '#1E4B95'],
      hot: ['#4A3A35', '#7C5744', '#B47A4E', '#C89C70', '#8C6A5C', '#3D3A3D'],
      cold: ['#4F5F70', '#7C8790', '#A99F88', '#D0C29D', '#8D7D64'],
    };
    const selected = palettes[family].map((colour) => this.hexToRgb(colour));
    return selected.length > 0
      ? selected
      : fallbackPalette.length > 0
        ? fallbackPalette
        : [{ r: 96, g: 128, b: 128 }];
  }

  private hexToRgb(hex: string): RgbColour {
    const clean = hex.replace('#', '').slice(0, 6).padEnd(6, '8');
    return {
      r: Number.parseInt(clean.slice(0, 2), 16),
      g: Number.parseInt(clean.slice(2, 4), 16),
      b: Number.parseInt(clean.slice(4, 6), 16),
    };
  }

  private wrapUnit(value: number): number {
    return ((value % 1) + 1) % 1;
  }

  private shortestUnitDelta(value: number, target: number): number {
    return this.wrapUnit(value - target + 0.5) - 0.5;
  }

  private smoothstep(edge0: number, edge1: number, value: number): number {
    const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.000001, edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  private hashUnit(seed: string): number {
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index++) {
      hash ^= seed.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 0xffffffff;
  }
}
