import { describe, expect, it, vi } from 'vitest';
import { RendererFacade } from '../../rendering/renderer_facade';
import { ScreenBuffer } from '../../rendering/screen_buffer';
import { CONFIG } from '../../config';

/** Creates a fresh renderer buffer on a DOM canvas already sized by an earlier session. */
function reusedCanvas() {
  const height = CONFIG.FONT_SIZE_PX * CONFIG.CHAR_SCALE;
  const width = height * CONFIG.CHAR_ASPECT_RATIO;
  const cols = Math.floor(window.innerWidth / width);
  const rows = Math.floor((window.innerHeight - 64 - 32) / height);
  const canvas = document.createElement('canvas');
  canvas.width = cols * width;
  canvas.height = rows * height;
  const ctx = {
    font: '',
    textBaseline: '',
    fillStyle: '',
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
  };
  const buffer = new ScreenBuffer(canvas, ctx as unknown as CanvasRenderingContext2D);
  const facade = Object.assign(Object.create(RendererFacade.prototype), {
    canvas,
    orbitCanvas: document.createElement('canvas'),
    overlayCanvas: document.createElement('canvas'),
    overlayCtx: { clearRect: vi.fn() },
    screenBuffer: buffer,
    statusBarUpdater: { updateMaxChars: vi.fn(), getStatusBarElement: () => ({ offsetHeight: 64 }) },
    commandStripUpdater: {
      updateMaxChars: vi.fn(),
      getElement: () => ({ offsetHeight: 32 }),
      setBottomOffset: vi.fn(),
    },
    nebulaRenderer: { clearCache: vi.fn() },
    sceneRenderer: { clearCaches: vi.fn() },
    galaxyMapRenderer: { clearCache: vi.fn() },
    layoutInvalidated: false,
    orbitAssetQueue: new Set(),
    orbitAssetPreparationHandle: null,
  }) as RendererFacade;
  return { facade, buffer, canvas, ctx, cols, rows };
}

describe('renderer buffer lifecycle', () => {
  it('invalidates projected scene caches after a discontinuous world arrival', () => {
    const { facade } = reusedCanvas();
    facade.invalidateWorldScene();
    expect((facade as any).sceneRenderer.clearCaches).toHaveBeenCalledOnce();
    expect((facade as any).nebulaRenderer.clearCache).not.toHaveBeenCalled();
    expect(facade.consumeLayoutInvalidation()).toBe(true);
  });
  it('initialises a fresh logical buffer even when physical canvas dimensions already match', () => {
    const { facade, buffer, canvas, ctx, cols, rows } = reusedCanvas();
    const before = [canvas.width, canvas.height];
    expect(buffer.getCols()).toBe(0);
    facade.fitToScreen();
    expect([canvas.width, canvas.height]).toEqual(before);
    expect([buffer.getCols(), buffer.getRows()]).toEqual([cols, rows]);
    expect(facade.consumeLayoutInvalidation()).toBe(true);
    buffer.drawString('FIELD ONLINE', 1, 1);
    buffer.renderFull();
    expect(ctx.fillText).toHaveBeenCalledWith(
      'FIELD ONLINE',
      buffer.getCharWidthPx(),
      buffer.getCharHeightPx()
    );
    facade.fitToScreen();
    expect(facade.consumeLayoutInvalidation()).toBe(false);
  });
});
