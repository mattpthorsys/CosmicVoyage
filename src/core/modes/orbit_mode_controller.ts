import { CONFIG } from '../../config';
import type { Planet } from '../../entities/planet';
import type { StellarBody } from '../../entities/stellar_body';
import { formatDistanceAu, formatLightTimeFromMeters } from '../../utils/space_scale';
import type { InputManager } from '../input_manager';
import { createOrbitStellarSources } from '../orbit_stellar_sources';
import { OrbitDossier } from '../orbit_dossier';
import {
  createOrbitScreenModel,
  getOrbitReferenceLabel,
  getPlanetMapSize,
  OrbitInteractionMode,
  OrbitScreenModel,
} from '../orbit_ui';
import { clampIndex } from '../text_ui';
import type { TextModalTableModel } from '../text_ui';

export interface OrbitInteractionContext {
  parentPlanet: Planet;
  stars: readonly StellarBody[];
  viewportCols: number;
  viewportRows: number;
  /** Checks the live location before a surface worker's result may change the interface. */
  isActive: () => boolean;
  survey: (body: Planet) => void;
  prefetch: (bodies: Planet[]) => void;
  leave: () => void;
  land: (body: Planet, x: number, y: number) => void;
  invalidate: () => void;
}

/** Owns local orbital selection, landing interaction, animation, and screen preparation. */
export class OrbitModeController {
  selectedBodyIndex = 0;
  mode: OrbitInteractionMode = 'overview';
  landingX = Math.floor(CONFIG.PLANET_MAP_BASE_SIZE / 2);
  landingY = Math.floor(CONFIG.PLANET_MAP_BASE_SIZE / 2);
  alert = '';
  elapsedSeconds = 0;
  readonly dossier = new OrbitDossier();
  private screenCache: { signature: string; model: OrbitScreenModel } | null = null;

  /** Resets orbital interaction on entry. */
  reset(selectedBodyIndex = 0, mapSize = CONFIG.PLANET_MAP_BASE_SIZE): void {
    this.selectedBodyIndex = Math.max(0, selectedBodyIndex);
    this.mode = 'overview';
    this.landingX = Math.floor(mapSize / 2);
    this.landingY = Math.floor(mapSize / 2);
    this.alert = '';
    this.elapsedSeconds = 0;
    this.dossier.close();
    this.invalidateScreen();
  }

  /** Discards the prepared screen when the world location changes. */
  invalidateScreen(): void {
    this.screenCache = null;
  }

  /** Returns the planet and its moons in interface order. */
  getBodies(parent: Planet | null): Planet[] {
    return parent ? [parent, ...parent.moons] : [];
  }

  /** Resolves and bounds the current selection against the local body list. */
  getSelectedBody(parent: Planet | null): Planet {
    const bodies = this.getBodies(parent);
    if (bodies.length === 0) throw new Error('No orbital body selected.');
    this.selectedBodyIndex = clampIndex(this.selectedBodyIndex, bodies.length);
    return bodies[this.selectedBodyIndex];
  }

  /** Centers landing controls when changing the selected body. */
  private resetLandingCursor(parent: Planet): void {
    const mapSize = getPlanetMapSize(this.getSelectedBody(parent));
    this.landingX = Math.floor(mapSize / 2);
    this.landingY = Math.floor(mapSize / 2);
    this.mode = 'overview';
    this.alert = '';
  }

  /** Returns the selected body and nearby candidates for surface prefetch. */
  getPrefetchWindow(parent: Planet): Planet[] {
    const bodies = this.getBodies(parent);
    const selected = clampIndex(this.selectedBodyIndex, bodies.length);
    return [bodies[selected], bodies[selected + 1], bodies[selected - 1], bodies[selected + 2]].filter(
      (body): body is Planet => Boolean(body)
    );
  }

