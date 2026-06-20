import { CONFIG } from '../config';
import { logger } from '../utils/logger';
import { eventManager, GameEvents } from './event_manager';
import { Game } from './game';
import { GameSave, parseGameSave, SaveGameStorage } from './save_game';
import { TitleCinematicRenderer } from '../rendering/title_cinematic_renderer';

const AUTOSAVE_INTERVAL_MS = 10_000;

/** Coordinates title-screen, save storage, import/export, and the active Game instance. */
export class ApplicationController {
  private game: Game | null = null;
  private autosaveTimer: number | null = null;
  private menuOpen = false;
  private readonly storage = new SaveGameStorage(window.sessionStorage, window.localStorage);
  private readonly titleRenderer = new TitleCinematicRenderer(
    requireElement<HTMLCanvasElement>('titleCinematicCanvas'),
    CONFIG.SEED
  );
  private readonly splash = requireElement<HTMLElement>('splashScreen');
  private readonly gameMenu = requireElement<HTMLElement>('gameMenu');
  private readonly splashMessage = requireElement<HTMLElement>('splashMessage');
  private readonly splashDetail = requireElement<HTMLElement>('splashDetail');
  private readonly menuMessage = requireElement<HTMLElement>('gameMenuMessage');
  private readonly importInput = requireElement<HTMLInputElement>('saveImportInput');

  /** Initializes ApplicationController and displays available startup choices. */
  constructor() {
    this.bindButtons();
    window.addEventListener('keydown', this.handleGlobalKeyDown, true);
    window.addEventListener('beforeunload', this.handleBeforeUnload);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    eventManager.subscribe(GameEvents.GAME_STATE_CHANGED, () => {
      queueMicrotask(() => this.saveSession(''));
    });
    this.refreshSplash();
    this.titleRenderer.start();
  }

  /** Wires title and in-game menu controls. */
  private bindButtons(): void {
    requireElement<HTMLButtonElement>('continueSessionButton').addEventListener('click', () => {
      const save = this.storage.loadSession();
      if (save) this.startGame(save.seed, save);
    });
    requireElement<HTMLButtonElement>('loadManualButton').addEventListener('click', () => {
      const save = this.storage.loadManual();
      if (save) this.startGame(save.seed, save);
    });
    requireElement<HTMLButtonElement>('newGameButton').addEventListener('click', () => {
      this.storage.clearSession();
      this.startGame(CONFIG.SEED);
    });
    requireElement<HTMLButtonElement>('importSplashButton').addEventListener('click', () => {
      this.importInput.click();
    });
    requireElement<HTMLButtonElement>('resumeGameButton').addEventListener('click', () => {
      this.closeGameMenu();
    });
    requireElement<HTMLButtonElement>('checkpointButton').addEventListener('click', () => {
      this.saveSession('Session checkpoint saved.');
    });
    requireElement<HTMLButtonElement>('saveManualButton').addEventListener('click', () => {
      this.saveManual();
    });
    requireElement<HTMLButtonElement>('loadManualMenuButton').addEventListener('click', () => {
      const save = this.storage.loadManual();
      if (save) this.startGame(save.seed, save);
      else this.menuMessage.textContent = 'No persistent browser save is available.';
    });
    requireElement<HTMLButtonElement>('exportSaveButton').addEventListener('click', () => {
      this.exportSave();
    });
    requireElement<HTMLButtonElement>('importMenuButton').addEventListener('click', () => {
      this.importInput.click();
    });
    requireElement<HTMLButtonElement>('newGameMenuButton').addEventListener('click', () => {
      if (!window.confirm('Start a new game and replace the current session checkpoint?')) return;
      this.returnToTitle(true);
    });
    requireElement<HTMLButtonElement>('titleButton').addEventListener('click', () => {
      this.returnToTitle(false);
    });
    this.importInput.addEventListener('change', () => {
      void this.importSelectedFile();
    });
    document.querySelectorAll<HTMLButtonElement>('#splashScreen [data-detail]').forEach((button) => {
      /** Displays contextual information for the focused cinematic menu option. */
      const showDetail = (): void => {
        this.splashDetail.textContent = button.dataset.detail ?? '';
      };
      button.addEventListener('mouseenter', showDetail);
      button.addEventListener('focus', showDetail);
    });
  }

  /** Starts a fresh runtime, optionally restoring a validated save snapshot. */
  private startGame(seed: string, save?: GameSave): void {
    this.destroyCurrentGame();
    try {
      this.game = new Game('gameCanvas', 'statusBar', seed);
      if (save) this.game.restoreSaveGame(save);
      this.splash.hidden = true;
      this.titleRenderer.stop();
      this.gameMenu.hidden = true;
      this.menuOpen = false;
      this.game.startGame();
      this.startAutosave();
      this.saveSession('');
    } catch (error) {
      this.destroyCurrentGame();
      this.splash.hidden = false;
      this.titleRenderer.start();
      this.splashMessage.textContent = `Unable to start: ${formatError(error)}`;
      logger.error('[ApplicationController] Unable to start game.', error);
    }
  }

