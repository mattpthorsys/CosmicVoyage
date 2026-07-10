import { CONFIG } from '../config';
import { MilkyWayModel } from '../generation/milky_way_model';

const GALAXY_ZOOM_SPANS_PC = [36000, 16000, 8000, 3000] as const;

export interface GalaxyMapModel {
  readonly centerXpc: number;
  readonly centerYpc: number;
  readonly spanPc: number;
  readonly zoomIndex: number;
  readonly zoomLabel: string;
  readonly playerXpc: number;
  readonly playerYpc: number;
  readonly playerWorldX: number;
  readonly playerWorldY: number;
  readonly playerGalactocentricRadiusPc: number;
  readonly playerDistanceFromSolLy: number;
  readonly armName: string;
  readonly humanRegion: string;
  readonly generationVersion: number;
}

/** Owns keyboard pan and zoom state for the modal top-down Galaxy instrument. */
export class GalaxyMapController {
  private zoomIndex = 0;
  private centerXpc = 0;
  private centerYpc = 0;

  /** Resets the whole-Galaxy view while retaining the player's crosshair position. */
  reset(): void {
    this.zoomIndex = 0;
    this.centerXpc = 0;
    this.centerYpc = 0;
  }

  /** Pans by a stable fraction of the current viewport span. */
  pan(dx: number, dy: number): void {
    const stepPc = GALAXY_ZOOM_SPANS_PC[this.zoomIndex] * 0.075;
    const limit = CONFIG.GALACTIC_DISK_RADIUS_PC * 1.25;
    this.centerXpc = clamp(this.centerXpc + dx * stepPc, -limit, limit);
    this.centerYpc = clamp(this.centerYpc + dy * stepPc, -limit, limit);
  }

  /** Changes zoom and centres the first regional view on the player. */
  zoom(delta: number, model: MilkyWayModel, playerWorldX: number, playerWorldY: number): void {
    const previous = this.zoomIndex;
    this.zoomIndex = clamp(this.zoomIndex + delta, 0, GALAXY_ZOOM_SPANS_PC.length - 1);
    if (this.zoomIndex === 0) {
      this.centerXpc = 0;
      this.centerYpc = 0;
    } else if (previous === 0) {
      this.recenterOnPlayer(model, playerWorldX, playerWorldY);
    }
  }

  /** Centres the current viewport on the player's projected Galactic location. */
  recenterOnPlayer(model: MilkyWayModel, playerWorldX: number, playerWorldY: number): void {
    const player = model.worldToGalactocentric(playerWorldX, playerWorldY);
    this.centerXpc = player.xPc;
    this.centerYpc = player.yPc;
  }

  /** Builds one immutable frame model without exposing mutable controller state. */
  createModel(model: MilkyWayModel, playerWorldX: number, playerWorldY: number): GalaxyMapModel {
    const player = model.worldToGalactocentric(playerWorldX, playerWorldY);
    const context = model.getCellContext(playerWorldX, playerWorldY);
    const spanPc = GALAXY_ZOOM_SPANS_PC[this.zoomIndex];
    const zoomLabels = ['GALACTIC', 'REGIONAL', 'HUMAN REACH', 'INHABITED VOLUME'] as const;

    return Object.freeze({
      centerXpc: this.centerXpc,
      centerYpc: this.centerYpc,
      spanPc,
      zoomIndex: this.zoomIndex,
      zoomLabel: zoomLabels[this.zoomIndex],
      playerXpc: player.xPc,
      playerYpc: player.yPc,
      playerWorldX,
      playerWorldY,
      playerGalactocentricRadiusPc: context.galactocentricRadiusPc,
      playerDistanceFromSolLy: context.human.distanceFromSolLy,
      armName: context.armName ?? 'inter-arm space',
      humanRegion: context.human.region,
      generationVersion: CONFIG.GALAXY_MODEL_VERSION,
    });
  }
}

/** Clamps an integer or scalar to inclusive bounds. */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
