const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

/** Checks typed microbial interactions in the real application using a controlled, physically compatible field fixture. */
async function main() {
  const output = process.env.MICROBIAL_CAPTURE_DIR || '/tmp/cosmic-microbial';
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
    await page.goto(process.env.COSMIC_URL || 'http://127.0.0.1:5177/');
    await page.waitForSelector('#newGameButton');
    const fixture = await page.evaluate(async () => {
      const { CONFIG } = await import('/src/config.ts');
      const { PRNG } = await import('/src/utils/prng.ts');
      const { Player } = await import('/src/core/player.ts');
      const { SystemDataGenerator } = await import('/src/generation/system_data_generator.ts');
      const { SolarSystem } = await import('/src/entities/solar_system.ts');
      const { prepareBiosphere, createBiologyEnvironment } =
        await import('/src/entities/biology/biosphere_generator.ts');
      const { generateMicrobialCommunity } = await import('/src/entities/biology/microbial_biosphere.ts');
      const { createEncounter } = await import('/src/systems/surface_encounter_system.ts');
      const { createXenobiologySnapshot } = await import('/src/entities/biology/biology_types.ts');
      const { SAVE_GAME_VERSION, getSystemPlanetPaths } = await import('/src/core/save_game.ts');
      const seed = 'microbial-browser-v1';
      const prng = new PRNG(seed);
      const x = CONFIG.PLAYER_START_X + CONFIG.STARTING_HUB_OFFSET_X;
      const y = CONFIG.PLAYER_START_Y + CONFIG.STARTING_HUB_OFFSET_Y;
      const generator = new SystemDataGenerator(prng);
      const system = new SolarSystem(generator.getSystemProperties(x, y), x, y, prng);
      const planet = system.colonyWorld;
      if (!planet || !system.starbase) throw new Error('Compatible colony fixture missing.');
      await planet.prepareSurfaceReady();
      const bodyPath = getSystemPlanetPaths(system).find((entry) => entry.planet === planet).path;
      const managed = prepareBiosphere(planet, system, bodyPath);
      const site = managed?.sites.find(
        (entry) => entry.habitat?.kind === 'moist-margin' || entry.habitat?.kind === 'rocky-margin'
      );
      if (!site) throw new Error('Water-margin fixture missing.');
      const environment = createBiologyEnvironment(planet, system, bodyPath);
      // This fixture isolates controls/rendering; actual native occurrence is checked by the population probe.
      // Introduced contacts on a managed world avoid fabricating an indigenous discovery in this test save.
      const biosphere = {
        id: environment.bodyId,
        bodyName: planet.name,
        origin: 'introduced',
        complexity: 'microbial-only',
        sites: [site],
        species: generateMicrobialCommunity(environment, prng).map((species) => ({
          ...species,
          origin: 'introduced',
          recognised: true,
          baselineSamples: 0,
        })),
      };
      const field = createEncounter(biosphere, site);
      const target = field.individuals[0];
      field.individuals = [target];
      target.x = target.homeX = 15;
      target.y = target.homeY = 20;
      field.terrain[20] = field.terrain[20].substring(0, 15) + '..' + field.terrain[20].substring(17);
      const xenobiology = createXenobiologySnapshot();
      xenobiology.fields[site.id] = field;
      xenobiology.activeSiteId = site.id;
      const player = new Player(x, y);
      player.position.surfaceX = site.x;
      player.position.surfaceY = site.y;
      player.terrainVehicle.deployed = true;
      player.terrainVehicle.shipSurfaceX = site.x;
      player.terrainVehicle.shipSurfaceY = site.y;
      return {
        station: { id: system.starbase.id, name: system.starbase.name },
        targetId: target.id,
        speciesId: target.speciesId,
        siteId: site.id,
        save: {
          version: SAVE_GAME_VERSION,
          surveyData: { evidence: {}, paid: {}, charts: {}, buyers: {} },
          depots: {},
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
            kind: 'planet',
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
          xenobiology,
        },
      };
    });
    /** Sends complete physical key presses through the production input manager. */
    const press = async (key) => {
      await page.keyboard.press(key, { delay: 55 });
      await page.waitForTimeout(100);
    };
    /** Restores a fixture through normal validated import without accessing a live Game's private state. */
    const load = async (save) => {
      await page.locator('#saveImportInput').setInputFiles({
        name: 'microbial-fixture.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(save)),
      });
      await page.waitForFunction(
        ({ seed, savedAt }) => {
          const key = Object.keys(sessionStorage).find((entry) =>
            entry.startsWith('cosmic-voyage.session.v')
          );
          const imported = key && JSON.parse(sessionStorage.getItem(key));
          return (
            (document.querySelector('#splashScreen').hidden &&
              imported?.seed === seed &&
              imported.savedAt !== savedAt) ||
            document.querySelector('#splashMessage').textContent.startsWith('Import failed:')
          );
        },
        { seed: save.seed, savedAt: save.savedAt },
        { timeout: 15000 }
      );
      const message = await page.locator('#splashMessage').textContent();
      assert(!message.startsWith('Import failed:'), message);
      await page.waitForTimeout(700);
    };
    /** Reads a normal game checkpoint, including validated source exhaustion and specimen metadata. */
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
    /** Captures visible terminals and requires organism pixels only while the field view is active. */
    const capture = async (name, expectSprites) => {
      if (expectSprites)
        await page.waitForFunction(
          () => {
            const raster = document.querySelector('#gameCanvasOrbit');
            if (!(raster instanceof HTMLCanvasElement) || raster.width === 0 || raster.height === 0)
              return false;
            const detail = raster.getContext('2d').getImageData(0, 0, raster.width, raster.height).data;
            let sprites = 0;
            for (let index = 0; index < detail.length; index += 16) {
              if (detail[index + 3] > 128 && detail[index] + detail[index + 1] + detail[index + 2] > 60) {
                sprites++;
                if (sprites > 20) return true;
              }
            }
            return false;
          },
          null,
          { timeout: 30000 }
        );
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      );
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(output, `${name}.png`) });
      await page.evaluate(
        () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      );
      const pixels = await page.evaluate(() => {
        const canvas = document.querySelector('#gameCanvas');
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let lit = 0;
        for (let index = 0; index < data.length; index += 4)
          if (data[index] + data[index + 1] + data[index + 2] > 60) lit++;
        const raster = document.querySelector('#gameCanvasOrbit');
        const detail = raster.getContext('2d').getImageData(0, 0, raster.width, raster.height).data;
        let sprites = 0;
        let visibleSprites = 0;
        let minX = raster.width,
          minY = raster.height,
          maxX = -1,
          maxY = -1;
        for (let pixel = 0; pixel < raster.width * raster.height; pixel++) {
          const index = pixel * 4;
          if (detail[index + 3] > 0 && detail[index] + detail[index + 1] + detail[index + 2] > 60) {
            sprites++;
            if (detail[index + 3] > 128) visibleSprites++;
            const x = pixel % raster.width,
              y = Math.floor(pixel / raster.width);
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        }
        return {
          lit,
          sprites,
          visibleSprites,
          rasterWidth: raster.width,
          rasterHeight: raster.height,
          spriteBounds: sprites ? { minX, minY, maxX, maxY } : null,
          thin: document.fonts.check('16px PxPlus_IBM_CGAthin'),
          thick: document.fonts.check('16px PxPlus_IBM_CGA'),
        };
      });
      assert(pixels.lit > 300 && pixels.thin && pixels.thick, JSON.stringify({ name, pixels }));
      if (expectSprites) assert(pixels.visibleSprites > 20, 'Field silhouettes missing.');
      return pixels;
    };
    await load(fixture.save);
    const metrics = { desktop: await capture('desktop-microbial-field', true) };
    await press('v');
    let save = await checkpoint();
    assert.equal(save.xenobiology.evidence[fixture.speciesId].level, 2);
    assert(await page.locator('[data-command-id="stun"]').isDisabled());
    assert(await page.locator('[data-command-id="shoot"]').isDisabled());
    const time = save.gameClockElapsedSeconds;
    await press('k');
    await press('t');
    assert.equal(
      (await checkpoint()).gameClockElapsedSeconds,
      time,
      'A microbial weapon refusal advanced time.'
    );
    await press('a');
    save = await checkpoint();
    assert.equal(save.xenobiology.evidence[fixture.speciesId].level, 3);
    await press('d');
    await page.waitForTimeout(1700);
    await capture('desktop-microbial-dossier', false);
    await page.setViewportSize({ width: 480, height: 900 });
    await capture('narrow-microbial-dossier', false);
    await press('PageDown');
    await capture('narrow-microbial-dossier-page', false);
    await press('Escape');
    await capture('narrow-microbial-field', true);
    await page.setViewportSize({ width: 1400, height: 900 });
    await press('s');
    save = await checkpoint();
    assert.equal(save.player.terrainVehicle.cargoHold.specimens.length, 1);
    assert.equal(save.player.terrainVehicle.cargoHold.specimens[0].materialMassKg, 0.005);
    const sampleTime = save.gameClockElapsedSeconds;
    await press('s');
    assert.equal(
      (await checkpoint()).gameClockElapsedSeconds,
      sampleTime,
      'Repeated material sampling advanced time.'
    );
    await press('i');
    await capture('desktop-microbial-cargo', false);
    await press('Enter');
    save = await checkpoint();
    assert.equal(save.player.ship.stasisClass, 1);
    assert.deepEqual(
      save.player.terrainVehicle.cargoHold.specimens.map((item) => item.kind),
      ['tissue', 'live']
    );
    assert(
      save.player.terrainVehicle.cargoHold.specimens.every(
        (item) => item.volumeM3 === 0.1 && item.materialMassKg === 0.005
      )
    );
    assert.equal(save.xenobiology.fields[fixture.siteId].individuals[0].state, 'collected');
    await press('Escape');
    await load(save);
    const restored = await checkpoint();
    assert.deepEqual(
      restored.player.terrainVehicle.cargoHold.specimens,
      save.player.terrainVehicle.cargoHold.specimens
    );
    assert.equal(restored.xenobiology.fields[fixture.siteId].individuals[0].state, 'collected');
    await press('F10');
    const docked = structuredClone(restored);
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
    for (let index = 0; index < 3; index++) await press('ArrowRight');
    await capture('microbial-sell', false);
    const before = await checkpoint();
    await press('Enter');
    const sold = await checkpoint();
    assert(
      sold.player.resources.credits > before.player.resources.credits,
      'Microbial scientific sample did not pay.'
    );
    assert.equal(sold.player.terrainVehicle.cargoHold.specimens.length, 1);
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        { output, metrics, samples: save.player.terrainVehicle.cargoHold.specimens.length, errors },
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
