const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

/** Exercises the production application through keyboard controls and versioned JSON import/export. */
async function main() {
  const output = process.env.XENO_CAPTURE_DIR || '/tmp/cosmic-xenobiology';
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(process.env.COSMIC_URL || 'http://127.0.0.1:5173/');
    await page.waitForSelector('#newGameButton');
    const fixture = await page.evaluate(async () => {
      const { Player } = await import('/src/core/player.ts');
      const { PRNG } = await import('/src/utils/prng.ts');
      const { CONFIG } = await import('/src/config.ts');
      const { SystemDataGenerator } = await import('/src/generation/system_data_generator.ts');
      const { SolarSystem } = await import('/src/entities/solar_system.ts');
      const { prepareBiosphere } = await import('/src/entities/biology/biosphere_generator.ts');
      const { createXenobiologySnapshot } = await import('/src/entities/biology/biology_types.ts');
      const { SAVE_GAME_VERSION, getSystemPlanetPaths } = await import('/src/core/save_game.ts');
      const { installShipyardUpgrade } = await import('/src/core/ship_modifications.ts');
      const seed = 'xenobiology-browser-v1',
        prng = new PRNG(seed);
      const x = CONFIG.PLAYER_START_X + CONFIG.STARTING_HUB_OFFSET_X,
        y = CONFIG.PLAYER_START_Y + CONFIG.STARTING_HUB_OFFSET_Y;
      const generator = new SystemDataGenerator(prng),
        system = new SolarSystem(generator.getSystemProperties(x, y), x, y, prng);
      const body = system.colonyWorld;
      if (!body) throw new Error('Starting colony missing.');
      await body.prepareSurfaceReady();
      const bodyPath = getSystemPlanetPaths(system).find((entry) => entry.planet === body).path;
      const biosphere = prepareBiosphere(body, system, bodyPath);
      if (!biosphere?.sites.length) throw new Error('Starting colony has no accessible biology.');
      const player = new Player(x, y);
      player.resources.credits = 10000;
      installShipyardUpgrade(player.ship, 'shipyard:stasis:2');
      return {
        station: { id: system.starbase.id, name: system.starbase.name },
        biosphere,
        save: {
          version: SAVE_GAME_VERSION,
          generationVersion: CONFIG.GALAXY_MODEL_VERSION,
          savedAt: new Date().toISOString(),
          seed,
          gameClockElapsedSeconds: 100,
          player: {
            position: player.position,
            resources: player.resources,
            render: player.render,
            cargoHold: player.cargoHold,
            terrainVehicle: player.terrainVehicle,
            ship: player.ship,
            crew: player.crew,
          },
          location: {
            kind: 'orbit',
            worldX: x,
            worldY: y,
            systemSlot: 0,
            bodyPath,
            orbitReferencePath: bodyPath,
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
    /** Uses the real shared import picker, never assigning state into a running Game. */
    const load = async (save) => {
      await page.locator('#saveImportInput').setInputFiles({
        name: 'xeno-fixture.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(save)),
      });
      await page.waitForFunction(() => document.querySelector('#splashScreen').hidden);
      await page.waitForTimeout(500);
    };
    /** Sends a complete physical key press with enough time for the game frame to consume it. */
    const press = async (key) => {
      await page.keyboard.press(key, { delay: 55 });
      await page.waitForTimeout(65);
    };
    /** Reads an explicit session checkpoint through the game's pause menu. */
    const checkpoint = async () => {
      await press('F10');
      await page.locator('#checkpointButton').click();
      const save = await page.evaluate(() => JSON.parse(sessionStorage.getItem('cosmic-voyage.session.v11')));
      await press('F10');
      return save;
    };
    /** Checks the real font faces and nonblank canvas before taking a screenshot. */
    const capture = async (name) => {
      await page.evaluate(() => document.fonts.ready);
      const pixels = await page.evaluate(() => {
        const canvas = document.querySelector('#gameCanvas'),
          ctx = canvas.getContext('2d');
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        let lit = 0,
          centreHash = 2166136261;
        for (let index = 0; index < data.length; index += 4)
          if (data[index] + data[index + 1] + data[index + 2] > 60) lit++;
        // Dialogs must alter the frozen field's central raster, not merely be active but invisible.
        for (let y = Math.floor(canvas.height * 0.15); y < canvas.height * 0.75; y++)
          for (let x = Math.floor(canvas.width * 0.2); x < canvas.width * 0.8; x++) {
            const index = (y * canvas.width + x) * 4;
            centreHash = Math.imul(centreHash ^ (data[index] + data[index + 1] + data[index + 2]), 16777619);
          }
        return {
          lit,
          centreHash: centreHash >>> 0,
          width: canvas.width,
          height: canvas.height,
          thick: document.fonts.check('16px PxPlus_IBM_CGA'),
          thin: document.fonts.check('16px PxPlus_IBM_CGAthin'),
        };
      });
      assert(pixels.lit > 500 && pixels.thick && pixels.thin, JSON.stringify(pixels));
      await page.screenshot({ path: path.join(output, `${name}.png`) });
      return pixels;
    };
    await load(fixture.save);
    await page.waitForTimeout(1500);
    await press('b');
    await press('Enter');
    await page.waitForTimeout(500);
    await press('Enter');
    await press('Enter');
    await press('b');
    let save = await checkpoint();
    assert(save.xenobiology.activeSiteId, 'Keyboard habitat entry failed.');
    const field = save.xenobiology.fields[save.xenobiology.activeSiteId];
    const startTime = save.gameClockElapsedSeconds;
    await page.waitForTimeout(750);
    assert.equal((await checkpoint()).gameClockElapsedSeconds, startTime, 'Local time advanced while idle.');
    await press('v');
    const metrics = { desktop: await capture('desktop-field') };
    save = await checkpoint();
    assert(Object.keys(save.xenobiology.evidence).length > 0, 'Observation not recorded.');
    await press('d');
    await page.waitForTimeout(1700);
    assert.notEqual((await capture('desktop-dossier')).centreHash, metrics.desktop.centreHash);
    await press('Escape');
    await press('Enter');
    await press('ArrowDown');
    await press('ArrowDown');
    await press('Enter');
    await capture('desktop-stun');
    await press('Escape');
    // The permanently sessile nearest producer is a stable collection target for this real generated field.
    const target = field.individuals[8];
    const { Path } = require('rot-js');
    const route = [];
    new Path.AStar(
      target.x - 1,
      target.y,
      (x, y) =>
        field.terrain[y]?.[x] === '.' && !field.individuals.some((item) => item.x === x && item.y === y),
      { topology: 4 }
    ).compute(field.roverX, field.roverY, (x, y) => route.push([x, y]));
    assert(route.length > 1, 'No route to specimen.');
    for (let index = 1; index < route.length; index++) {
      const [x, y] = route[index],
        [px, py] = route[index - 1];
      await press(x > px ? 'ArrowRight' : x < px ? 'ArrowLeft' : y > py ? 'ArrowDown' : 'ArrowUp');
    }
    for (let attempt = 0; attempt < 12; attempt++) {
      await press('v');
      await press('Enter');
      for (let index = 0; index < 3; index++) await press('ArrowDown');
      await press('Enter');
      save = await checkpoint();
      if (save.player.terrainVehicle.cargoHold.specimens.length) break;
      await press('Tab');
    }
    assert.equal(save.player.terrainVehicle.cargoHold.specimens.length, 1, 'Physical collection failed.');
    const restored = structuredClone(save);
    await load(restored);
    save = await checkpoint();
    assert.equal(
      save.player.terrainVehicle.cargoHold.specimens[0].id,
      restored.player.terrainVehicle.cargoHold.specimens[0].id
    );
    await page.setViewportSize({ width: 480, height: 900 });
    await page.waitForTimeout(400);
    metrics.narrow = await capture('narrow-field');
    await press('d');
    await page.waitForTimeout(1700);
    assert.notEqual((await capture('narrow-dossier')).centreHash, metrics.narrow.centreHash);
    await press('Escape');
    await press('Enter');
    assert.notEqual((await capture('narrow-operations')).centreHash, metrics.narrow.centreHash);
    await press('Escape');
    await page.setViewportSize({ width: 1400, height: 900 });
    const docked = structuredClone(save);
    docked.xenobiology.activeSiteId = null;
    docked.player.terrainVehicle.deployed = false;
    docked.location = {
      kind: 'starbase',
      worldX: fixture.save.location.worldX,
      worldY: fixture.save.location.worldY,
      systemSlot: 0,
      stationId: fixture.station.id,
      starbaseName: fixture.station.name,
    };
    await load(docked);
    for (let index = 0; index < 4; index++) await press('ArrowRight');
    await capture('research-exchange');
    const before = (await checkpoint()).player.resources.credits;
    await press('Enter');
    const paid = (await checkpoint()).player.resources.credits;
    assert(paid > before, 'Research submission did not pay.');
    await press('Enter');
    assert.equal((await checkpoint()).player.resources.credits, paid, 'Repeat submission paid again.');
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          output,
          body: fixture.biosphere.bodyName,
          habitats: fixture.biosphere.sites.length,
          specimen: save.player.terrainVehicle.cargoHold.specimens[0].kind,
          award: paid - before,
          metrics,
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
