import { RgbColour } from '../colour';
import { ORBIT_CAMERA_DISTANCE, ORBIT_FOCAL_FACTOR, OrbitVector } from './orbit_lighting';

export interface OrbitAtmosphere {
  scaleHeight: number;
  outerRadius: number;
  extinction: RgbColour;
  projectedLayers: readonly number[];
}

// Molar mass (g/mol), mean polarizability (A^3). Polarizabilities: NIST CCCBDB,
// https://cccbdb.nist.gov/pollistx.asp . Dispersion/absorption bands are omitted.
const MOLECULES: Record<string, readonly [number, number]> = {
  Hydrogen: [2.016, 0.787],
  Helium: [4.003, 0.208],
  Methane: [16.043, 2.448],
  Argon: [39.948, 1.664],
  Nitrogen: [28.014, 1.71],
  Oxygen: [31.998, 1.562],
  'Carbon Dioxide': [44.01, 2.507],
  'Carbon Monoxide': [28.01, 1.953],
  'Water Vapor': [18.015, 1.501],
  Ammonia: [17.031, 2.103],
  Neon: [20.18, 0.381],
  'Hydrogen Sulfide': [34.08, 3.631],
  'Sulfur Dioxide': [64.066, 3.882],
};

/** Builds a clear, isothermal molecular atmosphere; distances are in planet radii. */
export function createOrbitAtmosphere(
  pressureAtm: number,
  temperatureK: number,
  gravityG: number,
  diameterKm: number,
  composition: Readonly<Record<string, number>> = {}
): OrbitAtmosphere | null {
  if (![pressureAtm, temperatureK, gravityG, diameterKm].every(Number.isFinite)) return null;
  if (pressureAtm <= 0 || temperatureK <= 0 || gravityG <= 0 || diameterKm <= 0) return null;
  // Unknown species use air-equivalent optical properties, not invented colours.
  // Number fractions weight alpha squared because scattering cross section scales
  // with alpha squared, whereas molecular mass determines hydrostatic scale height.
  let abundance = 0;
  let mass = 0;
  let polarizability2 = 0;
  for (const [gas, fraction] of Object.entries(composition)) {
    if (!Number.isFinite(fraction) || fraction <= 0) continue;
    const [molarMass, alpha] = MOLECULES[gas] ?? [28.965, 1.68];
    abundance += fraction;
    mass += molarMass * fraction;
    polarizability2 += alpha * alpha * fraction;
  }
  const molarMass = abundance ? mass / abundance : 28.965;
  const scatteringRatio = abundance ? polarizability2 / abundance / 1.68 ** 2 : 1;
  const radiusM = diameterKm * 500;
  const scaleHeight = (8314.46 * temperatureK) / (molarMass * gravityG * 9.80665 * radiusM);
  // A thin-shell approximation is not valid for an extended escaping envelope.
  if (scaleHeight > 0.02) return null;
  const density = pressureAtm * (288.15 / temperatureK) * radiusM * scatteringRatio;
  return {
    scaleHeight,
    outerRadius: 1 + scaleHeight * 8,
    projectedLayers: [0, 1, 2, 4, 8].map((height) => {
      const radius = 1 + scaleHeight * height;
      return (ORBIT_FOCAL_FACTOR * radius) / Math.sqrt(ORBIT_CAMERA_DISTANCE ** 2 - radius ** 2);
    }),
    extinction: { r: 5.8e-6 * density, g: 13.5e-6 * density, b: 33.1e-6 * density },
  };
}

/** Integrates exponential molecular density along a sun ray, stopping at the shell boundary. */
function solarColumn(x: number, y: number, z: number, sun: OrbitVector, air: OrbitAtmosphere): number {
  const r2 = x * x + y * y + z * z;
  const along = x * sun.x + y * sun.y + z * sun.z;
  if (along < 0 && r2 - along * along < 1) return Infinity;
  const distance = -along + Math.sqrt(Math.max(0, along * along + air.outerRadius ** 2 - r2));
  const step = distance / 8;
  let column = 0;
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.5) * step;
    const altitude = Math.hypot(x + sun.x * t, y + sun.y * t, z + sun.z * t) - 1;
    column += Math.exp(-Math.max(0, altitude) / air.scaleHeight) * step;
  }
  return column;
}

/** Attenuates a point-like host star along the same ray used to project it behind the limb. */
export function orbitSourceTransmittance(x: number, y: number, air: OrbitAtmosphere): RgbColour {
  const length = Math.hypot(x, y, ORBIT_FOCAL_FACTOR);
  const vx = x / length;
  const vy = y / length;
  const vz = -ORBIT_FOCAL_FACTOR / length;
  const along = ORBIT_CAMERA_DISTANCE * vz;
  const impact2 = ORBIT_CAMERA_DISTANCE ** 2 - along * along;
  if (impact2 <= 1) return { r: 0, g: 0, b: 0 };
  if (impact2 >= air.outerRadius ** 2) return { r: 1, g: 1, b: 1 };
  const halfChord = Math.sqrt(air.outerRadius ** 2 - impact2);
  const step = (2 * halfChord) / 32;
  let column = 0;
  for (let i = 0; i < 32; i++) {
    const t = -along - halfChord + (i + 0.5) * step;
    column +=
      Math.exp(-(Math.hypot(vx * t, vy * t, ORBIT_CAMERA_DISTANCE + vz * t) - 1) / air.scaleHeight) * step;
  }
  return {
    r: Math.exp(-air.extinction.r * column),
    g: Math.exp(-air.extinction.g * column),
    b: Math.exp(-air.extinction.b * column),
  };
}

