import { describe, expect, it } from 'vitest';
import { StatusBarUpdater } from '../../rendering/status_bar_updater';
import type { TravelTelemetryModel } from '../../core/travel_telemetry';

const TELEMETRY: TravelTelemetryModel = {
  mode: 'HYPERSPACE',
  navigation: [
    {
      id: 'mode',
      label: 'NAV',
      compactLabel: 'N',
      value: 'HYPERSPACE',
      compactValue: 'HYPER',
      tone: 'signal',
    },
    { id: 'position', label: 'POS', value: '0,0' },
  ],
  target: [
    { id: 'contact', label: 'CONTACT', value: 'A very long resolved stellar contact name', tone: 'signal' },
  ],
  environment: [
    { id: 'medium', label: 'ISM', value: 'diffuse neutral hydrogen' },
    { id: 'sensor', label: 'SENSOR', value: '107%', priority: 'secondary' },
  ],
  resources: [
    { id: 'fuel', label: 'FUEL', value: '500/500' },
    { id: 'cargo', label: 'CARGO', value: '0/100', priority: 'secondary' },
    { id: 'credits', label: 'CR', value: '12,345', priority: 'optional' },
  ],
  notification: 'Scan complete: G2V main-sequence star.',
  notificationTone: 'signal',
};

describe('StatusBarUpdater telemetry panel', () => {
  it('keeps field nodes stable while values and notifications update', () => {
    const element = document.createElement('div');
    const updater = new StatusBarUpdater(element);
    updater.updateMaxChars(8, 16);
    updater.updateTelemetry(TELEMETRY);

    const target = element.querySelector('.cosmic-telemetry-target .cosmic-telemetry-value');
    const fuel = element.querySelector('.cosmic-telemetry-resources .cosmic-telemetry-value');
    expect(element.dataset.telemetry).toBe('true');
    expect(element.textContent).toContain(TELEMETRY.notification!);
    expect(element.querySelector('.cosmic-telemetry-label')?.getAttribute('data-compact-label')).toBe('N');
    expect(target?.getAttribute('data-compact-value')).toBeNull();

    updater.updateTelemetry({
      ...TELEMETRY,
      target: [
        { id: 'contact', label: 'CONTACT', value: 'Tau Ceti G8V', compactValue: 'Tau Ceti', tone: 'signal' },
      ],
      resources: [{ id: 'fuel', label: 'FUEL', value: '499/500' }],
      notification: undefined,
    });

    expect(element.querySelector('.cosmic-telemetry-target .cosmic-telemetry-value')).toBe(target);
    expect(element.querySelector('.cosmic-telemetry-resources .cosmic-telemetry-value')).toBe(fuel);
    expect(target?.textContent).toBe('Tau Ceti G8V');
    expect(target?.getAttribute('data-compact-value')).toBe('Tau Ceti');
    expect(fuel?.textContent).toBe('499/500');
    expect(element.textContent).toContain('SYSTEMS NOMINAL');
    expect(
      element.querySelector('.cosmic-telemetry-resources [data-priority="secondary"]')?.hasAttribute('hidden')
    ).toBe(true);
  });

  it('falls back to the legacy tagged message renderer for standalone status events', () => {
    const element = document.createElement('div');
    const updater = new StatusBarUpdater(element);
    updater.updateTelemetry(TELEMETRY);
    updater.updateStatus('<h>Mining:</h> deposit mapped.', false);

    expect(element.dataset.telemetry).toBe('false');
    expect(element.textContent).toContain('Mining: deposit mapped.');
    expect(element.querySelector('.cosmic-telemetry-grid')).toBeNull();
  });
});
