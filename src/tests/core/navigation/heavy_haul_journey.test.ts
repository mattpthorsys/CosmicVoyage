import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../../../core/game';
import { GameStateManager } from '../../../core/game_state_manager';
import { eventManager, GameEvents } from '../../../core/event_manager';
import { SystemDataGenerator } from '../../../generation/system_data_generator';
import { PRNG } from '../../../utils/prng';
import { parseGameSave } from '../../../core/save_game';
import { HeavyHaulService } from '../../../core/heavy_haul_service';
import { MissionProgressService } from '../../../core/mission_progress';
import { prepareHaulJourney, commitPreparedHaulJourney } from '../../../core/heavy_haul_journey';
import {
  capturePlanetMutations,
  captureSystemOrbit,
  restoreSystemOrbits,
} from '../../../core/system_orbit_state';
import { haulJourneyFixture, haulSystemFixture } from '../../fixtures/heavy_haul_journeys';
import { AstrometricOverlay } from '../../../rendering/astrometric_overlay';
import { TerminalOverlay } from '../../../rendering/terminal_overlay';
import { AU_IN_METERS } from '../../../constants/physics';
import type { StellarArchitecture, StellarBody } from '../../../entities/stellar_body';

afterEach(() => vi.restoreAllMocks());

describe('prepared heavy-haul journeys', () => {
  it.each(['binary', 'triple'] as const)(
    'prepares %s arrival around the actual moving stellar host',
    (kind) => {
      const f = haulJourneyFixture();
      const stars: StellarBody[] = ['A', 'B', ...(kind === 'triple' ? ['C'] : [])].map((id) => ({
        ...structuredClone(f.source.stars[0]),
        id: id as StellarBody['id'],
        name: `Fixture ${id}`,
        orbit: id === 'A' ? null : { center: 'barycenter', radius: 0, angle: 0, periodSeconds: 0 },
      }));
      const architecture: StellarArchitecture = {
        ...f.source.architecture,
        kind,
        stars,
        binarySeparation: 40 * AU_IN_METERS,
        outerSeparation: kind === 'triple' ? 500 * AU_IN_METERS : 0,
      };
      const world = {
        createSystem: (address: Parameters<typeof haulSystemFixture>[0]) =>
          address.worldX === 100 ? haulSystemFixture(address, architecture) : f.world.createSystem(address),
      };
      const beforeBlueprint = JSON.stringify(architecture);
      const result = prepareHaulJourney(f.save, f.source, f.request, world);
      expect(result.ok, result.ok ? '' : result.message).toBe(true);
      if (!result.ok) throw new Error(result.message);
      const expected = haulSystemFixture(f.objective.destination.systemAddress, architecture);
      expected.advanceOrbitsBySimulatedSeconds(result.journey.quote.durationSeconds);
      expect(
        result.journey.system.stars.map((star) => [star.systemX, star.systemY, star.orbit?.angle])
      ).toEqual(expected.stars.map((star) => [star.systemX, star.systemY, star.orbit?.angle]));
      const host = result.journey.system.getOrbitCenter(f.objective.destination.orbit.host);
      expect(
        Math.hypot(result.journey.position.x - host.x, result.journey.position.y - host.y)
      ).toBeGreaterThan(result.journey.system.stars[0].radiusM * 3);
      expect(JSON.stringify(architecture)).toBe(beforeBlueprint);
    }
  );

  it.each(['local', 'medium', 'heavy'] as const)(
    'prepares %s transfer with exact simulated seconds and independent support fuel',
    (kind) => {
      const f = haulJourneyFixture(kind);
      const before = structuredClone(f.save);
      const sourceOrbit = captureSystemOrbit(f.source);
      const sourceBodies = capturePlanetMutations(f.source);
      const outcome = prepareHaulJourney(f.save, f.source, f.request, f.world);
      expect(outcome.ok, outcome.ok ? '' : outcome.message).toBe(true);
      if (!outcome.ok) throw new Error(outcome.message);
      const { save, receipt, quote, system, position } = outcome.journey;
      expect(save.gameClockElapsedSeconds).toBe(100 + quote.durationSeconds);
      expect(save.bulkAdvanceSeconds).toBe(quote.durationSeconds);
      expect(receipt.supportFuelConsumedUnits).toBe(quote.transitFuelUnits);
      expect(save.heavyHaul.activeTow).toMatchObject({
        stage: 'arrived',
        journeyOperationId: `${f.mission.id}:transit`,
      });
      expect(save.heavyHaul.activeTow!.remainingSupportFuelUnits).toBeCloseTo(
        f.objective.package.supportFuelCapacityUnits - quote.transitFuelUnits
      );
      expect(save.player.resources).toEqual(before.player.resources);
      expect(save.player.cargoHold).toEqual(before.player.cargoHold);
      expect(save.player.terrainVehicle).toEqual(before.player.terrainVehicle);
      expect(save.player.crew).toEqual(before.player.crew);
      expect(save.xenobiology).toEqual(before.xenobiology);
      expect(save.economy).toEqual(before.economy);
      expect(save.activeMissions).toEqual(before.activeMissions);
      expect(save.completedMissionIds).toEqual(before.completedMissionIds);
      expect(system.lastAppliedBulkSeconds).toBe(save.bulkAdvanceSeconds);
      expect(system).not.toBe(f.source);
      expect(Number.isFinite(position.x) && Number.isFinite(position.y)).toBe(true);
      expect(save.location).toEqual({ kind: 'system', ...f.objective.destination.systemAddress });
      expect(parseGameSave(JSON.stringify(save))).toEqual(save);
      expect(f.save).toEqual(before);
      expect(captureSystemOrbit(f.source)).toEqual(sourceOrbit);
      expect(capturePlanetMutations(f.source)).toEqual(sourceBodies);
    }
  );

  it('requires staging, real supply, an undocked source, and unchanged confirmed capabilities', () => {
    const f = haulJourneyFixture();
    const before = structuredClone(f.save);
    const notStaged = structuredClone(f.save);
    notStaged.player.position.systemX = 1e10;
    expect(prepareHaulJourney(notStaged, f.source, f.request, f.world)).toMatchObject({ ok: false });
    expect(
      prepareHaulJourney(
        f.save,
        f.source,
        { ...f.request, resupply: { ...f.request.resupply, stationId: 'imaginary-depot' } },
        f.world
      )
    ).toMatchObject({ ok: false });
    const docked = structuredClone(f.save);
    docked.location = {
      ...f.save.location,
      kind: 'starbase',
      stationId: f.source.starbase!.id,
      starbaseName: f.source.starbase!.name,
    };
    expect(prepareHaulJourney(docked, f.source, f.request, f.world)).toMatchObject({ ok: false });
    const good = prepareHaulJourney(f.save, f.source, f.request, f.world);
    if (!good.ok) throw new Error(good.message);
    const changed = structuredClone(f.save);
    changed.player.ship.engineClass = 3;
    expect(
      prepareHaulJourney(changed, f.source, { ...f.request, expectedQuote: good.journey.quote }, f.world)
    ).toMatchObject({ ok: false, message: expect.stringContaining('fresh manifest') });
    changed.player.ship.engineClass = 2;
    changed.player.ship.hypersleepClass = 0;
    expect(prepareHaulJourney(changed, f.source, f.request, f.world)).toMatchObject({ ok: false });
    changed.player.ship.hypersleepClass = 1;
    changed.player.resources.fuel = 0;
    expect(prepareHaulJourney(changed, f.source, f.request, f.world)).toMatchObject({ ok: false });
    expect(f.save).toEqual(before);
  });

  it('refuses missing/misaddressed destinations and invalid site hosts without a partial departure', () => {
    const f = haulJourneyFixture();
    const missing = { createSystem: () => null };
    expect(prepareHaulJourney(f.save, f.source, f.request, missing)).toMatchObject({ ok: false });
    const wrong = { createSystem: () => haulSystemFixture({ worldX: 999, worldY: 0, systemSlot: 0 }) };
    expect(prepareHaulJourney(f.save, f.source, f.request, wrong)).toMatchObject({ ok: false });
    const malformed = structuredClone(f.save);
    const objective = malformed.activeMissions[f.mission.id].objectives[0];
    if (objective.kind !== 'haul') throw new Error('Expected haul objective.');
    (objective.destination.orbit.host as { kind: string; starId: string }).starId = 'B';
    expect(prepareHaulJourney(malformed, f.source, f.request, f.world)).toMatchObject({ ok: false });
    expect(f.haul.createSnapshot().activeTow!.stage).toBe('attached');
  });

  it('does not apply live effects on failed/missing checkpoints and allows a clean retry', () => {
    const f = haulJourneyFixture();
    const prepared = prepareHaulJourney(f.save, f.source, f.request, f.world);
    if (!prepared.ok) throw new Error(prepared.message);
    const apply = vi.fn();
    const failing = vi.fn(() => {
      throw new Error('quota exceeded');
    });
    expect(commitPreparedHaulJourney(prepared.journey, undefined, apply).ok).toBe(false);
    expect(commitPreparedHaulJourney(prepared.journey, failing, apply)).toMatchObject({
      ok: false,
      message: expect.stringContaining('quota exceeded'),
    });
    expect(apply).not.toHaveBeenCalled();
    expect(f.haul.createSnapshot().activeTow!.stage).toBe('attached');
    const checkpoint = vi.fn((save) => {
      expect(parseGameSave(save).heavyHaul.activeTow!.stage).toBe('arrived');
    });
    expect(commitPreparedHaulJourney(prepared.journey, checkpoint, apply).ok).toBe(true);
    expect(checkpoint.mock.invocationCallOrder[0]).toBeLessThan(apply.mock.invocationCallOrder[0]);
    expect(apply).toHaveBeenCalledOnce();
  });

  it('reloads arrived receipts without consuming fuel/time again, and catches up a departed source lazily', () => {
    const f = haulJourneyFixture();
    const prepared = prepareHaulJourney(f.save, f.source, f.request, f.world);
    if (!prepared.ok) throw new Error(prepared.message);
    const saved = parseGameSave(JSON.stringify(prepared.journey.save));
    expect(prepareHaulJourney(saved, prepared.journey.system, f.request, f.world)).toMatchObject({
      ok: false,
    });
    const missions = new MissionProgressService();
    missions.restoreSnapshot(saved);
    const haul = new HeavyHaulService(missions);
    haul.restoreSnapshot(saved.heavyHaul, saved.gameClockElapsedSeconds);
    expect(haul.recordArrival(prepared.journey.receipt, f.context).ok).toBe(false);
    const sourceAgain = haulSystemFixture(f.objective.pickup.systemAddress);
    const sourceHistory = saved.systemOrbitHistory.find((entry) => entry.worldX === 0)!;
    restoreSystemOrbits(sourceAgain, sourceHistory.orbit, saved.planetMutations, saved.bulkAdvanceSeconds);
    const expectedSource = haulSystemFixture(f.objective.pickup.systemAddress);
    expectedSource.advanceOrbitsBySimulatedSeconds(prepared.journey.quote.durationSeconds);
    expect(capturePlanetMutations(sourceAgain).map((entry) => entry.orbitAngle)).toEqual(
      capturePlanetMutations(expectedSource).map((entry) => entry.orbitAngle)
    );
    expect(sourceAgain.starbase!.orbitAngle).toBe(expectedSource.starbase!.orbitAngle);
  });
});

