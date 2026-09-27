import type { RgbColour } from '../colour';
import {
  forEachOrbitAtmospherePixelRay,
  integrateOrbitDensityColumn,
  type OrbitAtmosphere,
  type OrbitAtmosphereTransfer,
} from './orbit_atmosphere';
import {
  ORBIT_CAMERA_DISTANCE,
  ORBIT_FOCAL_FACTOR,
  orbitSurfaceNormal,
  type OrbitVector,
} from './orbit_lighting';

const COLUMN_WIDTH = 1024;
const COLUMN_HEIGHT = 256;
const VIEW_STEPS = 32;
const POINT_STRIDE = 7;
const MAX_CACHED_RAYS = 32768;
const MAX_CACHED_PIXELS = 16384;
const MIN_VIEW_TRANSMITTANCE = 1e-14;

/**
 * Density columns from a point to the top of a spherical atmosphere.
 * Distance-to-boundary coordinates resolve the grazing paths responsible for twilight.
 * See Bruneton's transmittance mapping; shadows are resolved analytically before interpolation.
 */
export class OrbitSolarColumnTable {
  private readonly columns = new Float64Array(COLUMN_WIDTH * COLUMN_HEIGHT);
  private readonly topSquared: number;
  private readonly tangentLength: number;

  /** Precomputes the same density quadrature as the reference renderer. */
  constructor(private readonly air: OrbitAtmosphere) {
    this.topSquared = air.outerRadius ** 2;
    this.tangentLength = Math.sqrt(this.topSquared - 1);
    if (!(this.tangentLength > 0)) return;
    for (let row = 0; row < COLUMN_HEIGHT; row++) {
      const rho = (this.tangentLength * row) / (COLUMN_HEIGHT - 1);
      const r2 = 1 + rho * rho;
      const radius = Math.sqrt(r2);
      const minimum = Math.max(0, air.outerRadius - radius);
      const maximum = rho + this.tangentLength;
      for (let col = 0; col < COLUMN_WIDTH; col++) {
        const distance = minimum + ((maximum - minimum) * col) / (COLUMN_WIDTH - 1);
        if (distance <= 0) continue;
        const along = (this.topSquared - r2 - distance * distance) / (2 * distance);
        const impact2 = Math.max(0, r2 - along * along);
        const end = Math.sqrt(Math.max(0, this.topSquared - impact2));
        this.columns[row * COLUMN_WIDTH + col] = integrateOrbitDensityColumn(impact2, along, end, air);
      }
    }
  }

  /** Looks up a sunlight column from squared radius and the signed projection toward the star. */
  sample(radiusSquared: number, along: number): number {
    const impact2 = Math.max(0, radiusSquared - along * along);
    if (along < 0 && impact2 < 1) return Infinity;
    const end = Math.sqrt(Math.max(0, this.topSquared - impact2));
    // Degenerate shells and out-of-shell callers keep the reference's numerical behaviour.
    if (!(this.tangentLength > 0) || radiusSquared < 1 || radiusSquared > this.topSquared) {
      return integrateOrbitDensityColumn(impact2, along, end, this.air);
    }
    const rho = Math.sqrt(Math.max(0, radiusSquared - 1));
    const minimum = this.air.outerRadius - Math.sqrt(radiusSquared);
    const range = rho + this.tangentLength - minimum;
    const u = Math.max(0, Math.min(COLUMN_WIDTH - 1, ((end - along - minimum) / range) * (COLUMN_WIDTH - 1)));
    const v = Math.max(0, Math.min(COLUMN_HEIGHT - 1, (rho / this.tangentLength) * (COLUMN_HEIGHT - 1)));
    const col = Math.min(COLUMN_WIDTH - 2, Math.floor(u));
    const row = Math.min(COLUMN_HEIGHT - 2, Math.floor(v));
    const fx = u - col;
    const fy = v - row;
    const offset = row * COLUMN_WIDTH + col;
    const lower = this.columns[offset] * (1 - fx) + this.columns[offset + 1] * fx;
    const upper =
      this.columns[offset + COLUMN_WIDTH] * (1 - fx) + this.columns[offset + COLUMN_WIDTH + 1] * fx;
    return lower * (1 - fy) + upper * fy;
  }
}

