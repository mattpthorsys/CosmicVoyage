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
    page.on('console', (message) => {
      // Chromium requests this optional browser icon even though it is not a game asset.
      if (message.type() === 'error' && !message.location().url.endsWith('/favicon.ico'))
        errors.push(`${message.text()} @ ${message.location().url}`);
    });
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
      if (player.ship.stasisClass !== 1) throw new Error('Basic stasis missing from starting equipment.');
      return {
        station: { id: system.starbase.id, name: system.starbase.name },
        systemName: system.name,
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
      const originalSavedAt = save.savedAt;
      await page.locator('#saveImportInput').setInputFiles({
        name: 'xeno-fixture.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(save)),
      });
      await page.waitForFunction(
        ({ seed, originalSavedAt }) => {
          const saveKey = Object.keys(sessionStorage).find((key) =>
            key.startsWith('cosmic-voyage.session.v')
          );
          const imported = saveKey && JSON.parse(sessionStorage.getItem(saveKey));
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
      const importFailure = await page.locator('#splashMessage').textContent();
      assert(!importFailure.startsWith('Import failed:'), importFailure);
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
      const save = await page.evaluate(async () => {
        const { SESSION_SAVE_KEY } = await import('/src/core/save_game.ts');
        return JSON.parse(sessionStorage.getItem(SESSION_SAVE_KEY));
      });
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
        const spriteCanvas = document.querySelector('#gameCanvasOrbit');
        const sprites = spriteCanvas
          .getContext('2d')
          .getImageData(0, 0, spriteCanvas.width, spriteCanvas.height).data;
        let spritePixels = 0;
        for (let index = 0; index < sprites.length; index += 4)
          if (sprites[index + 3] > 0 && sprites[index] + sprites[index + 1] + sprites[index + 2] > 60)
            spritePixels++;
        return {
          lit,
          spritePixels,
          centreHash: centreHash >>> 0,
          width: canvas.width,
          height: canvas.height,
          thick: document.fonts.check('16px PxPlus_IBM_CGA'),
          thin: document.fonts.check('16px PxPlus_IBM_CGAthin'),
        };
      });
      await page.screenshot({ path: path.join(output, `${name}.png`) });
      assert(pixels.lit > 500 && pixels.thick && pixels.thin, JSON.stringify({ ...pixels, errors }));
      return pixels;
    };
    /** Counts the mission marker colour only inside the terrain, excluding highlighted panel text. */
    const missionMarkerPixels = async () =>
      page.evaluate(async () => {
        const { CONFIG } = await import('/src/config.ts');
        const { getEncounterLayout } = await import('/src/rendering/surface_encounter_renderer.ts');
        const canvas = document.querySelector('#gameCanvas');
        const cellHeight = CONFIG.FONT_SIZE_PX * CONFIG.CHAR_SCALE;
        const cellWidth = cellHeight * CONFIG.CHAR_ASPECT_RATIO;
        const field = getEncounterLayout(
          Math.floor(canvas.width / cellWidth),
          Math.floor(canvas.height / cellHeight)
        ).field;
        const data = canvas
          .getContext('2d')
          .getImageData(
            field.x * cellWidth,
            field.y * cellHeight,
            field.width * cellWidth,
            field.height * cellHeight
          ).data;
        let count = 0;
        for (let index = 0; index < data.length; index += 4)
          if (data[index] < 20 && data[index + 1] > 235 && data[index + 2] > 85 && data[index + 2] < 120)
            count++;
        return count;
      });
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
    assert(metrics.desktop.spritePixels > 20, 'Field silhouettes absent from the overlay raster.');
    save = await checkpoint();
    assert(Object.keys(save.xenobiology.evidence).length > 0, 'Observation not recorded.');
    const logTime = save.gameClockElapsedSeconds;
    await press('x');
    await page.waitForTimeout(1700);
    metrics.scienceLog = await capture('desktop-science-log');
    assert.equal(metrics.scienceLog.spritePixels, 0, 'Field sprites leaked through the science log.');
    await page.setViewportSize({ width: 480, height: 800 });
    await capture('narrow-science-log');
    await press('s');
    await press('s');
    await press('s');
    await press('s');
    assert.equal((await checkpoint()).gameClockElapsedSeconds, logTime, 'Science log did not pause time.');
    await press('Escape');
    await page.setViewportSize({ width: 1400, height: 900 });
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
    const target = field.individuals
      .filter(
        (actor) => field.species.find((species) => species.id === actor.speciesId)?.behaviour === 'sessile'
      )
      .sort(
        (a, b) =>
          Math.hypot(a.x - field.roverX, a.y - field.roverY) -
          Math.hypot(b.x - field.roverX, b.y - field.roverY)
      )[0];
    assert(target, 'No sessile reference organism in this habitat.');
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
      await press('s');
      save = await checkpoint();
      if (save.player.terrainVehicle.cargoHold.specimens.length) break;
      await press('Tab');
    }
    assert.equal(save.player.terrainVehicle.cargoHold.specimens.length, 1, 'Physical collection failed.');
    await page.locator('[data-command-id="cargo"]').click();
    await page.waitForTimeout(150);
    await capture('desktop-cargo');
    const currentField = save.xenobiology.fields[save.xenobiology.activeSiteId];
    const nearby = currentField.individuals.filter(
      (actor) =>
        actor.state !== 'collected' &&
        Math.hypot(actor.x - currentField.roverX, actor.y - currentField.roverY) <= 1.5
    ).length;
    for (let index = 0; index < nearby; index++) {
      await press('Enter');
      save = await checkpoint();
      if (save.player.terrainVehicle.cargoHold.specimens.some((container) => container.kind === 'live'))
        break;
      await press('ArrowDown');
    }
    assert.equal(save.player.ship.stasisClass, 1, 'Test silently acquired upgraded stasis.');
    assert.equal(save.player.terrainVehicle.cargoHold.specimens.length, 2, 'Nearby Cargo pickup failed.');
    assert(save.player.terrainVehicle.cargoHold.specimens.some((container) => container.kind === 'live'));
    await capture('desktop-cargo-collected');
    await press('Escape');
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
    assert(metrics.narrow.spritePixels > 20, 'Narrow field silhouettes absent.');
    await press('d');
    await page.waitForTimeout(1700);
    assert.notEqual((await capture('narrow-dossier')).centreHash, metrics.narrow.centreHash);
    await press('Escape');
    await press('Enter');
    await capture('narrow-operations');
    assert.notEqual(
      await page.locator('[data-command-id="observe"]').evaluate((button) => button.style.boxShadow),
      'none'
    );
    await press('ArrowRight');
    assert.notEqual(
      await page.locator('[data-command-id="analyse"]').evaluate((button) => button.style.boxShadow),
      'none'
    );
    await press('Escape');
    await press('i');
    await capture('narrow-cargo');
    await press('ArrowDown');
    await capture('narrow-cargo-selected');
    await press('Escape');
    await page.setViewportSize({ width: 1400, height: 900 });
    const docked = structuredClone(save);
    docked.xenobiology.activeSiteId = null;
    docked.player.terrainVehicle.deployed = false;
    // The zero-demand regression is a controlled fixture, independent of which habitat taxon was sampled.
    for (const container of docked.player.terrainVehicle.cargoHold.specimens) {
      container.species.baselineSamples = 12;
      docked.xenobiology.evidence[container.species.id].species.baselineSamples = 12;
    }
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
    await capture('sell-specimens');
    const selling = await checkpoint();
    await press('Enter');
    const retained = await checkpoint();
    assert.equal(
      retained.player.resources.credits,
      selling.player.resources.credits,
      'Zero-value specimen paid.'
    );
    assert.equal(
      retained.player.terrainVehicle.cargoHold.specimens.length,
      2,
      'Zero-demand specimen was discarded.'
    );
    await press('ArrowRight');
    const researchPixels = await capture('research-exchange');
    assert.equal(researchPixels.spritePixels, 0, 'Field silhouettes leaked into the station view.');
    const before = (await checkpoint()).player.resources.credits;
    await press('ArrowDown'); // The science log is the first Research row.
    await press('Enter');
    const paid = (await checkpoint()).player.resources.credits;
    assert(paid > before, 'Research submission did not pay.');
    await press('Enter');
    assert.equal((await checkpoint()).player.resources.credits, paid, 'Repeat submission paid again.');

    // A controlled incapacitation fixture isolates UI/cargo/contract integration from probabilistic weapons.
    const delivery = await page.evaluate(async (initial) => {
      const { createBiologicalContract } = await import('/src/core/biological_contracts.ts');
      const { createEncounter } = await import('/src/systems/surface_encounter_system.ts');
      const { createXenobiologySnapshot } = await import('/src/entities/biology/biology_types.ts');
      const station = { ...initial.station, kind: 'starbase' };
      const mission = createBiologicalContract(station, initial.systemName, [initial.biosphere], {});
      if (!mission) throw new Error('No compatible real biological request in the starting colony.');
      const objective = mission.objectives[0];
      const site = initial.biosphere.sites.find((entry) => entry.id === objective.siteId);
      mission.systemAddress = {
        worldX: initial.save.location.worldX,
        worldY: initial.save.location.worldY,
        systemSlot: initial.save.location.systemSlot,
      };
      objective.location = {
        bodyPath: initial.save.location.bodyPath,
        bodyName: initial.biosphere.bodyName,
        surface: { x: site.x, y: site.y, siteId: site.id, label: site.label },
      };
      const field = createEncounter(initial.biosphere, site);
      const source = field.individuals.find((actor) => actor.speciesId === objective.speciesId);
      source.x = source.homeX = 16;
      source.y = source.homeY = 20;
      source.state = 'stunned';
      source.recoveryAt = 3600;
      const save = structuredClone(initial.save);
      save.player.position.surfaceX = site.x;
      save.player.position.surfaceY = site.y;
      save.player.terrainVehicle.deployed = true;
      save.location.kind = 'planet';
      save.xenobiology = createXenobiologySnapshot();
      save.xenobiology.fields[site.id] = field;
      save.xenobiology.activeSiteId = site.id;
      save.acceptedMissionIds = [mission.id];
      save.activeMissions = { [mission.id]: mission };
      save.missionObjectiveProgress = { [mission.id]: [] };
      return { save, mission };
    }, fixture);
    // Selecting a journal destination must move only the landing cursor, not the ship or simulation clock.
    const navigation = structuredClone(delivery.save);
    navigation.location.kind = 'orbit';
    navigation.player.terrainVehicle.deployed = false;
    navigation.xenobiology.activeSiteId = null;
    await load(navigation);
    await press('j');
    await page.waitForTimeout(1700);
    metrics.missionJournal = await capture('desktop-mission-journal');
    const pausedMission = await checkpoint();
    await page.waitForTimeout(500);
    assert.equal(
      (await checkpoint()).gameClockElapsedSeconds,
      pausedMission.gameClockElapsedSeconds,
      'Mission journal did not pause time.'
    );
    await page.setViewportSize({ width: 600, height: 800 });
    await capture('narrow-mission-journal');
    await page.setViewportSize({ width: 1400, height: 900 });
    await press('Enter');
    assert.equal(
      (await checkpoint()).location.kind,
      'orbit',
      'Mission selection landed without confirmation.'
    );
    await capture('mission-landing-target');
    await press('Enter');
    const landedMission = await checkpoint();
    assert.equal(landedMission.location.kind, 'planet', 'Mission landing confirmation failed.');
    assert.equal(landedMission.player.position.surfaceX, delivery.mission.objectives[0].location.surface.x);
    assert.equal(landedMission.player.position.surfaceY, delivery.mission.objectives[0].location.surface.y);
    await load(delivery.save);
    try {
      await page.waitForFunction(
        () => {
          const canvas = document.querySelector('#gameCanvasOrbit');
          const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          let lit = 0;
          for (let index = 0; index < pixels.length; index += 4)
            if (pixels[index + 3] > 0 && pixels[index] + pixels[index + 1] + pixels[index + 2] > 60) lit++;
          return lit > 20;
        },
        undefined,
        { timeout: 15000 }
      );
    } catch (error) {
      const canvases = await page.evaluate(() =>
        [...document.querySelectorAll('canvas')].map((canvas) => {
          const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
          let lit = 0;
          for (let index = 0; index < pixels.length; index += 4)
            if (pixels[index] + pixels[index + 1] + pixels[index + 2] > 60) lit++;
          return { id: canvas.id, width: canvas.width, height: canvas.height, lit };
        })
      );
      await page.screenshot({ path: path.join(output, 'contract-render-timeout.png') });
      throw new Error(
        `${error.message}; canvases=${JSON.stringify(canvases)}; browserErrors=${JSON.stringify(errors)}`
      );
    }
    await capture('contract-before-identification');
    assert.equal(
      await missionMarkerPixels(),
      0,
      'An unidentified organism received a confirmed mission marker.'
    );
    await press('v');
    metrics.contractField = await capture('desktop-contract-field');
    assert(
      metrics.contractField.spritePixels > 20,
      'Reference field was captured before its raster became ready.'
    );
    metrics.contractMarkerPixels = await missionMarkerPixels();
    assert(metrics.contractMarkerPixels > 0, 'Confirmed compatible reference has no mission marker.');
    await press('d');
    await page.waitForTimeout(1700);
    await capture('desktop-contract-dossier');
    await press('Escape');
    await press('i');
    await press('Enter');
    const capturedReference = await checkpoint();
    assert.equal(capturedReference.player.terrainVehicle.cargoHold.specimens.length, 1);
    assert.equal(capturedReference.player.terrainVehicle.cargoHold.specimens[0].kind, 'live');
    capturedReference.xenobiology.activeSiteId = null;
    capturedReference.player.terrainVehicle.deployed = false;
    capturedReference.location = { ...docked.location };
    await load(capturedReference);
    for (let index = 0; index < 4; index++) await press('ArrowRight');
    const deliveryCredits = capturedReference.player.resources.credits;
    await press('ArrowDown');
    await capture('research-live-contract');
    await press('Enter');
    const delivered = await checkpoint();
    assert(
      delivered.completedMissionIds.includes(delivery.mission.id),
      'Physical delivery did not complete the request.'
    );
    assert.equal(
      delivered.player.terrainVehicle.cargoHold.specimens.length,
      0,
      'Delivered container remains aboard.'
    );
    const contractAward = delivered.player.resources.credits - deliveryCredits;
    assert(contractAward >= 900, 'Contract fee missing.');
    await capture('research-contract-settled');

    const alternatives = await page.evaluate(async (initial) => {
      const { createBiologicalContracts } = await import('/src/core/biological_contracts.ts');
      const { createEncounter } = await import('/src/systems/surface_encounter_system.ts');
      const { XenobiologyService } = await import('/src/core/xenobiology_service.ts');
      const { MissionProgressService } = await import('/src/core/mission_progress.ts');
      const { resolveMissionNavigation } = await import('/src/core/mission_navigation.ts');
      const { SolarSystem } = await import('/src/entities/solar_system.ts');
      const { SystemDataGenerator } = await import('/src/generation/system_data_generator.ts');
      const { PRNG } = await import('/src/utils/prng.ts');
      const prng = new PRNG(initial.save.seed);
      const generator = new SystemDataGenerator(prng);
      const system = new SolarSystem(
        generator.getSystemProperties(initial.save.location.worldX, initial.save.location.worldY),
        initial.save.location.worldX,
        initial.save.location.worldY,
        prng
      );
      const research = new XenobiologyService();
      const offers = createBiologicalContracts(
        { ...initial.station, kind: 'starbase' },
        initial.systemName,
        [initial.biosphere],
        {},
        [],
        research
      ).filter(
        (mission) =>
          mission.objectives.length === 1 &&
          (mission.objectives[0].kind === 'biology-data' || mission.objectives[0].requiredKind === 'tissue')
      );
      if (offers.length !== 2) throw new Error('Missing analysis/tissue requests.');
      const objective = offers[0].objectives[0];
      const site = initial.biosphere.sites.find((entry) => entry.id === objective.siteId);
      const field = createEncounter(initial.biosphere, site);
      const source = field.individuals.find((actor) => actor.speciesId === objective.speciesId);
      if (!source || offers[1].objectives[0].speciesId !== source.speciesId)
        throw new Error('Representative alternative requests must share an obtainable producer.');
      // Keep one real generated organism next to the rover to isolate interface/delivery from travel.
      field.individuals = [source];
      field.species.find((species) => species.id === source.speciesId).behaviour = 'sessile';
      for (const mission of offers)
        for (const requirement of mission.objectives)
          if (requirement.kind !== 'scan') requirement.reference.behaviour = 'sessile';
      source.x = source.homeX = 16;
      source.y = source.homeY = 20;
      field.terrain[20] = field.terrain[20].slice(0, 16) + '.' + field.terrain[20].slice(17);
      const save = structuredClone(initial.save);
      save.location.kind = 'planet';
      save.player.position.surfaceX = site.x;
      save.player.position.surfaceY = site.y;
      save.player.terrainVehicle.deployed = true;
      research.snapshot.fields[site.id] = field;
      research.snapshot.activeSiteId = site.id;
      save.xenobiology = research.createSnapshot();
      const progress = new MissionProgressService();
      for (const mission of offers)
        progress.accept(resolveMissionNavigation(mission, system, [initial.biosphere]));
      Object.assign(save, progress.createSnapshot());
      return { save, missionIds: offers.map((mission) => mission.id), sourceId: source.id };
    }, fixture);
    await load(alternatives.save);
    await press('a');
    await press('s');
    const prepared = await checkpoint();
    if (!prepared.player.terrainVehicle.cargoHold.specimens.length) {
      await capture('alternative-sampling-debug');
      const field = prepared.xenobiology.fields[prepared.xenobiology.activeSiteId];
      throw new Error(
        JSON.stringify({
          location: prepared.location,
          activeSiteId: prepared.xenobiology.activeSiteId,
          field: field && {
            rover: [field.roverX, field.roverY],
            organisms: field.individuals.map((actor) => ({
              id: actor.id,
              x: actor.x,
              y: actor.y,
              state: actor.state,
              sampled: actor.sampled,
              speciesId: actor.speciesId,
            })),
          },
          missionProgress: prepared.missionObjectiveProgress,
          browserErrors: errors,
        })
      );
    }
    assert.equal(prepared.player.terrainVehicle.cargoHold.specimens[0].kind, 'tissue');
    assert(
      prepared.readyMissionIds.includes(alternatives.missionIds[0]),
      'Detailed analysis did not create a site-specific mission packet.'
    );
    await press('x');
    await page.waitForTimeout(1700);
    await capture('science-log-analysis-and-tissue');
    await press('Escape');
    prepared.xenobiology.activeSiteId = null;
    prepared.player.terrainVehicle.deployed = false;
    prepared.location = { ...docked.location };
    await load(prepared);
    for (let index = 0; index < 4; index++) await press('ArrowRight');
    await press('ArrowDown');
    await capture('research-alternative-contracts');
    await press('Enter');
    await press('Enter'); // The remaining tissue request moves into the same selected row.
    const alternativesDelivered = await checkpoint();
    assert(
      alternatives.missionIds.every((id) => alternativesDelivered.completedMissionIds.includes(id)),
      'Alternative requests were not both settled.'
    );
    assert.equal(alternativesDelivered.player.terrainVehicle.cargoHold.specimens.length, 0);
    assert(
      alternativesDelivered.player.resources.credits >= prepared.player.resources.credits + 1000,
      'Alternative contract fees missing.'
    );
    await press('Enter');
    assert.equal(
      (await checkpoint()).player.resources.credits,
      alternativesDelivered.player.resources.credits,
      'Repeated alternative delivery paid again.'
    );
    await capture('research-alternatives-settled');
    // A passive field-study fixture retains real species and resource rules; only local positions are controlled.
    const ethology = await page.evaluate(async (initial) => {
      const { createBehaviourContracts } = await import('/src/core/behaviour_research.ts');
      const { createEncounter } = await import('/src/systems/surface_encounter_system.ts');
      const { XenobiologyService } = await import('/src/core/xenobiology_service.ts');
      const { MissionProgressService } = await import('/src/core/mission_progress.ts');
      const { resolveMissionNavigation } = await import('/src/core/mission_navigation.ts');
      const { SolarSystem } = await import('/src/entities/solar_system.ts');
      const { SystemDataGenerator } = await import('/src/generation/system_data_generator.ts');
      const { PRNG } = await import('/src/utils/prng.ts');
      const prng = new PRNG(initial.save.seed),
        generator = new SystemDataGenerator(prng);
      const system = new SolarSystem(
        generator.getSystemProperties(initial.save.location.worldX, initial.save.location.worldY),
        initial.save.location.worldX,
        initial.save.location.worldY,
        prng
      );
      const site = initial.biosphere.sites.find((entry) => entry.habitat?.kind === 'moist-margin');
      if (!site) throw new Error('No genuine moist-margin habitat for the feeding walkthrough.');
      const field = createEncounter(initial.biosphere, site);
      const consumer = field.species.find(
        (entry) => entry.foragingGuild === 'grazer' && entry.behaviour === 'skittish'
      );
      const actor = field.individuals.find((entry) => entry.speciesId === consumer?.id);
      const source = field.individuals.find((entry) =>
        field.species.some((species) => species.id === entry.speciesId && species.metabolism === 'autotroph')
      );
      if (!actor || !source) throw new Error('No generated grazer/producer pair.');
      source.x = source.homeX = 10;
      source.y = source.homeY = 10;
      actor.x = actor.homeX = 11;
      actor.y = actor.homeY = 10;
      field.individuals = [source, actor];
      field.terrain = field.terrain.map((row) => row.replaceAll('#', '.'));
      field.roverX = 18;
      field.roverY = 10;
      const phase = new PRNG(field.seed).seedNew(actor.id, 'activity-phase').randomInt(0, 5);
      // Observe identifies during rest; Watch then spans the first genuine feeding tick.
      const restTick = ((6 - phase) % 6) + 6;
      field.elapsedSeconds = (restTick - 1) * 5;
      const research = new XenobiologyService();
      research.snapshot.fields[site.id] = field;
      research.snapshot.activeSiteId = site.id;
      const offered = createBehaviourContracts(
        { ...initial.station, kind: 'starbase' },
        initial.systemName,
        [initial.biosphere],
        research.snapshot.fields,
        research
      ).find((mission) => mission.id.endsWith('-feeding'));
      if (
        !offered ||
        offered.objectives[0].speciesId !== consumer.id ||
        offered.objectives[0].siteId !== site.id
      )
        throw new Error('Feeding contract does not target the real test population.');
      const mission = resolveMissionNavigation(offered, system, [initial.biosphere]);
      const save = structuredClone(initial.save);
      save.location.kind = 'planet';
      save.player.position.surfaceX = site.x;
      save.player.position.surfaceY = site.y;
      save.player.terrainVehicle.deployed = true;
      save.xenobiology = research.createSnapshot();
      const progress = new MissionProgressService();
      progress.accept(mission);
      Object.assign(save, progress.createSnapshot());
      return { save, mission, speciesId: consumer.id, sourceId: actor.id, siteId: site.id };
    }, fixture);
    await load(ethology.save);
    assert.equal(await missionMarkerPixels(), 0, 'Unidentified ethology source has a confirmed marker.');
    await press('v');
    const identifiedEthology = await checkpoint();
    assert.equal(identifiedEthology.xenobiology.evidence[ethology.speciesId].level, 2);
    assert(
      !identifiedEthology.readyMissionIds.includes(ethology.mission.id),
      'Identity alone completed a field-study contract.'
    );
    assert((await missionMarkerPixels()) > 0, 'Identified feeding-survey source has no marker.');
    await capture('ethology-identified-source');
    await press('w');
    const witnessed = await checkpoint();
    assert(
      witnessed.readyMissionIds.includes(ethology.mission.id),
      'Witnessed feeding did not make the survey ready.'
    );
    assert.equal(
      witnessed.xenobiology.evidence[ethology.speciesId].behaviourObservations.filter(
        (entry) => entry.kind === 'feeding' && entry.siteId === ethology.siteId
      ).length,
      1
    );
    assert.equal(await missionMarkerPixels(), 0, 'Already recorded field-study source is still marked.');
    assert.equal(witnessed.player.terrainVehicle.cargoHold.specimens.length, 0);
    await capture('ethology-feeding-recorded');
    await load(witnessed);
    const restoredEthology = await checkpoint();
    assert.deepEqual(
      restoredEthology.xenobiology.evidence[ethology.speciesId],
      witnessed.xenobiology.evidence[ethology.speciesId]
    );
    await press('d');
    await page.waitForTimeout(1700);
    await press('PageDown');
    const desktopEthology = await capture('desktop-ethology-dossier');
    assert.equal(desktopEthology.spritePixels, 0, 'Sprites leaked into ethology report.');
    await page.waitForTimeout(750);
    const readingEthology = await checkpoint();
    assert.deepEqual(
      readingEthology.xenobiology.fields[ethology.siteId],
      restoredEthology.xenobiology.fields[ethology.siteId]
    );
    assert.equal(readingEthology.gameClockElapsedSeconds, restoredEthology.gameClockElapsedSeconds);
    await page.setViewportSize({ width: 480, height: 800 });
    assert.equal((await capture('narrow-ethology-dossier')).spritePixels, 0);
    await press('Escape');
    await press('x');
    await page.waitForTimeout(1700);
    await capture('narrow-ethology-science-log');
    await press('Escape');
    await page.setViewportSize({ width: 1400, height: 900 });
    witnessed.xenobiology.activeSiteId = null;
    witnessed.player.terrainVehicle.deployed = false;
    witnessed.location = { ...docked.location };
    await load(witnessed);
    for (let index = 0; index < 4; index++) await press('ArrowRight');
    await press('ArrowDown');
    await capture('research-field-study-ready');
    await press('Enter');
    const ethologyDelivered = await checkpoint();
    assert(ethologyDelivered.completedMissionIds.includes(ethology.mission.id));
    assert.equal(
      ethologyDelivered.player.resources.credits,
      witnessed.player.resources.credits + ethology.mission.rewardCredits
    );
    assert.deepEqual(ethologyDelivered.xenobiology.demand, witnessed.xenobiology.demand);
    assert.deepEqual(
      ethologyDelivered.player.terrainVehicle.cargoHold,
      witnessed.player.terrainVehicle.cargoHold
    );
    assert.deepEqual(ethologyDelivered.player.cargoHold, witnessed.player.cargoHold);
    const repeatedEthology = await page.evaluate(
      async ({ saved, station, missionId }) => {
        const { MissionProgressService } = await import('/src/core/mission_progress.ts');
        const { XenobiologyService } = await import('/src/core/xenobiology_service.ts');
        const { deliverBiologicalContract } = await import('/src/core/biological_contracts.ts');
        const progress = new MissionProgressService(),
          research = new XenobiologyService();
        progress.restoreSnapshot(saved);
        research.restoreSnapshot(saved.xenobiology);
        const context = {
          station: { ...station, kind: 'starbase' },
          resources: { credits: saved.player.resources.credits },
          holds: [saved.player.cargoHold, saved.player.terrainVehicle.cargoHold],
        };
        const result = deliverBiologicalContract(progress, research, context, missionId);
        return { ok: result.ok, credits: context.resources.credits };
      },
      { saved: ethologyDelivered, station: fixture.station, missionId: ethology.mission.id }
    );
    assert.equal(repeatedEthology.ok, false);
    assert.equal(
      repeatedEthology.credits,
      ethologyDelivered.player.resources.credits,
      'Field-study payment repeated.'
    );
    metrics.behaviourSurvey = true;
    metrics.behaviourSurveyAward = ethology.mission.rewardCredits;
    // Keep real generated size classes and source identities, positioning only the two contacts for a short walkthrough.
    const comparative = await page.evaluate(async (initial) => {
      const { createComparativeBiologicalContracts } = await import('/src/core/comparative_biology.ts');
      const { createEncounter } = await import('/src/systems/surface_encounter_system.ts');
      const { individualSizeClass } = await import('/src/entities/biology/biology_rules.ts');
      const { XenobiologyService } = await import('/src/core/xenobiology_service.ts');
      const { MissionProgressService } = await import('/src/core/mission_progress.ts');
      const { resolveMissionNavigation } = await import('/src/core/mission_navigation.ts');
      const { SolarSystem } = await import('/src/entities/solar_system.ts');
      const { SystemDataGenerator } = await import('/src/generation/system_data_generator.ts');
      const { PRNG } = await import('/src/utils/prng.ts');
      const prng = new PRNG(initial.save.seed);
      const generator = new SystemDataGenerator(prng);
      const system = new SolarSystem(
        generator.getSystemProperties(initial.save.location.worldX, initial.save.location.worldY),
        initial.save.location.worldX,
        initial.save.location.worldY,
        prng
      );
      const research = new XenobiologyService();
      const offer = createComparativeBiologicalContracts(
        { ...initial.station, kind: 'starbase' },
        initial.systemName,
        [initial.biosphere],
        {},
        [],
        research
      ).find((mission) => mission.id.endsWith('size-comparison'));
      if (!offer) throw new Error('No obtainable comparative size request.');
      const mission = resolveMissionNavigation(offer, system, [initial.biosphere]);
      const site = initial.biosphere.sites.find((entry) => entry.id === mission.objectives[0].siteId);
      const field = createEncounter(initial.biosphere, site);
      const contacts = mission.objectives.map((objective, index) => {
        const actor = field.individuals.find(
          (entry) =>
            entry.speciesId === objective.speciesId &&
            individualSizeClass(entry.sizeScale) === objective.sizeClass
        );
        if (!actor || field.species.find((entry) => entry.id === actor.speciesId).behaviour !== 'sessile')
          throw new Error('Expected obtainable sessile size reference.');
        actor.x = actor.homeX = 16 + index;
        actor.y = actor.homeY = 20;
        return actor;
      });
      field.individuals = contacts;
      field.terrain[20] = field.terrain[20].slice(0, 16) + '..' + field.terrain[20].slice(18);
      const save = structuredClone(initial.save);
      save.location.kind = 'planet';
      save.player.position.surfaceX = site.x;
      save.player.position.surfaceY = site.y;
      save.player.terrainVehicle.deployed = true;
      research.snapshot.fields[site.id] = field;
      research.snapshot.activeSiteId = site.id;
      save.xenobiology = research.createSnapshot();
      const progress = new MissionProgressService();
      progress.accept(mission);
      Object.assign(save, progress.createSnapshot());
      return { save, mission, sourceIds: contacts.map((actor) => actor.id) };
    }, fixture);
    await load(comparative.save);
    await press('v');
    await press('s');
    const partial = await checkpoint();
    assert.equal(partial.player.terrainVehicle.cargoHold.specimens.length, 1);
    assert.equal(partial.player.terrainVehicle.cargoHold.specimens[0].sourceId, comparative.sourceIds[0]);
    await press('j');
    await page.waitForTimeout(1700);
    await capture('comparative-partial-journal');
    await page.setViewportSize({ width: 480, height: 800 });
    await capture('narrow-comparative-journal');
    await page.setViewportSize({ width: 1400, height: 900 });
    await press('Escape');
    await press('x');
    await page.waitForTimeout(1700);
    await capture('comparative-partial-science-log');
    await press('Escape');
    const partialDock = structuredClone(partial);
    partialDock.xenobiology.activeSiteId = null;
    partialDock.player.terrainVehicle.deployed = false;
    partialDock.location = { ...docked.location };
    await load(partialDock);
    for (let index = 0; index < 4; index++) await press('ArrowRight');
    await press('ArrowDown');
    await press('Enter');
    const refused = await checkpoint();
    assert.equal(
      refused.player.resources.credits,
      partialDock.player.resources.credits,
      'Partial pair paid a reward.'
    );
    assert.equal(
      refused.player.terrainVehicle.cargoHold.specimens.length + refused.player.cargoHold.specimens.length,
      1,
      'Partial delivery consumed a container.'
    );
    assert(!refused.completedMissionIds.includes(comparative.mission.id), 'Partial study marked complete.');
    await capture('comparative-partial-refused');
    await load(partial);
    await press('Tab');
    await press('s');
    const complete = await checkpoint();
    assert.equal(complete.player.terrainVehicle.cargoHold.specimens.length, 2);
    assert.deepEqual(
      complete.player.terrainVehicle.cargoHold.specimens.map((container) => container.sourceId).sort(),
      [...comparative.sourceIds].sort()
    );
    await press('x');
    await page.waitForTimeout(1700);
    await capture('comparative-complete-science-log');
    complete.xenobiology.activeSiteId = null;
    complete.player.terrainVehicle.deployed = false;
    complete.location = { ...docked.location };
    await load(complete);
    for (let index = 0; index < 4; index++) await press('ArrowRight');
    await press('ArrowDown');
    await press('Enter');
    const comparisonDelivered = await checkpoint();
    assert(
      comparisonDelivered.completedMissionIds.includes(comparative.mission.id),
      'Paired delivery did not complete.'
    );
    assert.equal(
      comparisonDelivered.player.terrainVehicle.cargoHold.specimens.length +
        comparisonDelivered.player.cargoHold.specimens.length,
      0
    );
    metrics.comparativeAward =
      comparisonDelivered.player.resources.credits - complete.player.resources.credits;
    assert(
      metrics.comparativeAward >= comparative.mission.rewardCredits,
      'Comparative contract fee missing.'
    );
    await capture('comparative-study-settled');
    // Use an accepted, resolved two-habitat request to check destination cycling through the actual orbital interface.
    const habitatNavigation = await page.evaluate(async (initial) => {
      const { createComparativeBiologicalContracts } = await import('/src/core/comparative_biology.ts');
      const { XenobiologyService } = await import('/src/core/xenobiology_service.ts');
      const { resolveMissionNavigation } = await import('/src/core/mission_navigation.ts');
      const { SolarSystem } = await import('/src/entities/solar_system.ts');
      const { SystemDataGenerator } = await import('/src/generation/system_data_generator.ts');
      const { PRNG } = await import('/src/utils/prng.ts');
      const prng = new PRNG(initial.save.seed);
      const system = new SolarSystem(
        new SystemDataGenerator(prng).getSystemProperties(
          initial.save.location.worldX,
          initial.save.location.worldY
        ),
        initial.save.location.worldX,
        initial.save.location.worldY,
        prng
      );
      const offer = createComparativeBiologicalContracts(
        { ...initial.station, kind: 'starbase' },
        initial.systemName,
        [initial.biosphere],
        {},
        [],
        new XenobiologyService()
      ).find((mission) => mission.id.endsWith('habitat-comparison'));
      if (!offer) return null; // Some genuine terrain seeds lack two contrasting suitable habitats.
      const mission = resolveMissionNavigation(offer, system, [initial.biosphere]);
      const save = structuredClone(initial.save);
      save.acceptedMissionIds = [mission.id];
      save.activeMissions = { [mission.id]: mission };
      save.missionObjectiveProgress = { [mission.id]: [] };
      return { save, mission };
    }, fixture);
    if (habitatNavigation) {
      await load(habitatNavigation.save);
      await press('j');
      await page.waitForTimeout(1700);
      const firstDestination = await capture('comparative-first-habitat');
      await press('b');
      const secondDestination = await capture('comparative-second-habitat');
      assert.notEqual(
        firstDestination.centreHash,
        secondDestination.centreHash,
        'Destination cycling left stale terminal pixels.'
      );
      await press('Enter');
      await capture('comparative-second-landing-target');
      await press('Enter');
      const landed = await checkpoint();
      const target = habitatNavigation.mission.objectives[1].location.surface;
      assert.equal(landed.location.kind, 'planet');
      assert.deepEqual(
        [landed.player.position.surfaceX, landed.player.position.surfaceY],
        [target.x, target.y]
      );
      metrics.secondHabitatNavigation = true;
    } else metrics.secondHabitatNavigation = 'no contrasting habitats on representative generated colony';
    const comparisonSave = await page.evaluate(async (initial) => {
      const { XenobiologyService } = await import('/src/core/xenobiology_service.ts');
      const research = new XenobiologyService();
      for (const species of initial.biosphere.species.slice(0, 3)) research.observe(species, 3);
      const save = structuredClone(initial.save);
      save.xenobiology = research.createSnapshot();
      return save;
    }, fixture);
    await load(comparisonSave);
    await capture('survey-orbit-summary');
    await press('d');
    await page.waitForTimeout(1700);
    await capture('survey-planetary-dossier');
    await press('Escape');
    await press('x');
    await page.waitForTimeout(1700);
    const comparisonBefore = await checkpoint();
    await press('c');
    const comparisonPixels = await capture('desktop-species-comparison');
    assert.equal(comparisonPixels.spritePixels, 0, 'Sprites leaked through comparison terminal.');
    await press('Tab');
    assert.notEqual(
      (await capture('desktop-comparison-counterpart')).centreHash,
      comparisonPixels.centreHash
    );
    await page.setViewportSize({ width: 480, height: 800 });
    await capture('narrow-species-comparison');
    const comparisonAfter = await checkpoint();
    assert.equal(comparisonAfter.gameClockElapsedSeconds, comparisonBefore.gameClockElapsedSeconds);
    assert.deepEqual(
      comparisonAfter.xenobiology,
      comparisonBefore.xenobiology,
      'Comparison changed research state.'
    );
    await press('Escape');
    await page.setViewportSize({ width: 1400, height: 900 });

    // Controlled pressure environment tests presentation/handling, not the probability of finding a world.
    const pressure = await page.evaluate(async (initial) => {
      const { PRNG } = await import('/src/utils/prng.ts');
      const { generatePressureCommunity } = await import('/src/entities/biology/pressure_biosphere.ts');
      const { createEncounter } = await import('/src/systems/surface_encounter_system.ts');
      const { XenobiologyService } = await import('/src/core/xenobiology_service.ts');
      const { MissionProgressService } = await import('/src/core/mission_progress.ts');
      const { createPressureExpedition } = await import('/src/core/pressure_expedition.ts');
      const { SystemDataGenerator } = await import('/src/generation/system_data_generator.ts');
      const { SolarSystem } = await import('/src/entities/solar_system.ts');
      const { getSystemPlanetPaths } = await import('/src/core/save_game.ts');
      const { createBiologyEnvironment } = await import('/src/entities/biology/biosphere_generator.ts');
      const { resolveMissionNavigation } = await import('/src/core/mission_navigation.ts');
      const { getStationSections } = await import('/src/core/starbase_ui.ts');
      const { Game } = await import('/src/core/game.ts');
      const prng = new PRNG(initial.save.seed),
        location = initial.save.location;
      const system = new SolarSystem(
        new SystemDataGenerator(prng).getSystemProperties(location.worldX, location.worldY),
        location.worldX,
        location.worldY,
        prng
      );
      const body = getSystemPlanetPaths(system).find((entry) => entry.path === location.bodyPath).planet;
      const environment = {
        ...createBiologyEnvironment(body, system, location.bodyPath),
        origin: 'native',
        temperatureK: 300,
        pressureBar: 10,
        oxygenBar: 0,
        stellarFluxWm2: 800,
        carbonDioxideBar: 0.0004,
      };
      const site = initial.biosphere.sites.find((entry) => entry.habitat.kind === 'moist-margin');
      if (!site) throw new Error('No representative water margin for pressure handling fixture.');
      const bio = {
        id: environment.bodyId,
        bodyName: environment.bodyName,
        origin: 'native',
        sites: [site],
        species: generatePressureCommunity(environment, new PRNG('pressure-browser')).map((species) => ({
          ...species,
          recognised: true,
        })),
      };
      const field = createEncounter(bio, site),
        target = field.individuals[0];
      field.individuals = [target];
      target.x = target.homeX = 16;
      target.y = target.homeY = 20;
      field.terrain[20] = field.terrain[20].slice(0, 16) + '.' + field.terrain[20].slice(17);
      const research = new XenobiologyService();
      research.snapshot.fields[site.id] = field;
      research.snapshot.activeSiteId = site.id;
      const mission = createPressureExpedition(
        system.starbase,
        system.name,
        [bio],
        research.snapshot.fields,
        [],
        research
      )[0];
      if (!mission) throw new Error('Pressure request has no obtainable contact.');
      const progress = new MissionProgressService();
      progress.accept(resolveMissionNavigation(mission, system, [bio]));
      const save = structuredClone(initial.save);
      save.location.kind = 'planet';
      save.player.position.surfaceX = site.x;
      save.player.position.surfaceY = site.y;
      save.player.terrainVehicle.deployed = true;
      save.player.ship.stasisClass = 2;
      save.xenobiology = research.createSnapshot();
      Object.assign(save, progress.createSnapshot());
      const yardModel = Object.assign(Object.create(Game.prototype), {
        player: save.player,
        stateManager: { currentStarbase: system.starbase, currentSystem: system },
        getTradeDepotManifest: () => [],
      });
      return {
        save,
        missionId: mission.id,
        sourceId: target.id,
        shipyardIndex: getStationSections(system.starbase).findIndex((section) => section.id === 'shipyard'),
        pressureCradleIndex: yardModel
          .getStarbaseRows(system.starbase, 'shipyard')
          .findIndex((row) => row.id === 'shipyard:stasis:3'),
      };
    }, fixture);
    await load(pressure.save);
    await press('v');
    const pressureBefore = await checkpoint();
    await press('c');
    const pressureRefused = await checkpoint();
    assert.deepEqual(
      pressureRefused.xenobiology,
      pressureBefore.xenobiology,
      'Incompatible collection mutated the field.'
    );
    assert.equal(pressureRefused.player.terrainVehicle.cargoHold.specimens.length, 0);
    await capture('pressure-cradle-required');
    await press('a');
    await press('d');
    await page.waitForTimeout(1700);
    await capture('desktop-pressure-dossier');
    await page.setViewportSize({ width: 480, height: 800 });
    await capture('narrow-pressure-dossier');
    await press('Escape');
    await page.setViewportSize({ width: 1400, height: 900 });
    await press('s');
    const pressureTissue = await checkpoint();
    assert.equal(pressureTissue.player.terrainVehicle.cargoHold.specimens[0].kind, 'tissue');
    const pressureDock = structuredClone(pressureTissue);
    pressureDock.xenobiology.activeSiteId = null;
    pressureDock.player.terrainVehicle.deployed = false;
    pressureDock.location = { ...docked.location };
    await load(pressureDock);
    assert(pressure.shipyardIndex >= 0, 'Pressure upgrade needs an inhabited shipyard.');
    for (let index = 0; index < pressure.shipyardIndex; index++) await press('ArrowRight');
    assert(pressure.pressureCradleIndex >= 0, 'Pressure-preserving cradle missing from the yard.');
    for (let index = 0; index < pressure.pressureCradleIndex; index++) await press('ArrowDown');
    await capture('pressure-cradle-shipyard');
    await press('Enter');
    const fitted = await checkpoint();
    assert.equal(fitted.player.ship.stasisClass, 3, 'Shipyard did not fit pressure cradle.');
    assert.equal(fitted.player.resources.credits, pressureDock.player.resources.credits - 4200);
    fitted.location = { ...pressure.save.location };
    fitted.player.position.surfaceX = pressure.save.player.position.surfaceX;
    fitted.player.position.surfaceY = pressure.save.player.position.surfaceY;
    fitted.player.terrainVehicle.deployed = true;
    fitted.xenobiology.activeSiteId = pressure.save.xenobiology.activeSiteId;
    await load(fitted);
    await press('c');
    const pressureCollected = await checkpoint();
    const pressureContainers = [
      ...pressureCollected.player.cargoHold.specimens,
      ...pressureCollected.player.terrainVehicle.cargoHold.specimens,
    ];
    assert.equal(
      pressureContainers.filter(
        (container) => container.kind === 'live' && container.sourceId === pressure.sourceId
      ).length,
      1
    );
    await press('i');
    await capture('pressure-live-cargo');
    pressureCollected.location = { ...docked.location };
    pressureCollected.player.terrainVehicle.deployed = false;
    pressureCollected.xenobiology.activeSiteId = null;
    await load(pressureCollected);
    for (let index = 0; index < 4; index++) await press('ArrowRight');
    await press('ArrowDown');
    await capture('pressure-reference-delivery');
    await press('Enter');
    const pressureDelivered = await checkpoint();
    assert(pressureDelivered.completedMissionIds.includes(pressure.missionId));
    assert(pressureDelivered.player.resources.credits >= pressureCollected.player.resources.credits + 1600);
    assert.equal(
      [
        ...pressureDelivered.player.cargoHold.specimens,
        ...pressureDelivered.player.terrainVehicle.cargoHold.specimens,
      ].filter((container) => container.kind === 'live').length,
      0
    );
    await capture('pressure-reference-settled');
    metrics.pressureExpedition = true;
    metrics.speciesComparison = true;

    // Exercise armed confirmations, visible incapacitation and Operations without changing local time.
    const localFixture = structuredClone(delivery.save);
    const localSiteId = localFixture.xenobiology.activeSiteId;
    const localField = localFixture.xenobiology.fields[localSiteId];
    const localContact = localField.individuals.find((actor) => actor.state === 'stunned');
    assert(localContact, 'Controlled incapacitation fixture missing.');
    localField.individuals = [localContact];
    localContact.state = 'active';
    await load(localFixture);
    /** Counts the stun badge colour on the cell plane, independently of the creature sprite raster. */
    const stunMarkerPixels = async () =>
      page.evaluate(async () => {
        const { CONFIG } = await import('/src/config.ts');
        const { TEXT_PALETTE } = await import('/src/rendering/text_palette.ts');
        const { getEncounterLayout } = await import('/src/rendering/surface_encounter_renderer.ts');
        const canvas = document.querySelector('#gameCanvas');
        const cellHeight = CONFIG.FONT_SIZE_PX * CONFIG.CHAR_SCALE;
        const cellWidth = cellHeight * CONFIG.CHAR_ASPECT_RATIO;
        const area = getEncounterLayout(
          Math.floor(canvas.width / cellWidth),
          Math.floor(canvas.height / cellHeight)
        ).field;
        const data = canvas
          .getContext('2d')
          .getImageData(
            area.x * cellWidth,
            area.y * cellHeight,
            area.width * cellWidth,
            area.height * cellHeight
          ).data;
        const colour = [1, 3, 5].map((start) => parseInt(TEXT_PALETTE.amber.slice(start, start + 2), 16));
        let pixels = 0;
        for (let index = 0; index < data.length; index += 4)
          if (colour.every((value, channel) => data[index + channel] === value)) pixels++;
        return pixels;
      });
    const unstunnedMarkers = await stunMarkerPixels();
    localContact.state = 'stunned';
    localContact.recoveryAt = localField.elapsedSeconds + 3600;
    await load(localFixture);
    const localBefore = await checkpoint();
    metrics.stunMarkerPixels = (await stunMarkerPixels()) - unstunnedMarkers;
    assert(metrics.stunMarkerPixels > 0, 'Stunned contact has no visible cell-plane marker.');
    await capture('desktop-stunned-contact');
    await page.setViewportSize({ width: 480, height: 800 });
    await capture('narrow-stunned-contact');
    await page.setViewportSize({ width: 1400, height: 900 });
    await press('o');
    await capture('field-operations');
    assert(
      await page.locator('#commandStrip [data-command-id="return"]:visible').count(),
      'Operations controls absent.'
    );
    await page.locator('#commandStrip [data-command-id="return"]').click();
    await page.waitForTimeout(100);
    const afterOperations = await checkpoint();
    assert.equal(afterOperations.gameClockElapsedSeconds, localBefore.gameClockElapsedSeconds);
    assert.deepEqual(
      afterOperations.xenobiology.fields[localSiteId],
      localBefore.xenobiology.fields[localSiteId]
    );
    await press('k');
    const armed = await capture('lethal-confirmation');
    assert.equal(armed.spritePixels, 0, 'Creature sprites leaked into lethal confirmation.');
    await page.waitForTimeout(900);
    await press('ArrowRight');
    assert.equal(
      (await capture('lethal-confirmation-held')).centreHash,
      armed.centreHash,
      'Idle or unrelated input dismissed lethal confirmation.'
    );
    await press('Escape');
    assert((await capture('lethal-confirmation-cancelled')).spritePixels > 0);
    assert.equal((await checkpoint()).xenobiology.fields[localSiteId].individuals[0].state, 'stunned');
    await press('k');
    await page.waitForTimeout(500);
    await press('Enter');
    assert.equal(
      (await checkpoint()).xenobiology.fields[localSiteId].individuals[0].state,
      'dead',
      'Confirmed lethal action was not performed.'
    );
    metrics.lethalConfirmation = true;
    metrics.fieldOperations = true;

    // Repair diagnostics must show current damage, settle only selected work, and keep the Shipyard parent.
    const repairs = structuredClone(pressureDelivered);
    repairs.player.ship.damage = {
      hullIntegrity: 80,
      maxHullIntegrity: 100,
      subsystemDamage: { drive: 25, shield: 10 },
    };
    repairs.player.terrainVehicle.available = true;
    repairs.player.terrainVehicle.integrity = 60;
    repairs.player.resources.credits = 10000;
    await load(repairs);
    for (let index = 0; index < pressure.shipyardIndex; index++) await press('ArrowRight');
    await capture('repairs-first-shipyard-item');
    await press('Enter');
    await page.waitForTimeout(1700);
    await capture('desktop-repair-control');
    assert.equal(
      (await checkpoint()).player.resources.credits,
      10000,
      'Opening diagnostics charged credits.'
    );
    await page.setViewportSize({ width: 480, height: 800 });
    await capture('narrow-repair-control');
    await press('ArrowDown');
    await capture('narrow-hull-repair-selected');
    await press('Enter');
    const hullRepaired = await checkpoint();
    assert.equal(hullRepaired.player.ship.damage.hullIntegrity, 100);
    assert.deepEqual(hullRepaired.player.ship.damage.subsystemDamage, { drive: 25, shield: 10 });
    assert.equal(hullRepaired.player.terrainVehicle.integrity, 60);
    assert.equal(hullRepaired.player.resources.credits, 9760);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.locator('#commandStrip [data-command-id="all"]').click();
    const fullyRepaired = await checkpoint();
    assert.deepEqual(fullyRepaired.player.ship.damage.subsystemDamage, {});
    assert.equal(fullyRepaired.player.terrainVehicle.integrity, 100);
    assert.equal(fullyRepaired.player.resources.credits, 8930);
    await capture('repairs-completed');
    await press('Escape');
    assert.equal((await checkpoint()).location.kind, 'starbase', 'Escape from repairs undocked the ship.');
    await capture('repairs-return-to-shipyard');
    metrics.shipyardRepairs = true;
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify(
        {
          output,
          body: fixture.biosphere.bodyName,
          habitats: fixture.biosphere.sites.length,
          specimens: save.player.terrainVehicle.cargoHold.specimens.map((item) => item.kind),
          award: paid - before,
          contractAward,
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
