import { CONFIG } from '../config';
import type { GalaxyMapModel } from '../core/galaxy_map';
import { MilkyWayModel } from '../generation/milky_way_model';
import { GLYPHS } from '../constants/visual';
import { ScreenBuffer } from './screen_buffer';
import { TEXT_PALETTE } from './text_palette';

interface GalaxyRasterCache {
  signature: string;
  colours: readonly (string | null)[];
}

/** Draws the cached analytical Galaxy field at the same half-cell scale as orbital planets. */
export class GalaxyMapRenderer {
  private cache: GalaxyRasterCache | null = null;

  /** Initializes a renderer backed by the shared detailed-raster layer. */
  constructor(
    private readonly screenBuffer: ScreenBuffer,
    private readonly milkyWayModel: MilkyWayModel
  ) {}

  /** Clears the static raster after a canvas resize or generation-model change. */
  clearCache(): void {
    this.cache = null;
  }

  /** Draws the Galaxy panel, player crosshair, scientific readout, and keyboard legend. */
  draw(model: GalaxyMapModel): void {
    const cols = this.screenBuffer.getCols();
    const rows = this.screenBuffer.getRows();
    if (cols < 20 || rows < 12) return;

    const panelX = 1;
    const panelY = 1;
    const panelWidth = cols - 2;
    const panelHeight = rows - 2;
    const mapX = panelX + 1;
    const mapY = panelY + 2;
    const mapWidth = Math.max(8, panelWidth - 2);
    const mapHeight = Math.max(4, panelHeight - 7);
    this.fillPanel(panelX, panelY, panelWidth, panelHeight);
    this.drawFrame(panelX, panelY, panelWidth, panelHeight);
    this.drawRaster(model, mapX, mapY, mapWidth, mapHeight);
    this.drawPlayerCrosshair(model, mapX, mapY, mapWidth, mapHeight);

    this.drawCentred('MILKY WAY // GALACTIC NAVIGATION', panelY + 1, TEXT_PALETTE.textBright);
    const radiusKpc = model.playerGalactocentricRadiusPc / 1000;
    const distanceLy = model.playerDistanceFromSolLy;
    const location = `R_GC ${radiusKpc.toFixed(2)} kpc  ${model.armName.toUpperCase()}  ${model.humanRegion.toUpperCase()}`;
    const coordinates = `GRID ${model.playerWorldX},${model.playerWorldY}  SOL ${distanceLy.toFixed(0)} ly  ${model.zoomLabel}`;
    this.drawCentred(location, panelY + panelHeight - 3, TEXT_PALETTE.amber);
    this.drawCentred(coordinates, panelY + panelHeight - 2, TEXT_PALETTE.textMuted);
    this.drawCentred(
      'ARROWS PAN   +/- ZOOM   HOME RECENTRE   G/ESC CLOSE',
      panelY + panelHeight - 1,
      TEXT_PALETTE.cyanSignal
    );
  }

  /** Fills the modal area so the underlying physical scene cannot bleed through. */
  private fillPanel(x: number, y: number, width: number, height: number): void {
    for (let row = y; row < y + height; row++) {
      for (let column = x; column < x + width; column++) {
        this.screenBuffer.drawChar(' ', column, row, CONFIG.DEFAULT_FG_COLOUR, '#010202');
      }
    }
  }

  /** Draws a restrained single-cell instrument frame. */
  private drawFrame(x: number, y: number, width: number, height: number): void {
    const right = x + width - 1;
    const bottom = y + height - 1;
    for (let column = x + 1; column < right; column++) {
      this.screenBuffer.drawChar('-', column, y, TEXT_PALETTE.cyanBorder, '#010202');
      this.screenBuffer.drawChar('-', column, bottom, TEXT_PALETTE.cyanBorder, '#010202');
    }
    for (let row = y + 1; row < bottom; row++) {
      this.screenBuffer.drawChar('|', x, row, TEXT_PALETTE.cyanBorder, '#010202');
      this.screenBuffer.drawChar('|', right, row, TEXT_PALETTE.cyanBorder, '#010202');
    }
    this.screenBuffer.drawChar('+', x, y, TEXT_PALETTE.cyanBorder, '#010202');
    this.screenBuffer.drawChar('+', right, y, TEXT_PALETTE.cyanBorder, '#010202');
    this.screenBuffer.drawChar('+', x, bottom, TEXT_PALETTE.cyanBorder, '#010202');
    this.screenBuffer.drawChar('+', right, bottom, TEXT_PALETTE.cyanBorder, '#010202');
  }

