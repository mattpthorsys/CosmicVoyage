interface Vec3 {
  x: number;
  y: number;
  z: number;
}

interface PanoramaStar {
  azimuth: number;
  elevation: number;
  size: number;
  colour: string;
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

interface RockSurfaceSample {
  colour: [number, number, number];
  elevation: number;
}

interface PanoramaEffectSprite {
  canvas: HTMLCanvasElement;
  displayWidth: number;
  displayHeight: number;
  azimuth: number;
  elevation: number;
  angularMargin: number;
}

interface LensArtifactSprite {
  canvas: HTMLCanvasElement;
  position: number;
}

const TITLE_FRAME_INTERVAL_MS = 1000 / 60;
const TITLE_SEQUENCE_SECONDS = 96;
const HORIZONTAL_FOV = (104 * Math.PI) / 180;
const RESIZE_DEBOUNCE_MS = 140;
const DIFFUSE_EFFECT_CACHE_SCALE = 0.5;
const JOVIAN_SMALL_EDDIES = [
  [-0.88, -0.38, 0.18, 0.052, 3.1, 1],
  [-0.22, 0.34, 0.15, 0.046, -3.4, -1],
  [0.06, -0.05, 0.13, 0.04, 3.8, 1],
  [0.68, 0.08, 0.17, 0.048, -3.2, -1],
  [1.02, -0.42, 0.14, 0.044, 3.6, 1],
] as const;

/** Renders a fixed panoramic title scene viewed through one continuously rotating camera. */
export class TitleCinematicRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly stars: PanoramaStar[];
  private readonly bands: PanoramaBand[];
  private readonly nebulae: PanoramaNebula[];
  private readonly starDirection: Vec3;
  private readonly bodies: CelestialBody[];
  private readonly surfaceCache = new Map<string, CachedBodySurface>();
  private readonly bodyImageCache = new Map<string, HTMLCanvasElement>();
  private starPanoramaCanvas: HTMLCanvasElement | null = null;
  private nebulaSprites: PanoramaEffectSprite[] = [];
  private bandSprites: PanoramaEffectSprite[] = [];
  private starGlowSprite: HTMLCanvasElement | null = null;
  private lensArtifactSprites: LensArtifactSprite[] = [];
  private exposureWarmSprite: HTMLCanvasElement | null = null;
  private exposureCoolSprite: HTMLCanvasElement | null = null;
  private animationFrameId: number | null = null;
  private resizeTimer: number | null = null;
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

