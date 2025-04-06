// src/rendering/scene_renderer.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest'; // Keep Mock from vitest
import { SceneRenderer } from './scene_renderer';
import { ScreenBuffer } from './screen_buffer';
import { DrawingContext } from './drawing_context';
import { NebulaRenderer } from './nebula_renderer';
import { Player } from '../core/player';
import { SolarSystem } from '../entities/solar_system';
import { Planet } from '../entities/planet';
import { Starbase } from '../entities/starbase';
import { PRNG } from '../utils/prng';
import { CONFIG } from '../config';
import { GLYPHS } from '../constants';
import { fastHash } from '../utils/hash';

// Mock dependencies
vi.mock('./screen_buffer');
vi.mock('./drawing_context');
vi.mock('./nebula_renderer');
vi.mock('../core/player');
vi.mock('../entities/solar_system');
vi.mock('../entities/planet');
vi.mock('../entities/starbase');
vi.mock('../utils/prng');
vi.mock('../utils/hash');
vi.mock('../utils/logger');

// --- Mock Helper Types (Corrected - simplified) ---
// Use vi.Mock for function mocks, or Partial for object shapes
type MockScreenBuffer = Partial<ScreenBuffer> & {
    drawChar: vi.Mock;
    drawString: vi.Mock;
    getCols: vi.Mock;
    getRows: vi.Mock;
    getDefaultBgColor: vi.Mock;
    // Add other mocked methods if needed
};
type MockDrawingContext = Partial<DrawingContext> & {
    drawBox: vi.Mock;
    drawCircle: vi.Mock;
    drawOrbit: vi.Mock;
};
type MockNebulaRenderer = Partial<NebulaRenderer> & {
    getBackgroundColor: vi.Mock;
    clearCache: vi.Mock;
};

