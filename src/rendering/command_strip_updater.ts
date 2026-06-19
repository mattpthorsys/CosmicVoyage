import { AvailableAction } from '../core/available_actions';
import { CommandBarButton, CommandBarModel } from '../core/command_bar';
import { eventManager, GameEvents } from '../core/event_manager';
import { CONFIG } from '../config';
import { TEXT_PALETTE } from './text_palette';

export class CommandStripUpdater {
  private readonly element: HTMLElement;

  /** Initializes CommandStripUpdater. */
  constructor(element: HTMLElement) {
    this.element = element;
    this.element.style.fontFamily = CONFIG.FONT_FAMILY;
    this.element.style.backgroundColor = TEXT_PALETTE.panelBackground;
    this.element.style.color = TEXT_PALETTE.text;
    this.element.style.boxSizing = 'border-box';
    this.element.style.overflow = 'hidden';
    this.element.style.whiteSpace = 'nowrap';
    this.element.style.display = 'flex';
    this.element.style.alignItems = 'center';
    this.element.style.gap = '8px';
    this.ensureCommandBarStyles();
  }

  /** Returns element. */
  getElement(): HTMLElement {
    return this.element;
  }

  /** Updates max chars. */
  updateMaxChars(charWidthPx: number, charHeightPx: number): void {
    const fontSize = charHeightPx > 0 ? charHeightPx * 0.82 : 13;
    this.element.style.fontSize = `${fontSize}px`;
    this.element.style.height = `calc(${fontSize * 1.45}px + 8px)`;
    const paddingLR = charWidthPx > 0 ? charWidthPx : 10;
    this.element.style.padding = `4px ${paddingLR}px`;
    const statusHeight = fontSize * 1.4 * 3 + 10;
    this.element.style.bottom = `${statusHeight}px`;
  }

  /** Updates. */
  update(
    actionsOrModel: AvailableAction[] | CommandBarModel,
    primaryActionId?: string,
    targetName?: string
  ): void {
    while (this.element.firstChild) {
      this.element.removeChild(this.element.firstChild);
    }

    if (!Array.isArray(actionsOrModel)) {
      this.updateCommandBar(actionsOrModel);
      return;
    }

    if (targetName) {
      const target = document.createElement('span');
      target.textContent = `TARGET ${targetName}`;
      target.style.color = TEXT_PALETTE.cyanSignal;
      this.element.appendChild(target);
    }

    actionsOrModel.slice(0, 7).forEach((action) => {
      const key = document.createElement('span');
      key.textContent = `[${this.formatKey(action.key)}] `;
      key.style.color = action.enabled ? TEXT_PALETTE.amber : TEXT_PALETTE.textDim;
      this.element.appendChild(key);

      const label = document.createElement('span');
      label.textContent = action.id === primaryActionId ? `${action.label} *` : action.label;
      label.style.color = action.enabled ? TEXT_PALETTE.text : TEXT_PALETTE.textDim;
      this.element.appendChild(label);
    });
  }

  /** Updates command bar. */
  private updateCommandBar(model: CommandBarModel): void {
    if (model.targetName) {
      const target = document.createElement('span');
      target.textContent = `TARGET ${model.targetName}`;
      target.title = model.context;
      target.style.color = TEXT_PALETTE.cyanSignal;
      target.style.marginRight = '4px';
      this.element.appendChild(target);
    }

    const left = model.leftButtons ?? [];
    const right = model.rightButtons ?? [];
    [...left, ...model.buttons, ...right].forEach((button) => {
      this.element.appendChild(
        this.createButton(button, button.id === model.primaryButtonId, button.id === model.selectedButtonId)
      );
    });
  }

