interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface PanoramaStar {
  azimuth: number;
  elevation: number;
  size: number;
  alpha: number;
  warm: boolean;
}

interface PanoramaBand {
  azimuth: number;
  widthRadians: number;
  alpha: number;
  tilt: number;
}

interface PanoramaNebula {
  azimuth: number;
  elevation: number;
  widthRadians: number;
  heightRadians: number;
  alpha: number;
  tilt: number;
}

interface SurfaceCrater {
  center: Vec3;
  angularRadius: number;
  depth: number;
}

interface CelestialBody {
  kind: 'gas' | 'rock';
  direction: Vec3;
  angularRadius: number;
  layer: number;
  colour: [number, number, number];
  textureSeed: number;
  craters: SurfaceCrater[];
}

interface ProjectedPoint {
  x: number;
  y: number;
}

interface ProjectedBody extends ProjectedPoint {
  body: CelestialBody;
  radius: number;
}

interface CachedBodySurface {
  albedo: Uint8ClampedArray;
  normals: Float32Array;
  coverage: Uint8ClampedArray;
}

const TITLE_FRAME_INTERVAL_MS = 1000 / 24;
const TITLE_SEQUENCE_SECONDS = 96;
const HORIZONTAL_FOV = (104 * Math.PI) / 180;

/** Renders a fixed panoramic title scene viewed through one continuously rotating camera. */
export class TitleCinematicRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly bodyCanvas: HTMLCanvasElement;
  private readonly bodyContext: CanvasRenderingContext2D;
  private readonly stars: PanoramaStar[];
  private readonly bands: PanoramaBand[];
  private readonly nebulae: PanoramaNebula[];
  private readonly starDirection: Vec3;
  private readonly bodies: CelestialBody[];
  private readonly surfaceCache = new Map<string, CachedBodySurface>();
  private animationFrameId: number | null = null;
  private startedAt = 0;
  private lastFrameAt = Number.NEGATIVE_INFINITY;
  private running = false;
  private width = 0;
  private height = 0;
  private pixelsPerRadian = 1;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Initializes one deterministic panorama whose contents never move in world space. */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    seed: string
  ) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Unable to create title cinematic canvas context.');
    this.ctx = context;
    this.bodyCanvas = document.createElement('canvas');
    const bodyContext = this.bodyCanvas.getContext('2d');
    if (!bodyContext) throw new Error('Unable to create title body canvas context.');
    this.bodyContext = bodyContext;

    const random = createSeededRandom(seed);
    this.stars = Array.from({ length: 430 }, () => ({
      azimuth: random() * Math.PI * 2,
      elevation: (random() - 0.5) * 1.15,
      size: random() > 0.9 ? 2 : 1,
      alpha: 0.13 + random() * 0.56,
      warm: random() > 0.84,
    }));
    this.bands = [
      { azimuth: -0.58, widthRadians: 0.34, alpha: 0.13, tilt: -0.17 },
      { azimuth: -0.19, widthRadians: 0.18, alpha: 0.075, tilt: -0.19 },
      { azimuth: 0.18, widthRadians: 0.27, alpha: 0.09, tilt: -0.16 },
      { azimuth: 0.49, widthRadians: 0.14, alpha: 0.055, tilt: -0.2 },
    ];
    this.nebulae = [
      {
        azimuth: 1.62,
        elevation: 0.14,
        widthRadians: 0.56,
        heightRadians: 0.19,
        alpha: 0.055,
        tilt: -0.14,
      },
      {
        azimuth: 2.08,
        elevation: -0.21,
        widthRadians: 0.32,
        heightRadians: 0.13,
        alpha: 0.038,
        tilt: 0.19,
      },
      {
        azimuth: 5.28,
        elevation: 0.27,
        widthRadians: 0.42,
        heightRadians: 0.16,
        alpha: 0.032,
        tilt: -0.08,
      },
    ];

    this.starDirection = sphericalDirection(-0.52, 0.2);
    const giantAzimuth = 0.58;
    const giantElevation = -0.18;
    const giant = createBody('gas', giantAzimuth, giantElevation, 0.55, 1, [137, 108, 72], 11);
    /** Returns the slightly tilted shared orbital plane used by the giant's moons. */
    const orbitalElevation = (azimuth: number): number => giantElevation + (azimuth - giantAzimuth) * 0.055;
    this.bodies = [
      giant,
      createBody('rock', -0.18, orbitalElevation(-0.18), 0.075, 2, [137, 143, 139], 61),
      createBody('rock', 0.42, orbitalElevation(0.42), 0.034, 3, [127, 138, 140], 41),
      createBody('rock', 1.04, orbitalElevation(1.04), 0.052, 2, [157, 145, 126], 67),
      createBody('rock', Math.PI + 0.06, -0.12, 0.19, 1, [119, 108, 91], 73),
    ];
  }

  /** Starts or resumes the title animation. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedAt = performance.now();
    this.lastFrameAt = Number.NEGATIVE_INFINITY;
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.resize();
    this.animationFrameId = requestAnimationFrame(this.renderFrame);
  }

  /** Stops rendering and removes lifecycle listeners. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  /** Sizes the presentation canvas and recalculates the camera projection. */
  private resize(): void {
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    const scale = Math.min(1.25, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.width * scale);
    this.canvas.height = Math.floor(this.height * scale);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.pixelsPerRadian = this.width / HORIZONTAL_FOV;
  }

  /** Handles viewport changes. */
  private handleResize = (): void => {
    this.resize();
  };

  /** Restarts elapsed presentation time after a hidden tab becomes visible. */
  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && this.running) {
      this.startedAt = performance.now();
      this.lastFrameAt = Number.NEGATIVE_INFINITY;
    }
  };

  /** Renders one throttled frame. */
  private renderFrame = (now: number): void => {
    if (!this.running) return;
    if (document.visibilityState !== 'hidden' && now - this.lastFrameAt >= TITLE_FRAME_INTERVAL_MS) {
      const elapsed = this.reducedMotion ? 8 : (now - this.startedAt) / 1000;
      this.drawScene((elapsed % TITLE_SEQUENCE_SECONDS) / TITLE_SEQUENCE_SECONDS);
      this.lastFrameAt = now;
    }
    this.animationFrameId = requestAnimationFrame(this.renderFrame);
  };

  /** Draws one view of the fixed panorama at the supplied camera rotation. */
  private drawScene(progress: number): void {
    const cameraYaw = progress * Math.PI * 2;
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = '#000000';
    this.ctx.fillRect(0, 0, this.width, this.height);

    this.drawPanoramaStars(cameraYaw);
    this.drawPanoramaNebulae(cameraYaw);
    this.drawPanoramaBands(cameraYaw);

    const projectedStar = this.projectWorldDirection(this.starDirection, cameraYaw);
    const visibleStar =
      projectedStar && isNearViewport(projectedStar, this.width, this.height, this.width * 0.12)
        ? projectedStar
        : null;
    if (visibleStar) {
      this.drawStarGlow(visibleStar.x, visibleStar.y);
    }

    const projectedBodies = this.projectBodies(cameraYaw).sort((a, b) => a.body.layer - b.body.layer);
    for (const projected of projectedBodies) {
      this.drawBody(projected);
    }

    if (visibleStar && !isPointOcculted(visibleStar, projectedBodies)) {
      this.drawLensArtifacts(visibleStar.x, visibleStar.y);
    }
    this.drawExposureVeil(cameraYaw);
  }

  /** Projects and draws fixed stars from their panorama coordinates. */
  private drawPanoramaStars(cameraYaw: number): void {
    for (const star of this.stars) {
      const projected = this.projectDirection(star.azimuth, star.elevation, cameraYaw);
      if (!projected) continue;
      const x = Math.round(projected.x);
      const y = Math.round(projected.y);
      this.ctx.fillStyle = star.warm ? `rgba(220,193,139,${star.alpha})` : `rgba(177,207,205,${star.alpha})`;
      this.ctx.fillRect(x, y, star.size, star.size);
    }
  }

  /** Projects fixed blue nebula wisps through the shared camera without independent drift. */
  private drawPanoramaNebulae(cameraYaw: number): void {
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'lighter';
    for (const nebula of this.nebulae) {
      const width = Math.max(40, nebula.widthRadians * this.pixelsPerRadian);
      const height = Math.max(18, nebula.heightRadians * this.pixelsPerRadian);
      const relativeAzimuth = wrapAngle(nebula.azimuth - cameraYaw);
      if (Math.abs(relativeAzimuth) > HORIZONTAL_FOV / 2 + nebula.widthRadians) continue;
      const projectedX = projectPanoramaX(nebula.azimuth, cameraYaw, this.width, HORIZONTAL_FOV);
      const projectedY = this.height / 2 - nebula.elevation * this.pixelsPerRadian;
      this.ctx.save();
      this.ctx.translate(projectedX, projectedY);
      this.ctx.rotate(nebula.tilt);
      this.ctx.scale(1, height / width);
      const glow = this.ctx.createRadialGradient(0, 0, width * 0.06, 0, 0, width);
      glow.addColorStop(0, `rgba(68,113,132,${nebula.alpha})`);
      glow.addColorStop(0.36, `rgba(32,79,103,${nebula.alpha * 0.62})`);
      glow.addColorStop(0.72, `rgba(18,53,74,${nebula.alpha * 0.24})`);
      glow.addColorStop(1, 'rgba(5,20,31,0)');
      this.ctx.fillStyle = glow;
      this.ctx.filter = `blur(${Math.max(7, width * 0.045)}px)`;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, width, 0, Math.PI * 2);
      this.ctx.fill();
      this.ctx.restore();
    }
    this.ctx.restore();
    this.ctx.filter = 'none';
  }

  /** Projects broad fixed amber panorama bands through the same camera transform. */
  private drawPanoramaBands(cameraYaw: number): void {
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'lighter';
    for (const band of this.bands) {
      const relativeAzimuth = wrapAngle(band.azimuth - cameraYaw);
      const halfVisible = HORIZONTAL_FOV / 2 + band.widthRadians;
      if (Math.abs(relativeAzimuth) > halfVisible) continue;
      const centerX = projectPanoramaX(band.azimuth, cameraYaw, this.width, HORIZONTAL_FOV);
      const width = Math.max(18, band.widthRadians * this.pixelsPerRadian);
      this.ctx.save();
      this.ctx.translate(centerX, this.height / 2);
      this.ctx.rotate(band.tilt);
      const gradient = this.ctx.createLinearGradient(-width, 0, width, 0);
      gradient.addColorStop(0, 'rgba(26,16,5,0)');
      gradient.addColorStop(0.33, `rgba(75,46,14,${band.alpha * 0.36})`);
      gradient.addColorStop(0.5, `rgba(164,116,48,${band.alpha})`);
      gradient.addColorStop(0.67, `rgba(75,46,14,${band.alpha * 0.34})`);
      gradient.addColorStop(1, 'rgba(26,16,5,0)');
      this.ctx.fillStyle = gradient;
      this.ctx.filter = `blur(${Math.max(10, width * 0.1)}px)`;
      this.ctx.fillRect(-width, -this.height, width * 2, this.height * 2);
      this.ctx.restore();
    }
    this.ctx.restore();
    this.ctx.filter = 'none';
  }

  /** Projects every fixed celestial body and rejects objects outside the camera frustum. */
  private projectBodies(cameraYaw: number): ProjectedBody[] {
    const projected: ProjectedBody[] = [];
    for (const body of this.bodies) {
      const center = this.projectWorldDirection(body.direction, cameraYaw);
      if (!center) continue;
      const screenRadius = body.angularRadius * this.pixelsPerRadian;
      if (
        center.x + screenRadius < 0 ||
        center.x - screenRadius > this.width ||
        center.y + screenRadius < 0 ||
        center.y - screenRadius > this.height
      ) {
        continue;
      }
      projected.push({ ...center, body, radius: screenRadius });
    }
    return projected;
  }

  /** Draws one pixel-grained sphere with geometric world-space illumination. */
  private drawBody(projected: ProjectedBody): void {
    const { body, x, y, radius } = projected;
    const sampleDiameter = Math.min(360, Math.max(28, Math.round(radius * 0.7)));
    if (this.bodyCanvas.width !== sampleDiameter || this.bodyCanvas.height !== sampleDiameter) {
      this.bodyCanvas.width = sampleDiameter;
      this.bodyCanvas.height = sampleDiameter;
    }
    const image = this.bodyContext.createImageData(sampleDiameter, sampleDiameter);
    const pixels = image.data;
    const surface = this.getCachedBodySurface(body, sampleDiameter);
    const lightDirection = this.starDirection;

    for (let pixel = 0; pixel < sampleDiameter * sampleDiameter; pixel++) {
      const coverage = surface.coverage[pixel];
      if (coverage === 0) continue;
      const normalIndex = pixel * 3;
      const normal = {
        x: surface.normals[normalIndex],
        y: surface.normals[normalIndex + 1],
        z: surface.normals[normalIndex + 2],
      };
      const diffuse = Math.max(0, dot(normal, lightDirection));
      const illumination = 0.008 + Math.pow(diffuse, 0.82) * 0.992;
      const colourIndex = pixel * 3;
      const outputIndex = pixel * 4;
      pixels[outputIndex] = clampByte(surface.albedo[colourIndex] * illumination);
      pixels[outputIndex + 1] = clampByte(surface.albedo[colourIndex + 1] * illumination);
      pixels[outputIndex + 2] = clampByte(surface.albedo[colourIndex + 2] * illumination);
      pixels[outputIndex + 3] = coverage;
    }

    this.bodyContext.putImageData(image, 0, 0);
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.clip();
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.bodyCanvas, x - radius, y - radius, radius * 2, radius * 2);
    this.ctx.restore();
  }

  /** Returns cached world-oriented normals, coverage, and albedo for one body resolution. */
  private getCachedBodySurface(body: CelestialBody, sampleDiameter: number): CachedBodySurface {
    const key = `${body.textureSeed}:${sampleDiameter}`;
    const cached = this.surfaceCache.get(key);
    if (cached) return cached;

    const albedo = new Uint8ClampedArray(sampleDiameter * sampleDiameter * 3);
    const normals = new Float32Array(sampleDiameter * sampleDiameter * 3);
    const coverage = new Uint8ClampedArray(sampleDiameter * sampleDiameter);
    const viewDirection = scale(body.direction, -1);
    const worldUp: Vec3 = { x: 0, y: 1, z: 0 };
    const surfaceRight = normalize(cross(viewDirection, worldUp));
    const surfaceUp = normalize(cross(surfaceRight, viewDirection));

    for (let py = 0; py < sampleDiameter; py++) {
      const ny = (py / (sampleDiameter - 1)) * 2 - 1;
      for (let px = 0; px < sampleDiameter; px++) {
        const nx = (px / (sampleDiameter - 1)) * 2 - 1;
        const radiusSq = nx * nx + ny * ny;
        if (radiusSq > 1.04) continue;
        const nz = Math.sqrt(Math.max(0, 1 - radiusSq));
        const normal = normalize(
          add(add(scale(surfaceRight, nx), scale(surfaceUp, -ny)), scale(viewDirection, nz))
        );
        const texture =
          body.kind === 'gas' ? sampleGasTexture(normal, body) : sampleRockTexture(normal, body);
        const pixel = py * sampleDiameter + px;
        const index = pixel * 3;
        normals[index] = normal.x;
        normals[index + 1] = normal.y;
        normals[index + 2] = normal.z;
        albedo[index] = clampByte(texture[0]);
        albedo[index + 1] = clampByte(texture[1]);
        albedo[index + 2] = clampByte(texture[2]);
        coverage[pixel] = sphereCoverage(radiusSq, sampleDiameter) * 255;
      }
    }

    const surface = { albedo, normals, coverage };
    this.surfaceCache.set(key, surface);
    return surface;
  }

  /** Draws the warm stellar source before bodies so they can occult it naturally. */
  private drawStarGlow(x: number, y: number): void {
    const coreRadius = Math.max(3, Math.min(this.width, this.height) * 0.008);
    const glowRadius = coreRadius * 13;
    const glow = this.ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
    glow.addColorStop(0, 'rgba(255,250,232,0.98)');
    glow.addColorStop(0.08, 'rgba(255,232,177,0.82)');
    glow.addColorStop(0.25, 'rgba(225,167,78,0.24)');
    glow.addColorStop(1, 'rgba(90,50,10,0)');
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'lighter';
    this.ctx.fillStyle = glow;
    this.ctx.beginPath();
    this.ctx.arc(x, y, glowRadius, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  /** Draws restrained optical artifacts only while the stellar source is unobstructed. */
  private drawLensArtifacts(x: number, y: number): void {
    const coreRadius = Math.max(3, Math.min(this.width, this.height) * 0.008);
    const axisX = this.width / 2 - x;
    const axisY = this.height / 2 - y;
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'lighter';
    for (const artifact of [
      { position: 0.42, radius: coreRadius * 1.7, alpha: 0.05 },
      { position: 0.78, radius: coreRadius * 3.1, alpha: 0.03 },
    ]) {
      const flareX = x + axisX * artifact.position;
      const flareY = y + axisY * artifact.position;
      const flare = this.ctx.createRadialGradient(flareX, flareY, 0, flareX, flareY, artifact.radius);
      flare.addColorStop(0, `rgba(218,168,89,${artifact.alpha})`);
      flare.addColorStop(1, 'rgba(80,45,12,0)');
      this.ctx.fillStyle = flare;
      this.ctx.beginPath();
      this.ctx.arc(flareX, flareY, artifact.radius, 0, Math.PI * 2);
      this.ctx.fill();
    }
    this.ctx.restore();
  }

  /** Adds a very faint periodic exposure veil without moving scene objects. */
  private drawExposureVeil(cameraYaw: number): void {
    const gradient = this.ctx.createLinearGradient(0, 0, this.width, this.height);
    gradient.addColorStop(0, 'rgba(34,24,12,0.016)');
    gradient.addColorStop(0.46, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,8,10,${0.023 + Math.sin(cameraYaw) * 0.006})`);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /** Projects one world-space point through the rotating camera. */
  private projectWorldDirection(direction: Vec3, cameraYaw: number): ProjectedPoint | null {
    const azimuth = Math.atan2(direction.x, direction.z);
    const elevation = Math.asin(Math.max(-1, Math.min(1, direction.y)));
    const relativeAzimuth = wrapAngle(azimuth - cameraYaw);
    if (Math.abs(relativeAzimuth) > HORIZONTAL_FOV / 2) return null;
    return {
      x: projectPanoramaX(azimuth, cameraYaw, this.width, HORIZONTAL_FOV),
      y: this.height / 2 - elevation * this.pixelsPerRadian,
    };
  }

  /** Projects a direction on the infinite panorama through the rotating camera. */
  private projectDirection(azimuth: number, elevation: number, cameraYaw: number): ProjectedPoint | null {
    const projected = this.projectWorldDirection(sphericalDirection(azimuth, elevation), cameraYaw);
    return projected && isNearViewport(projected, this.width, this.height, 2) ? projected : null;
  }
}

/** Creates a fixed celestial body from spherical world coordinates. */
function createBody(
  kind: CelestialBody['kind'],
  azimuth: number,
  elevation: number,
  angularRadius: number,
  layer: number,
  colour: [number, number, number],
  textureSeed: number
): CelestialBody {
  return {
    kind,
    direction: sphericalDirection(azimuth, elevation),
    angularRadius,
    layer,
    colour,
    textureSeed,
    craters: kind === 'rock' ? createSurfaceCraters(textureSeed, angularRadius >= 0.15 ? 34 : 12) : [],
  };
}

/** Converts panorama azimuth and elevation into a unit celestial-sphere direction. */
function sphericalDirection(azimuth: number, elevation: number): Vec3 {
  const horizontal = Math.cos(elevation);
  return {
    x: Math.sin(azimuth) * horizontal,
    y: Math.sin(elevation),
    z: Math.cos(azimuth) * horizontal,
  };
}

/** Returns whether a projected point falls behind any nearer opaque body disc. */
function isPointOcculted(point: ProjectedPoint, bodies: readonly ProjectedBody[]): boolean {
  return bodies.some((body) => Math.hypot(point.x - body.x, point.y - body.y) <= body.radius);
}

/** Returns whether a projected point lies within a viewport plus the supplied drawing margin. */
function isNearViewport(point: ProjectedPoint, width: number, height: number, margin: number): boolean {
  return point.x >= -margin && point.x <= width + margin && point.y >= -margin && point.y <= height + margin;
}

/** Calculates illuminated fraction from body-to-sun angular separation on the celestial sphere. */
export function calculateIlluminatedFraction(
  _cameraPosition: Vec3,
  bodyDirection: Vec3,
  starDirection: Vec3
): number {
  return (1 - dot(normalize(bodyDirection), normalize(starDirection))) / 2;
}

/** Returns the sun's horizontal side in a body's projected disc; negative is screen-left. */
export function calculateSunwardScreenX(bodyDirection: Vec3, starDirection: Vec3): number {
  const viewDirection = scale(normalize(bodyDirection), -1);
  const surfaceRight = normalize(cross(viewDirection, { x: 0, y: 1, z: 0 }));
  return dot(normalize(starDirection), surfaceRight);
}

/** Samples fixed gas bands from a world-space surface normal. */
function sampleGasTexture(normal: Vec3, body: CelestialBody): [number, number, number] {
  const latitude = Math.asin(Math.max(-1, Math.min(1, normal.y)));
  const longitude = Math.atan2(normal.x, normal.z);
  const turbulence =
    Math.sin(latitude * 25 + Math.sin(longitude * 3 + body.textureSeed) * 2.2) * 0.5 +
    Math.sin(latitude * 53 - longitude * 5) * 0.23 +
    Math.sin(latitude * 13 + longitude * 2) * 0.17;
  const band = Math.sin(latitude * 19 + turbulence * 1.9);
  const pale = Math.max(0, band) * 0.52;
  const dark = Math.max(0, -band) * 0.43;
  return [
    body.colour[0] + pale * 70 - dark * 43,
    body.colour[1] + pale * 58 - dark * 36,
    body.colour[2] + pale * 43 - dark * 28,
  ];
}

/** Samples fixed rocky grain from a world-space surface normal. */
function sampleRockTexture(normal: Vec3, body: CelestialBody): [number, number, number] {
  let relief =
    Math.sin(normal.x * 31 + normal.y * 19 + body.textureSeed) * 0.09 +
    Math.sin(normal.z * 47 - normal.y * 23) * 0.055 +
    Math.sin((normal.x + normal.z) * 71) * 0.025;
  for (const crater of body.craters) {
    const angularDistance = Math.acos(Math.max(-1, Math.min(1, dot(normal, crater.center))));
    const normalizedDistance = angularDistance / crater.angularRadius;
    if (normalizedDistance >= 1.35) continue;
    if (normalizedDistance < 0.82) {
      relief -= crater.depth * (1 - normalizedDistance / 0.82);
    } else {
      const rimDistance = Math.abs(normalizedDistance - 1);
      relief += crater.depth * 0.72 * Math.max(0, 1 - rimDistance / 0.35);
    }
  }
  return [
    body.colour[0] * (1 + relief),
    body.colour[1] * (1 + relief * 0.92),
    body.colour[2] * (1 + relief * 0.8),
  ];
}

/** Creates deterministic crater centres and profiles for cached lunar-style albedo. */
function createSurfaceCraters(seed: number, count: number): SurfaceCrater[] {
  const random = createSeededRandom(`title-craters-${seed}`);
  return Array.from({ length: count }, () => {
    const azimuth = random() * Math.PI * 2;
    const elevation = Math.asin(random() * 2 - 1);
    return {
      center: sphericalDirection(azimuth, elevation),
      angularRadius: 0.025 + random() ** 2 * 0.16,
      depth: 0.04 + random() * 0.12,
    };
  });
}

/** Creates a deterministic floating-point generator for fixed panorama objects. */
function createSeededRandom(seed: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  return (): number => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Wraps one angle into the interval -PI through PI. */
function wrapAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

/** Projects fixed panorama azimuth with constant pixels-per-radian camera motion. */
export function projectPanoramaX(
  azimuth: number,
  cameraYaw: number,
  width: number,
  horizontalFov: number
): number {
  return width / 2 + wrapAngle(azimuth - cameraYaw) * (width / horizontalFov);
}

/** Estimates antialiased coverage at a sampled sphere limb. */
function sphereCoverage(radiusSq: number, diameter: number): number {
  const edgeDistancePixels = (1 - Math.sqrt(Math.max(0, radiusSq))) * (diameter / 2);
  return Math.max(0, Math.min(1, edgeDistancePixels + 0.5));
}

/** Adds two vectors. */
function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

/** Multiplies a vector by a scalar. */
function scale(vector: Vec3, amount: number): Vec3 {
  return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount };
}

/** Returns the scalar dot product of two vectors. */
function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Returns the cross product of two vectors. */
function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** Returns a vector's Euclidean length. */
function vectorLength(vector: Vec3): number {
  return Math.hypot(vector.x, vector.y, vector.z);
}

/** Returns a normalized vector. */
function normalize(vector: Vec3): Vec3 {
  const length = Math.max(0.000001, vectorLength(vector));
  return scale(vector, 1 / length);
}

/** Clamps a numeric channel to an unsigned byte. */
function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
