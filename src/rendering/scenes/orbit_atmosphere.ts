import { RgbColour } from '../colour';
import type { Planet } from '../../entities/planet';
import { ORBIT_CAMERA_DISTANCE, ORBIT_FOCAL_FACTOR, orbitSurfaceNormal, OrbitVector } from './orbit_lighting';

export interface OrbitAtmosphere {
  scaleHeight: number;
  outerRadius: number;
  extinction: RgbColour;
  projectedLayers: readonly number[];
}

export interface OrbitAtmosphereTransfer {
  /** Scattered radiance per unit incident stellar irradiance. */
  scattering: RgbColour;
  /** Lambertian surface radiance for unit albedo, including both atmospheric paths. */
  surface: RgbColour;
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

/** Places the optical boundary at solid terrain or the giant's visible cloud deck. */
export function createBodyOrbitAtmosphere(
  body: Pick<Planet, 'type' | 'effectiveAtmosphere' | 'effectiveSurfaceTemp' | 'gravity' | 'diameter'>
): OrbitAtmosphere | null {
  const air = body.effectiveAtmosphere;
  if (!air) return null;
  // Giant textures already depict clouds, not a surface beneath the deep gas
  // envelope. These representative cloud-top pressures are rendering defaults,
  // not predictions of cloud condensation (see docs/orbit-atmosphere.md).
  const cloudTopBar = body.type === 'GasGiant' ? 0.5 : body.type === 'IceGiant' ? 0.3 : Infinity;
  return createOrbitAtmosphere(
    Math.min(air.pressure, cloudTopBar),
    body.effectiveSurfaceTemp,
    body.gravity,
    body.diameter,
    air.composition
  );
}

/** Builds a clear, isothermal molecular atmosphere; distances are in planet radii. */
export function createOrbitAtmosphere(
  pressureBar: number,
  temperatureK: number,
  gravityG: number,
  diameterKm: number,
  composition: Readonly<Record<string, number>> = {}
): OrbitAtmosphere | null {
  if (![pressureBar, temperatureK, gravityG, diameterKm].every(Number.isFinite)) return null;
  if (pressureBar <= 0 || temperatureK <= 0 || gravityG <= 0 || diameterKm <= 0) return null;
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
  const physicalScaleHeight = (8314.46 * temperatureK) / (molarMass * gravityG * 9.80665 * radiusM);
  if (!Number.isFinite(physicalScaleHeight) || physicalScaleHeight <= 0) return null;
  // Extended envelopes need a vertical-structure model. Until then, use an
  // equivalent compact shell preserving vertical optical depth, rather than
  // abruptly removing the atmosphere when H/R crosses the geometric limit.
  const scaleHeight = Math.min(physicalScaleHeight, 0.02);
  // The stored pressure is bar; the reference Rayleigh coefficients use 101325 Pa.
  const density =
    (pressureBar / 1.01325) *
    (288.15 / temperatureK) *
    radiusM *
    scatteringRatio *
    (physicalScaleHeight / scaleHeight);
  const extinction = { r: 5.8e-6 * density, g: 13.5e-6 * density, b: 33.1e-6 * density };
  // Dense atmospheres can remain optically significant beyond eight scale heights.
  // Stop where the largest tangent optical depth falls below 1e-4 (bounded isothermal model).
  const topHeight = Math.max(
    8,
    Math.min(20, Math.log((extinction.b * Math.sqrt(2 * Math.PI * scaleHeight)) / 1e-4))
  );
  return {
    scaleHeight,
    outerRadius: 1 + scaleHeight * topHeight,
    projectedLayers: [
      ...[0, 0.5, 1, 2, 4, 6, 8, 12, 16].filter((height) => height < topHeight),
      topHeight,
    ].map((height) => {
      const radius = 1 + scaleHeight * height;
      return (ORBIT_FOCAL_FACTOR * radius) / Math.sqrt(ORBIT_CAMERA_DISTANCE ** 2 - radius ** 2);
    }),
    extinction,
  };
}

// Six-point Gauss-Legendre quadrature on each side of closest approach. Splitting
// at the tangent prevents a long grazing ray from stepping over the dense layer.
const COLUMN_NODES = [-0.9324695142, -0.6612093865, -0.2386191861, 0.2386191861, 0.6612093865, 0.9324695142];
const COLUMN_WEIGHTS = [0.1713244924, 0.360761573, 0.4679139346, 0.4679139346, 0.360761573, 0.1713244924];

/** Integrates density between signed distances from a ray's tangent point. */
export function integrateOrbitDensityColumn(
  impact2: number,
  start: number,
  end: number,
  air: OrbitAtmosphere
): number {
  if (start < 0 && end > 0)
    return (
      integrateOrbitDensityColumn(impact2, start, 0, air) + integrateOrbitDensityColumn(impact2, 0, end, air)
    );
  const midpoint = (start + end) / 2;
  const half = (end - start) / 2;
  let column = 0;
  for (let i = 0; i < COLUMN_NODES.length; i++) {
    const t = midpoint + half * COLUMN_NODES[i];
    const altitude = Math.max(0, Math.sqrt(impact2 + t * t) - 1);
    column += COLUMN_WEIGHTS[i] * Math.exp(-altitude / air.scaleHeight);
  }
  return column * half;
}

/** Integrates exponential molecular density along a sun ray, stopping at the shell boundary. */
export function orbitSolarDensityColumn(
  x: number,
  y: number,
  z: number,
  sun: OrbitVector,
  air: OrbitAtmosphere
): number {
  const r2 = x * x + y * y + z * z;
  const along = x * sun.x + y * sun.y + z * sun.z;
  if (along < 0 && r2 - along * along < 1) return Infinity;
  const impact2 = Math.max(0, r2 - along * along);
  const end = Math.sqrt(Math.max(0, air.outerRadius ** 2 - impact2));
  return integrateOrbitDensityColumn(impact2, along, end, air);
}

/** Attenuates a point-like host star along the same ray used to project it behind the limb. */
export function orbitSourceTransmittance(x: number, y: number, air: OrbitAtmosphere): RgbColour {
  const length = Math.hypot(x, y, ORBIT_FOCAL_FACTOR);
  const vz = -ORBIT_FOCAL_FACTOR / length;
  const along = ORBIT_CAMERA_DISTANCE * vz;
  const impact2 = ORBIT_CAMERA_DISTANCE ** 2 - along * along;
  if (impact2 <= 1) return { r: 0, g: 0, b: 0 };
  if (impact2 >= air.outerRadius ** 2) return { r: 1, g: 1, b: 1 };
  const halfChord = Math.sqrt(air.outerRadius ** 2 - impact2);
  const column = integrateOrbitDensityColumn(impact2, -halfChord, halfChord, air);
  return {
    r: Math.exp(-air.extinction.r * column),
    g: Math.exp(-air.extinction.g * column),
    b: Math.exp(-air.extinction.b * column),
  };
}

/** Returns scattered and transmitted surface light per unit irradiance along one camera ray. */
export function sampleOrbitAtmosphereTransfer(
  x: number,
  y: number,
  sun: OrbitVector,
  air: OrbitAtmosphere
): OrbitAtmosphereTransfer {
  const length = Math.hypot(x, y, ORBIT_FOCAL_FACTOR);
  const vx = x / length;
  const vy = y / length;
  const vz = -ORBIT_FOCAL_FACTOR / length;
  const along = ORBIT_CAMERA_DISTANCE * vz;
  const impact2 = ORBIT_CAMERA_DISTANCE ** 2 - along * along;
  const result: OrbitAtmosphereTransfer = {
    scattering: { r: 0, g: 0, b: 0 },
    surface: { r: 0, g: 0, b: 0 },
  };
  if (impact2 >= air.outerRadius ** 2) return result;
  const halfChord = Math.sqrt(air.outerRadius ** 2 - impact2);
  const start = -along - halfChord;
  const end = impact2 < 1 ? -along - Math.sqrt(1 - impact2) : -along + halfChord;
  const step = (end - start) / 32;
  const cosine = vx * sun.x + vy * sun.y + vz * sun.z;
  // Rayleigh scattering is NOT strongly forward-peaked. No invented aerosol
  // lobe: warm contact colours emerge from wavelength-dependent extinction.
  const phase = (3 * (1 + cosine * cosine)) / (16 * Math.PI);
  let viewColumn = 0;
  for (let i = 0; i < 32; i++) {
    const t = start + (i + 0.5) * step;
    const px = vx * t;
    const py = vy * t;
    const pz = ORBIT_CAMERA_DISTANCE + vz * t;
    const densityStep = Math.exp(-Math.max(0, Math.hypot(px, py, pz) - 1) / air.scaleHeight) * step;
    const column = orbitSolarDensityColumn(px, py, pz, sun, air) + viewColumn;
    // Integrate extinction within each view segment analytically. Midpoint-only
    // attenuation wrongly suppresses the whole segment when optical depth is large.
    result.scattering.r +=
      Math.exp(-air.extinction.r * column) * -Math.expm1(-air.extinction.r * densityStep) * phase;
    result.scattering.g +=
      Math.exp(-air.extinction.g * column) * -Math.expm1(-air.extinction.g * densityStep) * phase;
    result.scattering.b +=
      Math.exp(-air.extinction.b * column) * -Math.expm1(-air.extinction.b * densityStep) * phase;
    viewColumn += densityStep;
  }
  const normal = orbitSurfaceNormal(x, y);
  if (normal) {
    const incidence = Math.max(0, normal.x * sun.x + normal.y * sun.y + normal.z * sun.z);
    if (incidence > 0) {
      // Integrate the complete ground-to-camera path independently of the view
      // marching resolution. Both terms are in radiance / stellar irradiance.
      const groundColumn = integrateOrbitDensityColumn(impact2, -halfChord, end + along, air);
      const column = groundColumn + orbitSolarDensityColumn(normal.x, normal.y, normal.z, sun, air);
      const diffuse = incidence / Math.PI;
      result.surface = {
        r: diffuse * Math.exp(-air.extinction.r * column),
        g: diffuse * Math.exp(-air.extinction.g * column),
        b: diffuse * Math.exp(-air.extinction.b * column),
      };
    }
  }
  return result;
}

/** Returns molecular scattering alone for optical diagnostics. */
export function sampleOrbitAtmosphere(
  x: number,
  y: number,
  sun: OrbitVector,
  air: OrbitAtmosphere
): RgbColour {
  return sampleOrbitAtmosphereTransfer(x, y, sun, air).scattering;
}

/** Area-integrates surface transmission and scattering together at the silhouette. */
export function sampleOrbitAtmospherePixelTransfer(
  x: number,
  y: number,
  size: number,
  sun: OrbitVector,
  air: OrbitAtmosphere
): OrbitAtmosphereTransfer {
  const result: OrbitAtmosphereTransfer = {
    scattering: { r: 0, g: 0, b: 0 },
    surface: { r: 0, g: 0, b: 0 },
  };
  forEachOrbitAtmospherePixelRay(x, y, size, air, (rayX, rayY, area) => {
    const sample = sampleOrbitAtmosphereTransfer(rayX, rayY, sun, air);
    result.scattering.r += sample.scattering.r * area;
    result.scattering.g += sample.scattering.g * area;
    result.scattering.b += sample.scattering.b * area;
    result.surface.r += sample.surface.r * area;
    result.surface.g += sample.surface.g * area;
    result.surface.b += sample.surface.b * area;
  });
  return result;
}

/** Shares the exact limb quadrature between the reference integrator and prepared rendering rays. */
export function forEachOrbitAtmospherePixelRay(
  x: number,
  y: number,
  size: number,
  air: OrbitAtmosphere,
  visit: (rayX: number, rayY: number, area: number) => void
): void {
  const distance = Math.hypot(x, y);
  const half = size / 2;
  if (distance + Math.SQRT2 * half < 1) {
    visit(x, y, 1);
    return;
  }
  if (distance - Math.SQRT2 * half >= air.projectedLayers[air.projectedLayers.length - 1]) return;
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
        const area = (radius * (end - low) * angleStep) / (count * size * size);
        visit(radius * cosine, radius * sine, area);
      }
      low = end;
      if (low >= high) break;
    }
  }
}

/** Returns area-averaged molecular scattering alone for optical diagnostics. */
export function sampleOrbitAtmospherePixel(
  x: number,
  y: number,
  size: number,
  sun: OrbitVector,
  air: OrbitAtmosphere
): RgbColour {
  return sampleOrbitAtmospherePixelTransfer(x, y, size, sun, air).scattering;
}
