const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

/** Checks the production instrument through physical keys, real purchases and validated save import. */
async function main() {
  const output = process.env.OBSERVATORY_CAPTURE_DIR || '/tmp/cosmic-observatory';
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
        errors.push(message.text());
    });
    await page.goto(process.env.COSMIC_URL || 'http://127.0.0.1:5176/');
    await page.waitForSelector('#newGameButton');
    const fixture = await page.evaluate(async () => {
      const { Player } = await import('/src/core/player.ts');
      const { PRNG } = await import('/src/utils/prng.ts');
      const { CONFIG } = await import('/src/config.ts');
      const { SystemDataGenerator } = await import('/src/generation/system_data_generator.ts');
      const { SolarSystem } = await import('/src/entities/solar_system.ts');
      const { Game } = await import('/src/core/game.ts');
      const { getStationSections } = await import('/src/core/starbase_ui.ts');
      const { SAVE_GAME_VERSION } = await import('/src/core/save_game.ts');
      const { createXenobiologySnapshot } = await import('/src/entities/biology/biology_types.ts');
      const seed = 'observatory-browser-v1';
      const prng = new PRNG(seed);
      const x = CONFIG.PLAYER_START_X + CONFIG.STARTING_HUB_OFFSET_X;
      const y = CONFIG.PLAYER_START_Y + CONFIG.STARTING_HUB_OFFSET_Y;
      const generator = new SystemDataGenerator(prng);
      const system = new SolarSystem(generator.getSystemProperties(x, y), x, y, prng);
      if (!system.starbase) throw new Error('Starting station missing.');
      const player = new Player(x, y);
      player.resources.credits = 30000;
      const yard = Object.assign(Object.create(Game.prototype), {
        player,
        stateManager: { currentStarbase: system.starbase, currentSystem: system },
        getTradeDepotManifest: () => [],
      });
      return {
        x,
        y,
        yardSection: getStationSections(system.starbase).findIndex((section) => section.id === 'shipyard'),
        upgradeRow: yard
          .getStarbaseRows(system.starbase, 'shipyard')
          .findIndex((row) => row.id === 'shipyard:observatory:1'),
        save: {
          version: SAVE_GAME_VERSION,
          generationVersion: CONFIG.GALAXY_MODEL_VERSION,
          savedAt: new Date().toISOString(),
          seed,
          gameClockElapsedSeconds: 100,
          player: {
            position: player.position,
            render: player.render,
            resources: player.resources,
            cargoHold: player.cargoHold,
            terrainVehicle: player.terrainVehicle,
            ship: player.ship,
            crew: player.crew,
          },
          location: {
            kind: 'starbase',
            worldX: x,
            worldY: y,
            systemSlot: 0,
            stationId: system.starbase.id,
            starbaseName: system.starbase.name,
          },
          systemOrbit: null,
          planetMutations: [],
          acceptedMissionIds: [],
          readyMissionIds: [],
          completedMissionIds: [],
          activeMissions: {},
          missionObjectiveProgress: {},
          catalogueDiscoveries: {},
          economy: {},
          tutorialHintsShown: [],
          xenobiology: createXenobiologySnapshot(),
        },
      };
    });
    /** Waits for each frame to consume a complete physical key press. */
    const press = async (key) => {
      await page.keyboard.press(key, { delay: 50 });
      await page.waitForTimeout(80);
    };
    /** Imports through the application's normal picker and waits for the new game to become visible. */
    const load = async (save) => {
      const originalSavedAt = save.savedAt;
      await page.locator('#saveImportInput').setInputFiles({
        name: 'observatory-fixture.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(save)),
      });
      await page.waitForFunction(
        ({ seed, originalSavedAt }) => {
          const key = Object.keys(sessionStorage).find((key) => key.startsWith('cosmic-voyage.session.v'));
          const imported = key && JSON.parse(sessionStorage.getItem(key));
          const failed = document.querySelector('#splashMessage').textContent.startsWith('Import failed:');
          return (
            failed ||
            (document.querySelector('#splashScreen').hidden &&
              imported?.seed === seed &&
              imported.savedAt !== originalSavedAt)
          );
        },
        { seed: save.seed, originalSavedAt },
        { timeout: 15000 }
      );
      const message = await page.locator('#splashMessage').textContent();
      assert(!message.startsWith('Import failed:'), message);
      await page.waitForTimeout(600);
    };
    /** Reads a real application checkpoint rather than accessing a running Game's private fields. */
    const checkpoint = async () => {
      await press('F10');
      await page.locator('#checkpointButton').click();
      const save = await page.evaluate(async () => {
        const { SESSION_SAVE_KEY } = await import('/src/core/save_game.ts');
        return JSON.parse(sessionStorage.getItem(SESSION_SAVE_KEY));
      });
      await press('F10');
      return save;
    };
    /** Checks both font faces, a nonblank terminal and the absence of a planet raster over the screen. */
    const capture = async (name) => {
      await page.evaluate(() => document.fonts.ready);
      const pixels = await page.evaluate(() => {
        const canvas = document.querySelector('#gameCanvas');
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let lit = 0;
        for (let index = 0; index < data.length; index += 4)
          if (data[index] + data[index + 1] + data[index + 2] > 60) lit++;
        const raster = document.querySelector('#gameCanvasOrbit');
        const detail = raster.getContext('2d').getImageData(0, 0, raster.width, raster.height).data;
        let detailPixels = 0;
        for (let index = 0; index < detail.length; index += 4)
          if (detail[index + 3] > 0 && detail[index] + detail[index + 1] + detail[index + 2] > 60)
            detailPixels++;
        return {
          lit,
          detailPixels,
          thick: document.fonts.check('16px PxPlus_IBM_CGA'),
          thin: document.fonts.check('16px PxPlus_IBM_CGAthin'),
        };
      });
      await page.screenshot({ path: path.join(output, `${name}.png`) });
      assert(pixels.lit > 300 && pixels.thick && pixels.thin, JSON.stringify({ name, pixels, errors }));
      assert.equal(pixels.detailPixels, 0, 'Physical raster covers the observatory.');
      return pixels;
    };
    await load(fixture.save);
    assert(fixture.yardSection >= 0 && fixture.upgradeRow >= 0);
    for (let index = 0; index < fixture.yardSection; index++) await press('ArrowRight');
    for (let index = 0; index < fixture.upgradeRow; index++) await press('ArrowDown');
    await press('Enter');
    const fitted = await checkpoint();
    assert.equal(fitted.player.ship.observatoryClass, 1, 'Shipyard did not install the observatory.');
    assert.equal(fitted.player.resources.credits, fixture.save.player.resources.credits - 3600);
    assert.equal(fitted.player.ship.specialBaysOccupied, fixture.save.player.ship.specialBaysOccupied + 1);
    fitted.location = { kind: 'hyperspace', worldX: fixture.x, worldY: fixture.y, systemSlot: 0 };
    await load(fitted);
    await page.locator('[data-command-id="observatory"]').click();
    await page.waitForTimeout(3500);
    await capture('desktop-class-I');
    const baseline = await checkpoint();
    assert(Object.keys(baseline.observatory.observations).length > 0, 'Passive spectra missing.');
    assert(
      Object.values(baseline.observatory.observations).some((record) => record.biology === 'catalogued'),
      'Actual starting biosphere not recognised.'
    );
    await page.waitForTimeout(500);
    const paused = await checkpoint();
    assert.equal(
      paused.gameClockElapsedSeconds,
      baseline.gameClockElapsedSeconds,
      'Instrument browsing advances time.'
    );
    await press('v');
    const exposed = await checkpoint();
    assert.equal(exposed.gameClockElapsedSeconds - paused.gameClockElapsedSeconds, 300);
    await press('Enter');
    const marked = await checkpoint();
    assert(marked.observatory.destination, 'Destination not recorded.');
    assert.equal(marked.observatory.destination.systemSlot, 0);
    assert.deepEqual(marked.readyMissionIds, baseline.readyMissionIds);
    await press('PageDown');
    await capture('desktop-report-scroll');
    await press('ArrowRight');
    await press('Tab');
    await press('ArrowRight');
    await capture('combined-filters');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
    await capture('mobile-filtered');
    await press('Escape');
    await load(marked);
    await press('f');
    await page.waitForTimeout(3500);
    const reloaded = await checkpoint();
    assert.deepEqual(reloaded.observatory.destination, marked.observatory.destination);
    await capture('mobile-reloaded');
    await press('c');
    assert.equal((await checkpoint()).observatory.destination, null);
    await press('Escape');
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          output,
          observations: Object.keys(reloaded.observatory.observations).length,
          shipyardPurchase: true,
          pausedBrowsing: true,
          exposureSeconds: 300,
          destinationRoundTrip: true,
          errors,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
