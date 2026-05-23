import { CONFIG } from '../config';
import { AU_IN_METERS, PLANET_TYPES, SPECTRAL_TYPES } from '../constants';
import { GameState } from '../core/game_state_manager';
import { Player } from '../core/player';
import { SystemDataGenerator } from '../generation/system_data_generator';
import { Planet } from '../entities/planet';
import { SolarSystem } from '../entities/solar_system';
import { Starbase } from '../entities/starbase';

interface OverlayContext {
  state: GameState;
  player: Player;
  system: SolarSystem | null;
  planet: Planet | null;
  starbase: Starbase | null;
  viewScale: number;
}

interface OverlayItem {
  state: GameState;
  lines: string[];
  x: number;
  y: number;
  targetX?: number;
  targetY?: number;
  color: string;
  createdAt: number;
  typedChars: number;
  durationMs: number;
}

interface CameraState {
  state: GameState;
  x: number;
  y: number;
  viewScale: number;
}

export class AstrometricOverlay {
  private readonly systemDataGenerator: SystemDataGenerator;
  private readonly items: OverlayItem[] = [];
  private readonly fontScale = 0.86;
  private lastEmitAt = 0;
  private lastCamera: CameraState | null = null;

  constructor(systemDataGenerator: SystemDataGenerator) {
    this.systemDataGenerator = systemDataGenerator;
  }

  update(context: OverlayContext, deltaTime: number, cols: number, rows: number): void {
    const now = performance.now();
    this.shiftWithCamera(context);
    for (const item of this.items) {
      item.typedChars += CONFIG.ASTROMETRIC_OVERLAY_TYPE_SPEED * deltaTime;
    }

    for (let i = this.items.length - 1; i >= 0; i--) {
      if (now - this.items[i].createdAt > this.items[i].durationMs + CONFIG.ASTROMETRIC_OVERLAY_FADE_MS) {
        this.items.splice(i, 1);
      }
    }

    if (now - this.lastEmitAt < this.getEmitInterval(context.state) || this.items.length >= this.getMaxItems(context.state)) {
      return;
    }

    const item = this.createItem(context, cols, rows, now);
    if (item) {
      this.items.push(this.placeItem(item, cols, rows));
      this.lastEmitAt = now;
    }
  }

  render(ctx: CanvasRenderingContext2D, charWidth: number, charHeight: number): void {
    if (charWidth <= 0 || charHeight <= 0) return;

    const now = performance.now();
    ctx.save();
    ctx.font = `${charHeight * this.fontScale}px ${CONFIG.THIN_FONT_FAMILY}`;
    ctx.textBaseline = 'top';
    ctx.shadowColor = '#00FF66';
    ctx.shadowBlur = 5;

    for (const item of this.items) {
      const age = now - item.createdAt;
      const fadeStart = item.durationMs;
      const alpha = age <= fadeStart ? 0.88 : Math.max(0, 0.88 * (1 - (age - fadeStart) / CONFIG.ASTROMETRIC_OVERLAY_FADE_MS));
      if (alpha <= 0) continue;

      ctx.globalAlpha = alpha;
      const text = item.lines.join('\n');
      const visibleText = this.takeVisibleChars(text, Math.floor(item.typedChars));
      const visibleLines = visibleText.split('\n');

      this.drawConnector(ctx, item, visibleLines, charWidth, charHeight);

      visibleLines.forEach((line, row) => {
        ctx.fillStyle = row === 0 ? '#00CCAA' : item.color;
        ctx.fillText(line, item.x * charWidth, (item.y + row) * charHeight);
      });
    }

    ctx.restore();
  }

  private createItem(context: OverlayContext, cols: number, rows: number, now: number): OverlayItem | null {
    switch (context.state) {
      case 'hyperspace':
        return this.createHyperspaceItem(context, cols, rows, now);
      case 'system':
        return this.createSystemItem(context, cols, rows, now);
      case 'planet':
        return this.createPlanetItem(context, cols, rows, now);
      case 'starbase':
        return null;
      default:
        return null;
    }
  }