    const random = createSeededRandom(seed);
    this.stars = Array.from({ length: 430 }, () => {
      const azimuth = random() * Math.PI * 2;
      const elevation = (random() - 0.5) * 1.15;
      const size = random() > 0.9 ? 2 : 1;
      const alpha = 0.13 + random() * 0.56;
      const warm = random() > 0.84;
      return {
        azimuth,
        elevation,
        size,
        colour: warm ? `rgba(220,193,139,${alpha})` : `rgba(177,207,205,${alpha})`,
      };
    });
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
        alpha: 0.095,
        tilt: -0.14,
      },
      {
        azimuth: 2.08,
        elevation: -0.21,
        widthRadians: 0.32,
        heightRadians: 0.13,
        alpha: 0.064,
        tilt: 0.19,
      },
      {
        azimuth: 5.28,
        elevation: 0.27,
        widthRadians: 0.42,
        heightRadians: 0.16,
        alpha: 0.052,
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
      createBody('rock', -0.18, orbitalElevation(-0.18), 0.075 / 3, 2, [137, 143, 139], 61),
      createBody('rock', 0.42, orbitalElevation(0.42), 0.034 / 3, 3, [127, 138, 140], 41),
      createBody('rock', 1.04, orbitalElevation(1.04), 0.052 / 3, 2, [157, 145, 126], 67),
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
    if (this.reducedMotion) {
      this.drawScene(8 / TITLE_SEQUENCE_SECONDS);
      return;
    }
    this.animationFrameId = requestAnimationFrame(this.renderFrame);
  }

  /** Stops rendering and removes lifecycle listeners. */
  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);
    this.animationFrameId = null;
    if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
    this.resizeTimer = null;
    window.removeEventListener('resize', this.handleResize);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
  }

  /** Sizes the presentation canvas and recalculates the camera projection. */
  private resize(): void {
    const nextWidth = Math.max(1, window.innerWidth);
    const nextHeight = Math.max(1, window.innerHeight);
    const scale = Math.min(1.25, window.devicePixelRatio || 1);
    const physicalWidth = Math.floor(nextWidth * scale);
    const physicalHeight = Math.floor(nextHeight * scale);
    const dimensionsChanged =
      nextWidth !== this.width ||
      nextHeight !== this.height ||
      this.canvas.width !== physicalWidth ||
      this.canvas.height !== physicalHeight;
    this.width = nextWidth;
    this.height = nextHeight;
    this.canvas.width = physicalWidth;
    this.canvas.height = physicalHeight;
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(scale, 0, 0, scale, 0, 0);
    this.pixelsPerRadian = this.width / HORIZONTAL_FOV;
    if (dimensionsChanged || this.bodyImageCache.size === 0) {
      this.rebuildRenderCaches();
    }
  }

  /** Debounces viewport changes so live browser resizing does not repeatedly rebuild expensive caches. */
  private handleResize = (): void => {
    if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      this.resizeTimer = null;
      this.resize();
      if (this.reducedMotion && this.running) {
        this.drawScene(8 / TITLE_SEQUENCE_SECONDS);
      }
    }, RESIZE_DEBOUNCE_MS);
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
      const elapsed = (now - this.startedAt) / 1000;
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

    const projectedStar = this.projectWorldDirection(this.starDirection, cameraYaw, 0.12);
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
    // The amber columns are optical scattering, so they sit over the completed astronomical scene.
    this.drawPanoramaBands(cameraYaw);
    this.drawExposureVeil(cameraYaw);
  }

  /** Projects and draws fixed stars from their panorama coordinates. */
  private drawPanoramaStars(cameraYaw: number): void {
    if (!this.starPanoramaCanvas) return;
    const stripWidth = this.starPanoramaCanvas.width;
    const sourceSpan = (HORIZONTAL_FOV / (Math.PI * 2)) * stripWidth;
    const sourceStart = calculatePanoramaStripSourceStart(cameraYaw, sourceSpan, stripWidth);
    let sourceX = sourceStart;
    let destinationX = 0;
    let remainingSource = sourceSpan;

    // Copy at most two wrapped strip sections; no stars are projected or styled during normal frames.
    while (remainingSource > 0) {
      const sourceWidth = Math.min(remainingSource, stripWidth - sourceX);
      const destinationWidth = (sourceWidth / sourceSpan) * this.width;
      this.ctx.drawImage(
        this.starPanoramaCanvas,
        sourceX,
        0,
        sourceWidth,
        this.height,
        destinationX,
        0,
        destinationWidth,
        this.height
      );
      destinationX += destinationWidth;
      remainingSource -= sourceWidth;
      sourceX = 0;
    }
  }

  /** Projects fixed blue nebula wisps through the shared camera without independent drift. */
  private drawPanoramaNebulae(cameraYaw: number): void {
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'lighter';
    for (const sprite of this.nebulaSprites) {
      const projected = this.projectEffectSprite(sprite, cameraYaw);
      if (!projected) continue;
      this.ctx.drawImage(
        sprite.canvas,
        projected.x - sprite.displayWidth / 2,
        projected.y - sprite.displayHeight / 2,
        sprite.displayWidth,
        sprite.displayHeight
      );
    }
    this.ctx.restore();
  }

  /** Projects broad fixed amber panorama bands through the same camera transform. */
  private drawPanoramaBands(cameraYaw: number): void {
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'lighter';
    for (const sprite of this.bandSprites) {
      const projected = this.projectEffectSprite(sprite, cameraYaw);
      if (!projected) continue;
      this.ctx.drawImage(
        sprite.canvas,
        projected.x - sprite.displayWidth / 2,
        projected.y - sprite.displayHeight / 2,
        sprite.displayWidth,
        sprite.displayHeight
      );
    }
    this.ctx.restore();
  }

  /** Projects every fixed celestial body and rejects objects outside the camera frustum. */
  private projectBodies(cameraYaw: number): ProjectedBody[] {
    const projected: ProjectedBody[] = [];
    for (const body of this.bodies) {
      const center = this.projectWorldDirection(body.direction, cameraYaw, body.angularRadius);
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
    const sampleDiameter = Math.min(420, Math.max(64, Math.round(radius * 0.72)));
    const image = this.getCachedBodyImage(body, sampleDiameter);
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.clip();
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(image, x - radius, y - radius, radius * 2, radius * 2);
    this.ctx.restore();
  }

  /** Returns a fully lit body bitmap so per-pixel shading runs only once per viewport size. */
  private getCachedBodyImage(body: CelestialBody, sampleDiameter: number): HTMLCanvasElement {
    const key = `${body.textureSeed}:${sampleDiameter}`;
    const cached = this.bodyImageCache.get(key);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = sampleDiameter;
    canvas.height = sampleDiameter;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to create cached title body context.');
    const image = context.createImageData(sampleDiameter, sampleDiameter);
    const pixels = image.data;
    const surface = this.getCachedBodySurface(body, sampleDiameter);

    for (let pixel = 0; pixel < sampleDiameter * sampleDiameter; pixel++) {
      const coverage = surface.coverage[pixel];
      if (coverage === 0) continue;
      const normalIndex = pixel * 3;
      const diffuse = Math.max(
        0,
        surface.normals[normalIndex] * this.starDirection.x +
          surface.normals[normalIndex + 1] * this.starDirection.y +
          surface.normals[normalIndex + 2] * this.starDirection.z
      );
      const illumination = 0.008 + Math.pow(diffuse, 0.82) * 0.992;
      const colourIndex = pixel * 3;
      const outputIndex = pixel * 4;
      pixels[outputIndex] = clampByte(surface.albedo[colourIndex] * illumination);
      pixels[outputIndex + 1] = clampByte(surface.albedo[colourIndex + 1] * illumination);
      pixels[outputIndex + 2] = clampByte(surface.albedo[colourIndex + 2] * illumination);
      pixels[outputIndex + 3] = coverage;
    }

    context.putImageData(image, 0, 0);
    this.bodyImageCache.set(key, canvas);
    return canvas;
  }

  /** Returns cached world-oriented normals, coverage, and albedo for one body resolution. */
  private getCachedBodySurface(body: CelestialBody, sampleDiameter: number): CachedBodySurface {
    const key = `${body.textureSeed}:${sampleDiameter}`;
    const cached = this.surfaceCache.get(key);
    if (cached) return cached;

    const albedo = new Uint8ClampedArray(sampleDiameter * sampleDiameter * 3);
    const normals = new Float32Array(sampleDiameter * sampleDiameter * 3);
    const coverage = new Uint8ClampedArray(sampleDiameter * sampleDiameter);
    const elevations = body.kind === 'rock' ? new Float32Array(sampleDiameter * sampleDiameter) : null;
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
        const pixel = py * sampleDiameter + px;
        const index = pixel * 3;
        normals[index] = normal.x;
        normals[index + 1] = normal.y;
        normals[index + 2] = normal.z;
        if (body.kind === 'gas') {
          const colour = sampleGasTexture(normal, body);
          albedo[index] = clampByte(colour[0]);
          albedo[index + 1] = clampByte(colour[1]);
          albedo[index + 2] = clampByte(colour[2]);
        } else {
          const rock = sampleRockSurface(normal, body);
          albedo[index] = clampByte(rock.colour[0]);
          albedo[index + 1] = clampByte(rock.colour[1]);
          albedo[index + 2] = clampByte(rock.colour[2]);
          elevations![pixel] = rock.elevation;
        }
        coverage[pixel] = sphereCoverage(radiusSq, sampleDiameter) * 255;
      }
    }

    if (elevations) {
      applyTerrainNormals(normals, elevations, coverage, sampleDiameter, surfaceRight, surfaceUp);
    }

    const surface = { albedo, normals, coverage };
    this.surfaceCache.set(key, surface);
    return surface;
  }

  /** Rebuilds all resolution-dependent sprites once after a settled viewport change. */
  private rebuildRenderCaches(): void {
    this.surfaceCache.clear();
    this.bodyImageCache.clear();
    this.starPanoramaCanvas = this.createStarPanorama();
    this.nebulaSprites = this.nebulae.map((nebula) => this.createNebulaSprite(nebula));
    this.bandSprites = this.bands.map((band) => this.createBandSprite(band));
    this.starGlowSprite = this.createStarGlowSprite();
    this.lensArtifactSprites = [
      { position: 0.42, canvas: this.createLensArtifactSprite(1.7, 0.05) },
      { position: 0.78, canvas: this.createLensArtifactSprite(3.1, 0.03) },
    ];
    [this.exposureWarmSprite, this.exposureCoolSprite] = this.createExposureSprites();

    // Prewarm every fixed body so none can cause a generation hitch when entering the viewport.
    for (const body of this.bodies) {
      const radius = body.angularRadius * this.pixelsPerRadian;
      const sampleDiameter = Math.min(420, Math.max(64, Math.round(radius * 0.72)));
      this.getCachedBodyImage(body, sampleDiameter);
    }
  }

  /** Bakes every fixed star into one cylindrical strip reused by all animation frames. */
  private createStarPanorama(): HTMLCanvasElement {
    const stripWidth = Math.max(1, Math.round(Math.PI * 2 * this.pixelsPerRadian));
    const canvas = createCanvas(stripWidth, this.height);
    const context = getCanvasContext(canvas, 'cached title star panorama');
    for (const star of this.stars) {
      const x = Math.round((positiveModulo(star.azimuth, Math.PI * 2) / (Math.PI * 2)) * stripWidth);
      const y = Math.round(this.height / 2 - star.elevation * this.pixelsPerRadian);
      if (y + star.size < 0 || y > this.height) continue;
      context.fillStyle = star.colour;
      context.fillRect(x, y, star.size, star.size);
      if (x + star.size > stripWidth) {
        context.fillRect(x - stripWidth, y, star.size, star.size);
      }
    }
    return canvas;
  }

  /** Creates one pre-blurred blue nebula sprite at the current panorama scale. */
  private createNebulaSprite(nebula: PanoramaNebula): PanoramaEffectSprite {
    const width = Math.max(40, nebula.widthRadians * this.pixelsPerRadian);
    const height = Math.max(18, nebula.heightRadians * this.pixelsPerRadian);
    const blur = Math.max(7, width * 0.045);
    const rectWidth = width * 2;
    const rectHeight = height * 2;
    const cosine = Math.abs(Math.cos(nebula.tilt));
    const sine = Math.abs(Math.sin(nebula.tilt));
    const displayWidth = rectWidth * cosine + rectHeight * sine + blur * 6;
    const displayHeight = rectWidth * sine + rectHeight * cosine + blur * 6;
    const canvas = createCanvas(
      Math.ceil(displayWidth * DIFFUSE_EFFECT_CACHE_SCALE),
      Math.ceil(displayHeight * DIFFUSE_EFFECT_CACHE_SCALE)
    );
    const context = getCanvasContext(canvas, 'cached title nebula');
    context.scale(DIFFUSE_EFFECT_CACHE_SCALE, DIFFUSE_EFFECT_CACHE_SCALE);
    context.translate(displayWidth / 2, displayHeight / 2);
    context.rotate(nebula.tilt);
    context.scale(1, height / width);
    const glow = context.createRadialGradient(0, 0, width * 0.06, 0, 0, width);
    glow.addColorStop(0, `rgba(68,113,132,${nebula.alpha})`);
    glow.addColorStop(0.36, `rgba(32,79,103,${nebula.alpha * 0.62})`);
    glow.addColorStop(0.72, `rgba(18,53,74,${nebula.alpha * 0.24})`);
    glow.addColorStop(1, 'rgba(5,20,31,0)');
    context.fillStyle = glow;
    context.filter = `blur(${blur * DIFFUSE_EFFECT_CACHE_SCALE}px)`;
    context.beginPath();
    context.arc(0, 0, width, 0, Math.PI * 2);
    context.fill();
    return {
      canvas,
      displayWidth,
      displayHeight,
      azimuth: nebula.azimuth,
      elevation: nebula.elevation,
      angularMargin: displayWidth / (2 * this.pixelsPerRadian),
    };
  }

  /** Creates one pre-blurred amber optical band covering the current viewport height. */
  private createBandSprite(band: PanoramaBand): PanoramaEffectSprite {
    const width = Math.max(18, band.widthRadians * this.pixelsPerRadian);
    const blur = Math.max(10, width * 0.1);
    const rectWidth = width * 2;
    const rectHeight = this.height * 2;
    const cosine = Math.abs(Math.cos(band.tilt));
    const sine = Math.abs(Math.sin(band.tilt));
    const displayWidth = rectWidth * cosine + rectHeight * sine + blur * 6;
    const displayHeight = rectWidth * sine + rectHeight * cosine + blur * 6;
    const canvas = createCanvas(
      Math.ceil(displayWidth * DIFFUSE_EFFECT_CACHE_SCALE),
      Math.ceil(displayHeight * DIFFUSE_EFFECT_CACHE_SCALE)
    );
    const context = getCanvasContext(canvas, 'cached title optical band');
    context.scale(DIFFUSE_EFFECT_CACHE_SCALE, DIFFUSE_EFFECT_CACHE_SCALE);
    context.translate(displayWidth / 2, displayHeight / 2);
    context.rotate(band.tilt);
    const gradient = context.createLinearGradient(-width, 0, width, 0);
    gradient.addColorStop(0, 'rgba(26,16,5,0)');
    gradient.addColorStop(0.33, `rgba(75,46,14,${band.alpha * 0.36})`);
    gradient.addColorStop(0.5, `rgba(164,116,48,${band.alpha})`);
    gradient.addColorStop(0.67, `rgba(75,46,14,${band.alpha * 0.34})`);
    gradient.addColorStop(1, 'rgba(26,16,5,0)');
    context.fillStyle = gradient;
    context.filter = `blur(${blur * DIFFUSE_EFFECT_CACHE_SCALE}px)`;
    context.fillRect(-width, -this.height, width * 2, this.height * 2);
    return {
      canvas,
      displayWidth,
      displayHeight,
      azimuth: band.azimuth,
      elevation: 0,
      angularMargin: displayWidth / (2 * this.pixelsPerRadian),
    };
  }

  /** Creates the fixed warm stellar core and haze bitmap. */
  private createStarGlowSprite(): HTMLCanvasElement {
    const coreRadius = Math.max(3, Math.min(this.width, this.height) * 0.008);
    const glowRadius = coreRadius * 13;
    const canvas = createCanvas(Math.ceil(glowRadius * 2), Math.ceil(glowRadius * 2));
    const context = getCanvasContext(canvas, 'cached title star glow');
    const center = canvas.width / 2;
    const glow = context.createRadialGradient(center, center, 0, center, center, glowRadius);
    glow.addColorStop(0, 'rgba(255,250,232,0.98)');
    glow.addColorStop(0.08, 'rgba(255,232,177,0.82)');
    glow.addColorStop(0.25, 'rgba(225,167,78,0.24)');
    glow.addColorStop(1, 'rgba(90,50,10,0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(center, center, glowRadius, 0, Math.PI * 2);
    context.fill();
    return canvas;
  }

  /** Creates one cached radial lens artifact bitmap. */
  private createLensArtifactSprite(radiusMultiplier: number, alpha: number): HTMLCanvasElement {
    const coreRadius = Math.max(3, Math.min(this.width, this.height) * 0.008);
    const radius = coreRadius * radiusMultiplier;
    const canvas = createCanvas(Math.ceil(radius * 2), Math.ceil(radius * 2));
    const context = getCanvasContext(canvas, 'cached title lens artifact');
    const center = canvas.width / 2;
    const flare = context.createRadialGradient(center, center, 0, center, center, radius);
    flare.addColorStop(0, `rgba(218,168,89,${alpha})`);
    flare.addColorStop(1, 'rgba(80,45,12,0)');
    context.fillStyle = flare;
    context.beginPath();
    context.arc(center, center, radius, 0, Math.PI * 2);
    context.fill();
    return canvas;
  }

  /** Creates low-resolution full-screen exposure gradients for cheap per-frame compositing. */
  private createExposureSprites(): [HTMLCanvasElement, HTMLCanvasElement] {
    const scale = 0.25;
    const width = Math.max(1, Math.ceil(this.width * scale));
    const height = Math.max(1, Math.ceil(this.height * scale));
    const warm = createCanvas(width, height);
    const warmContext = getCanvasContext(warm, 'cached title warm exposure');
    const warmGradient = warmContext.createLinearGradient(0, 0, width, height);
    warmGradient.addColorStop(0, 'rgba(34,24,12,0.016)');
    warmGradient.addColorStop(0.46, 'rgba(0,0,0,0)');
    warmGradient.addColorStop(1, 'rgba(0,0,0,0)');
    warmContext.fillStyle = warmGradient;
    warmContext.fillRect(0, 0, width, height);

    const cool = createCanvas(width, height);
    const coolContext = getCanvasContext(cool, 'cached title cool exposure');
    const coolGradient = coolContext.createLinearGradient(0, 0, width, height);
    coolGradient.addColorStop(0, 'rgba(0,0,0,0)');
    coolGradient.addColorStop(0.46, 'rgba(0,0,0,0)');
    coolGradient.addColorStop(1, 'rgba(0,8,10,1)');
    coolContext.fillStyle = coolGradient;
    coolContext.fillRect(0, 0, width, height);
    return [warm, cool];
  }

  /** Projects one cached panorama effect without regenerating its gradient or blur. */
  private projectEffectSprite(sprite: PanoramaEffectSprite, cameraYaw: number): ProjectedPoint | null {
    const relativeAzimuth = wrapAngle(sprite.azimuth - cameraYaw);
    if (!isPanoramaDiscVisible(relativeAzimuth, sprite.angularMargin, HORIZONTAL_FOV)) return null;
    return {
      x: this.width / 2 + relativeAzimuth * this.pixelsPerRadian,
      y: this.height / 2 - sprite.elevation * this.pixelsPerRadian,
    };
  }

  /** Draws the cached warm stellar source before bodies so they can occult it naturally. */
  private drawStarGlow(x: number, y: number): void {
    if (!this.starGlowSprite) return;
    this.ctx.save();
    // Source-over keeps this atmospheric haze beneath the later additive foreground beams.
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(
      this.starGlowSprite,
      x - this.starGlowSprite.width / 2,
      y - this.starGlowSprite.height / 2
    );
    this.ctx.restore();
  }

  /** Draws restrained optical artifacts only while the stellar source is unobstructed. */
  private drawLensArtifacts(x: number, y: number): void {
    const axisX = this.width / 2 - x;
    const axisY = this.height / 2 - y;
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'lighter';
    for (const artifact of this.lensArtifactSprites) {
      const flareX = x + axisX * artifact.position;
      const flareY = y + axisY * artifact.position;
      this.ctx.drawImage(
        artifact.canvas,
        flareX - artifact.canvas.width / 2,
        flareY - artifact.canvas.height / 2
      );
    }
    this.ctx.restore();
  }

  /** Adds a very faint periodic exposure veil without moving scene objects. */
  private drawExposureVeil(cameraYaw: number): void {
    if (!this.exposureWarmSprite || !this.exposureCoolSprite) return;
    this.ctx.drawImage(this.exposureWarmSprite, 0, 0, this.width, this.height);
    this.ctx.save();
    this.ctx.globalAlpha = 0.023 + Math.sin(cameraYaw) * 0.006;
    this.ctx.drawImage(this.exposureCoolSprite, 0, 0, this.width, this.height);
    this.ctx.restore();
  }

  /** Projects one world-space point through the rotating camera. */
  private projectWorldDirection(
    direction: Vec3,
    cameraYaw: number,
    angularMargin: number = 0
  ): ProjectedPoint | null {
    const azimuth = Math.atan2(direction.x, direction.z);
    const elevation = Math.asin(Math.max(-1, Math.min(1, direction.y)));
    const relativeAzimuth = wrapAngle(azimuth - cameraYaw);
    if (!isPanoramaDiscVisible(relativeAzimuth, angularMargin, HORIZONTAL_FOV)) return null;
    return {
      x: projectPanoramaX(azimuth, cameraYaw, this.width, HORIZONTAL_FOV),
      y: this.height / 2 - elevation * this.pixelsPerRadian,
    };
  }
}

