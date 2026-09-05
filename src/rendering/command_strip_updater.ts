import { AvailableAction } from '../core/available_actions';
import { CommandBarButton, CommandBarModel } from '../core/command_bar';
import { eventManager, GameEvents } from '../core/event_manager';
import { CONFIG } from '../config';
import { TEXT_PALETTE } from './text_palette';

export class CommandStripUpdater {
  private readonly element: HTMLElement;
  private commandRoot: HTMLElement | null = null;
  private primaryGroup: HTMLElement | null = null;
  private actionsGroup: HTMLElement | null = null;
  private readonly buttonNodes = new Map<string, HTMLElement>();

  /** Initializes CommandStripUpdater. */
  constructor(element: HTMLElement) {
    this.element = element;
    this.element.style.fontFamily = CONFIG.FONT_FAMILY;
    this.element.style.backgroundColor = TEXT_PALETTE.panelBackground;
    this.element.style.color = TEXT_PALETTE.text;
    this.element.style.boxSizing = 'border-box';
    this.element.style.overflow = 'hidden';
    this.element.style.whiteSpace = 'normal';
    this.element.style.display = 'block';
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
    this.element.style.minHeight = `calc(${fontSize * 1.45}px + 8px)`;
    this.element.style.height = 'auto';
    const paddingLR = charWidthPx > 0 ? charWidthPx : 10;
    this.element.style.padding = `4px ${paddingLR}px`;
  }

  /** Positions the command panel immediately above the measured telemetry panel. */
  setBottomOffset(offsetPx: number): void {
    this.element.style.bottom = `${Math.max(0, Math.ceil(offsetPx))}px`;
  }

  /** Updates. */
  update(
    actionsOrModel: AvailableAction[] | CommandBarModel,
    primaryActionId?: string,
    targetName?: string
  ): void {
    if (!Array.isArray(actionsOrModel)) {
      this.updateCommandBar(actionsOrModel);
      return;
    }

    while (this.element.firstChild) {
      this.element.removeChild(this.element.firstChild);
    }
    this.commandRoot = null;
    this.primaryGroup = null;
    this.actionsGroup = null;
    this.buttonNodes.clear();

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
    this.ensureCommandLayout();
    const primary = (model.leftButtons ?? []).filter((button) => button.id !== 'red-reserved');
    const routine = [...model.buttons, ...(model.rightButtons ?? [])].filter(
      (button) => button.id !== 'red-reserved'
    );
    this.renderButtonGroup(this.primaryGroup!, primary, model);
    this.renderButtonGroup(this.actionsGroup!, routine, model);
  }

  /** Creates the persistent command zones used at every responsive width. */
  private ensureCommandLayout(): void {
    if (this.commandRoot && this.primaryGroup && this.actionsGroup) return;
    while (this.element.firstChild) this.element.removeChild(this.element.firstChild);
    const root = document.createElement('div');
    root.className = 'cosmic-command-layout';
    const primary = document.createElement('div');
    primary.className = 'cosmic-command-primary';
    const actions = document.createElement('div');
    actions.className = 'cosmic-command-actions';
    root.appendChild(primary);
    root.appendChild(actions);
    this.element.appendChild(root);
    this.commandRoot = root;
    this.primaryGroup = primary;
    this.actionsGroup = actions;
  }

  /** Updates command buttons in place and restores their model ordering within a zone. */
  private renderButtonGroup(
    group: HTMLElement,
    buttons: readonly CommandBarButton[],
    model: CommandBarModel
  ): void {
    const active = new Set(buttons.map((button) => button.id));
    for (const [id, node] of this.buttonNodes) {
      if (node.parentElement === group) node.hidden = !active.has(id);
    }
    for (const button of buttons) {
      let node = this.buttonNodes.get(button.id);
      if (!node) {
        node = this.createButton(button, false, false);
        this.buttonNodes.set(button.id, node);
      }
      this.updateButton(
        node,
        button,
        button.id === model.primaryButtonId,
        button.id === model.selectedButtonId
      );
      node.hidden = false;
      group.appendChild(node);
    }
  }

  /** Creates button. */
  private createButton(button: CommandBarButton, primary: boolean, selected: boolean): HTMLElement {
    const el = document.createElement('button');
    el.type = 'button';
    el.style.fontFamily = CONFIG.FONT_FAMILY;
    el.style.fontSize = 'inherit';
    el.style.lineHeight = '1';
    el.style.borderRadius = '0';
    el.style.textTransform = 'uppercase';
    el.style.letterSpacing = '0';
    el.style.whiteSpace = 'nowrap';
    el.addEventListener('click', () => {
      const id = el.dataset.commandId;
      const action = el.dataset.commandAction;
      if (el.disabled || !id || !action) return;
      eventManager.publish(GameEvents.COMMAND_BAR_ACTION_SELECTED, { id, action });
    });
    this.updateButton(el, button, primary, selected);
    return el;
  }

  /** Replaces one button's live values without recreating its element or event handler. */
  private updateButton(el: HTMLElement, button: CommandBarButton, primary: boolean, selected: boolean): void {
    const enabled = button.enabled !== false;
    el.dataset.commandId = button.id;
    el.dataset.commandAction = button.action;
    el.textContent = `${button.key ? `[${this.formatKey(button.key)}] ` : ''}${button.label}${primary ? ' *' : ''}`;
    el.title = button.detail ?? button.label;
    (el as HTMLButtonElement).disabled = !enabled;
    el.style.padding = '3px 8px';
    el.style.border = `1px solid ${this.getBorderColour(button)}`;
    el.style.backgroundColor = enabled
      ? this.getBackgroundColour(button, primary, selected)
      : TEXT_PALETTE.panelBackground;
    el.style.color = enabled ? this.getForegroundColour(button, primary, selected) : TEXT_PALETTE.textDim;
    el.style.cursor = enabled ? 'pointer' : 'default';
    el.style.boxShadow =
      selected && enabled
        ? '0 0 10px rgba(140, 255, 255, 0.35)'
        : primary && enabled
          ? '0 0 8px rgba(0, 255, 160, 0.35)'
          : 'none';
    el.classList.toggle('cosmic-command-button-green', button.tone === 'green' && enabled && !selected);
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
      .cosmic-command-layout { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 6px; align-items: center; }
      .cosmic-command-primary, .cosmic-command-actions { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; min-width: 0; }
      .cosmic-command-actions { justify-content: flex-end; }
      @media (max-width: 720px) {
        .cosmic-command-layout { grid-template-columns: 1fr; gap: 4px; }
        .cosmic-command-actions { justify-content: flex-start; }
      }
      @media (max-width: 460px) {
        .cosmic-command-layout button { padding: 3px 5px !important; }
      }
    `;
    document.head.appendChild(style);
  }
}