interface PreparedRay {
  area: number;
  direction: OrbitVector;
  normal: OrbitVector | null;
  groundTransmission: RgbColour;
  /** Per segment: x, y, z, radius squared, and the three view-path scattering weights. */
  points: Float64Array;
  count: number;
}

/**
 * Owns one atmosphere's lookup table and a bounded set of sun-independent pixel rays.
 * Texture rotation and stellar motion do not invalidate these rays. A changed atmosphere does.
 */
export class OrbitAtmosphereSampler {
  private readonly sunlight: OrbitSolarColumnTable;
  private readonly pixels = new Map<string, readonly PreparedRay[]>();
  private cachedRays = 0;
  private pixelSize: number | null = null;

  /** Owns an immutable snapshot so mutable planet data cannot silently stale the optical cache. */
  constructor(air: OrbitAtmosphere) {
    this.air = { ...air, extinction: { ...air.extinction }, projectedLayers: [...air.projectedLayers] };
    this.sunlight = new OrbitSolarColumnTable(this.air);
  }

  private readonly air: OrbitAtmosphere;

  /** Reports retained numerical storage for offline profiling; JavaScript object overhead is additional. */
  getCacheStats(): { pixels: number; rays: number; numericBytes: number } {
    return {
      pixels: this.pixels.size,
      rays: this.cachedRays,
      numericBytes:
        (COLUMN_WIDTH * COLUMN_HEIGHT + this.cachedRays * VIEW_STEPS * POINT_STRIDE) *
        Float64Array.BYTES_PER_ELEMENT,
    };
  }

  /** Checks every optical input before the renderer reuses the active atmosphere. */
  matches(air: OrbitAtmosphere): boolean {
    return (
      this.air.scaleHeight === air.scaleHeight &&
      this.air.outerRadius === air.outerRadius &&
      this.air.extinction.r === air.extinction.r &&
      this.air.extinction.g === air.extinction.g &&
      this.air.extinction.b === air.extinction.b &&
      this.air.projectedLayers.length === air.projectedLayers.length &&
      this.air.projectedLayers.every((layer, index) => layer === air.projectedLayers[index])
    );
  }

  /** Evaluates one star's transfer with the reference's full limb sampling and surface coverage. */
  samplePixel(x: number, y: number, size: number, sun: OrbitVector): OrbitAtmosphereTransfer {
    if (this.pixelSize !== size) {
      this.pixels.clear();
      this.cachedRays = 0;
      this.pixelSize = size;
    }
    const key = `${x}:${y}`;
    let rays = this.pixels.get(key);
    if (!rays) {
      const prepared: PreparedRay[] = [];
      forEachOrbitAtmospherePixelRay(x, y, size, this.air, (rayX, rayY, area) => {
        const ray = this.prepareRay(rayX, rayY, area);
        if (ray) prepared.push(ray);
      });
      rays = prepared;
      // Keep the existing cache when full; eviction here would make every frame churn.
      if (this.cachedRays + rays.length <= MAX_CACHED_RAYS && this.pixels.size < MAX_CACHED_PIXELS) {
        this.pixels.set(key, rays);
        this.cachedRays += rays.length;
      }
    }
    const result: OrbitAtmosphereTransfer = {
      scattering: { r: 0, g: 0, b: 0 },
      surface: { r: 0, g: 0, b: 0 },
    };
    for (const ray of rays) this.accumulateRay(ray, sun, result);
    return result;
  }

