import { CrewMember, getBestCrewSkill } from './crew';
import { ShipModificationState } from './ship_modifications';

export interface OperationalCapabilities {
  scanConfidenceBonus: number;
  miningThroughputMultiplier: number;
  hyperspaceFuelMultiplier: number;
  buyPriceMultiplier: number;
  sellPriceMultiplier: number;
}

/** Derives bounded operational modifiers from crew competence and fitted equipment. */
export function getOperationalCapabilities(
  crew: CrewMember[],
  ship: ShipModificationState
): OperationalCapabilities {
  const astroscience = getBestCrewSkill(crew, 'astroscience');
  const geology = getBestCrewSkill(crew, 'geology');
  const navigation = getBestCrewSkill(crew, 'navigation');
  const engineering = getBestCrewSkill(crew, 'engineering');
  const trade = getBestCrewSkill(crew, 'trade');
  const communication = getBestCrewSkill(crew, 'communication');
  const surveyClass = Math.max(0, Math.min(3, ship.surveyEquipmentClass ?? 0));

  return {
    scanConfidenceBonus: Math.min(24, astroscience * 1.4 + surveyClass * 4),
    miningThroughputMultiplier: Math.min(1.75, 1 + geology * 0.035 + surveyClass * 0.08),
    hyperspaceFuelMultiplier: Math.max(0.72, 1 - navigation * 0.012 - engineering * 0.014),
    buyPriceMultiplier: Math.max(0.82, 1 - trade * 0.012 - communication * 0.004),
    sellPriceMultiplier: Math.min(1.18, 1 + trade * 0.012 + communication * 0.004),
  };
}
