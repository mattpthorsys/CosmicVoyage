import { describe, expect, it } from 'vitest';
import { createStartingCrew } from '../../../core/crew';
import { createShipStatusDashboard } from '../../../core/ship_status_dashboard';
import { createDefaultShipModifications, getShipDerivedStats } from '../../../core/ship_modifications';

/** Flattens dashboard segments into plain text for assertions. */
function dashboardText(lines: ReturnType<typeof createShipStatusDashboard>): string {
  return lines.map((line) => line.segments.map((segment) => segment.text).join('')).join('\n');
}

describe('ship status dashboard layout', () => {
  it('keeps the ship status screen as a compact editable dashboard', () => {
    const ship = createDefaultShipModifications();
    const dashboard = createShipStatusDashboard({
      ship,
      stats: getShipDerivedStats(ship),
      crew: createStartingCrew('ship-status-dashboard'),
      cargoTotal: 26.4,
      cargoCapacity: 100,
      fuel: 500,
      maxFuel: 500,
      credits: 1000,
      worldX: 25,
      worldY: 18,
      stateLabel: 'hyperspace',
      operatingState: 'Drift',
      crewHealthLabel: 'all green',
      terrainVehicleAvailable: true,
    });

    const text = dashboardText(dashboard);
    const tones = dashboard.flatMap((line) => line.segments.map((segment) => segment.tone));
    const lineLengths = text.split('\n').map((line) => line.length);

    expect(text).toContain('SURVEY SUPERSTRUCTURE');
    expect(text).toContain('BRIDGE');
    expect(text).toContain('COMMAND');
    expect(text).toContain('DRIVE TRUNK');
    expect(text).toContain('PAYLOAD SPINE');
    expect(text).toContain('CORE');
    expect(text).toContain('WATCH');
    expect(text).toContain('26.4/100 m^3');
    expect(text).not.toContain('╭');
    expect(Math.max(...lineLengths)).toBeLessThanOrEqual(92);
    expect(tones).toEqual(expect.arrayContaining(['cyan', 'green', 'amber', 'bright']));
  });
});