/** Creates an offscreen canvas with valid positive integer dimensions. */
function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

/** Returns a required 2D context for one cached title-rendering canvas. */
function getCanvasContext(canvas: HTMLCanvasElement, purpose: string): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error(`Unable to create ${purpose} context.`);
  return context;
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
  const facingLongitude = Math.atan2(-body.direction.x, -body.direction.z);
  const greatStormLongitude = wrapAngle(facingLongitude + 0.38);
  const lesserStormLongitude = wrapAngle(facingLongitude - 0.52);
  const paleStormLongitude = wrapAngle(facingLongitude + 0.82);
  const broadFlow = valueNoise3d(normal, 3.4, body.textureSeed + 211) - 0.5;
  const mediumFlow = valueNoise3d(normal, 8.5, body.textureSeed + 307) - 0.5;
  const fineFlow = valueNoise3d(normal, 21, body.textureSeed + 419) - 0.5;
  // Jupiter-like polar convolution is confined to the extreme high latitudes.
  const polarAmount = smoothUnit((Math.abs(latitude) - 0.96) / 0.34);
  const globalFlowWarp =
    broadFlow * 0.12 +
    mediumFlow * 0.045 +
    Math.sin(longitude * 5 + broadFlow * 7 + latitude * 3) * 0.018 +
    polarAmount * (broadFlow * 0.1 + mediumFlow * 0.06);
  const bandWarp =
    jovianBandWarp(longitude, latitude, greatStormLongitude, -0.22, 0.72, 0.25, 0.17) +
    jovianBandWarp(longitude, latitude, lesserStormLongitude, 0.2, 0.38, 0.13, -0.065) +
    jovianBandWarp(longitude, latitude, paleStormLongitude, 0.37, 0.29, 0.1, 0.04);
  const warpedLatitude = latitude + bandWarp + globalFlowWarp;
  const broadBand = Math.sin(warpedLatitude * 20);
  const narrowBand = Math.sin(warpedLatitude * 47) * 0.23;
  const filament =
    Math.sin(warpedLatitude * 103 + mediumFlow * 5) * 0.085 +
    Math.sin(warpedLatitude * 181 - longitude * 3 + fineFlow * 7) * 0.05;
  const fineStreaks =
    Math.sin(warpedLatitude * 246 + longitude * 8 + fineFlow * 10) * 0.56 +
    Math.sin(warpedLatitude * 377 - longitude * 13 + mediumFlow * 8) * 0.3 +
    Math.sin(warpedLatitude * 613 + longitude * 21 + broadFlow * 13) * 0.14;
  const streakEnvelope = 0.35 + Math.abs(narrowBand) * 0.65;
  const streakDetail = fineStreaks * streakEnvelope;
  const longitudinalTexture =
    Math.sin(longitude * 7 + body.textureSeed) * 0.035 +
    Math.sin(longitude * 17 - body.textureSeed * 0.7) * 0.018 +
    broadFlow * 0.08 +
    mediumFlow * 0.035;
  const equatorialCream = gaussian(latitude, 0.015, 0.095);
  const northernOchre = gaussian(latitude, 0.18, 0.075);
  const southernRust = gaussian(latitude, -0.25, 0.085);
  const northTemperateBelt = gaussian(latitude, 0.28, 0.09);
  const southEquatorialBelt = gaussian(latitude, -0.13, 0.075);
  const northernSootBelt =
    gaussian(latitude, 0.39, 0.055) * (0.82 + Math.sin(longitude * 5.5 + body.textureSeed * 0.3) * 0.13);
  const southernSootBelt =
    gaussian(latitude, -0.46, 0.07) * (0.78 + Math.sin(longitude * 4.2 - body.textureSeed * 0.2) * 0.11);
  const polarConvolution = jovianPolarWeather(longitude, latitude, broadFlow, mediumFlow, polarAmount);
  const polarDarkening = Math.pow(Math.abs(normal.y), 2.6) * 0.19 + polarAmount * 0.08;
  const pale = Math.max(0, broadBand + narrowBand + filament) * 0.46;
  const dark =
    Math.max(0, -(broadBand + narrowBand * 0.7)) * 0.39 +
    northTemperateBelt * 0.11 +
    southEquatorialBelt * 0.16 +
    northernSootBelt * 0.31 +
    southernSootBelt * 0.25 +
    polarDarkening;
  const greatOval = jovianStorm(longitude, latitude, greatStormLongitude, -0.22, 0.5, 0.16, 3.4);
  const lesserOval = jovianStorm(longitude, latitude, lesserStormLongitude, 0.2, 0.31, 0.095, -2.1);
  const paleVortex = jovianStorm(longitude, latitude, paleStormLongitude, 0.37, 0.23, 0.075, 2.7);
  const smallEddies = sampleJovianEddies(longitude, latitude, facingLongitude);
  const stormLift = greatOval.envelope * 0.82 + lesserOval.envelope * 0.3 + paleVortex.envelope * 0.19;
  const stormWarmth =
    greatOval.envelope * 0.75 + greatOval.swirl * 0.48 + lesserOval.swirl * 0.08 - paleVortex.envelope * 0.12;
  const stormShadow = greatOval.ring * 0.42 + lesserOval.ring * 0.1 + paleVortex.ring * 0.07;
  const stormCloudLanes =
    greatOval.lanes * 0.78 + lesserOval.lanes * 0.22 + paleVortex.lanes * 0.14 + smallEddies.lanes;
  const atmosphericMix = broadFlow * 0.45 + mediumFlow * 0.28 + fineFlow * 0.12;
  const beltRed = northernOchre * 18 + southernRust * 31 + equatorialCream * 12;
  const beltGreen = northernOchre * 8 + southernRust * 5 + equatorialCream * 18;
  const beltBlue = northernOchre * -5 + southernRust * -10 + equatorialCream * 15;
  return [
    body.colour[0] +
      pale * 68 -
      dark * 55 +
      longitudinalTexture * 72 +
      beltRed +
      stormLift * 42 +
      stormWarmth * 36 -
      stormShadow * 28 +
      stormCloudLanes * 34 +
      streakDetail * 18 +
      atmosphericMix * 17 +
      polarConvolution * 30 +
      smallEddies.contrast * 25,
    body.colour[1] +
      pale * 56 -
      dark * 48 +
      longitudinalTexture * 48 +
      beltGreen +
      stormLift * 25 +
      stormWarmth * 12 -
      stormShadow * 31 +
      stormCloudLanes * 24 +
      streakDetail * 13 +
      atmosphericMix * 11 +
      polarConvolution * 18 +
      smallEddies.contrast * 16,
    body.colour[2] +
      pale * 39 -
      dark * 37 +
      longitudinalTexture * 29 +
      beltBlue +
      stormLift * 13 -
      stormWarmth * 8 -
      stormShadow * 22 +
      stormCloudLanes * 13 +
      streakDetail * 8 +
      atmosphericMix * 7 +
      polarConvolution * 10 +
      smallEddies.contrast * 8,
  ];
}