  /** Handles orbital selection and landing keys, returning whether input was consumed. */
  handleInput(
    input: Pick<InputManager, 'wasActionJustPressed' | 'isActionActive' | 'wasAnyKeyJustPressed'>,
    context: OrbitInteractionContext
  ): boolean {
    const { parentPlanet } = context;
    const bodies = this.getBodies(parentPlanet);
    const selectedBody = this.getSelectedBody(parentPlanet);
    const mapSize = getPlanetMapSize(selectedBody);
    if (this.dossier.isOpen) {
      if (this.dossier.reveal.isActive && input.wasAnyKeyJustPressed()) {
        this.dossier.reveal.complete();
        context.invalidate();
        return true;
      }
      if (input.wasActionJustPressed('QUIT') || input.wasActionJustPressed('ORBIT_DOSSIER')) {
        this.dossier.close();
        context.invalidate();
      } else {
        const direction =
          input.wasActionJustPressed('MOVE_UP') || input.wasActionJustPressed('PAGE_UP')
            ? -1
            : input.wasActionJustPressed('MOVE_DOWN') || input.wasActionJustPressed('PAGE_DOWN')
              ? 1
              : 0;
        if (direction) {
          const model = this.createDossier(
            parentPlanet,
            context.stars,
            context.viewportCols,
            context.viewportRows
          );
          const page = input.wasActionJustPressed('PAGE_UP') || input.wasActionJustPressed('PAGE_DOWN');
          this.dossier.scroll(
            direction * (page ? model.visibleRowCount : 1),
            model.dashboard!.length,
            context.viewportRows
          );
          context.invalidate();
        }
      }
      return true;
    }
    if (input.wasActionJustPressed('ORBIT_DOSSIER')) {
      this.dossier.open();
      context.invalidate();
      return true;
    }
    if (this.mode === 'overview') {
      if (input.wasActionJustPressed('MOVE_LEFT')) {
        this.selectBody(-1, bodies.length, context);
        return true;
      }
      if (input.wasActionJustPressed('MOVE_RIGHT') || input.wasActionJustPressed('CYCLE_TARGET')) {
        this.selectBody(1, bodies.length, context);
        return true;
      }
      if (
        input.wasActionJustPressed('ENTER_SYSTEM') ||
        input.wasActionJustPressed('PRIMARY_ACTION') ||
        input.wasActionJustPressed('ACTIVATE_LAND_LIFTOFF')
      ) {
        if (selectedBody.type === 'GasGiant' || selectedBody.type === 'IceGiant') {
          this.alert = 'No solid landing solution for giant-class atmosphere.';
        } else if (!selectedBody.isSurfaceReady()) {
          this.alert = `Preparing ${selectedBody.name} landing data...`;
          this.prepareLandingSurface(selectedBody, context);
        } else {
          this.mode = 'landing';
          this.alert = 'Select landing coordinates.';
        }
        context.invalidate();
        return true;
      }
      if (input.wasActionJustPressed('QUIT') || input.wasActionJustPressed('LEAVE_SYSTEM')) {
        context.leave();
        context.invalidate();
        return true;
      }
      return false;
    }

    let moved = false;
    if (input.wasActionJustPressed('MOVE_LEFT') || input.isActionActive('MOVE_LEFT')) {
      this.landingX = (this.landingX - 1 + mapSize) % mapSize;
      moved = true;
    }
    if (input.wasActionJustPressed('MOVE_RIGHT') || input.isActionActive('MOVE_RIGHT')) {
      this.landingX = (this.landingX + 1) % mapSize;
      moved = true;
    }
    if (input.wasActionJustPressed('MOVE_UP') || input.isActionActive('MOVE_UP')) {
      this.landingY = Math.max(0, this.landingY - 1);
      moved = true;
    }
    if (input.wasActionJustPressed('MOVE_DOWN') || input.isActionActive('MOVE_DOWN')) {
      this.landingY = Math.min(mapSize - 1, this.landingY + 1);
      moved = true;
    }
    if (moved) {
      this.alert = '';
      context.invalidate();
      return true;
    }
    if (input.wasActionJustPressed('QUIT') || input.wasActionJustPressed('LEAVE_SYSTEM')) {
      this.mode = 'overview';
      this.alert = 'Landing selection cancelled.';
      context.invalidate();
      return true;
    }
    if (
      input.wasActionJustPressed('ENTER_SYSTEM') ||
      input.wasActionJustPressed('PRIMARY_ACTION') ||
      input.wasActionJustPressed('ACTIVATE_LAND_LIFTOFF')
    ) {
      context.land(selectedBody, this.landingX, this.landingY);
      context.invalidate();
      return true;
    }
    return false;
  }

  /** Builds the frozen statistics modal for the selected primary or moon. */
  createDossier(
    parent: Planet,
    stars: readonly StellarBody[],
    cols: number,
    rows: number
  ): TextModalTableModel {
    const body = this.getSelectedBody(parent);
    return this.dossier.createModel(body, parent, createOrbitStellarSources(stars, body), cols, rows);
  }

