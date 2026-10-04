import { describe, expect, it } from 'vitest';
import { ObservatoryController, getObservatoryLayout } from '../../../core/observatory';
import { createObservatorySnapshot, getObservatoryCapabilities } from '../../../core/observatory_types';
import { createDefaultShipModifications } from '../../../core/ship_modifications';
import { observatoryContactFixture, observatoryObservationFixture } from '../../fixtures/observatory';

describe('observatory terminal', () => {
  it('combines evidence and host filters before paging, preserving distant matching targets', () => {
    const controller = new ObservatoryController();
    controller.contacts = Array.from({ length: 40 }, (_, index) => observatoryContactFixture(index + 1));
    controller.contacts[39].multiplicity = 'binary';
    const state = createObservatorySnapshot();
    state.observations[controller.contacts[39].id] = observatoryObservationFixture(controller.contacts[39]);
    controller.filters = [1, 2, 0];
    expect(controller.filtered(state, () => false).map((contact) => contact.id)).toEqual([
      controller.contacts[39].id,
    ]);
  });

  it('keeps unmeasured objects distinct from observed nondetections', () => {
    const controller = new ObservatoryController();
    controller.contacts = [observatoryContactFixture(1), observatoryContactFixture(2)];
    const state = createObservatorySnapshot();
    state.observations[controller.contacts[1].id] = observatoryObservationFixture(controller.contacts[1], {
      biology: 'no-signal',
    });
    controller.filters[0] = 5;
    expect(controller.filtered(state, () => false)).toEqual([controller.contacts[0]]);
    controller.filters[0] = 1;
    expect(controller.filtered(state, () => false)).toEqual([]);
  });

  it('does not reroll evidence or discard the selected identity during a catalogue refresh', () => {
    const controller = new ObservatoryController();
    const contact = observatoryContactFixture();
    const state = createObservatorySnapshot();
    controller.selectedId = contact.id;
    const before = structuredClone(state);
    const capabilities = getObservatoryCapabilities(createDefaultShipModifications());
    controller.createModel(state, capabilities, 0, 0, 120, 45, () => false);
    expect(controller.selectedId).toBe(contact.id);
    controller.contacts = [contact];
    controller.createModel(state, capabilities, 0, 0, 120, 45, () => false);
    expect(state).toEqual(before);
  });

  it('uses the first key to finish typing and only subsequent keys perform instrument actions', () => {
    const controller = new ObservatoryController();
    controller.contacts = [observatoryContactFixture()];
    controller.open('ship-menu');
    const model = controller.createModel(
      createObservatorySnapshot(),
      getObservatoryCapabilities(createDefaultShipModifications()),
      0,
      0,
      120,
      45,
      () => false
    );
    const input = {
      wasAnyKeyJustPressed: () => true,
      wasActionJustPressed: (action: string) => action === 'ENTER_SYSTEM',
    };
    expect(controller.input(input, model)).toBeUndefined();
    expect(controller.input(input, model)).toBe('mark');
    expect(controller.returnTo).toBe('ship-menu');
  });

  it.each([
    [140, 50],
    [72, 40],
    [40, 25],
    [24, 16],
  ])('wraps all scientific text within %i x %i cells', (cols, rows) => {
    const controller = new ObservatoryController();
    const contact = observatoryContactFixture();
    controller.contacts = [contact];
    const state = createObservatorySnapshot();
    state.observations[contact.id] = observatoryObservationFixture(contact, {
      features: [
        'A very long scientific interpretation remains readable without dropping words or overlapping the control strip.',
      ],
    });
    const model = controller.createModel(
      state,
      getObservatoryCapabilities(createDefaultShipModifications()),
      0,
      0,
      cols,
      rows,
      () => false
    );
    expect(
      model.details.every(
        (line) =>
          line.segments.reduce((sum, segment) => sum + segment.text.length, 0) <= model.layout.readoutWidth
      )
    ).toBe(true);
    expect(
      model.details.map((line) => line.segments.map((segment) => segment.text).join('')).join(' ')
    ).toContain('dropping words');
    expect(getObservatoryLayout(cols, rows).detailRows).toBeGreaterThan(0);
  });
});