/** Returns a normalized Gaussian profile around one scalar centre. */
function gaussian(value: number, center: number, width: number): number {
  const normalized = (value - center) / Math.max(0.0001, width);
  return Math.exp(-normalized * normalized);
}

/** Smoothly clamps a normalized scalar for weather-region envelopes. */
function smoothUnit(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

/** Builds tangled high-latitude cloud lanes suggestive of Jupiter's convoluted polar weather. */
function jovianPolarWeather(
  longitude: number,
  latitude: number,
  broadFlow: number,
  mediumFlow: number,
  polarAmount: number
): number {
  if (polarAmount <= 0) return 0;
  const poleDistance = Math.PI / 2 - Math.abs(latitude);
  const hemisphere = latitude >= 0 ? 1 : -1;
  const curledLane =
    Math.sin(longitude * 7 * hemisphere + poleDistance * 31 + broadFlow * 9) * 0.58 +
    Math.sin(longitude * 13 * hemisphere - poleDistance * 47 + mediumFlow * 11) * 0.3 +
    Math.sin(longitude * 19 + poleDistance * 71 + (broadFlow - mediumFlow) * 8) * 0.12;
  return curledLane * polarAmount;
}

/** Combines several small alternating vortices distributed through the temperate belts. */
function sampleJovianEddies(
  longitude: number,
  latitude: number,
  facingLongitude: number
): { lanes: number; contrast: number } {
  let lanes = 0;
  let contrast = 0;
  for (const [
    longitudeOffset,
    centerLatitude,
    longitudeRadius,
    latitudeRadius,
    winding,
    direction,
  ] of JOVIAN_SMALL_EDDIES) {
    const eddy = jovianStorm(
      longitude,
      latitude,
      wrapAngle(facingLongitude + longitudeOffset),
      centerLatitude,
      longitudeRadius,
      latitudeRadius,
      winding
    );
    lanes += eddy.lanes * 0.22;
    contrast += (eddy.ring * -0.34 + eddy.envelope * 0.18) * direction;
  }
  return { lanes, contrast };
}

/** Bends nearby horizontal belts around one elliptical circulation system. */
function jovianBandWarp(
  longitude: number,
  latitude: number,
  centerLongitude: number,
  centerLatitude: number,
  longitudeRadius: number,
  latitudeRadius: number,
  strength: number
): number {
  const longitudeDistance = wrapAngle(longitude - centerLongitude) / longitudeRadius;
  const latitudeDistance = (latitude - centerLatitude) / latitudeRadius;
  const distanceSq = longitudeDistance * longitudeDistance + latitudeDistance * latitudeDistance;
  if (distanceSq >= 1) return 0;

  // Tangential flow lifts one side of a belt and lowers the other, creating a Jovian curl.
  const envelope = (1 - distanceSq) ** 2;
  const circulation = longitudeDistance * envelope;
  const spiralRipple =
    Math.sin(Math.atan2(latitudeDistance, longitudeDistance) * 2 + Math.sqrt(distanceSq) * Math.PI * 3) *
    envelope *
    0.22;
  return strength * (circulation + spiralRipple);
}

/** Returns one horizontally elongated deterministic Jovian storm with curved internal cloud lanes. */
function jovianStorm(
  longitude: number,
  latitude: number,
  centerLongitude: number,
  centerLatitude: number,
  longitudeRadius: number,
  latitudeRadius: number,
  winding: number
): { envelope: number; swirl: number; ring: number; lanes: number } {
  const longitudeDistance = wrapAngle(longitude - centerLongitude) / longitudeRadius;
  const latitudeDistance = (latitude - centerLatitude) / latitudeRadius;
  const distanceSq = longitudeDistance * longitudeDistance + latitudeDistance * latitudeDistance;
  if (distanceSq >= 1) return { envelope: 0, swirl: 0, ring: 0, lanes: 0 };
  const radius = Math.sqrt(distanceSq);
  const edge = 1 - distanceSq;
  const envelope = edge * edge;
  const angle = Math.atan2(latitudeDistance, longitudeDistance);
  const spiralLane = Math.sin(angle * 2 + radius * winding * Math.PI);
  const secondaryLane = Math.sin(angle * 3 - radius * winding * Math.PI * 1.35);
  const eye = gaussian(radius, 0, 0.2);
  const ring = gaussian(radius, 0.58, 0.16) * envelope;
  return {
    envelope: envelope * (0.82 + spiralLane * 0.18),
    swirl: spiralLane * envelope * (1 - eye),
    ring,
    lanes: (spiralLane * 0.72 + secondaryLane * 0.28) * envelope * (1 - eye * 0.7),
  };
}

/** Samples fixed rocky colour and radial elevation from a world-space surface normal. */
function sampleRockSurface(normal: Vec3, body: CelestialBody): RockSurfaceSample {
  const broadTerrain = fractalRockNoise(normal, body.textureSeed);
  const maria = Math.max(0, valueNoise3d(normal, 3.2, body.textureSeed + 41) - 0.58) * -0.42;
  const fineTerrain = valueNoise3d(normal, 34, body.textureSeed + 113) - 0.5;
  let albedoRelief = broadTerrain * 0.24 + maria + fineTerrain * 0.12;
  let elevation = broadTerrain * 0.018 + fineTerrain * 0.003;
  for (const crater of body.craters) {
    const angularDistance = Math.acos(Math.max(-1, Math.min(1, dot(normal, crater.center))));
    const normalizedDistance = angularDistance / crater.angularRadius;
    if (normalizedDistance >= 1.35) continue;
    if (normalizedDistance < 0.82) {
      const bowl = 1 - normalizedDistance / 0.82;
      albedoRelief -= crater.depth * bowl;
      elevation -= crater.depth * 0.075 * bowl;
    } else {
      const rimDistance = Math.abs(normalizedDistance - 1);
      const rim = Math.max(0, 1 - rimDistance / 0.35);
      albedoRelief += crater.depth * 0.72 * rim;
      elevation += crater.depth * 0.045 * rim;
      if (normalizedDistance < 1.28) {
        const ray = Math.abs(
          Math.sin(Math.atan2(normal.y - crater.center.y, normal.x - crater.center.x) * 9)
        );
        albedoRelief += crater.depth * 0.08 * ray * (1 - (normalizedDistance - 0.82) / 0.46);
      }
    }
  }
  return {
    colour: [
      body.colour[0] * (1 + albedoRelief),
      body.colour[1] * (1 + albedoRelief * 0.92),
      body.colour[2] * (1 + albedoRelief * 0.8),
    ],
    elevation,
  };
}

/** Perturbs cached spherical normals from neighbouring lunar elevation samples. */
function applyTerrainNormals(
  normals: Float32Array,
  elevations: Float32Array,
  coverage: Uint8ClampedArray,
  diameter: number,
  surfaceRight: Vec3,
  surfaceUp: Vec3
): void {
  const coordinateStep = 2 / (diameter - 1);
  for (let py = 1; py < diameter - 1; py++) {
    for (let px = 1; px < diameter - 1; px++) {
      const pixel = py * diameter + px;
      const left = pixel - 1;
      const right = pixel + 1;
      const above = pixel - diameter;
      const below = pixel + diameter;
      if (
        coverage[pixel] === 0 ||
        coverage[left] === 0 ||
        coverage[right] === 0 ||
        coverage[above] === 0 ||
        coverage[below] === 0
      ) {
        continue;
      }
      const slopeX = (elevations[right] - elevations[left]) / (2 * coordinateStep);
      const slopeY = (elevations[below] - elevations[above]) / (2 * coordinateStep);
      const index = pixel * 3;
      const sphericalNormal = {
        x: normals[index],
        y: normals[index + 1],
        z: normals[index + 2],
      };
      const terrainNormal = normalize(
        add(sphericalNormal, add(scale(surfaceRight, -slopeX), scale(surfaceUp, slopeY)))
      );
      normals[index] = terrainNormal.x;
      normals[index + 1] = terrainNormal.y;
      normals[index + 2] = terrainNormal.z;
    }
  }
}

/** Builds direction-neutral multi-scale rocky terrain without latitude or diagonal sine bands. */
function fractalRockNoise(normal: Vec3, seed: number): number {
  const broad = valueNoise3d(normal, 4.5, seed) - 0.5;
  const medium = valueNoise3d(normal, 11, seed + 17) - 0.5;
  const fine = valueNoise3d(normal, 24, seed + 31) - 0.5;
  return broad + medium * 0.52 + fine * 0.24;
}

/** Samples smoothly interpolated deterministic value noise in three dimensions. */
function valueNoise3d(point: Vec3, frequency: number, seed: number): number {
  const x = point.x * frequency;
  const y = point.y * frequency;
  const z = point.z * frequency;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = smoothNoiseStep(x - x0);
  const ty = smoothNoiseStep(y - y0);
  const tz = smoothNoiseStep(z - z0);
  const x00 = lerp(latticeNoise(x0, y0, z0, seed), latticeNoise(x0 + 1, y0, z0, seed), tx);
  const x10 = lerp(latticeNoise(x0, y0 + 1, z0, seed), latticeNoise(x0 + 1, y0 + 1, z0, seed), tx);
  const x01 = lerp(latticeNoise(x0, y0, z0 + 1, seed), latticeNoise(x0 + 1, y0, z0 + 1, seed), tx);
  const x11 = lerp(latticeNoise(x0, y0 + 1, z0 + 1, seed), latticeNoise(x0 + 1, y0 + 1, z0 + 1, seed), tx);
  return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz);
}

