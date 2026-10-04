import type { BehaviourObservationKind } from './biology_types';

export const BEHAVIOUR_OBSERVATION_LABELS: Readonly<Record<BehaviourObservationKind, string>> = {
  feeding: 'Substrate feeding',
  'shelter-use': 'Shelter use',
  'group-retreat': 'Coordinated retreat',
  'defensive-display': 'Defensive display',
};
