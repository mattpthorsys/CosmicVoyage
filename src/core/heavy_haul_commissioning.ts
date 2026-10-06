import type { SolarSystem } from '../entities/solar_system';
import { HeavyHaulService, type HaulActionResult } from './heavy_haul_service';
import { isClearInstallationOrbit } from './infrastructure_registry';
import { sameHaulAddress } from './heavy_haul_types';
import { getHeavyHaulObjective } from './mission_board';
import { MissionProgressService } from './mission_progress';
import { parseGameSave, type GameSave } from './save_game';
import { systemAddress } from './system_orbit_state';

export type PreparedHaulChange =
  | { readonly ok: false; readonly message: string }
  | { readonly ok: true; readonly save: GameSave; readonly message: string };

/** Prepares installation, detached support, objective completion and escrow on isolated persistent state. */
export function prepareHaulCommissioning(original: GameSave, system: SolarSystem): PreparedHaulChange {
  try {
    const save = structuredClone(parseGameSave(original));
    const tow = save.heavyHaul.activeTow;
    const mission = tow && save.activeMissions[tow.missionId];
    const objective = mission && getHeavyHaulObjective(mission);
    if (
      !objective ||
      save.location.kind !== 'system' ||
      !sameHaulAddress(systemAddress(system), objective.destination.systemAddress)
    )
      throw new Error('Deploy from the contracted destination system, undocked.');
    if (save.infrastructure.length >= 2048) throw new Error('Infrastructure registry is full.');
    if (!isClearInstallationOrbit(system, objective.destination.orbit))
      throw new Error('The reserved orbit is occupied or no longer stable.');
    const site = system.navigationMarkers.find((marker) => marker.id === objective.destination.siteId);
    const center = system.getOrbitCenter(objective.destination.orbit.host);
    const angleRad = site?.orbitAngle ?? objective.destination.orbit.angleRad;
    const x = site?.systemX ?? center.x + Math.cos(angleRad) * objective.destination.orbit.radiusM;
    const y = site?.systemY ?? center.y + Math.sin(angleRad) * objective.destination.orbit.radiusM;
    const missions = new MissionProgressService();
    missions.restoreSnapshot(save);
    const haul = new HeavyHaulService(missions);
    haul.restoreSnapshot(save.heavyHaul, save.gameClockElapsedSeconds);
    const result = haul.commitDeployment({
      systemAddress: systemAddress(system),
      siteId: objective.destination.siteId,
      distanceM: Math.hypot(save.player.position.systemX - x, save.player.position.systemY - y),
      gameClockSeconds: save.gameClockElapsedSeconds,
      bulkAdvanceSeconds: save.bulkAdvanceSeconds,
      orbit: { ...objective.destination.orbit, angleRad },
    });
    if (!result.ok) return result;
    save.infrastructure.push(result.installation);
    save.player.resources.credits += result.credits;
    Object.assign(save, missions.createSnapshot(), { heavyHaul: haul.createSnapshot() });
    save.savedAt = new Date().toISOString();
    parseGameSave(save);
    return {
      ok: true,
      save,
      message: `Installation commissioned. Escrow ${result.credits.toLocaleString()} Cr paid; contractor tank released.`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Commissioning unavailable.' };
  }
}

/** Prepares a restricted normal-tank refill; the allowance cannot become cargo or repeat after reload. */
export function prepareCommissioningRefill(original: GameSave, stationId: string): PreparedHaulChange {
  const save = structuredClone(parseGameSave(original));
  const record = save.infrastructure.find(
    (asset) => asset.assetId === stationId && asset.kind === 'automated-depot'
  );
  if (
    !record ||
    save.location.kind !== 'starbase' ||
    save.location.stationId !== stationId ||
    !sameHaulAddress(save.location, record.systemAddress)
  )
    return { ok: false, message: 'Dock at the commissioned depot to use its contractor refill.' };
  const units = Math.min(
    record.commissioningFuelRemainingUnits,
    save.player.resources.maxFuel - save.player.resources.fuel
  );
  if (!(units > 0)) return { ok: false, message: 'Commissioning refill exhausted or tank already full.' };
  record.commissioningFuelRemainingUnits -= units;
  save.player.resources.fuel += units;
  parseGameSave(save);
  return {
    ok: true,
    save,
    message: `Commissioning allowance: ${units.toFixed(0)} reactor fuel loaded / ${record.commissioningFuelRemainingUnits.toFixed(0)} remaining.`,
  };
}

/** Requires one durable checkpoint before applying a prepared lifecycle, deployment, or refill outcome. */
export function commitHaulChange(
  prepared: PreparedHaulChange,
  checkpoint: ((save: GameSave) => void) | undefined,
  apply: (save: GameSave) => void
): HaulActionResult {
  if (!prepared.ok) return prepared;
  if (!checkpoint) return { ok: false, message: 'This operation requires a working session checkpoint.' };
  try {
    checkpoint(structuredClone(prepared.save));
  } catch (error) {
    return {
      ok: false,
      message: `Operation cancelled: checkpoint failed (${error instanceof Error ? error.message : 'storage unavailable'}).`,
    };
  }
  apply(prepared.save);
  return { ok: true, message: prepared.message };
}