/** Produces a stable unit value for one integer noise-lattice coordinate. */
function latticeNoise(x: number, y: number, z: number, seed: number): number {
  let value = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 2147483647);
  value = Math.imul(value ^ Math.trunc(seed * 1013), 1274126177);
  value ^= value >>> 16;
  return (value >>> 0) / 4294967295;
}

/** Applies a cubic interpolation curve to one normalized noise coordinate. */
function smoothNoiseStep(value: number): number {
  return value * value * (3 - 2 * value);
}

/** Linearly interpolates between two scalar values. */
function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
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

/** Wraps a scalar into a positive zero-to-modulus interval. */
function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** Returns the wrapped source offset for a camera-centred cylindrical panorama slice. */
export function calculatePanoramaStripSourceStart(
  cameraYaw: number,
  sourceSpan: number,
  stripWidth: number
): number {
  const cameraCenter = (positiveModulo(cameraYaw, Math.PI * 2) / (Math.PI * 2)) * stripWidth;
  return positiveModulo(cameraCenter - sourceSpan / 2, stripWidth);
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

/** Returns whether any portion of an angular disc intersects the camera's horizontal panorama view. */
export function isPanoramaDiscVisible(
  relativeAzimuth: number,
  angularRadius: number,
  horizontalFov: number
): boolean {
  return Math.abs(wrapAngle(relativeAzimuth)) <= horizontalFov / 2 + angularRadius;
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