describe('Game haul orchestration', () => {
  it('leaves live state unchanged on storage failure, then arrives exactly once and clears stale controls/overlays', () => {
    const f = haulJourneyFixture();
    const seed = new PRNG(f.save.seed);
    const generator = new SystemDataGenerator(seed);
    const manager = new GameStateManager(f.player, seed, generator);
    (manager as any)._changeState('system', f.source, null, null);
    const game = Object.assign(Object.create(Game.prototype), {
      player: f.player,
      gameSeedPRNG: seed,
      stateManager: manager,
      systemDataGenerator: generator,
      _missionProgress: f.missions,
      _heavyHaulService: f.haul,
      gameClockElapsedSeconds: f.save.gameClockElapsedSeconds,
      bulkAdvanceSeconds: 0,
      planetMutationRegistry: new Map(),
      materializedOrbitalSystem: f.source,
      tutorialHintsShown: new Set(),
      infrastructureRecords: [],
      terminalOverlay: new TerminalOverlay(),
      astrometricOverlay: new AstrometricOverlay(generator),
      inputManager: { clearState: vi.fn() },
      hyperspaceSurveyService: { clearCache: vi.fn() },
      renderer: { clearOverlay: vi.fn(), invalidateWorldScene: vi.fn() },
      popupState: 'inactive',
      _emitContextualHint: vi.fn(),
      _publishStatusUpdate: vi.fn(),
    }) as any;
    Object.defineProperty(game, 'haulJourneyWorld', { get: () => f.world });
    game.travelMode.approachTargetSignature = 'old-target';
    game.travelMode.currentTargetSignature = 'old-target';
    const clearHud = vi.spyOn(game.astrometricOverlay, 'clear');
    const clearTerminal = vi.spyOn(game.terminalOverlay, 'clear');
    const unsubscribe = eventManager.subscribe(GameEvents.GAME_STATE_CHANGED, (event) =>
      game._handleGameStateChange(event)
    );
    const before = game.createSaveGame();
    try {
      game.setJourneyCheckpointWriter(() => {
        throw new Error('quota exceeded');
      });
      expect(game.departHaulJourney(f.request).ok).toBe(false);
      expect(game.gameClockElapsedSeconds).toBe(before.gameClockElapsedSeconds);
      expect(game.bulkAdvanceSeconds).toBe(0);
      expect(manager.currentSystem).toBe(f.source);
      expect(f.haul.createSnapshot()).toEqual(before.heavyHaul);
      expect(f.player.position).toEqual(before.player.position);
      expect(clearHud).not.toHaveBeenCalled();
      const checkpoint = vi.fn();
      game.setJourneyCheckpointWriter(checkpoint);
      expect(game.departHaulJourney(f.request).ok).toBe(true);
      const persisted = parseGameSave(checkpoint.mock.calls[0][0]);
      expect(game.gameClockElapsedSeconds).toBe(persisted.gameClockElapsedSeconds);
      expect(game.bulkAdvanceSeconds).toBe(persisted.bulkAdvanceSeconds);
      expect(manager.currentSystem!.lastAppliedBulkSeconds).toBe(persisted.bulkAdvanceSeconds);
      expect(f.player.position).toEqual(persisted.player.position);
      expect(f.player.resources).toEqual(before.player.resources);
      expect(f.haul.createSnapshot()).toEqual(persisted.heavyHaul);
      expect(game.travelMode.approachTargetSignature).toBeNull();
      expect(game.travelMode.currentTargetSignature).toBe('');
      expect(clearHud).toHaveBeenCalledOnce();
      expect(clearTerminal).toHaveBeenCalledOnce();
      expect(game.inputManager.clearState).toHaveBeenCalledOnce();
      expect(game.renderer.invalidateWorldScene).toHaveBeenCalledOnce();
      const after = game.createSaveGame();
      expect(game.departHaulJourney(f.request).ok).toBe(false);
      expect(checkpoint).toHaveBeenCalledOnce();
      expect(game.gameClockElapsedSeconds).toBe(after.gameClockElapsedSeconds);
      expect(game.createSaveGame().systemOrbitHistory).toEqual(after.systemOrbitHistory);
    } finally {
      unsubscribe();
      manager.destroy();
    }
  });
});