  /** Queues one cached two-pixels-per-cell bitmap onto the dedicated detail layer. */
  private drawRaster(
    model: GalaxyMapModel,
    mapX: number,
    mapY: number,
    mapWidth: number,
    mapHeight: number
  ): void {
    const pixelWidth = mapWidth * 2;
    const pixelHeight = mapHeight * 2;
    const signature = [
      model.generationVersion,
      model.centerXpc.toFixed(1),
      model.centerYpc.toFixed(1),
      model.spanPc,
      pixelWidth,
      pixelHeight,
    ].join('|');
    if (this.cache?.signature !== signature) {
      this.cache = {
        signature,
        colours: this.buildRaster(model, pixelWidth, pixelHeight),
      };
    }

    for (let pixelY = 0; pixelY < pixelHeight; pixelY++) {
      for (let pixelX = 0; pixelX < pixelWidth; pixelX++) {
        const colour = this.cache.colours[pixelY * pixelWidth + pixelX];
        if (!colour) continue;
        this.screenBuffer.drawScaledChar(
          GLYPHS.BLOCK,
          mapX + pixelX * 0.5,
          mapY + pixelY * 0.5,
          colour,
          null,
          0.5,
          0.5
        );
      }
    }
  }

  /** Samples the analytical Galaxy exactly once for every cached half-cell pixel. */
  private buildRaster(
    model: GalaxyMapModel,
    pixelWidth: number,
    pixelHeight: number
  ): readonly (string | null)[] {
    const colours = new Array<string | null>(pixelWidth * pixelHeight).fill(null);
    const horizontalSpanPc = model.spanPc;
    const verticalSpanPc = model.spanPc * (pixelHeight / Math.max(1, pixelWidth));

    for (let pixelY = 0; pixelY < pixelHeight; pixelY++) {
      const yFactor = (pixelY + 0.5) / pixelHeight - 0.5;
      const galacticYpc = model.centerYpc - yFactor * verticalSpanPc;
      for (let pixelX = 0; pixelX < pixelWidth; pixelX++) {
        const xFactor = (pixelX + 0.5) / pixelWidth - 0.5;
        const galacticXpc = model.centerXpc + xFactor * horizontalSpanPc;
        const field = this.milkyWayModel.sampleGalaxyField(galacticXpc, galacticYpc);
        const colour = this.getFieldColour(field);
        colours[pixelY * pixelWidth + pixelX] = colour;
      }
    }
    return Object.freeze(colours);
  }

  /** Converts enormous Galactic dynamic range into a restrained quantized amber-blue palette. */
  private getFieldColour(field: ReturnType<MilkyWayModel['sampleGalaxyField']>): string | null {
    const logarithmicDensity = Math.log1p(field.density * 5) / Math.log1p(42 * 5);
    const haloFloor = field.insideMainDisk ? 0 : logarithmicDensity * 0.24;
    let brightness = Math.max(haloFloor, logarithmicDensity * 0.96);
    brightness *= 1 - Math.min(0.72, field.dustDensity * 0.36);
    if (brightness < 0.018) return null;

    const armBlue = field.armInfluence * Math.min(1, field.gasDensity) * 0.34;
    const coreWarmth = Math.min(1, logarithmicDensity * 1.8);
    const quantized = Math.round(Math.min(1, brightness) * 15) / 15;
    const red = 10 + quantized * (160 + coreWarmth * 58) - armBlue * 28;
    const green = 9 + quantized * (112 + coreWarmth * 42) + armBlue * 28;
    const blue = 8 + quantized * (58 + coreWarmth * 22) + armBlue * 82;
    return rgbToHex(red, green, blue);
  }

  /** Draws a high-contrast crosshair at the player's projected position when it is in view. */
  private drawPlayerCrosshair(
    model: GalaxyMapModel,
    mapX: number,
    mapY: number,
    mapWidth: number,
    mapHeight: number
  ): void {
    const pixelWidth = mapWidth * 2;
    const pixelHeight = mapHeight * 2;
    const verticalSpanPc = model.spanPc * (pixelHeight / Math.max(1, pixelWidth));
    const pixelX = ((model.playerXpc - model.centerXpc) / model.spanPc + 0.5) * pixelWidth;
    const pixelY = (0.5 - (model.playerYpc - model.centerYpc) / verticalSpanPc) * pixelHeight;
    if (pixelX < 0 || pixelX >= pixelWidth || pixelY < 0 || pixelY >= pixelHeight) return;

    const x = mapX + Math.floor(pixelX) * 0.5;
    const y = mapY + Math.floor(pixelY) * 0.5;
    const colour = '#5FFFF0';
    const ticks = [
      [-1, 0],
      [-0.5, 0],
      [0, 0],
      [0.5, 0],
      [1, 0],
      [0, -1],
      [0, -0.5],
      [0, 0.5],
      [0, 1],
    ] as const;
    for (const [dx, dy] of ticks) {
      this.screenBuffer.drawScaledChar(GLYPHS.BLOCK, x + dx, y + dy, colour, null, 0.5, 0.5);
    }
  }

  /** Draws clipped centred text without allocating a padded full-width line. */
  private drawCentred(text: string, y: number, colour: string): void {
    const cols = this.screenBuffer.getCols();
    const clipped = text.slice(0, Math.max(0, cols - 4));
    const x = Math.max(2, Math.floor((cols - clipped.length) / 2));
    this.screenBuffer.drawString(clipped, x, y, colour, '#010202');
  }
}

/** Packs bounded RGB values into a CSS hexadecimal colour. */
function rgbToHex(red: number, green: number, blue: number): string {
  /** Clamps and formats one packed colour channel. */
  const channel = (value: number): string =>
    Math.max(0, Math.min(255, Math.round(value)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}