  /** Opens or closes the game menu when F10 is pressed. */
  private handleGlobalKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'F10' && this.game) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (this.menuOpen) this.closeGameMenu();
      else this.openGameMenu();
      return;
    }

    const activeOverlay = this.menuOpen ? this.gameMenu : this.splash.hidden ? null : this.splash;
    if (!activeOverlay) return;
    if (
      event.key !== 'ArrowUp' &&
      event.key !== 'ArrowDown' &&
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'Enter' &&
      event.key !== ' '
    ) {
      return;
    }

    const buttons = [...activeOverlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    if (buttons.length === 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const focusedIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Enter' || event.key === ' ') {
      buttons[Math.max(0, focusedIndex)]?.click();
      return;
    }
    const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
    const nextIndex =
      focusedIndex < 0
        ? direction > 0
          ? 0
          : buttons.length - 1
        : (focusedIndex + direction + buttons.length) % buttons.length;
    buttons[nextIndex].focus();
  };

  /** Opens the F10 menu and pauses gameplay input and simulation. */
  private openGameMenu(): void {
    if (!this.game || this.menuOpen) return;
    this.game.pauseGame();
    this.saveSession('');
    this.menuOpen = true;
    this.menuMessage.textContent = 'Game paused. Session checkpoint current.';
    requireElement<HTMLButtonElement>('loadManualMenuButton').disabled = !this.storage.loadManual();
    this.gameMenu.hidden = false;
    requireElement<HTMLButtonElement>('resumeGameButton').focus();
  }

  /** Closes the F10 menu and resumes the retained game instance. */
  private closeGameMenu(): void {
    if (!this.game || !this.menuOpen) return;
    this.gameMenu.hidden = true;
    this.menuOpen = false;
    this.game.resumeGame();
  }

  /** Saves an automatic checkpoint into this tab's session storage. */
  private saveSession(message: string): void {
    if (!this.game) return;
    try {
      this.storage.saveSession(this.game.createSaveGame());
      if (message) this.menuMessage.textContent = message;
    } catch (error) {
      this.menuMessage.textContent = `Checkpoint failed: ${formatError(error)}`;
    }
  }

  /** Saves the current game into persistent browser storage. */
  private saveManual(): void {
    if (!this.game) return;
    try {
      this.storage.saveManual(this.game.createSaveGame());
      this.menuMessage.textContent = 'Persistent browser save written.';
    } catch (error) {
      this.menuMessage.textContent = `Save failed: ${formatError(error)}`;
    }
  }

  /** Downloads the current save as a portable JSON file. */
  private exportSave(): void {
    if (!this.game) return;
    const save = this.game.createSaveGame();
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cosmic-voyage-${save.savedAt.replace(/[:.]/g, '-')}.json`;
    link.click();
    URL.revokeObjectURL(url);
    this.menuMessage.textContent = 'Save file exported.';
  }

  /** Imports and starts the save selected through the shared file picker. */
  private async importSelectedFile(): Promise<void> {
    const file = this.importInput.files?.[0];
    this.importInput.value = '';
    if (!file) return;
    try {
      const save = parseGameSave(await file.text());
      this.storage.saveSession(save);
      this.startGame(save.seed, save);
    } catch (error) {
      const message = `Import failed: ${formatError(error)}`;
      if (this.menuOpen) this.menuMessage.textContent = message;
      else this.splashMessage.textContent = message;
    }
  }

  /** Returns to the title screen, optionally clearing the current session checkpoint. */
  private returnToTitle(clearSession: boolean): void {
    if (this.game && !clearSession) this.saveSession('');
    if (clearSession) this.storage.clearSession();
    this.destroyCurrentGame();
    this.gameMenu.hidden = true;
    this.menuOpen = false;
    this.splash.hidden = false;
    this.refreshSplash();
    this.titleRenderer.start();
  }

  /** Updates title-screen button availability from validated browser saves. */
  private refreshSplash(): void {
    const session = this.storage.loadSession();
    const manual = this.storage.loadManual();
    const continueButton = requireElement<HTMLButtonElement>('continueSessionButton');
    const manualButton = requireElement<HTMLButtonElement>('loadManualButton');
    continueButton.disabled = !session;
    manualButton.disabled = !manual;
    continueButton.textContent = 'Continue';
    manualButton.textContent = 'Load Game';
    continueButton.dataset.detail = session
      ? `Resume current session · saved ${formatSaveDate(session)}`
      : 'No current session checkpoint';
    manualButton.dataset.detail = manual
      ? `Load browser save · saved ${formatSaveDate(manual)}`
      : 'No persistent browser save';
    this.splashMessage.textContent = session ? 'SESSION AVAILABLE' : '';
    this.splashDetail.textContent = session
      ? (continueButton.dataset.detail ?? '')
      : 'Begin a new voyage into a vast, indifferent galaxy.';
    window.setTimeout(() => {
      (session ? continueButton : requireElement<HTMLButtonElement>('newGameButton')).focus();
    }, 1800);
  }

  /** Starts periodic session checkpoints while a game exists. */
  private startAutosave(): void {
    if (this.autosaveTimer !== null) window.clearInterval(this.autosaveTimer);
    this.autosaveTimer = window.setInterval(() => this.saveSession(''), AUTOSAVE_INTERVAL_MS);
  }

  /** Saves before page teardown when browser storage remains available. */
  private handleBeforeUnload = (): void => {
    this.saveSession('');
  };

  /** Checkpoints when the tab becomes hidden. */
  private handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') this.saveSession('');
  };

  /** Destroys the active game and cancels its checkpoint timer. */
  private destroyCurrentGame(): void {
    if (this.autosaveTimer !== null) {
      window.clearInterval(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    this.game?.stopGame();
    this.game = null;
  }
}

/** Returns one required DOM element or throws a useful initialization error. */
function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required interface element "#${id}" is missing.`);
  return element as T;
}

/** Formats one save timestamp for menu labels. */
function formatSaveDate(save: GameSave): string {
  return new Date(save.savedAt).toLocaleString();
}

/** Converts unknown failures into concise interface text. */
function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
