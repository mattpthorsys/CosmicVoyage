import {
  observatoryContactId,
  type ObservatoryContact,
  type ObservatoryObservation,
} from '../../core/observatory_types';

/** Supplies a detected stellar contact without materializing planetary or terrain data. */
export function observatoryContactFixture(
  x = 3,
  overrides: Partial<ObservatoryContact> = {}
): ObservatoryContact {
  const address = { worldX: x, worldY: 0, systemSlot: 0 };
  return {
    ...address,
    id: observatoryContactId(address),
    name: `Reference-${x}`,
    kind: 'system',
    distanceLy: Math.abs(x),
    system: {
      exists: true,
      starType: 'G2V',
      name: `Reference-${x}`,
      hasStarbase: false,
      objectKind: 'stellar',
    },
    phenomenon: null,
    multiplicity: 'single',
    ...overrides,
  };
}

/** Supplies measurement provenance separately from hidden generated biological state. */
export function observatoryObservationFixture(
  contact: ObservatoryContact,
  overrides: Partial<ObservatoryObservation> = {}
): ObservatoryObservation {
  return {
    address: { worldX: contact.worldX, worldY: contact.worldY, systemSlot: contact.systemSlot },
    quality: 0.6,
    biology: 'candidate',
    technology: 'no-signal',
    origin: 'unknown',
    features: ['Water-bearing atmosphere: supported.', 'Abiotic alternatives remain.'],
    bodyName: null,
    bodyPath: null,
    observedFromX: 0,
    observedFromY: 0,
    rangeLy: contact.distanceLy,
    equipmentClass: 2,
    exposure: 1,
    ...overrides,
  };
}
