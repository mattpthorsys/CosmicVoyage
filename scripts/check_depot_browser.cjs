const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

/** Exercises finite robotic services through normal save import, keyboard input and durable checkpoints. */
async function main() {
  const output = process.env.DEPOT_CAPTURE_DIR || '/tmp/cosmic-depots';
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
      const { CONFIG } = await import('/src/config.ts');
      const { PRNG } = await import('/src/utils/prng.ts');
      const { Player } = await import('/src/core/player.ts');
      const { CargoSystem } = await import('/src/systems/cargo_systems.ts');
      const { SystemDataGenerator } = await import('/src/generation/system_data_generator.ts');
      const { SolarSystem } = await import('/src/entities/solar_system.ts');
      const { InfrastructureRegistry, reserveInstallationOrbit } =
        await import('/src/core/infrastructure_registry.ts');
      const { StarbaseCommerceService } = await import('/src/core/starbase_commerce.ts');
      const { DepotService } = await import('/src/core/depot_service.ts');
      const { createDepotServiceRows } = await import('/src/core/depot_service_console.ts');
      const { createHeavyHaulSnapshot } = await import('/src/core/heavy_haul_types.ts');
      const { createObservatorySnapshot } = await import('/src/core/observatory_types.ts');
      const { createXenobiologySnapshot } = await import('/src/entities/biology/biology_types.ts');
      const { getStationSections } = await import('/src/core/starbase_ui.ts');
      const { parseGameSave, SAVE_GAME_VERSION, SESSION_SAVE_KEY } = await import('/src/core/save_game.ts');
      const seed = 'depot-browser-v1';
      const prng = new PRNG(seed);
      const worldX = CONFIG.PLAYER_START_X + CONFIG.STARTING_HUB_OFFSET_X;
      const worldY = CONFIG.PLAYER_START_Y + CONFIG.STARTING_HUB_OFFSET_Y;
      const address = { worldX, worldY, systemSlot: 0 };
      const system = new SolarSystem(
        new SystemDataGenerator(prng).getSystemProperties(worldX, worldY),
        worldX,
        worldY,
        prng
      );
      const orbit = reserveInstallationOrbit(system, 2e11, 0);
      if (!orbit) throw new Error('No stable installation orbit for the browser fixture.');
      const sourceMissionId = 'depot-browser-fixture';
      const asset = {
        assetId: `haul-installation:${sourceMissionId}`,
        sourceMissionId,
        kind: 'automated-depot',
        systemAddress: address,
        systemName: system.name,
        orbit,
        commissionedAtSeconds: 100,
        lastAppliedBulkSeconds: 0,
        commissioningFuelRemainingUnits: 0,
      };
      const registry = new InfrastructureRegistry();
      registry.restore([asset]);
      registry.materialize(system, 0);
      const station = system.stations.find((entry) => entry.id === asset.assetId);
      if (!station) throw new Error('Delivered depot was not materialised.');
      const player = new Player(worldX, worldY, '@', seed);
      player.position.systemX = station.systemX;
      player.position.systemY = station.systemY;
      player.resources.credits = 10_000;
      player.resources.fuel = player.resources.maxFuel - 90;
      player.ship.damage.hullIntegrity = 80;
      player.terrainVehicle.integrity = 80;
      player.crew[0].hitPoints -= 10;
      player.crew[1].hitPoints -= 10;
      const cargo = new CargoSystem();
      for (const [key, units] of Object.entries({
        REPAIR_SPARES: 2,
        MEDICAL_SUPPLIES: 1,
        HELIUM_3: 1,
        DEUTERIUM_PELLETS: 1,
      }))
        cargo.addItem(player.cargoHold, key, units);
      const commerce = new StarbaseCommerceService(player, cargo, prng.seed);
      const service = new DepotService(commerce, seed, player, cargo);
      service.ensureStation(station, address, 100, 100);
      const economy = commerce.createSnapshot();
      // Deliberately restrict fixture stocks; the application must not refill them on import or rendering.
      for (const [key, units] of Object.entries({
        TITANIUM_TRUSS: 4,
        REPAIR_SPARES: 1,
        MEDICAL_SUPPLIES: 1,
        HELIUM_3: 2,
        DEUTERIUM_PELLETS: 2,
      }))
        economy[station.id].items[key].units = units;
      const save = parseGameSave({
        version: SAVE_GAME_VERSION,
        generationVersion: CONFIG.GALAXY_MODEL_VERSION,
        seed,
        savedAt: new Date().toISOString(),
        gameClockElapsedSeconds: 100,
        bulkAdvanceSeconds: 0,
        player: {
          position: player.position,
          render: player.render,
          resources: player.resources,
          cargoHold: player.cargoHold,
          terrainVehicle: player.terrainVehicle,
          ship: player.ship,
          crew: player.crew,
        },
        location: { kind: 'starbase', ...address, stationId: station.id, starbaseName: station.name },
        systemOrbit: null,
        systemOrbitHistory: [],
        planetMutations: [],
        acceptedMissionIds: [],
        readyMissionIds: [],
        completedMissionIds: [sourceMissionId],
        activeMissions: {},
        missionObjectiveProgress: {},
        catalogueDiscoveries: {},
        heavyHaul: createHeavyHaulSnapshot(),
        infrastructure: [asset],
        depots: service.createSnapshot(),
        economy,
        observatory: createObservatorySnapshot(),
        xenobiology: createXenobiologySnapshot(),
        tutorialHintsShown: [],
      });
      return {
        save,
        stationId: station.id,
        sessionKey: SESSION_SAVE_KEY,
        servicesIndex: getStationSections(station).findIndex((section) => section.id === 'services'),
        missionsIndex: getStationSections(station).findIndex((section) => section.id === 'missions'),
        serviceRows: createDepotServiceRows(
          service.quote(station.id, 'repair', 'all'),
          service.quote(station.id, 'fuel', 'fuel'),
          0,
          service.quote(station.id, 'medical', 'all')
        ).map((row) => row.id),
      };
    });
    fs.writeFileSync(path.join(output, 'depot-fixture.json'), JSON.stringify(fixture.save, null, 2));

    /** Sends a released key through the production input map and lets its resulting frame finish. */
    const press = async (key) => {
      await page.keyboard.press(key, { delay: 55 });
      await page.waitForTimeout(100);
    };
    /** Imports a detached save through the same strict boundary available to players. */
    const load = async (save) => {
      const previousEpoch = await page.evaluate((key) => {
        return JSON.parse(sessionStorage.getItem(key) || 'null')?.savedAt ?? null;
      }, fixture.sessionKey);
      await page.locator('#saveImportInput').setInputFiles({
        name: 'depot-fixture.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(save)),
      });
      await page.waitForFunction(
        ({ seed, sessionKey, previousEpoch }) => {
          const saved = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
          return (
            (document.querySelector('#splashScreen').hidden &&
              saved?.seed === seed &&
              saved.savedAt !== previousEpoch) ||
            document.querySelector('#splashMessage').textContent.startsWith('Import failed:') ||
            document.querySelector('#splashMessage').textContent.startsWith('Unable to start:')
          );
        },
        { seed: save.seed, sessionKey: fixture.sessionKey, previousEpoch },
        { timeout: 15000 }
      );
      const message = await page.locator('#splashMessage').textContent();
      assert(!message.startsWith('Import failed:') && !message.startsWith('Unable to start:'), message);
      await page.waitForTimeout(700);
    };
    /** Reads the actual saved outcome without exposing or modifying a live Game instance. */
    const checkpoint = async () => {
      await press('F10');
      await page.locator('#checkpointButton').click();
      const save = await page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), fixture.sessionKey);
      await page.locator('#resumeGameButton').click();
      return save;
    };
    /** Captures terminal pixels and checks both font assets and the absence of stale orbit raster content. */
    const capture = async (name) => {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(100);
      const pixels = await page.evaluate(() => {
        const canvas = document.querySelector('#gameCanvas');
        const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let lit = 0;
        for (let index = 0; index < data.length; index += 16)
          if (data[index] + data[index + 1] + data[index + 2] > 60) lit++;
        const orbit = document.querySelector('#gameCanvasOrbit');
        const raster = orbit.getContext('2d').getImageData(0, 0, orbit.width, orbit.height).data;
        let visibleOrbit = 0;
        for (let index = 3; index < raster.length; index += 16)
          if (raster[index] > 128 && raster[index - 3] + raster[index - 2] + raster[index - 1] > 60)
            visibleOrbit++;
        return {
          lit,
          visibleOrbit,
          thin: document.fonts.check('16px PxPlus_IBM_CGAthin'),
          thick: document.fonts.check('16px PxPlus_IBM_CGA'),
        };
      });
      assert(pixels.lit > 100 && pixels.thin && pixels.thick, JSON.stringify({ name, pixels }));
      assert.equal(pixels.visibleOrbit, 0, 'A depot terminal retained orbital/terrain overlay pixels.');
      await page.screenshot({ path: path.join(output, `${name}.png`) });
      return pixels;
    };
    /** Opens a known service row and skips its reveal without issuing a work order. */
    const open = async (serviceId) => {
      for (let index = 0; index < fixture.servicesIndex; index++) await press('ArrowRight');
      const row = fixture.serviceRows.indexOf(serviceId);
      assert(row >= 0, `Service row missing: ${serviceId}`);
      for (let index = 0; index < row; index++) await press('ArrowDown');
      await press('Enter');
      await page.locator('[data-command-id="review"]').waitFor();
      await press('PageDown');
      await press('PageUp');
    };
    /** Reviews a work order without relying on a selection silently defaulting to Yes. */
    const review = async () => {
      await page.locator('[data-command-id="review"]').click();
      await page.locator('[data-command-id="dialog-yes"]').waitFor();
    };
    const metrics = {};
    const cases = [
      { kind: 'repair', serviceId: 'repair', stock: 'REPAIR_SPARES', partial: 90 },
      { kind: 'medical', serviceId: 'medical', stock: 'MEDICAL_SUPPLIES', partial: 10 },
      {
        kind: 'fuel',
        serviceId: 'refuel',
        stock: 'HELIUM_3',
        partial: fixture.save.player.resources.maxFuel - 10,
      },
    ];
    for (const test of cases) {
      await load(fixture.save);
      await open(test.serviceId);
      metrics[test.kind] = await capture(`desktop-${test.kind}`);
      const before = await checkpoint();
      await review();
      await capture(`desktop-${test.kind}-confirmation`);
      await press('Enter'); // No is the initial confirmation selection.
      assert.deepEqual((await checkpoint()).player, before.player, 'Default No applied service work.');
      await review();
      await press('y');
      const partial = await checkpoint();
      assert.equal(partial.economy[fixture.stationId].items[test.stock].units, 0);
      assert.deepEqual(
        partial.player.cargoHold,
        before.player.cargoHold,
        'Cargo was consumed without consent.'
      );
      assert(partial.player.resources.credits < before.player.resources.credits);
      assert.equal(partial.gameClockElapsedSeconds, before.gameClockElapsedSeconds);
      if (test.kind === 'repair') {
        assert.equal(partial.player.ship.damage.hullIntegrity, test.partial);
        assert.equal(partial.player.terrainVehicle.integrity, 80);
      } else if (test.kind === 'fuel') assert.equal(partial.player.resources.fuel, test.partial);
      else
        assert.equal(
          partial.player.crew.reduce(
            (sum, member, index) => sum + member.hitPoints - before.player.crew[index].hitPoints,
            0
          ),
          test.partial
        );
      await press('Enter'); // Dismiss the persistent completion receipt.
      await press('Tab');
      await review();
      await press('y');
      const complete = await checkpoint();
      assert.equal(complete.player.cargoHold.items[test.stock], undefined);
      assert.equal(complete.depots[fixture.stationId].revision, 2);
      assert.equal(complete.economy[fixture.stationId].items.FUSION_FUEL_MIX, undefined);
      if (test.kind === 'repair') {
        assert.equal(complete.player.ship.damage.hullIntegrity, complete.player.ship.damage.maxHullIntegrity);
        assert.equal(complete.player.terrainVehicle.integrity, 100);
      } else if (test.kind === 'fuel')
        assert.equal(complete.player.resources.fuel, complete.player.resources.maxFuel);
      else assert(complete.player.crew.every((member) => member.hitPoints === member.maxHitPoints));
      await page.reload();
      await page.locator('#continueSessionButton').click();
      await page.waitForFunction(() => document.querySelector('#splashScreen').hidden);
      const restored = await checkpoint();
      assert.deepEqual(restored.player, complete.player, 'Reload lost completed depot work.');
      assert.deepEqual(restored.economy, complete.economy, 'Reload replenished depleted stock.');
      assert.deepEqual(restored.depots, complete.depots, 'Reload changed operational state.');
    }
    // Robot work uses the same importer, station navigation, confirmation and checkpoint path as services.
    await load(fixture.save);
    const boardSave = await checkpoint();
    const supply = boardSave.depots[fixture.stationId].jobs.offers.find((offer) => offer.type === 'supply');
    assert(supply, 'The controlled shortages did not produce a funded supply job.');
    const objective = supply.objectives[0];
    boardSave.player.cargoHold.items[objective.itemKey] = objective.quantity;
    await load(boardSave);
    for (let index = 0; index < fixture.missionsIndex; index++) await press('ArrowRight');
    await press('ArrowDown'); // Journal is followed by the first prepared supply offer.
    await press('Enter');
    await page.locator('[data-command-id="dialog-yes"]').waitFor();
    await capture('desktop-robot-contract-confirmation');
    await press('n');
    assert.equal((await checkpoint()).activeMissions[supply.id], undefined, 'No accepted a contract.');
    await press('Enter');
    await press('y');
    const accepted = await checkpoint();
    assert.equal(accepted.depots[fixture.stationId].jobs.reservedCredits[supply.id], supply.rewardCredits);
    assert.equal(accepted.player.resources.credits, boardSave.player.resources.credits);
    const readiness = await page.evaluate(
      async ({ saved, missionId }) => {
        const { MissionProgressService } = await import('/src/core/mission_progress.ts');
        const progress = new MissionProgressService(() => saved.player.cargoHold.items);
        progress.restoreSnapshot(saved);
        return progress.getStatus(saved.activeMissions[missionId]);
      },
      { saved: accepted, missionId: supply.id }
    );
    assert.equal(readiness, 'READY');
    await press('Enter'); // Acknowledge acceptance; selection must remain on the same contract.
    await capture('desktop-robot-contract-claimable');
    await press('Enter');
    await capture('desktop-robot-delivery-receipt');
    const delivered = await checkpoint();
    assert(delivered.completedMissionIds.includes(supply.id));
    assert.equal(
      delivered.player.resources.credits,
      accepted.player.resources.credits + supply.rewardCredits
    );
    assert.equal(delivered.player.cargoHold.items[objective.itemKey], undefined);
    assert.equal(
      delivered.economy[fixture.stationId].items[objective.itemKey].units,
      accepted.economy[fixture.stationId].items[objective.itemKey].units + objective.quantity
    );
    await page.reload();
    await page.locator('#continueSessionButton').click();
    await page.waitForFunction(() => document.querySelector('#splashScreen').hidden);
    const reloaded = await checkpoint();
    assert.deepEqual(reloaded.depots, delivered.depots);
    assert.deepEqual(reloaded.player, delivered.player);
    assert(reloaded.completedMissionIds.includes(supply.id));

    await load(fixture.save);
    for (let index = 0; index < fixture.servicesIndex; index++) await press('ArrowRight');
    await press('Enter'); // Resource report is the first service row.
    await page.locator('[data-command-id="dialog-continue"]').waitFor();
    await capture('desktop-resource-report');
    await page.setViewportSize({ width: 390, height: 844 });
    await capture('narrow-resource-report');
    await load(fixture.save);
    await open('medical');
    metrics.narrow = await capture('narrow-medical');
    await press('PageDown');
    await capture('narrow-medical-page');
    await press('Escape');
    await capture('narrow-depot-services');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ output, metrics, errors }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