  /** Changes the local target and publishes its survey, preparation, and redraw effects. */
  private selectBody(direction: number, count: number, context: OrbitInteractionContext): void {
    this.selectedBodyIndex = (this.selectedBodyIndex + direction + count) % count;
    this.resetLandingCursor(context.parentPlanet);
    context.survey(this.getSelectedBody(context.parentPlanet));
    context.prefetch(this.getPrefetchWindow(context.parentPlanet));
    context.invalidate();
  }

  /** Opens landing controls once the selected body's surface is ready. */
  private prepareLandingSurface(planet: Planet, context: OrbitInteractionContext): void {
    void planet
      .prepareSurfaceReady()
      .then(() => {
        if (
          context.isActive() &&
          this.getSelectedBody(context.parentPlanet) === planet &&
          this.mode === 'overview'
        ) {
          this.resetLandingCursor(context.parentPlanet);
          this.mode = 'landing';
          this.alert = 'Select landing coordinates.';
          context.invalidate();
        }
      })
      .catch((error: unknown) => {
        if (context.isActive() && this.getSelectedBody(context.parentPlanet) === planet) {
          this.alert = `Landing data unavailable: ${error instanceof Error ? error.message : String(error)}`;
          context.invalidate();
        }
      });
  }

  /** Advances visual time, bounds the cursor, and describes the selected orbit. */
  update(parent: Planet, deltaSeconds: number): string {
    this.elapsedSeconds += deltaSeconds;
    const body = this.getSelectedBody(parent);
    const mapSize = getPlanetMapSize(body);
    this.landingX = ((Math.floor(this.landingX) % mapSize) + mapSize) % mapSize;
    this.landingY = Math.max(0, Math.min(mapSize - 1, Math.floor(this.landingY)));
    const orbitText =
      body.orbitDistance <= 0
        ? 'none'
        : `${formatDistanceAu(body.orbitDistance)} about ${getOrbitReferenceLabel(body, parent)}`;
    const signalText = body.orbitDistance <= 0 ? 'none' : formatLightTimeFromMeters(body.orbitDistance);
    return `Orbit: ${body.name} | Orbit ${orbitText} | Radius light time ${signalText} | Mode: ${this.mode} | Site ${this.landingX},${this.landingY}.`;
  }

  /** Converts visual time into the body's physical rotation phase. */
  getRotationPhase(body: Pick<Planet, 'rotationPeriodHours'>, simulatedSecondsPerRealSecond: number): number {
    const period = body.rotationPeriodHours * 60 * 60;
    if (!Number.isFinite(period) || period <= 0) return this.elapsedSeconds * 0.006;
    return (this.elapsedSeconds * simulatedSecondsPerRealSecond) / period;
  }

  /** Retains the orbital camera's independent viewing cadence. */
  getIlluminationPhase(): number {
    return this.elapsedSeconds * 0.06;
  }

  /** Reuses static screen content while advancing the rotating globe every frame. */
  createScreen(
    parentPlanet: Planet,
    stars: readonly StellarBody[],
    statusMessage: string,
    simulatedSecondsPerRealSecond: number
  ): OrbitScreenModel {
    const selectedBody = this.getSelectedBody(parentPlanet);
    const alert = this.alert || statusMessage;
    const signature = [
      parentPlanet.name,
      selectedBody.name,
      this.selectedBodyIndex,
      this.mode,
      this.landingX,
      this.landingY,
      selectedBody.discovery.level,
      selectedBody.scanned ? 'scanned' : 'pending',
      selectedBody.isSurfaceReady() ? 'surface-ready' : 'surface-pending',
      alert,
    ].join('|');
    if (
      !this.screenCache ||
      this.screenCache.signature !== signature ||
      this.screenCache.model.parentPlanet !== parentPlanet ||
      this.screenCache.model.selectedBody !== selectedBody
    ) {
      this.screenCache = {
        signature,
        model: createOrbitScreenModel({
          parentPlanet,
          selectedBody,
          selectedIndex: this.selectedBodyIndex,
          mode: this.mode,
          landingCursorX: this.landingX,
          landingCursorY: this.landingY,
          rotationPhase: 0,
          illuminationPhase: 0,
          alert,
        }),
      };
    }
    return {
      ...this.screenCache.model,
      // Positions and luminosities are live data, unlike the cached descriptive text.
      stellarSources: createOrbitStellarSources(stars, selectedBody),
      rotationPhase: this.getRotationPhase(selectedBody, simulatedSecondsPerRealSecond),
      illuminationPhase: this.getIlluminationPhase(),
    };
  }
}
