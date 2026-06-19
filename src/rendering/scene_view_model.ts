import type { Player } from '../core/player';
import type { OrbitScreenModel } from '../core/orbit_ui';
import type { StarbaseScreenModel } from '../core/starbase_ui';
import type { Planet } from '../entities/planet';
import type { SolarSystem } from '../entities/solar_system';
import type { Starbase } from '../entities/starbase';
import type { SurfaceVehicleOverlayModel } from './scene_renderer';

export interface PlayerViewSnapshot {
  readonly position: Readonly<{
    worldX: number;
    worldY: number;
    systemX: number;
    systemY: number;
    surfaceX: number;
    surfaceY: number;
  }>;
  readonly render: Readonly<{
    char: string;
    fgColor: string;
    directionGlyph?: string;
  }>;
  readonly resources: Readonly<{
    credits: number;
    fuel: number;
    maxFuel: number;
  }>;
  distanceSqToSystemCoords(targetX: number, targetY: number): number;
}

export type SceneViewModel =
  | Readonly<{ kind: 'hyperspace'; player: PlayerViewSnapshot }>
  | Readonly<{ kind: 'system'; player: PlayerViewSnapshot; system: SolarSystem; viewScale: number }>
  | Readonly<{ kind: 'orbit'; model: Readonly<OrbitScreenModel> }>
  | Readonly<{
      kind: 'surface';
      player: PlayerViewSnapshot;
      body: Planet | Starbase;
      overlay?: Readonly<SurfaceVehicleOverlayModel>;
    }>
  | Readonly<{
      kind: 'starbase';
      player: PlayerViewSnapshot;
      starbase: Starbase;
      model: Readonly<StarbaseScreenModel>;
    }>;

/** Creates player view snapshot. */
export function createPlayerViewSnapshot(player: Player): PlayerViewSnapshot {
  const position = Object.freeze({
    worldX: player.position.worldX,
    worldY: player.position.worldY,
    systemX: player.position.systemX,
    systemY: player.position.systemY,
    surfaceX: player.position.surfaceX,
    surfaceY: player.position.surfaceY,
  });
  const render = Object.freeze({
    char: player.render.char,
    fgColor: player.render.fgColor,
    directionGlyph: player.render.directionGlyph,
  });
  const resources = Object.freeze({
    credits: player.resources.credits,
    fuel: player.resources.fuel,
    maxFuel: player.resources.maxFuel,
  });
  return Object.freeze({
    position,
    render,
    resources,
    /** Calculates squared distance from a view-model item to system coordinates. */
    distanceSqToSystemCoords(targetX: number, targetY: number): number {
      const dx = targetX - position.systemX;
      const dy = targetY - position.systemY;
      return dx * dx + dy * dy;
    },
  });
}

/** Creates scene view model. */
export function createSceneViewModel(model: SceneViewModel): SceneViewModel {
  return Object.freeze(model);
}
