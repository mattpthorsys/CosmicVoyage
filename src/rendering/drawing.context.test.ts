// src/rendering/drawing_context.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DrawingContext } from './drawing_context';
import { ScreenBuffer } from './screen_buffer'; // We need the type, but will mock the implementation
import { GLYPHS } from '../constants';
import { CONFIG } from '../config';

// Mock the ScreenBuffer completely
vi.mock('./screen_buffer');

describe('DrawingContext', () => {
  let mockScreenBuffer: ScreenBuffer;
  let drawingContext: DrawingContext;
  let drawCharSpy: vi.Mock;
  const mockCols = 20;
  const mockRows = 10;
  const defaultFg = CONFIG.DEFAULT_FG_COLOR; // Assuming default color for checks

  beforeEach(() => {
    // Create a mock instance of ScreenBuffer for each test
    // We need to mock all methods that DrawingContext might call
    drawCharSpy = vi.fn();
    mockScreenBuffer = {
      drawChar: drawCharSpy,
      // Mock methods to get dimensions and defaults used by DrawingContext methods
      getCols: vi.fn().mockReturnValue(mockCols),
      getRows: vi.fn().mockReturnValue(mockRows),
      getDefaultFgColor: vi.fn().mockReturnValue(defaultFg),
      getDefaultBgColor: vi.fn().mockReturnValue(CONFIG.DEFAULT_BG_COLOR), // Mock if needed
      // Add mocks for other ScreenBuffer methods if DrawingContext starts using them
    } as unknown as ScreenBuffer; // Use type assertion for the mock object

    drawingContext = new DrawingContext(mockScreenBuffer);

    // Clear mock calls before each test run
    drawCharSpy.mockClear();
    vi.mocked(mockScreenBuffer.getCols).mockClear();
    vi.mocked(mockScreenBuffer.getRows).mockClear();
    vi.mocked(mockScreenBuffer.getDefaultFgColor).mockClear(); // Now valid after adding the method
  });

  describe('drawBox', () => {
    it('should draw corners correctly', () => {
      drawingContext.drawBox(1, 1, 5, 4, '#FFF', '#000'); // x, y, w, h, fg, bg
      // Top-left corner
      expect(drawCharSpy).toHaveBeenCalledWith(GLYPHS.BOX.TL, 1, 1, '#FFF', '#000');
      // Top-right corner (x=1+5-1=5, y=1)
      expect(drawCharSpy).toHaveBeenCalledWith(GLYPHS.BOX.TR, 5, 1, '#FFF', '#000');
      // Bottom-left corner (x=1, y=1+4-1=4)
      expect(drawCharSpy).toHaveBeenCalledWith(GLYPHS.BOX.BL, 1, 4, '#FFF', '#000');
      // Bottom-right corner (x=5, y=4)
      expect(drawCharSpy).toHaveBeenCalledWith(GLYPHS.BOX.BR, 5, 4, '#FFF', '#000');
    });

    it('should draw horizontal lines correctly', () => {
      drawingContext.drawBox(1, 1, 5, 4, '#FFF', '#000'); // w=5 => x from 1 to 5
      // Top line (y=1, x=2,3,4)
      expect(drawCharSpy).toHaveBeenCalledWith(GLYPHS.BOX.H, 2, 1, '#FFF', '#000');
      expect(drawCharSpy).toHaveBeenCalledWith(GLYPHS.BOX.H, 3, 1, '#FFF', '#000');
      expect(drawCharSpy).toHaveBeenCalledWith(GLYPHS.BOX.H, 4, 1, '#FFF', '#000');
      // Bottom line (y=4, x=2,3,4)
      expect(drawCharSpy).toHaveBeenCalledWith(GLYPHS.BOX.H, 2, 4, '#FFF', '#000');
      expect(drawCharSpy).toHaveBeenCalledWith(GLYPHS.BOX.H, 3, 4, '#FFF', '#000');
      expect(drawCharSpy).toHaveBeenCalledWith(GLYPHS.BOX.H, 4, 4, '#FFF', '#000');
    });

    it('should draw vertical lines correctly', () => {
      drawingContext.drawBox(1, 1, 5, 4, '#FFF', '#000'); // h=4 => y from 1 to 4
      // Left line (x=1, y=2,3)
      expect(drawCharSpy).toHaveBeenCalledWith(GLYPHS.BOX.V, 1, 2, '#FFF', '#000');
      expect(drawCharSpy).toHaveBeenCalledWith(GLYPHS.BOX.V, 1, 3, '#FFF', '#000');
      // Right line (x=5, y=2,3)
      expect(drawCharSpy).toHaveBeenCalledWith(GLYPHS.BOX.V, 5, 2, '#FFF', '#000');
      expect(drawCharSpy).toHaveBeenCalledWith(GLYPHS.BOX.V, 5, 3, '#FFF', '#000');
    });

    it('should fill the inside if fillChar is provided', () => {
      drawingContext.drawBox(1, 1, 3, 3, '#FFF', '#000', '*', '#0F0', '#F00'); // 3x3 box
      // Inside cell is at (x=2, y=2)
      expect(drawCharSpy).toHaveBeenCalledWith('*', 2, 2, '#0F0', '#F00');
      // Check a border cell was NOT called with fillChar
      expect(drawCharSpy).not.toHaveBeenCalledWith('*', 1, 1, expect.anything(), expect.anything());
    });

    it('should not fill the inside if fillChar is null', () => {
      drawingContext.drawBox(1, 1, 3, 3, '#FFF', '#000', null); // No fill char
      expect(drawCharSpy).not.toHaveBeenCalledWith(expect.anything(), 2, 2, expect.anything(), expect.anything()); // Inside cell not drawn
    });
  });

  describe('drawCircle', () => {
    it('should draw characters within the radius', () => {
      drawingContext.drawCircle(5, 5, 1, '*', '#FFF', '#000'); // Center (5,5), radius 1
      // Cells to draw: (5,4), (4,5), (5,5), (6,5), (5,6) for radius 1 (x*x+y*y <= 1*1)
      expect(drawCharSpy).toHaveBeenCalledWith('*', 5, 4, '#FFF', '#000'); // Top
      expect(drawCharSpy).toHaveBeenCalledWith('*', 4, 5, '#FFF', '#000'); // Left
      expect(drawCharSpy).toHaveBeenCalledWith('*', 5, 5, '#FFF', '#000'); // Center
      expect(drawCharSpy).toHaveBeenCalledWith('*', 6, 5, '#FFF', '#000'); // Right
      expect(drawCharSpy).toHaveBeenCalledWith('*', 5, 6, '#FFF', '#000'); // Bottom
      // Check a cell just outside wasn't drawn
      expect(drawCharSpy).not.toHaveBeenCalledWith('*', 4, 4, '#FFF', '#000');
    });

     it('should draw a single point for radius 0', () => {
        drawingContext.drawCircle(2, 3, 0, '@', '#F00', '#0F0');
        expect(drawCharSpy).toHaveBeenCalledOnce();
        expect(drawCharSpy).toHaveBeenCalledWith('@', 2, 3, '#F00', '#0F0');
     });

     it('should default background color to foreground color', () => {
        drawingContext.drawCircle(1, 1, 0, '#', '#ABC'); // bg omitted
        expect(drawCharSpy).toHaveBeenCalledWith('#', 1, 1, '#ABC', '#ABC'); // bg should be same as fg
     });

     it('should not draw if radius is negative', () => {
        drawingContext.drawCircle(1, 1, -1, '!', '#FFF', '#000');
        expect(drawCharSpy).not.toHaveBeenCalled();
     });
  });

  describe('drawOrbit', () => {
    it('should draw points along the circumference', () => {
      drawingContext.drawOrbit(10, 5, 3, '.', '#888'); // Center (10,5), radius 3
      // Expect calls for points roughly 3 units away from (10,5)
      // Examples using Midpoint algorithm for r=3:
      // (x,y) starts at (3,0) -> drawPoints(3,0) -> draw (13,5), (7,5), (10,8), (10,2) etc.
      // y++, err+=3 -> y=1, err= -2+3=1
      // x--, err+= 2(1-3)+1 = -3 -> x=2, err=1-3=-2
      // drawPoints(2,1) -> draw (12,6), (8,6), (12,4), (8,4), (11,7), (9,7), (11,3), (9,3)
      // y++, err+=5 -> y=2, err=-2+5=3
      // x--, err+=2(2-2)+1 = 1 -> x=1, err=3+1=4
      // drawPoints(1,2) -> draw (11,7), (9,7), (11,3), (9,3), (12,6), (8,6), (12,4), (8,4) - duplicates ok
      // y++, err+=7 -> y=3, err=4+7=11 > 0
      // Stop: x < y (1 < 3)

      // Check some expected points were drawn with null background
      expect(drawCharSpy).toHaveBeenCalledWith('.', 13, 5, '#888', null); // (10+3, 5)
      expect(drawCharSpy).toHaveBeenCalledWith('.', 7, 5, '#888', null);  // (10-3, 5)
      expect(drawCharSpy).toHaveBeenCalledWith('.', 10, 8, '#888', null); // (10, 5+3)
      expect(drawCharSpy).toHaveBeenCalledWith('.', 10, 2, '#888', null); // (10, 5-3)
      expect(drawCharSpy).toHaveBeenCalledWith('.', 12, 6, '#888', null); // Example from step 2
      expect(drawCharSpy).toHaveBeenCalledWith('.', 9, 3, '#888', null);  // Example from step 2
    });

    it('should respect boundary limits', () => {
        // Orbit centered near edge, radius goes out of bounds
        drawingContext.drawOrbit(18, 5, 3, '.', '#888', 0, 0, 19, 9); // MaxX=19, MaxY=9
        // Point (18+3, 5) = (21, 5) is out of bounds (x > 19)
        expect(drawCharSpy).not.toHaveBeenCalledWith('.', 21, 5, '#888', null);
        // Point (18-1, 5+2) = (17, 7) is in bounds
        expect(drawCharSpy).toHaveBeenCalledWith('.', 17, 7, '#888', null);
        // Point (18, 5+3) = (18, 8) is in bounds
        expect(drawCharSpy).toHaveBeenCalledWith('.', 18, 8, '#888', null);
        // Point (18, 5-3) = (18, 2) is in bounds
        expect(drawCharSpy).toHaveBeenCalledWith('.', 18, 2, '#888', null);
    });

     it('should not draw if radius is zero or negative', () => {
        drawingContext.drawOrbit(5, 5, 0, '.', '#888');
        expect(drawCharSpy).not.toHaveBeenCalled();
        drawingContext.drawOrbit(5, 5, -2, '.', '#888');
        expect(drawCharSpy).not.toHaveBeenCalled();
     });
  });
});