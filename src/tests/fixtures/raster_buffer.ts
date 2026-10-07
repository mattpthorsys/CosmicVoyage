import { vi } from 'vitest';
import { ScreenBuffer } from '../../rendering/screen_buffer';

export interface RasterFrame {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** Keeps the terminal and raster canvas call histories independent. */
function canvasContext() {
  return {
    font: '',
    textBaseline: '',
    fillStyle: '',
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
  };
}

/** Captures the real buffer's dedicated raster output, including transparent clearing between frames. */
export function rasterBufferFixture(cols = 120, rows = 64) {
  let uploaded: RasterFrame | null = null;
  let displayed: RasterFrame | null = null;
  const main = canvasContext();
  const raster = {
    createImageData: vi.fn(
      (width: number, height: number): RasterFrame => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      })
    ),
    putImageData: vi.fn((image: RasterFrame) => {
      uploaded = structuredClone(image);
    }),
  };
  const rasterCanvas = { width: 0, height: 0, getContext: () => raster };
  const canvas = {
    width: cols * 8,
    height: rows * 8,
    ownerDocument: { createElement: () => rasterCanvas },
  };
  const layerCanvas = { width: cols * 8, height: rows * 8 };
  const layer = {
    ...canvasContext(),
    imageSmoothingEnabled: true,
    clearRect: vi.fn(() => {
      displayed = null;
    }),
    drawImage: vi.fn(() => {
      displayed = uploaded ? structuredClone(uploaded) : null;
    }),
  };
  // Canvas APIs are replaced at this boundary; the real ScreenBuffer performs
  // all pixel writes, masking, staging and nearest-neighbour layer composition.
  const buffer = new ScreenBuffer(
    canvas as unknown as HTMLCanvasElement,
    main as unknown as CanvasRenderingContext2D,
    false,
    layerCanvas as HTMLCanvasElement,
    layer as unknown as CanvasRenderingContext2D
  );
  buffer.updateDimensions(cols, rows, 8, 8);
  return {
    buffer,
    main,
    layer,
    /** Returns the visible half-cell bitmap after the most recent render pass. */
    frame(): RasterFrame {
      return displayed
        ? structuredClone(displayed)
        : {
            width: buffer.getCols() * 2,
            height: buffer.getRows() * 2,
            data: new Uint8ClampedArray(buffer.getCols() * buffer.getRows() * 16),
          };
    },
    /** Models the facade's physical canvas resize before its logical buffer is updated. */
    resize(width: number, height: number): void {
      canvas.width = layerCanvas.width = width * 8;
      canvas.height = layerCanvas.height = height * 8;
      displayed = null;
      buffer.updateDimensions(width, height, 8, 8);
    },
  };
}
