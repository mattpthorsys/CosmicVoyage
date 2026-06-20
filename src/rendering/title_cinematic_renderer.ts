interface CinematicStar {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  warmth: number;
  depth: number;
}

interface CinematicMoon {
  orbitRadiusX: number;
  orbitRadiusY: number;
  phase: number;
  radius: number;
  depth: number;
  colour: [number, number, number];
}

const TITLE_FRAME_INTERVAL_MS = 1000 / 30;
const TITLE_SEQUENCE_SECONDS = 84;

/** Renders the slow title-screen space reveal independently from gameplay rendering. */
export class TitleCinematicRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly planetCanvas: HTMLCanvasElement;
  private readonly planetContext: CanvasRenderingContext2D;
  private readonly stars: CinematicStar[];
  private readonly moons: CinematicMoon[];
  private animationFrameId: number | null = null;
  private startedAt = 0;
  private lastFrameAt = Number.NEGATIVE_INFINITY;
  private running = false;
  private width = 0;
  private height = 0;
  private deviceScale = 1;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /** Initializes the cinematic renderer with deterministic title-scene objects. */
  constructor(
    private readonly canvas: HTMLCanvasElement,
    seed: string
  ) {
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Unable to create title cinematic canvas context.');
    this.ctx = context;
    this.planetCanvas = document.createElement('canvas');
    const planetContext = this.planetCanvas.getContext('2d');
    if (!planetContext) throw new Error('Unable to create title planet canvas context.');
    this.planetContext = planetContext;
    const random = createSeededRandom(seed);
    this.stars = Array.from({ length: 150 }, () => ({
      x: random(),
      y: random(),
      radius: 0.35 + random() * 1.15,
      alpha: 0.12 + random() * 0.58,
      warmth: random(),
      depth: 0.2 + random() * 0.8,
    }));
    this.moons = [
      {
        orbitRadiusX: 0.52,
        orbitRadiusY: 0.12,
        phase: 0.42,
        radius: 0.034,
        depth: 0.7,
        colour: [166, 156, 137],
      },
      {
        orbitRadiusX: 0.69,
        orbitRadiusY: 0.2,
        phase: 2.84,
        radius: 0.018,
        depth: 0.45,
        colour: [132, 143, 145],
      },
      {
        orbitRadiusX: 0.82,
        orbitRadiusY: 0.27,
        phase: 4.72,
        radius: 0.012,
        depth: 0.28,
        colour: [183, 169, 141],
      },
    ];
  }

  /** Starts or resumes the cinematic animation. */
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

  /** Resizes the physical canvas while retaining CSS viewport dimensions. */
  private resize(): void {
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    this.deviceScale = Math.min(1.5, window.devicePixelRatio || 1);
    this.canvas.width = Math.floor(this.width * this.deviceScale);
    this.canvas.height = Math.floor(this.height * this.deviceScale);
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.ctx.setTransform(this.deviceScale, 0, 0, this.deviceScale, 0, 0);
  }

  /** Handles responsive viewport changes. */
  private handleResize = (): void => {
    this.resize();
  };

  /** Avoids spending title-screen CPU while the document is hidden. */
  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && this.running) {
      this.startedAt = performance.now();
      this.lastFrameAt = Number.NEGATIVE_INFINITY;
    }
  };

  /** Renders one throttled animation frame. */
  private renderFrame = (now: number): void => {
    if (!this.running) return;
    if (document.visibilityState !== 'hidden' && now - this.lastFrameAt >= TITLE_FRAME_INTERVAL_MS) {
      const elapsed = this.reducedMotion ? 26 : (now - this.startedAt) / 1000;
      this.drawScene(elapsed % TITLE_SEQUENCE_SECONDS);
      this.lastFrameAt = now;
    }
    this.animationFrameId = requestAnimationFrame(this.renderFrame);
  };

  /** Draws the complete title composition in back-to-front order. */
  private drawScene(seconds: number): void {
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.width, this.height);

    const progress = seconds / TITLE_SEQUENCE_SECONDS;
    const reveal = smoothStep(0.01, 0.28, progress);
    const cameraShift = smoothStep(0, 1, progress) * this.width * 0.075;
    const starX = this.width * 0.17 - cameraShift * 0.18;
    const starY = this.height * 0.27 + Math.sin(progress * Math.PI * 2) * this.height * 0.012;
    const planetRadius = Math.max(this.height * 0.48, this.width * 0.29);
    const planetX = this.width * (1.16 - progress * 0.22);
    const planetY = this.height * 0.67;

    this.drawStarfield(cameraShift);
    this.drawAmberLightBands(seconds, starX, starY);
    this.drawDistantGlow(starX, starY, reveal);
    this.drawMoons(seconds, planetX, planetY, planetRadius, starX, starY, true);
    this.drawGasGiant(seconds, planetX, planetY, planetRadius, starX, starY, reveal);
    this.drawMoons(seconds, planetX, planetY, planetRadius, starX, starY, false);
    this.drawStarAndFlare(seconds, starX, starY, reveal);
    this.drawExposureVeil(progress);
  }

  /** Draws deterministic stars with subtle parallax against camera motion. */
  private drawStarfield(cameraShift: number): void {
    const ctx = this.ctx;
    for (const star of this.stars) {
      const x = wrap(star.x * this.width - cameraShift * star.depth, this.width);
      const y = star.y * this.height;
      const warm = star.warmth > 0.82;
      ctx.fillStyle = warm ? `rgba(222,198,145,${star.alpha})` : `rgba(180,211,210,${star.alpha})`;
      ctx.fillRect(x, y, star.radius, star.radius);
    }
  }

  /** Draws several broad separated amber optical bands across the scene. */
  private drawAmberLightBands(seconds: number, starX: number, starY: number): void {
    const ctx = this.ctx;
    const diagonal = -0.18;
    const drift = Math.sin(seconds * 0.025) * this.width * 0.018;
    const bands = [
      { offset: -0.31, width: 0.18, alpha: 0.13 },
      { offset: -0.02, width: 0.095, alpha: 0.075 },
      { offset: 0.19, width: 0.14, alpha: 0.09 },
      { offset: 0.43, width: 0.075, alpha: 0.055 },
    ];

    ctx.save();
    ctx.translate(starX + drift, starY);
    ctx.rotate(diagonal);
    ctx.globalCompositeOperation = 'lighter';
    for (const band of bands) {
      const x = band.offset * this.width;
      const width = band.width * this.width;
      const gradient = ctx.createLinearGradient(x - width, 0, x + width, 0);
      gradient.addColorStop(0, 'rgba(24,15,5,0)');
      gradient.addColorStop(0.34, `rgba(70,43,13,${band.alpha * 0.42})`);
      gradient.addColorStop(0.5, `rgba(164,116,48,${band.alpha})`);
      gradient.addColorStop(0.66, `rgba(78,49,16,${band.alpha * 0.4})`);
      gradient.addColorStop(1, 'rgba(20,12,4,0)');
      ctx.fillStyle = gradient;
      ctx.filter = `blur(${Math.max(14, width * 0.12)}px)`;
      ctx.fillRect(x - width, -this.height, width * 2, this.height * 2.3);
    }
    ctx.restore();
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Draws the broad warm-white exposure surrounding the stellar source. */
  private drawDistantGlow(starX: number, starY: number, reveal: number): void {
    const ctx = this.ctx;
    const radius = Math.max(this.width, this.height) * 0.5;
    const glow = ctx.createRadialGradient(starX, starY, 0, starX, starY, radius);
    glow.addColorStop(0, `rgba(255,244,211,${0.12 * reveal})`);
    glow.addColorStop(0.08, `rgba(195,151,79,${0.055 * reveal})`);
    glow.addColorStop(0.34, `rgba(75,48,17,${0.022 * reveal})`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);
  }

  /** Draws the large gas giant with a star-aligned terminator and atmospheric bands. */
  private drawGasGiant(
    seconds: number,
    centerX: number,
    centerY: number,
    radius: number,
    starX: number,
    starY: number,
    reveal: number
  ): void {
    const sampleScale = 0.32;
    const diameter = Math.min(420, Math.max(64, Math.floor(radius * 2 * sampleScale)));
    if (this.planetCanvas.width !== diameter || this.planetCanvas.height !== diameter) {
      this.planetCanvas.width = diameter;
      this.planetCanvas.height = diameter;
    }
    const image = this.planetContext.createImageData(diameter, diameter);
    const pixels = image.data;
    const light = normalize3((starX - centerX) / radius, (starY - centerY) / radius, -0.52);
    const rotation = seconds * 0.014;

    for (let py = 0; py < diameter; py++) {
      const ny = (py / (diameter - 1)) * 2 - 1;
      for (let px = 0; px < diameter; px++) {
        const nx = (px / (diameter - 1)) * 2 - 1;
        const radiusSq = nx * nx + ny * ny;
        if (radiusSq > 1) continue;
        const nz = Math.sqrt(1 - radiusSq);
        const diffuse = Math.max(0, nx * light.x + ny * light.y + nz * light.z);
        const limb = Math.pow(Math.max(0, nz), 0.32);
        const atmosphere = Math.pow(1 - nz, 3.2);
        const longitude = Math.atan2(nx, nz) + rotation;
        const turbulence =
          Math.sin(ny * 39 + Math.sin(longitude * 3.2) * 2.3) * 0.5 +
          Math.sin(ny * 83 - longitude * 5.1) * 0.24 +
          Math.sin(ny * 17 + longitude * 1.7) * 0.18;
        const palette = sampleGasPalette(ny, turbulence);
        const ambient = 0.018;
        const illumination = ambient + Math.pow(diffuse, 0.78) * 0.95;
        const index = (py * diameter + px) * 4;
        pixels[index] = Math.min(255, palette[0] * illumination + atmosphere * 54 * diffuse);
        pixels[index + 1] = Math.min(255, palette[1] * illumination + atmosphere * 47 * diffuse);
        pixels[index + 2] = Math.min(255, palette[2] * illumination + atmosphere * 31 * diffuse);
        pixels[index + 3] = Math.min(255, (limb * 0.94 + atmosphere * diffuse * 0.52) * 255 * reveal);
      }
    }

    this.planetContext.putImageData(image, 0, 0);
    this.ctx.save();
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(this.planetCanvas, centerX - radius, centerY - radius, radius * 2, radius * 2);
    this.ctx.restore();
  }

  /** Draws moons either behind or in front of the giant according to orbital depth. */
  private drawMoons(
    seconds: number,
    planetX: number,
    planetY: number,
    planetRadius: number,
    starX: number,
    starY: number,
    behind: boolean
  ): void {
    for (const moon of this.moons) {
      const angle = moon.phase + seconds * (0.008 + moon.depth * 0.006);
      const z = Math.sin(angle);
      if (z < 0 !== behind) continue;
      const x = planetX + Math.cos(angle) * planetRadius * moon.orbitRadiusX;
      const y = planetY + Math.sin(angle * 0.73) * planetRadius * moon.orbitRadiusY;
      const radius = planetRadius * moon.radius * (0.82 + moon.depth * 0.25);
      this.drawLitMoon(x, y, radius, starX, starY, moon.colour, behind ? 0.58 : 0.9);
    }
  }

  /** Draws one small star-lit moon with its bright limb facing the stellar source. */
  private drawLitMoon(
    x: number,
    y: number,
    radius: number,
    starX: number,
    starY: number,
    colour: [number, number, number],
    alpha: number
  ): void {
    const dx = starX - x;
    const dy = starY - y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const highlightX = x + (dx / length) * radius * 0.45;
    const highlightY = y + (dy / length) * radius * 0.45;
    const gradient = this.ctx.createRadialGradient(highlightX, highlightY, radius * 0.08, x, y, radius);
    gradient.addColorStop(0, `rgba(${colour[0]},${colour[1]},${colour[2]},${alpha})`);
    gradient.addColorStop(0.42, `rgba(${colour[0] * 0.58},${colour[1] * 0.58},${colour[2] * 0.58},${alpha})`);
    gradient.addColorStop(0.78, `rgba(12,13,13,${alpha})`);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    this.ctx.fillStyle = gradient;
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.fill();
  }

  /** Draws the warm stellar source and restrained screen-space lens artifacts. */
  private drawStarAndFlare(seconds: number, x: number, y: number, reveal: number): void {
    const ctx = this.ctx;
    const pulse = 0.96 + Math.sin(seconds * 0.23) * 0.025;
    const coreRadius = Math.max(3, Math.min(this.width, this.height) * 0.008);
    const glowRadius = coreRadius * 12;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, glowRadius);
    glow.addColorStop(0, `rgba(255,250,232,${0.98 * reveal})`);
    glow.addColorStop(0.08, `rgba(255,232,177,${0.82 * reveal})`);
    glow.addColorStop(0.25, `rgba(225,167,78,${0.24 * reveal})`);
    glow.addColorStop(1, 'rgba(90,50,10,0)');
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, glowRadius * pulse, 0, Math.PI * 2);
    ctx.fill();

    const axisX = this.width * 0.5 - x;
    const axisY = this.height * 0.5 - y;
    for (const artifact of [
      { position: 0.42, radius: coreRadius * 1.7, alpha: 0.055 },
      { position: 0.78, radius: coreRadius * 3.1, alpha: 0.035 },
    ]) {
      const flareX = x + axisX * artifact.position;
      const flareY = y + axisY * artifact.position;
      const flare = ctx.createRadialGradient(flareX, flareY, 0, flareX, flareY, artifact.radius);
      flare.addColorStop(0, `rgba(218,168,89,${artifact.alpha * reveal})`);
      flare.addColorStop(1, 'rgba(80,45,12,0)');
      ctx.fillStyle = flare;
      ctx.beginPath();
      ctx.arc(flareX, flareY, artifact.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Adds a nearly imperceptible exposure fade to prevent a uniformly digital image. */
  private drawExposureVeil(progress: number): void {
    const gradient = this.ctx.createLinearGradient(0, 0, this.width, this.height);
    gradient.addColorStop(0, 'rgba(34,24,12,0.018)');
    gradient.addColorStop(0.46, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, `rgba(0,8,10,${0.025 + Math.sin(progress * Math.PI * 2) * 0.008})`);
    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }
}

/** Creates a deterministic floating-point generator for presentation-only title objects. */
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

/** Returns a smoothly eased value between two normalized boundaries. */
function smoothStep(start: number, end: number, value: number): number {
  const normalized = Math.max(0, Math.min(1, (value - start) / Math.max(0.0001, end - start)));
  return normalized * normalized * (3 - 2 * normalized);
}

/** Wraps one coordinate into a positive range. */
function wrap(value: number, size: number): number {
  return ((value % size) + size) % size;
}

/** Returns a normalized three-dimensional vector. */
function normalize3(x: number, y: number, z: number): { x: number; y: number; z: number } {
  const length = Math.max(0.0001, Math.hypot(x, y, z));
  return { x: x / length, y: y / length, z: z / length };
}

/** Samples a muted warm gas-giant palette from latitude and turbulent banding. */
function sampleGasPalette(latitude: number, turbulence: number): [number, number, number] {
  const band = Math.sin(latitude * 20 + turbulence * 1.8);
  const pale = Math.max(0, band) * 0.5;
  const dark = Math.max(0, -band) * 0.45;
  return [126 + pale * 72 - dark * 45, 99 + pale * 60 - dark * 39, 66 + pale * 46 - dark * 30];
}