  private createHyperspaceItem(context: OverlayContext, cols: number, rows: number, now: number): OverlayItem | null {
    const player = context.player;
    const contact = this.findNearestHyperspaceContact(player.position.worldX, player.position.worldY, 5);
    const x = Math.max(1, Math.floor(cols * 0.58));
    const y = Math.max(1, Math.floor(rows * 0.16));

    if (contact) {
      const starInfo = SPECTRAL_TYPES[contact.starType] ?? SPECTRAL_TYPES.G;
      return {
        state: context.state,
        x,
        y,
        targetX: Math.floor(cols / 2) + contact.dx,
        targetY: Math.floor(rows / 2) + contact.dy,
        color: '#00FF66',
        createdAt: now,
        typedChars: 0,
        durationMs: this.getDuration(context.state),
        lines: [
          'HYPERSPATIAL CONTACT',
          `ID ${contact.name}`,
          `TYPE ${contact.starType}  ${starInfo.temp.toFixed(0)}K`,
          `VECTOR ${this.formatSigned(contact.dx)},${this.formatSigned(contact.dy)} CELLS`,
        ],
      };
    }

    return {
      state: context.state,
      x,
      y,
      color: '#007755',
      createdAt: now,
      typedChars: 0,
      durationMs: this.getDuration(context.state) * 0.75,
      lines: [
        'DRIFT SOLUTION',
        `GRID ${player.position.worldX},${player.position.worldY}`,
        'LOCAL MASS SIGNATURE: NIL',
      ],
    };
  }

  private createSystemItem(context: OverlayContext, cols: number, rows: number, now: number): OverlayItem | null {
    if (!context.system) return null;
    const player = context.player;
    const viewCenterX = Math.floor(cols / 2);
    const viewCenterY = Math.floor(rows / 2);
    const viewWorldStartX = player.position.systemX - viewCenterX * context.viewScale;
    const viewWorldStartY = player.position.systemY - viewCenterY * context.viewScale;

    const candidates = context.system.planets
      .filter((planet): planet is Planet => planet !== null)
      .map((planet) => ({
        planet,
        distSq: player.distanceSqToSystemCoords(planet.systemX, planet.systemY),
        viewX: Math.floor((planet.systemX - viewWorldStartX) / context.viewScale),
        viewY: Math.floor((planet.systemY - viewWorldStartY) / context.viewScale),
      }))
      .filter((entry) => entry.viewX >= 0 && entry.viewX < cols && entry.viewY >= 0 && entry.viewY < rows)
      .sort((a, b) => a.distSq - b.distSq);

    if (candidates.length === 0) {
      const starRangeAu = Math.sqrt(player.distanceSqToSystemCoords(0, 0)) / AU_IN_METERS;
      return {
        state: context.state,
        x: Math.max(1, Math.floor(cols * 0.62)),
        y: Math.max(2, Math.floor(rows * 0.24)),
        targetX: Math.floor((0 - viewWorldStartX) / context.viewScale),
        targetY: Math.floor((0 - viewWorldStartY) / context.viewScale),
        color: '#9FFFE0',
        createdAt: now,
        typedChars: 0,
        durationMs: this.getDuration(context.state),
        lines: ['STELLAR REFERENCE', `RANGE ${starRangeAu.toFixed(3)} AU`, `FRAME ${context.system.name}`],
      };
    }

    const selected = candidates[Math.floor((now / this.getEmitInterval(context.state)) % Math.min(candidates.length, 4))];
    const info = PLANET_TYPES[selected.planet.type];
    const rangeAu = Math.sqrt(selected.distSq) / AU_IN_METERS;
    return {
      state: context.state,
      x: Math.max(1, Math.min(cols - 30, selected.viewX + (selected.viewX < cols / 2 ? 4 : -30))),
      y: Math.max(1, Math.min(rows - 5, selected.viewY - 2)),
      targetX: selected.viewX,
      targetY: selected.viewY,
      color: '#00FF66',
      createdAt: now,
      typedChars: 0,
      durationMs: this.getDuration(context.state),
      lines: [
        'ORBITAL BODY LOCK',
        `${selected.planet.name}`,
        `CLASS ${selected.planet.type}  ${info?.baseTemp ?? '?'}K BASE`,
        `RANGE ${rangeAu.toFixed(3)} AU`,
      ],
    };
  }

