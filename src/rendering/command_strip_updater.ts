import { AvailableAction } from '../core/available_actions';
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

  update(actions: AvailableAction[], primaryActionId?: string, targetName?: string): void {
    while (this.element.firstChild) {
      this.element.removeChild(this.element.firstChild);
    }

    if (targetName) {
      const target = document.createElement('span');
      target.textContent = `TARGET ${targetName}   `;
      target.style.color = '#00CCAA';
      this.element.appendChild(target);
    }

    actions.slice(0, 7).forEach((action, index) => {
      if (index > 0 || targetName) {
        this.element.appendChild(document.createTextNode('  |  '));
      }

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

  private formatKey(key: string): string {
    if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') return 'ARROWS';
    if (key === 'Up/Down') return 'UP/DOWN';
    if (key === ' ') return 'SPACE';
    return key.toUpperCase();
  }
}
