import { AvailableAction } from '../core/available_actions';
import { CommandBarButton, CommandBarModel } from '../core/command_bar';
import { eventManager, GameEvents } from '../core/event_manager';
import { CONFIG } from '../config';

export class CommandStripUpdater {
  private readonly element: HTMLElement;

  constructor(element: HTMLElement) {
    this.element = element;
    this.element.style.fontFamily = CONFIG.FONT_FAMILY;
    this.element.style.backgroundColor = '#001010';
    this.element.style.color = '#9FFFE0';
    this.element.style.boxSizing = 'border-box';
    this.element.style.overflow = 'hidden';
    this.element.style.whiteSpace = 'nowrap';
    this.element.style.display = 'flex';
    this.element.style.alignItems = 'center';
    this.element.style.gap = '8px';
    this.ensureCommandBarStyles();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  updateMaxChars(charWidthPx: number, charHeightPx: number): void {
    const fontSize = charHeightPx > 0 ? charHeightPx * 0.82 : 13;
    this.element.style.fontSize = `${fontSize}px`;
    this.element.style.height = `calc(${fontSize * 1.45}px + 8px)`;
    const paddingLR = charWidthPx > 0 ? charWidthPx : 10;
    this.element.style.padding = `4px ${paddingLR}px`;
    const statusHeight = fontSize * 1.4 * 3 + 10;
    this.element.style.bottom = `${statusHeight}px`;
  }

  update(actionsOrModel: AvailableAction[] | CommandBarModel, primaryActionId?: string, targetName?: string): void {
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
      target.style.color = '#00CCAA';
      this.element.appendChild(target);
    }

    actionsOrModel.slice(0, 7).forEach((action) => {
      const key = document.createElement('span');
      key.textContent = `[${this.formatKey(action.key)}] `;
      key.style.color = action.enabled ? '#FFD700' : '#506060';
      this.element.appendChild(key);

      const label = document.createElement('span');
      label.textContent = action.id === primaryActionId ? `${action.label} *` : action.label;
      label.style.color = action.enabled ? '#9FFFE0' : '#506060';
      this.element.appendChild(label);
    });
  }

  private updateCommandBar(model: CommandBarModel): void {
    if (model.targetName) {
      const target = document.createElement('span');
      target.textContent = `TARGET ${model.targetName}`;
      target.title = model.context;
      target.style.color = '#00CCAA';
      target.style.marginRight = '4px';
      this.element.appendChild(target);
    }

    const left = model.leftButtons ?? [];
    const right = model.rightButtons ?? [];
    [...left, ...model.buttons, ...right].forEach((button) => {
      this.element.appendChild(this.createButton(button, button.id === model.primaryButtonId, button.id === model.selectedButtonId));
    });
  }

  private createButton(button: CommandBarButton, primary: boolean, selected: boolean): HTMLElement {
    const el = document.createElement('button');
    const enabled = button.enabled !== false;
    el.type = 'button';
    el.disabled = !enabled;
    el.textContent = `${selected ? '> ' : ''}${button.key ? `[${this.formatKey(button.key)}] ` : ''}${button.label}${primary ? ' *' : ''}`;
    el.title = button.detail ?? button.label;
    el.style.fontFamily = CONFIG.FONT_FAMILY;
    el.style.fontSize = 'inherit';
    el.style.lineHeight = '1';
    el.style.padding = '3px 8px';
    el.style.borderRadius = '0';
    el.style.border = `1px solid ${this.getBorderColour(button)}`;
    el.style.backgroundColor = enabled ? this.getBackgroundColour(button, primary, selected) : '#001010';
    el.style.color = enabled ? this.getForegroundColour(button, primary, selected) : '#506060';
    el.style.cursor = enabled ? 'pointer' : 'default';
    el.style.textTransform = 'uppercase';
    el.style.letterSpacing = '0';
    el.style.whiteSpace = 'nowrap';
    el.style.boxShadow = selected && enabled ? '0 0 10px rgba(140, 255, 255, 0.35)' : primary && enabled ? '0 0 8px rgba(0, 255, 160, 0.35)' : 'none';
    if (button.tone === 'green' && enabled) {
      el.classList.add('cosmic-command-button-green');
    }
    el.addEventListener('click', () => {
      if (!enabled) return;
      eventManager.publish(GameEvents.COMMAND_BAR_ACTION_SELECTED, { id: button.id, action: button.action });
    });
    return el;
  }

  private getBorderColour(button: CommandBarButton): string {
    switch (button.tone) {
      case 'green':
        return '#00C878';
      case 'red':
        return '#8A3030';
      case 'muted':
        return '#305050';
      default:
        return '#006A6A';
    }
  }

  private getBackgroundColour(button: CommandBarButton, primary: boolean, selected: boolean): string {
    if (selected) return '#00C8AA';
    switch (button.tone) {
      case 'green':
        return primary ? '#00C878' : '#003820';
      case 'red':
        return '#240808';
      case 'muted':
        return '#001818';
      default:
        return primary ? '#005A50' : '#001010';
    }
  }

  private getForegroundColour(button: CommandBarButton, primary: boolean, selected: boolean): string {
    if (selected) return '#001010';
    switch (button.tone) {
      case 'green':
        return primary ? '#001010' : '#7CFFD0';
      case 'red':
        return '#FF8A7A';
      case 'muted':
        return '#608080';
      default:
        return primary ? '#D8FFF6' : '#9FFFE0';
    }
  }

  private formatKey(key: string): string {
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') return 'ARROWS';
    if (key === 'Arrows') return 'ARROWS';
    if (key === 'Up/Down') return 'UP/DOWN';
    if (key === ' ') return 'SPACE';
    return key.toUpperCase();
  }

  private ensureCommandBarStyles(): void {
    if (document.getElementById('cosmic-command-bar-styles')) return;
    const style = document.createElement('style');
    style.id = 'cosmic-command-bar-styles';
    style.textContent = `
      @keyframes cosmic-command-green-flash {
        0%, 44% { color: #001010; text-shadow: 0 0 3px rgba(180, 255, 230, 0.45); }
        55%, 100% { color: #E8FFF8; text-shadow: 0 0 7px rgba(110, 255, 210, 0.75); }
      }
      .cosmic-command-button-green {
        animation: cosmic-command-green-flash 1.55s steps(2, end) infinite;
      }
    `;
    document.head.appendChild(style);
  }
}