  private createPlanetItem(context: OverlayContext, cols: number, rows: number, now: number): OverlayItem | null {
    if (!context.planet) return null;
    const planet = context.planet;
    const viewport = this.getSurfaceViewport(cols, rows);
    const x = Math.min(viewport.x + viewport.width - 29, viewport.x + Math.max(2, Math.floor(viewport.width * 0.58)));
    const y = viewport.y + Math.max(1, Math.floor(viewport.height * 0.16));
    return {
      state: context.state,
      x,
      y,
      targetX: viewport.x + Math.floor(viewport.width / 2),
      targetY: viewport.y + Math.floor(viewport.height / 2),
      color: '#00FF66',
      createdAt: now,
      typedChars: 0,
      durationMs: this.getDuration(context.state),
      lines: [
        'SURFACE NAV SOLUTION',
        `GRID ${Math.floor(context.player.position.surfaceX)},${Math.floor(context.player.position.surfaceY)}`,
        `GRAV ${planet.gravity.toFixed(2)}g  TEMP ${planet.getCurrentTemperature()}K`,
        `SCAN ${planet.scanned ? planet.primaryResource || 'COMPLETE' : 'PENDING'}`,
      ],
    };
  }

  private findNearestHyperspaceContact(worldX: number, worldY: number, radius: number): { dx: number; dy: number; name: string; starType: string } | null {
    let best: { dx: number; dy: number; name: string; starType: string; distSq: number } | null = null;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const props = this.systemDataGenerator.getSystemProperties(worldX + dx, worldY + dy);
        if (!props.exists || !props.name || !props.starType) continue;
        const distSq = dx * dx + dy * dy;
        if (!best || distSq < best.distSq) {
          best = { dx, dy, name: props.name, starType: props.starType, distSq };
        }
      }
    }
    return best;
  }

  private shiftWithCamera(context: OverlayContext): void {
    const camera = this.getCameraState(context);
    if (
      !this.lastCamera ||
      this.lastCamera.state !== camera.state ||
      Math.abs(this.lastCamera.viewScale - camera.viewScale) > camera.viewScale * 0.001
    ) {
      this.items.length = 0;
      this.lastCamera = camera;
      return;
    }

    const dx = this.lastCamera.x - camera.x;
    const dy = this.lastCamera.y - camera.y;
    if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
      for (const item of this.items) {
        item.x += dx;
        item.y += dy;
        if (item.targetX !== undefined) item.targetX += dx;
        if (item.targetY !== undefined) item.targetY += dy;
      }
    }
    this.lastCamera = camera;
  }

  private getCameraState(context: OverlayContext): CameraState {
    switch (context.state) {
      case 'hyperspace':
        return {
          state: context.state,
          x: context.player.position.worldX,
          y: context.player.position.worldY,
          viewScale: 1,
        };
      case 'system':
        return {
          state: context.state,
          x: context.player.position.systemX / Math.max(1, context.viewScale),
          y: context.player.position.systemY / Math.max(1, context.viewScale),
          viewScale: context.viewScale,
        };
      case 'planet':
        return {
          state: context.state,
          x: context.player.position.surfaceX,
          y: context.player.position.surfaceY,
          viewScale: 1,
        };
      default:
        return { state: context.state, x: 0, y: 0, viewScale: 1 };
    }
  }

  private getEmitInterval(state: GameState): number {
    switch (state) {
      case 'hyperspace':
        return CONFIG.ASTROMETRIC_OVERLAY_EMIT_MS * 1.45;
      case 'system':
        return CONFIG.ASTROMETRIC_OVERLAY_EMIT_MS * 1.25;
      case 'planet':
        return CONFIG.ASTROMETRIC_OVERLAY_EMIT_MS * 1.1;
      default:
        return Number.POSITIVE_INFINITY;
    }
  }

  private getDuration(state: GameState): number {
    switch (state) {
      case 'system':
        return CONFIG.ASTROMETRIC_OVERLAY_DURATION_MS * 1.35;
      case 'hyperspace':
        return CONFIG.ASTROMETRIC_OVERLAY_DURATION_MS * 1.1;
      case 'planet':
        return CONFIG.ASTROMETRIC_OVERLAY_DURATION_MS;
      default:
        return 0;
    }
  }

  private getMaxItems(state: GameState): number {
    return state === 'hyperspace' ? 2 : CONFIG.ASTROMETRIC_OVERLAY_MAX_ITEMS;
  }

  private getSurfaceViewport(cols: number, rows: number): { x: number; y: number; width: number; height: number } {
    const width = Math.max(1, Math.min(CONFIG.PLANET_SURFACE_VIEW_WIDTH, Math.max(1, cols - 4)));
    const height = Math.max(1, Math.min(CONFIG.PLANET_SURFACE_VIEW_HEIGHT, Math.max(1, rows - 4)));
    return {
      x: Math.max(1, Math.floor((cols - width) / 2)),
      y: Math.max(1, Math.floor((rows - height) / 2)),
      width,
      height,
    };
  }

  private placeItem(item: OverlayItem, cols: number, rows: number): OverlayItem {
    const size = this.getItemBounds(item);
    if (item.state === 'planet') {
      const viewport = this.getSurfaceViewport(cols, rows);
      const maxX = Math.max(viewport.x + 1, viewport.x + viewport.width - size.width - 1);
      const maxY = Math.max(viewport.y + 1, viewport.y + viewport.height - size.height - 1);
      item.x = Math.round(Math.max(viewport.x + 1, Math.min(maxX, item.x)));
      item.y = Math.round(Math.max(viewport.y + 1, Math.min(maxY, item.y)));
      return item;
    }
    const reservedBottom = rows > 24 ? 8 : 3;
    const maxX = Math.max(1, cols - size.width - 1);
    const maxY = Math.max(1, rows - reservedBottom - size.height);
    const preferredX = Math.round(Math.max(1, Math.min(maxX, item.x)));
    const preferredY = Math.round(Math.max(1, Math.min(maxY, item.y)));
    const candidates: Array<{ x: number; y: number }> = [{ x: preferredX, y: preferredY }];

    const anchors = [
      { x: Math.floor(cols * 0.58), y: Math.floor(rows * 0.12) },
      { x: Math.floor(cols * 0.12), y: Math.floor(rows * 0.14) },
      { x: Math.floor(cols * 0.58), y: Math.floor(rows * 0.46) },
      { x: Math.floor(cols * 0.12), y: Math.floor(rows * 0.46) },
      { x: Math.floor(cols * 0.36), y: Math.floor(rows * 0.28) },
    ];

    for (const anchor of anchors) {
      candidates.push({
        x: Math.round(Math.max(1, Math.min(maxX, anchor.x))),
        y: Math.round(Math.max(1, Math.min(maxY, anchor.y))),
      });
    }

    for (let y = 1; y <= maxY; y += Math.max(2, size.height + 1)) {
      for (let x = 1; x <= maxX; x += Math.max(8, Math.floor(size.width * 0.75))) {
        candidates.push({ x, y });
      }
    }

    const placed = candidates.find((candidate) => !this.collides(candidate.x, candidate.y, size.width, size.height, item));
    item.x = placed?.x ?? preferredX;
    item.y = placed?.y ?? preferredY;
    return item;
  }

  private collides(x: number, y: number, width: number, height: number, newItem: OverlayItem): boolean {
    const padding = 2;
    return this.items.some((item) => {
      if (item.state !== newItem.state) return false;
      const bounds = this.getItemBounds(item);
      return (
        x < item.x + bounds.width + padding &&
        x + width + padding > item.x &&
        y < item.y + bounds.height + padding &&
        y + height + padding > item.y
      );
    });
  }

  private getItemBounds(item: OverlayItem): { width: number; height: number } {
    return {
      width: Math.max(...item.lines.map((line) => line.length), 1),
      height: item.lines.length,
    };
  }

  private drawConnector(
    ctx: CanvasRenderingContext2D,
    item: OverlayItem,
    visibleLines: string[],
    charWidth: number,
    charHeight: number
  ): void {
    if (item.targetX === undefined || item.targetY === undefined || visibleLines.length < 2) return;

    const labelLeft = item.x;
    const labelTop = item.y;
    const labelWidth = Math.max(...visibleLines.map((line) => line.length), 1);
    const labelMidY = labelTop + Math.floor(visibleLines.length / 2);
    const labelAnchorX = item.targetX < labelLeft ? labelLeft : labelLeft + labelWidth;
    const targetX = Math.floor(item.targetX);
    const targetY = Math.floor(item.targetY);
    const dir = targetX < labelAnchorX ? -1 : 1;
    const deltaX = targetX - labelAnchorX;
    const elbowX = labelAnchorX + dir * Math.max(4, Math.floor(Math.abs(deltaX) * 0.72));
    const startXPx = (labelAnchorX + dir * 0.6) * charWidth;
    const startYPx = (labelMidY + 0.48) * charHeight;
    const elbowXPx = (elbowX + 0.5) * charWidth;
    const targetXPx = (targetX + 0.5) * charWidth;
    const targetYPx = (targetY + 0.5) * charHeight;
    const pathLength = Math.abs(elbowXPx - startXPx) + Math.abs(targetYPx - startYPx) + Math.abs(targetXPx - elbowXPx);
    const drawProgress = Math.min(1, (performance.now() - item.createdAt) / CONFIG.ASTROMETRIC_OVERLAY_LINE_DRAW_MS);
    const visibleLength = pathLength * drawProgress;

    ctx.save();
    ctx.strokeStyle = '#007755';
    ctx.lineWidth = Math.max(1, charHeight * 0.08);
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(startXPx, startYPx);
    this.drawAnimatedSegment(ctx, startXPx, startYPx, elbowXPx, startYPx, visibleLength, 0);
    const afterFirst = Math.max(0, visibleLength - Math.abs(elbowXPx - startXPx));
    this.drawAnimatedSegment(ctx, elbowXPx, startYPx, elbowXPx, targetYPx, afterFirst, 0);
    const afterSecond = Math.max(0, afterFirst - Math.abs(targetYPx - startYPx));
    this.drawAnimatedSegment(ctx, elbowXPx, targetYPx, targetXPx, targetYPx, afterSecond, 0);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = '#007755';
    ctx.fillText(dir > 0 ? '├' : '┤', (labelAnchorX + (dir > 0 ? 0 : -1)) * charWidth, labelMidY * charHeight);
    ctx.fillStyle = '#00FF66';
    ctx.fillText('+', targetX * charWidth, targetY * charHeight);
  }

  private drawAnimatedSegment(
    ctx: CanvasRenderingContext2D,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    availableLength: number,
    offset: number
  ): void {
    const segmentLength = Math.hypot(x2 - x1, y2 - y1);
    const drawable = Math.max(0, Math.min(segmentLength, availableLength - offset));
    if (drawable <= 0 || segmentLength <= 0) return;
    const t = drawable / segmentLength;
    ctx.lineTo(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
    if (t >= 1) ctx.lineTo(x2, y2);
  }

  private takeVisibleChars(text: string, count: number): string {
    if (count <= 0) return '';
    return text.slice(0, count);
  }

  private formatSigned(value: number): string {
    return value >= 0 ? `+${value}` : `${value}`;
  }
}