describe('SceneRenderer', () => {
  let mockScreenBuffer: MockScreenBuffer;
  let mockDrawingContext: MockDrawingContext;
  let mockNebulaRenderer: MockNebulaRenderer;
  let sceneRenderer: SceneRenderer;

  // Mock entities (can be expanded with more properties as needed)
  let mockPlayer: Player;
  let mockSystem: SolarSystem;
  let mockSolidPlanet: Planet;
  let mockGasGiant: Planet;
  let mockStarbase: Starbase;
  let mockGamePrng: PRNG;

  const mockCols = 80;
  const mockRows = 24;

  beforeEach(() => {
    vi.clearAllMocks();

    // --- Mock Implementations ---
    // Use `as unknown as MockType` for simpler mocking when full implementation isn't needed
    mockScreenBuffer = {
      drawChar: vi.fn(),
      drawString: vi.fn(),
      getCols: vi.fn().mockReturnValue(mockCols),
      getRows: vi.fn().mockReturnValue(mockRows),
      getDefaultBgColor: vi.fn().mockReturnValue(CONFIG.DEFAULT_BG_COLOR),
      // No need to mock methods not directly used by SceneRenderer here
    } as unknown as MockScreenBuffer;

    mockDrawingContext = {
      drawBox: vi.fn(),
      drawCircle: vi.fn(),
      drawOrbit: vi.fn(),
    } as unknown as MockDrawingContext;

    mockNebulaRenderer = {
      getBackgroundColor: vi.fn().mockReturnValue(CONFIG.DEFAULT_BG_COLOR),
      clearCache: vi.fn(),
    } as unknown as MockNebulaRenderer;

    // --- Mock Entities (using type assertions for simplicity) ---
    mockPlayer = {
      worldX: 10, worldY: 20,
      systemX: 1000, systemY: 2000,
      surfaceX: 5, surfaceY: 5,
      char: '@', shipDirection: '^',
    } as Player;

    mockSolidPlanet = {
      name: 'RockSolid', type: 'Rock', systemX: 5000, systemY: 0, orbitDistance: 5000,
      heightmap: [[0, 1], [2, 3]],
      heightLevelColors: ['#111', '#333', '#666', '#999'],
      rgbPaletteCache: null, // Correct type is null for solid
      systemPRNG: { seedNew: vi.fn().mockReturnThis(), random: vi.fn(()=>0.5), choice: vi.fn(), randomInt: vi.fn(), next: vi.fn(), getInitialSeed: vi.fn()},
    } as unknown as Planet;

     mockGasGiant = {
      name: 'GasBag', type: 'GasGiant', systemX: 10000, systemY: 0, orbitDistance: 10000,
      heightmap: null, heightLevelColors: null,
      rgbPaletteCache: [{r:100, g:50, b:20}, {r:120, g:70, b:40}, {r:140, g:90, b:60}],
      systemPRNG: { seedNew: vi.fn().mockReturnThis(), random: vi.fn(()=>0.5), choice: vi.fn().mockReturnValue(' '), randomInt: vi.fn(), next: vi.fn(), getInitialSeed: vi.fn()},
     } as unknown as Planet;

    mockStarbase = {
      name: 'Starbase Alpha', type: 'Starbase', systemX: 20000, systemY: 0, orbitDistance: 20000,
    } as unknown as Starbase;

    mockSystem = {
      name: 'TestSystem', starType: 'G', edgeRadius: 50000,
      planets: [mockSolidPlanet, mockGasGiant], starbase: mockStarbase,
    } as SolarSystem;

    mockGamePrng = {
        seedNew: vi.fn().mockReturnThis(),
        choice: vi.fn().mockReturnValue('G'),
        random: vi.fn().mockReturnValue(0.5),
        randomInt: vi.fn().mockReturnValue(1),
        seed: 12345,
        // Add other PRNG methods if directly called by SceneRenderer
    } as unknown as PRNG;

    vi.mocked(fastHash).mockReturnValue(100);

    // --- Instantiate (pass mocks - TS should accept due to type assertions) ---
    sceneRenderer = new SceneRenderer(
      mockScreenBuffer as ScreenBuffer,             // Cast needed here
      mockDrawingContext as DrawingContext,         // Cast needed here
      mockNebulaRenderer as NebulaRenderer          // Cast needed here
    );
  });

  it('drawHyperspace should draw background, stars, and player', () => {
    vi.mocked(mockNebulaRenderer.getBackgroundColor).mockReturnValue('#100010');
    const starX = 10, starY = 10;
    const worldStarX = mockPlayer.worldX + starX - Math.floor(mockCols / 2);
    const worldStarY = mockPlayer.worldY + starY - Math.floor(mockRows / 2);
    // Add explicit 'any' type to 'call' parameter
    vi.mocked(fastHash).mockImplementation((x, y) => {
        return (x === worldStarX && y === worldStarY) ? 0 : 1000;
    });

    sceneRenderer.drawHyperspace(mockPlayer, mockGamePrng);

    expect(mockNebulaRenderer.getBackgroundColor).toHaveBeenCalled();
    expect(mockScreenBuffer.drawChar).toHaveBeenCalledWith(null, 0, 0, null, '#100010');
    expect(fastHash).toHaveBeenCalled();
    expect(mockGamePrng.seedNew).toHaveBeenCalledWith(`star_${worldStarX},${worldStarY}`);
    expect(mockScreenBuffer.drawChar).toHaveBeenCalledWith(
        expect.any(String), starX, starY, expect.any(String), null
    );
    const playerCall: [string, number, number, string | null, string | null] | undefined = 
        vi.mocked(mockScreenBuffer.drawChar).mock.calls.find((call: [string, number, number, string | null, string | null]) => call[0] === mockPlayer.char);
    expect(playerCall).toEqual([
        mockPlayer.char, Math.floor(mockCols / 2), Math.floor(mockRows / 2), CONFIG.PLAYER_COLOR, null
    ]);
  });

  it('drawSolarSystem should draw star, orbits, objects, player, and minimap', () => {
     const minimapSpy = vi.spyOn(sceneRenderer as any, 'drawSystemMinimap');
     sceneRenderer.drawSolarSystem(mockPlayer, mockSystem);

     expect(mockScreenBuffer.drawChar).toHaveBeenCalledWith(null, 0, 0, null, CONFIG.DEFAULT_BG_COLOR); // Background clear check
     expect(mockDrawingContext.drawCircle).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 1, expect.any(String), expect.any(String), expect.any(String)); // Star
     expect(mockDrawingContext.drawOrbit).toHaveBeenCalledTimes(3); // Orbits
     expect(mockDrawingContext.drawCircle).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 0, GLYPHS.PLANET_ICON, expect.any(String), expect.any(String)); // Planet
     expect(mockDrawingContext.drawCircle).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 0, GLYPHS.STARBASE_ICON, CONFIG.STARBASE_COLOR, CONFIG.STARBASE_COLOR); // Starbase
     expect(mockScreenBuffer.drawChar).toHaveBeenCalledWith(mockPlayer.char, Math.floor(mockCols/2), Math.floor(mockRows/2), CONFIG.PLAYER_COLOR, null); // Player
     expect(minimapSpy).toHaveBeenCalledOnce();
     minimapSpy.mockRestore();
  });

   it('drawSystemMinimap should draw border and entities within map bounds', () => {
    sceneRenderer.drawSolarSystem(mockPlayer, mockSystem); // Calls minimap internally

    expect(mockDrawingContext.drawBox).toHaveBeenCalledOnce();
    expect(mockDrawingContext.drawBox).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number), '#888888', null); // Border
    expect(mockScreenBuffer.drawChar).toHaveBeenCalledWith(null, expect.any(Number), expect.any(Number), null, expect.any(String)); // BG clear
    expect(mockScreenBuffer.drawChar).toHaveBeenCalledWith(CONFIG.PLAYER_CHAR, expect.any(Number), expect.any(Number), CONFIG.PLAYER_COLOR, null); // Player
   });

  describe('drawPlanetSurface', () => {
    it('should delegate to drawSolidPlanetSurface for solid planets', () => {
      const solidSpy = vi.spyOn(sceneRenderer as any, 'drawSolidPlanetSurface');
      sceneRenderer.drawPlanetSurface(mockPlayer, mockSolidPlanet);
      expect(solidSpy).toHaveBeenCalledWith(mockPlayer, mockSolidPlanet);
      solidSpy.mockRestore();
    });

    it('should delegate to drawGasGiantSurface for gas giants', () => {
      const gasSpy = vi.spyOn(sceneRenderer as any, 'drawGasGiantSurface');
      sceneRenderer.drawPlanetSurface(mockPlayer, mockGasGiant);
      expect(gasSpy).toHaveBeenCalledWith(mockPlayer, mockGasGiant);
      gasSpy.mockRestore();
    });

    it('should delegate to drawStarbaseInterior for starbases', () => {
      const starbaseSpy = vi.spyOn(sceneRenderer as any, 'drawStarbaseInterior');
      sceneRenderer.drawPlanetSurface(mockPlayer, mockStarbase);
      expect(starbaseSpy).toHaveBeenCalledWith(mockPlayer, mockStarbase);
      starbaseSpy.mockRestore();
    });
  });

  it('drawSolidPlanetSurface should draw terrain and player', () => {
     const legendSpy = vi.spyOn(sceneRenderer as any, 'drawHeightmapLegend');
     // We need to ensure the mock planet has heightmap and colors for this test
     sceneRenderer.drawPlanetSurface(mockPlayer, mockSolidPlanet);

     expect(mockScreenBuffer.drawChar).toHaveBeenCalledWith(GLYPHS.BLOCK, expect.any(Number), expect.any(Number), '#111', '#111');
     expect(mockScreenBuffer.drawChar).toHaveBeenCalledWith(GLYPHS.BLOCK, expect.any(Number), expect.any(Number), '#333', '#333');
     expect(mockScreenBuffer.drawChar).toHaveBeenCalledWith(mockPlayer.char, Math.floor(mockCols/2), Math.floor(mockRows/2), CONFIG.PLAYER_COLOR, null);
     expect(legendSpy).toHaveBeenCalledWith(mockSolidPlanet);
     legendSpy.mockRestore();
  });

   it('drawGasGiantSurface should draw atmospheric patterns and player', () => {
        // Need to ensure mock gas giant has rgbPaletteCache
        sceneRenderer.drawPlanetSurface(mockPlayer, mockGasGiant);

        expect(mockScreenBuffer.drawChar).toHaveBeenCalledWith(expect.stringMatching(/[\u2591\u2592\u2593 ]/), expect.any(Number), expect.any(Number), expect.stringMatching(/^#[0-9A-F]{6}$/), expect.stringMatching(/^#[0-9A-F]{6}$/));
        expect(mockScreenBuffer.drawChar).toHaveBeenCalledWith(mockPlayer.char, Math.floor(mockCols/2), Math.floor(mockRows/2), CONFIG.PLAYER_COLOR, null);
   });

   it('drawStarbaseInterior should draw box, text, and player', () => {
        sceneRenderer.drawPlanetSurface(mockPlayer, mockStarbase);

        expect(mockDrawingContext.drawBox).toHaveBeenCalledOnce();
        expect(mockScreenBuffer.drawString).toHaveBeenCalledWith(expect.stringContaining('Starbase Docking Bay'), expect.any(Number), expect.any(Number), CONFIG.STARBASE_COLOR, null);
        expect(mockScreenBuffer.drawString).toHaveBeenCalledWith(expect.stringContaining('Trade Commodities'), expect.any(Number), expect.any(Number), CONFIG.DEFAULT_FG_COLOR, null);
        expect(mockScreenBuffer.drawChar).toHaveBeenCalledWith(mockPlayer.char, Math.floor(mockCols/2), Math.floor(mockRows/2), CONFIG.PLAYER_COLOR, null);
   });

   it('drawHeightmapLegend should draw color blocks and labels', () => {
       // Call via drawSolidPlanetSurface which needs heightLevelColors
       sceneRenderer.drawPlanetSurface(mockPlayer, mockSolidPlanet);

       const legendHeight = Math.min(mockRows - 2, 20);
       expect(mockScreenBuffer.drawChar).toHaveBeenCalledWith(GLYPHS.BLOCK, expect.any(Number), expect.any(Number), expect.any(String), expect.any(String));
    
    interface DrawCharCall {
        0: string;
        1: number;
        2: number;
        3: string | null;
        4: string | null;
    }

    const blockCalls: DrawCharCall[] = vi.mocked(mockScreenBuffer.drawChar).mock.calls.filter(
        (call: DrawCharCall): call is DrawCharCall => call[0] === GLYPHS.BLOCK
    );
    expect(blockCalls.length).toBeGreaterThanOrEqual(legendHeight);
       expect(mockScreenBuffer.drawString).toHaveBeenCalledWith("High", expect.any(Number), expect.any(Number), CONFIG.DEFAULT_FG_COLOR, null);
       expect(mockScreenBuffer.drawString).toHaveBeenCalledWith("Low", expect.any(Number), expect.any(Number), CONFIG.DEFAULT_FG_COLOR, null);
   });
});