/** Returns single-scattered linear RGB radiance along a camera ray, with solid-body shadowing. */
export function sampleOrbitAtmosphere(
  x: number,
  y: number,
  sun: OrbitVector,
  air: OrbitAtmosphere
): RgbColour {
  const length = Math.hypot(x, y, ORBIT_FOCAL_FACTOR);
  const vx = x / length;
  const vy = y / length;
  const vz = -ORBIT_FOCAL_FACTOR / length;
  const along = ORBIT_CAMERA_DISTANCE * vz;
  const impact2 = ORBIT_CAMERA_DISTANCE ** 2 - along * along;
  const result = { r: 0, g: 0, b: 0 };
  if (impact2 >= air.outerRadius ** 2) return result;
  const halfChord = Math.sqrt(air.outerRadius ** 2 - impact2);
  const start = -along - halfChord;
  const end = impact2 < 1 ? -along - Math.sqrt(1 - impact2) : -along + halfChord;
  const step = (end - start) / 16;
  const cosine = vx * sun.x + vy * sun.y + vz * sun.z;
  // Rayleigh scattering is NOT strongly forward-peaked. No invented aerosol
  // lobe: warm contact colours emerge from wavelength-dependent extinction.
  const phase = (3 * (1 + cosine * cosine)) / (16 * Math.PI);
  let viewColumn = 0;
  for (let i = 0; i < 16; i++) {
    const t = start + (i + 0.5) * step;
    const px = vx * t;
    const py = vy * t;
    const pz = ORBIT_CAMERA_DISTANCE + vz * t;
    const densityStep = Math.exp(-Math.max(0, Math.hypot(px, py, pz) - 1) / air.scaleHeight) * step;
    const column = solarColumn(px, py, pz, sun, air) + viewColumn + densityStep * 0.5;
    result.r += Math.exp(-air.extinction.r * column) * air.extinction.r * densityStep * phase;
    result.g += Math.exp(-air.extinction.g * column) * air.extinction.g * densityStep * phase;
    result.b += Math.exp(-air.extinction.b * column) * air.extinction.b * densityStep * phase;
    viewColumn += densityStep;
  }
  return result;
}

/** Integrates a display pixel in polar strips so subpixel atmospheric layers cannot be missed. */
export function sampleOrbitAtmospherePixel(
  x: number,
  y: number,
  size: number,
  sun: OrbitVector,
  air: OrbitAtmosphere
): RgbColour {
  const distance = Math.hypot(x, y);
  if (distance < 0.98) return sampleOrbitAtmosphere(x, y, sun, air);
  const result = { r: 0, g: 0, b: 0 };
  const half = size / 2;
  const angle = Math.atan2(y, x);
  const angularRadius = Math.asin(Math.min(1, (Math.SQRT2 * half) / distance));
  const angleStep = (angularRadius * 2) / 4;
  for (let i = 0; i < 4; i++) {
    const theta = angle - angularRadius + (i + 0.5) * angleStep;
    const cosine = Math.cos(theta);
    const sine = Math.sin(theta);
    const x0 = (x - half) / cosine;
    const x1 = (x + half) / cosine;
    const y0 = (y - half) / sine;
    const y1 = (y + half) / sine;
    let low = Math.max(0, Math.min(x0, x1), Math.min(y0, y1));
    const high = Math.min(Math.max(x0, x1), Math.max(y0, y1));
    if (high <= low) continue;
    // Split at the solid limb and physical scale-height boundaries. Cartesian
    // supersampling can otherwise miss the entire low-altitude red layer.
    for (const boundary of air.projectedLayers) {
      const end = Math.min(high, boundary);
      if (end <= low) continue;
      const count = low < 1 ? 1 : 2;
      for (let j = 0; j < count; j++) {
        const fraction = count === 1 ? 0.5 : 0.5 + (j === 0 ? -1 : 1) / (2 * Math.sqrt(3));
        const radius = low + (end - low) * fraction;
        const sample = sampleOrbitAtmosphere(radius * cosine, radius * sine, sun, air);
        const area = (radius * (end - low) * angleStep) / (count * size * size);
        result.r += sample.r * area;
        result.g += sample.g * area;
        result.b += sample.b * area;
      }
      low = end;
      if (low >= high) break;
    }
  }
  return result;
}
