import { describe, expect, it } from 'vitest';
import { Player } from '../../../core/player';
import { createShipDeckRows, createShipStationRows, getShipCompartment } from '../../../core/ship_place';

describe('ship place model', () => {
  it('creates practical compartment and station rows from player state', () => {
    const player = new Player();
    const context = {
      crew: player.crew,
      cargoTotal: 12,
      cargoCapacity: 100,
      fuel: player.resources.fuel,
      maxFuel: player.resources.maxFuel,
      credits: player.resources.credits,
      stateLabel: 'system',
      currentCompartmentId: 'cargo',
    };

    const deck = createShipDeckRows(context);
    expect(deck.find((row) => row.id === 'deck:cargo')?.cells).toContain('FOCUS');
    expect(deck.find((row) => row.id === 'deck:cargo')?.cells[4]).toContain('12/100 m^3');

    const stations = createShipStationRows(context);
    expect(stations.some((row) => row.id === 'station:navigation')).toBe(true);
    expect(stations.every((row) => row.cells.length === 5)).toBe(true);
    expect(getShipCompartment('missing').id).toBe('bridge');
  });
});
