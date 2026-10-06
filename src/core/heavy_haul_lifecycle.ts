import type { SolarSystem } from '../entities/solar_system';
import { HeavyHaulService } from './heavy_haul_service';
import { resolveHaulQuoteContext, type HaulJourneyWorld } from './heavy_haul_journey';
import type { PreparedHaulChange } from './heavy_haul_commissioning';
import { InfrastructureRegistry, isClearInstallationOrbit } from './infrastructure_registry';
import { sameHaulAddress } from './heavy_haul_types';
import { getHeavyHaulObjective, type StarbaseMission } from './mission_board';
import { MissionProgressService } from './mission_progress';
import { parseGameSave, type GameSave } from './save_game';
import { systemAddress } from './system_orbit_state';

export type HaulLifecycleAction =
  | { kind: 'accept'; mission: StarbaseMission }
  | { kind: 'couple' }
  | { kind: 'recover' };

/** Prepares every attachment/recovery transition on isolated owners for one durable checkpoint. */
export function prepareHaulLifecycle(
  original: GameSave,
  action: HaulLifecycleAction,
  system: SolarSystem | null,
  world: HaulJourneyWorld
): PreparedHaulChange {
  try {
    const save = structuredClone(parseGameSave(original));
    const missions = new MissionProgressService();
    missions.restoreSnapshot(save);
    const haul = new HeavyHaulService(missions);
    haul.restoreSnapshot(save.heavyHaul, save.gameClockElapsedSeconds);
    if (action.kind === 'recover') {
      const result = haul.cancel();
      if (!result.ok) return result;
      Object.assign(save, missions.createSnapshot(), { heavyHaul: haul.createSnapshot() });
      parseGameSave(save);
      return { ok: true, save, message: result.message };
    }
    const tow = save.heavyHaul.activeTow;
    const mission = action.kind === 'accept' ? action.mission : tow && save.activeMissions[tow.missionId];
    const objective = mission && getHeavyHaulObjective(mission);
    if (
      !mission ||
      !objective?.resupply ||
      !system ||
      save.location.kind === 'hyperspace' ||
      !sameHaulAddress(systemAddress(system), objective.pickup.systemAddress) ||
      !sameHaulAddress(save.location, objective.pickup.systemAddress)
    )
      throw new Error('Contract source or certified resupply record is unavailable.');
    const context = resolveHaulQuoteContext(
      save,
      objective.destination.systemAddress,
      objective.resupply,
      world,
      objective
    );
    if (action.kind === 'accept') {
      if (save.location.kind !== 'starbase' || save.location.stationId !== mission.originStarbaseId)
        throw new Error('Accept this contract at its issuing port.');
      const destination = world.createSystem(objective.destination.systemAddress);
      if (!destination) throw new Error('Destination is not enterable.');
      const registry = new InfrastructureRegistry();
      registry.restore(save.infrastructure);
      registry.materialize(destination, save.bulkAdvanceSeconds);
      if (
        !isClearInstallationOrbit(system, objective.pickup.orbit) ||
        !isClearInstallationOrbit(destination, objective.destination.orbit)
      )
        throw new Error('A contracted orbital ring is occupied; this offer cannot be commissioned.');
      const result = haul.accept(mission, context);
      if (!result.ok) return result;
      Object.assign(save, missions.createSnapshot(), { heavyHaul: haul.createSnapshot() });
      parseGameSave(save);
      return { ok: true, save, message: result.message };
    }
    if (save.location.kind !== 'system') throw new Error('Undock and approach the package to couple.');
    const marker = system.navigationMarkers.find((entry) => entry.id === objective.pickup.siteId);
    if (!marker) throw new Error('Pickup contact is not materialized in this system.');
    const result = haul.couple(
      {
        systemAddress: systemAddress(system),
        siteId: marker.id,
        distanceM: Math.hypot(
          save.player.position.systemX - marker.systemX,
          save.player.position.systemY - marker.systemY
        ),
      },
      context
    );
    if (!result.ok) return result;
    Object.assign(save, missions.createSnapshot(), { heavyHaul: haul.createSnapshot() });
    parseGameSave(save);
    return { ok: true, save, message: result.message };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Haul operation unavailable.' };
  }
}
