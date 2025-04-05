// src/rendering/status_bar_updater.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StatusBarUpdater } from './status_bar_updater';
import { CONFIG } from '../config';
import { logger } from '../utils/logger';

// Mock the logger
vi.mock('../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('StatusBarUpdater', () => {
  let mockStatusBarElement: HTMLElement;
  let statusBarUpdater: StatusBarUpdater;

  beforeEach(() => {
    // Create a mock HTMLElement for the status bar
    mockStatusBarElement = document.createElement('div');
    // Mock offsetWidth for maxChars calculation
    Object.defineProperty(mockStatusBarElement, 'offsetWidth', {
      configurable: true,
      value: 800, // Example width
    });
    // Add basic style property needed by the class
    mockStatusBarElement.style.paddingLeft = '10px'; // Example padding needed for calculation

    // Clear mocks on the element if needed (e.g., if spying on properties)
    vi.clearAllMocks();

    statusBarUpdater = new StatusBarUpdater(mockStatusBarElement);

    // Clear logger calls from constructor
    vi.mocked(logger.debug).mockClear();
    vi.mocked(logger.warn).mockClear();
  });

  it('constructor should apply initial styles', () => {
    expect(mockStatusBarElement.style.fontFamily).toBe(CONFIG.FONT_FAMILY);
    expect(mockStatusBarElement.style.color).toBe(CONFIG.STATUS_BAR_FG_COLOR);
    expect(mockStatusBarElement.style.backgroundColor).toBe(CONFIG.STATUS_BAR_BG_COLOR);
    expect(mockStatusBarElement.style.whiteSpace).toBe('pre-wrap');
    expect(mockStatusBarElement.style.lineHeight).toBe('1.4');
    expect(mockStatusBarElement.style.overflow).toBe('hidden');
  });

  it('constructor should throw if element is not provided', () => {
     expect(() => new StatusBarUpdater(null as any)).toThrow('Status bar element not provided');
  });

  describe('updateMaxChars', () => {
     const charWidth = 10;
     const charHeight = 16;
     const sbFontSize = charHeight * 0.85; // 13.6
     const approxCharWidth = sbFontSize * 0.6; // ~8.16
     const paddingLR = charWidth; // 10
     const offsetWidth = 800;
     const availableWidth = offsetWidth - paddingLR * 2; // 780
     const expectedCharsPerLine = Math.floor(availableWidth / approxCharWidth); // floor(780 / 8.16) = floor(95.5) = 95
     const expectedMaxChars = expectedCharsPerLine * 3; // 285

     beforeEach(() => {
        // Ensure consistent offsetWidth for calculations
        Object.defineProperty(mockStatusBarElement, 'offsetWidth', { value: offsetWidth, configurable: true });
     });

    it('should calculate max characters based on dimensions', () => {
      statusBarUpdater.updateMaxChars(charWidth, charHeight);
      expect((statusBarUpdater as any).statusBarMaxChars).toBe(expectedMaxChars);
    });

    it('should apply size-dependent styles', () => {
      statusBarUpdater.updateMaxChars(charWidth, charHeight);
      expect(mockStatusBarElement.style.fontSize).toBe(`${sbFontSize}px`);
      expect(mockStatusBarElement.style.height).toMatch(/calc\(.*px \+ 10px\)/); // Check basic calc structure
      expect(mockStatusBarElement.style.padding).toBe(`5px ${paddingLR}px`);
    });

    it('should handle zero char dimensions gracefully', () => {
       const warnSpy = vi.spyOn(logger, 'warn');
       // Reset offsetWidth to 0 to trigger warning path more easily
       Object.defineProperty(mockStatusBarElement, 'offsetWidth', { value: 0, configurable: true });
       statusBarUpdater.updateMaxChars(0, 0);
       expect(warnSpy).toHaveBeenCalledWith(
         expect.stringContaining('Could not accurately calculate status bar width'),
         expect.any(Error)
       );
       expect((statusBarUpdater as any).statusBarMaxChars).toBe(240); // Should fallback
       warnSpy.mockRestore();
    });
  });

  describe('updateStatus', () => {
     // Make maxChars predictable for these tests
     beforeEach(() => {
        (statusBarUpdater as any).statusBarMaxChars = 50;
     });

    it('should update textContent if message changed', () => {
      const message = 'New status message';
      mockStatusBarElement.textContent = 'Old message';
      statusBarUpdater.updateStatus(message);
      expect(mockStatusBarElement.textContent).toBe(message);
    });

    it('should not update textContent if message is the same', () => {
      const message = 'Same message';
      mockStatusBarElement.textContent = message;
      // Spy on textContent setter (might be tricky/environment dependent)
      // Instead, check logger - it shouldn't log the update message
      const debugSpy = vi.spyOn(logger, 'debug');
      statusBarUpdater.updateStatus(message);
      expect(debugSpy).not.toHaveBeenCalledWith(expect.stringContaining('Updating status bar text'));
      expect(mockStatusBarElement.textContent).toBe(message); // Ensure it wasn't cleared
      debugSpy.mockRestore();
    });

    it('should truncate message if it exceeds maxChars', () => {
      const longMessage = 'This is a very long status message that definitely exceeds fifty characters.';
      const expectedTruncated = 'This is a very long status message that definite...'; // 47 chars + ...
      statusBarUpdater.updateStatus(longMessage);
      expect(mockStatusBarElement.textContent).toBe(expectedTruncated);
      expect(mockStatusBarElement.textContent?.length).toBe(50);
    });

    it('should not truncate message if it fits within maxChars', () => {
      const shortMessage = 'This fits.';
      statusBarUpdater.updateStatus(shortMessage);
      expect(mockStatusBarElement.textContent).toBe(shortMessage);
    });

    it('should handle cases where maxChars calculation might have failed (use fallback)', () => {
        (statusBarUpdater as any).statusBarMaxChars = 0; // Simulate calculation failure
        const longMessage = 'X'.repeat(300);
        const fallbackMax = 240;
        const expectedTruncated = 'X'.repeat(fallbackMax - 3) + '...';

        statusBarUpdater.updateStatus(longMessage);
        expect(mockStatusBarElement.textContent).toBe(expectedTruncated);
        expect(mockStatusBarElement.textContent?.length).toBe(fallbackMax);
    });
  });

   // Test the added getter method
   describe('getStatusBarElement', () => {
    it('should return the managed HTMLElement', () => {
        expect(statusBarUpdater.getStatusBarElement()).toBe(mockStatusBarElement);
    });
   });
});