  /** Precomputes camera geometry and exponential view attenuation for all integration segments. */
  private prepareRay(x: number, y: number, area: number): PreparedRay | null {
    const air = this.air;
    const k = air.extinction;
    const length = Math.hypot(x, y, ORBIT_FOCAL_FACTOR);
    const vx = x / length;
    const vy = y / length;
    const vz = -ORBIT_FOCAL_FACTOR / length;
    const along = ORBIT_CAMERA_DISTANCE * vz;
    const impact2 = ORBIT_CAMERA_DISTANCE ** 2 - along * along;
    if (impact2 >= air.outerRadius ** 2) return null;
    const halfChord = Math.sqrt(air.outerRadius ** 2 - impact2);
    const start = -along - halfChord;
    const end = impact2 < 1 ? -along - Math.sqrt(1 - impact2) : -along + halfChord;
    const step = (end - start) / VIEW_STEPS;
    const points = new Float64Array(VIEW_STEPS * POINT_STRIDE);
    let column = 0;
    let count = 0;
    const smallestExtinction = Math.min(k.r, k.g, k.b);
    for (let i = 0; i < VIEW_STEPS; i++) {
      // The remaining scattered radiance per unit incident light is at most
      // 3/(8*pi) times view transmittance, even if every deeper point is sunlit.
      if (Math.exp(-smallestExtinction * column) < MIN_VIEW_TRANSMITTANCE) break;
      const t = start + (i + 0.5) * step;
      const px = vx * t;
      const py = vy * t;
      const pz = ORBIT_CAMERA_DISTANCE + vz * t;
      const densityStep = Math.exp(-Math.max(0, Math.hypot(px, py, pz) - 1) / air.scaleHeight) * step;
      const offset = i * POINT_STRIDE;
      points[offset] = px;
      points[offset + 1] = py;
      points[offset + 2] = pz;
      points[offset + 3] = px * px + py * py + pz * pz;
      points[offset + 4] = Math.exp(-k.r * column) * -Math.expm1(-k.r * densityStep);
      points[offset + 5] = Math.exp(-k.g * column) * -Math.expm1(-k.g * densityStep);
      points[offset + 6] = Math.exp(-k.b * column) * -Math.expm1(-k.b * densityStep);
      column += densityStep;
      count++;
    }
    const normal = orbitSurfaceNormal(x, y);
    const groundColumn = normal ? integrateOrbitDensityColumn(impact2, -halfChord, end + along, air) : 0;
    return {
      area,
      direction: { x: vx, y: vy, z: vz },
      normal,
      points,
      count,
      groundTransmission: {
        r: Math.exp(-k.r * groundColumn),
        g: Math.exp(-k.g * groundColumn),
        b: Math.exp(-k.b * groundColumn),
      },
    };
  }

  /** Adds stellar-direction-dependent transfer, leaving RGB stellar irradiance to the compositor. */
  private accumulateRay(ray: PreparedRay, sun: OrbitVector, result: OrbitAtmosphereTransfer): void {
    const k = this.air.extinction;
    const cosine = ray.direction.x * sun.x + ray.direction.y * sun.y + ray.direction.z * sun.z;
    const phase = (3 * (1 + cosine * cosine)) / (16 * Math.PI);
    const points = ray.points;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < ray.count; i++) {
      const offset = i * POINT_STRIDE;
      const along = points[offset] * sun.x + points[offset + 1] * sun.y + points[offset + 2] * sun.z;
      const column = this.sunlight.sample(points[offset + 3], along);
      if (!Number.isFinite(column)) continue;
      r += Math.exp(-k.r * column) * points[offset + 4];
      g += Math.exp(-k.g * column) * points[offset + 5];
      b += Math.exp(-k.b * column) * points[offset + 6];
    }
    result.scattering.r += r * phase * ray.area;
    result.scattering.g += g * phase * ray.area;
    result.scattering.b += b * phase * ray.area;
    if (ray.normal) {
      const n = ray.normal;
      const incidence = Math.max(0, n.x * sun.x + n.y * sun.y + n.z * sun.z);
      if (incidence > 0) {
        const column = this.sunlight.sample(n.x * n.x + n.y * n.y + n.z * n.z, incidence);
        const diffuse = (incidence / Math.PI) * ray.area;
        result.surface.r += diffuse * ray.groundTransmission.r * Math.exp(-k.r * column);
        result.surface.g += diffuse * ray.groundTransmission.g * Math.exp(-k.g * column);
        result.surface.b += diffuse * ray.groundTransmission.b * Math.exp(-k.b * column);
      }
    }
  }
}
