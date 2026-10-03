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
    await press('o');
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
    await press('v');
    metrics.contractField = await capture('desktop-contract-field');
    await press('d');
    await page.waitForTimeout(1700);
    await capture('desktop-contract-dossier');
    await press('Escape');
    await press('o');
    await press('Enter');
    const capturedReference = await checkpoint();
    assert.equal(capturedReference.player.terrainVehicle.cargoHold.specimens.length, 1);
    assert.equal(capturedReference.player.terrainVehicle.cargoHold.specimens[0].kind, 'live');
    capturedReference.xenobiology.activeSiteId = null;
    capturedReference.player.terrainVehicle.deployed = false;
    capturedReference.location = { ...docked.location };
    await load(capturedReference);
    for (let index = 0; index < 4; index++) await press('ArrowRight');
    await capture('research-live-contract');
    const deliveryCredits = capturedReference.player.resources.credits;
    await press('ArrowDown');
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
          mission.objectives[0].kind === 'biology-data' || mission.objectives[0].requiredKind === 'tissue'
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
    await capture('research-alternative-contracts');
    await press('ArrowDown');
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