  /** Creates button. */
  private createButton(button: CommandBarButton, primary: boolean, selected: boolean): HTMLElement {
    const el = document.createElement('button');
    const enabled = button.enabled !== false;
    el.type = 'button';
    el.disabled = !enabled;
    el.textContent = `${button.key ? `[${this.formatKey(button.key)}] ` : ''}${button.label}${primary ? ' *' : ''}`;
    el.title = button.detail ?? button.label;
    el.style.fontFamily = CONFIG.FONT_FAMILY;
    el.style.fontSize = 'inherit';
    el.style.lineHeight = '1';
    el.style.padding = '3px 8px';
    el.style.borderRadius = '0';
    el.style.border = `1px solid ${this.getBorderColour(button)}`;
    el.style.backgroundColor = enabled
      ? this.getBackgroundColour(button, primary, selected)
      : TEXT_PALETTE.panelBackground;
    el.style.color = enabled ? this.getForegroundColour(button, primary, selected) : TEXT_PALETTE.textDim;
    el.style.cursor = enabled ? 'pointer' : 'default';
    el.style.textTransform = 'uppercase';
    el.style.letterSpacing = '0';
    el.style.whiteSpace = 'nowrap';
    el.style.boxShadow =
      selected && enabled
        ? '0 0 10px rgba(140, 255, 255, 0.35)'
        : primary && enabled
          ? '0 0 8px rgba(0, 255, 160, 0.35)'
          : 'none';
    if (button.tone === 'green' && enabled && !selected) {
      el.classList.add('cosmic-command-button-green');
    }
    el.addEventListener('click', () => {
      if (!enabled) return;
      eventManager.publish(GameEvents.COMMAND_BAR_ACTION_SELECTED, { id: button.id, action: button.action });
    });
    return el;
  }

  /** Returns border colour. */
  private getBorderColour(button: CommandBarButton): string {
    switch (button.tone) {
      case 'green':
        return TEXT_PALETTE.greenAction;
      case 'red':
        return TEXT_PALETTE.redBorder;
      case 'muted':
        return TEXT_PALETTE.textDim;
      default:
        return TEXT_PALETTE.cyanDeep;
    }
  }

  /** Returns background colour. */
  private getBackgroundColour(button: CommandBarButton, primary: boolean, selected: boolean): string {
    if (selected) return button.tone === 'green' ? TEXT_PALETTE.greenAction : TEXT_PALETTE.text;
    switch (button.tone) {
      case 'green':
        return TEXT_PALETTE.panelBackground;
      case 'red':
        return TEXT_PALETTE.panelBackgroundDanger;
      case 'muted':
        return TEXT_PALETTE.panelBackgroundRaised;
      default:
        return TEXT_PALETTE.panelBackground;
    }
  }

  /** Returns foreground colour. */
  private getForegroundColour(button: CommandBarButton, primary: boolean, selected: boolean): string {
    if (selected) return TEXT_PALETTE.inverseText;
    switch (button.tone) {
      case 'green':
        return TEXT_PALETTE.greenSoft;
      case 'red':
        return TEXT_PALETTE.redSoft;
      case 'muted':
        return TEXT_PALETTE.textDim;
      default:
        return primary ? TEXT_PALETTE.textStrong : TEXT_PALETTE.text;
    }
  }

  /** Formats key. */
  private formatKey(key: string): string {
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight')
      return 'ARROWS';
    if (key === 'Arrows') return 'ARROWS';
    if (key === 'Up/Down') return 'UP/DOWN';
    if (key === ' ') return 'SPACE';
    return key.toUpperCase();
  }

  /** Ensures command bar styles. */
  private ensureCommandBarStyles(): void {
    if (document.getElementById('cosmic-command-bar-styles')) return;
    const style = document.createElement('style');
    style.id = 'cosmic-command-bar-styles';
    style.textContent = `
      @keyframes cosmic-command-green-flash {
        0%, 44% { color: ${TEXT_PALETTE.greenFlashDim}; text-shadow: 0 0 3px rgba(72, 200, 168, 0.35); }
        55%, 100% { color: ${TEXT_PALETTE.greenFlashBright}; text-shadow: 0 0 7px rgba(110, 255, 210, 0.75); }
      }
      .cosmic-command-button-green {
        animation: cosmic-command-green-flash 1.55s steps(2, end) infinite;
      }
    `;
    document.head.appendChild(style);
  }
}
