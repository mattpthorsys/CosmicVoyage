import { CONFIG } from '../config';
import type { GalaxyMapModel } from '../core/galaxy_map';
import { MilkyWayModel, type GalaxyFieldSample } from '../generation/milky_way_model';
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
    const mapY = panelY + 3;
    const mapWidth = Math.max(8, panelWidth - 2);
    const mapHeight = Math.max(1, panelHeight - 8);
    this.fillPanel(panelX, panelY, panelWidth, panelHeight);
    this.drawFrame(panelX, panelY, panelWidth, panelHeight);
    this.drawRaster(model, mapX, mapY, mapWidth, mapHeight);
    this.drawPlayerCrosshair(model, mapX, mapY, mapWidth, mapHeight);
    this.drawGalacticNorthMarker(mapX, mapY);

    const available = cols - 4;
    const title = 'MILKY WAY // GALACTIC NAVIGATION';
    this.drawCentred(title.length <= available ? title : 'MILKY WAY', panelY + 1, TEXT_PALETTE.textBright);
    const radiusKpc = model.playerGalactocentricRadiusPc / 1000;
    const distanceLy = model.playerDistanceFromSolLy;
    const location = `R_GC ${radiusKpc.toFixed(2)} kpc  ${model.armName.toUpperCase()}  ${model.humanRegion.toUpperCase()}`;
    const coordinates = `GRID ${model.playerWorldX},${model.playerWorldY}  SOL ${distanceLy.toFixed(0)} ly  ${model.zoomLabel}`;
    this.drawCentred(
      location.length <= available ? location : `R_GC ${radiusKpc.toFixed(2)} kpc`,
      panelY + panelHeight - 3,
      TEXT_PALETTE.amber
    );
    const compactCoordinates = `SOL ${distanceLy < 1e6 ? distanceLy.toFixed(0) : distanceLy.toExponential(1)} ly`;
    this.drawCentred(
      coordinates.length <= available ? coordinates : compactCoordinates,
      panelY + panelHeight - 2,
      TEXT_PALETTE.textMuted
    );
    const legend = 'ARROWS PAN   +/- ZOOM   HOME RECENTRE   G/ESC CLOSE';
    this.drawCentred(
      legend.length <= available ? legend : '^v<> +/- G/ESC',
      panelY + panelHeight - 1,
      TEXT_PALETTE.cyanSignal
    );
  }

  /** Labels screen-up as the coreward Galactic north used by interstellar movement. */
  private drawGalacticNorthMarker(mapX: number, mapY: number): void {
    // The detail canvas composites above terminal text, so reserve a non-raster row.
    this.screenBuffer.drawString('^ N // CORE', mapX + 1, mapY - 1, TEXT_PALETTE.amber, '#010202');
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
    const { verticalSpanPc, horizontalSpanPc } = getGalaxyMapSpans(model.spanPc, pixelWidth, pixelHeight);

    for (let pixelY = 0; pixelY < pixelHeight; pixelY++) {
      const yFactor = (pixelY + 0.5) / pixelHeight - 0.5;
      const galacticYpc = model.centerYpc - yFactor * verticalSpanPc;
      for (let pixelX = 0; pixelX < pixelWidth; pixelX++) {
        const xFactor = (pixelX + 0.5) / pixelWidth - 0.5;
        const galacticXpc = model.centerXpc + xFactor * horizontalSpanPc;
        const field = this.milkyWayModel.sampleGalaxyField(galacticXpc, galacticYpc);
        const colour = getGalaxyFieldColour(field);
        colours[pixelY * pixelWidth + pixelX] = colour;
      }
    }
    return Object.freeze(colours);
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
    const { verticalSpanPc, horizontalSpanPc } = getGalaxyMapSpans(model.spanPc, pixelWidth, pixelHeight);
    const pixelX = ((model.playerXpc - model.centerXpc) / horizontalSpanPc + 0.5) * pixelWidth;
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
      if (x + dx < mapX || x + dx >= mapX + mapWidth || y + dy < mapY || y + dy >= mapY + mapHeight) continue;
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

/** Fits the scientific span to the shorter axis, preserving circles in landscape and portrait. */
export function getGalaxyMapSpans(
  spanPc: number,
  width: number,
  height: number
): {
  horizontalSpanPc: number;
  verticalSpanPc: number;
} {
  const parsecsPerPixel = spanPc / Math.max(1, Math.min(width, height));
  return { horizontalSpanPc: width * parsecsPerPixel, verticalSpanPc: height * parsecsPerPixel };
}

/** Mixes stellar populations and wavelength-dependent dust absorption before display exposure. */
export function getGalaxyFieldColour(field: GalaxyFieldSample): string | null {
  // Arm light must scale with the stars there, never with an independent outline mask.
  // The bar/bulge already belong to oldStellarDensity; do not add their light twice.
  const oldLight = field.oldStellarDensity * 0.16;
  const youngLight = field.youngStellarDensity * 0.85;
  const coreFraction = Math.min(
    1,
    (field.bulgeDensity + field.barDensity * 0.72) / Math.max(0.001, field.oldStellarDensity)
  );
  const opticalDepth = field.dustDensity * 0.36 + field.dustLaneDensity * 1.1;
  const red = (oldLight + youngLight * 0.63) * Math.exp(-opticalDepth * 0.65);
  const green = (oldLight * (0.91 - coreFraction * 0.12) + youngLight * 0.81) * Math.exp(-opticalDepth * 0.9);
  const blue = (oldLight * (0.78 - coreFraction * 0.28) + youngLight) * Math.exp(-opticalDepth * 1.25);
  // A common exposure preserves population colours. No brightness floor or 32-step
  // quantization: both previously turned a diffuse disk edge into hard concentric bands.
  const peak = Math.max(red, green, blue);
  if (peak < 0.002) return null;
  const exposure = (255 * (1 - Math.exp(-peak * 1.5))) / peak;
  return rgbToHex(red * exposure, green * exposure, blue * exposure);
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
