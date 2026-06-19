import { TextTableRow } from './text_ui';
import { CREW_SKILL_LABELS, CrewMember, CrewSkill, getBestCrewSkill } from './crew';

export interface ShipCompartment {
  id: string;
  label: string;
  deck: string;
  station: string;
  skill?: CrewSkill;
  function: string;
}

export interface ShipPlaceContext {
  crew: CrewMember[];
  cargoTotal: number;
  cargoCapacity: number;
  fuel: number;
  maxFuel: number;
  credits: number;
  stateLabel: string;
  currentCompartmentId: string;
}

export const SHIP_COMPARTMENTS: ShipCompartment[] = [
  {
    id: 'bridge',
    label: 'Bridge',
    deck: 'A',
    station: 'Command plot',
    skill: 'communication',
    function: 'Flight decisions, traffic control, and shipwide status routing.',
  },
  {
    id: 'navigation',
    label: 'Navigation Well',
    deck: 'A',
    station: 'Astrogation table',
    skill: 'navigation',
    function: 'Course plotting, orbital solutions, and close approach tracking.',
  },
  {
    id: 'survey',
    label: 'Survey Alcove',
    deck: 'A',
    station: 'Sensor desk',
    skill: 'astroscience',
    function: 'Stellar scans, contact classification, and anomaly reduction.',
  },
  {
    id: 'engineering',
    label: 'Engineering Trunk',
    deck: 'B',
    station: 'Reactor board',
    skill: 'engineering',
    function: 'Fuel handling, drive health, repairs, and thermal margins.',
  },
  {
    id: 'medbay',
    label: 'Med Bay',
    deck: 'B',
    station: 'Treatment couch',
    skill: 'medicine',
    function: 'Crew triage, recovery tracking, and contamination checks.',
  },
  {
    id: 'cargo',
    label: 'Cargo Spine',
    deck: 'C',
    station: 'Bay control',
    skill: 'geology',
    function: 'Cargo survey, mineral containment, and external bay operations.',
  },
  {
    id: 'crew',
    label: 'Crew Berths',
    deck: 'C',
    station: 'Watch board',
    skill: 'handCombat',
    function: 'Rest cycles, muster state, and internal security readiness.',
  },
];

/** Creates ship deck rows. */
export function createShipDeckRows(context: ShipPlaceContext): TextTableRow[] {
  return SHIP_COMPARTMENTS.map((compartment) => {
    const current = compartment.id === context.currentCompartmentId;
    const crewName = getBestCrewName(context.crew, compartment.skill);
    return {
      id: `deck:${compartment.id}`,
      cells: [
        current ? `>${compartment.deck}` : compartment.deck,
        compartment.label,
        crewName,
        current ? 'FOCUS' : compartment.skill ? 'CREWED' : 'STANDBY',
        getCompartmentReadout(compartment.id, context),
      ],
      detail: `${compartment.station}: ${compartment.function}`,
      tone: current ? 'bright' : 'green',
      cellTones: [
        'cyan',
        current ? 'bright' : 'green',
        crewName === 'Uncrewed' ? 'amber' : 'cyan',
        current ? 'amber' : 'green',
        'bright',
      ],
      detailTone: 'cyan',
    };
  });
}

/** Creates ship station rows. */
export function createShipStationRows(context: ShipPlaceContext): TextTableRow[] {
  return SHIP_COMPARTMENTS.filter((compartment) => compartment.skill).map((compartment) => {
    const skill = compartment.skill!;
    const rating = getBestCrewSkill(context.crew, skill);
    const current = compartment.id === context.currentCompartmentId;
    return {
      id: `station:${compartment.id}`,
      cells: [
        compartment.station,
        CREW_SKILL_LABELS[skill],
        String(rating),
        current ? 'IN USE' : rating > 0 ? 'READY' : 'UNCREWED',
        getCompartmentReadout(compartment.id, context),
      ],
      detail: `Enter focuses ${compartment.label}. ${compartment.function}`,
      disabled: rating <= 0,
      tone: rating <= 0 ? 'muted' : current ? 'bright' : 'green',
      cellTones: [
        'cyan',
        'green',
        rating <= 0 ? 'amber' : 'bright',
        current ? 'amber' : rating > 0 ? 'green' : 'muted',
        'bright',
      ],
      detailTone: rating <= 0 ? 'muted' : 'cyan',
    };
  });
}

/** Returns ship compartment. */
export function getShipCompartment(id: string): ShipCompartment {
  return SHIP_COMPARTMENTS.find((compartment) => compartment.id === id) ?? SHIP_COMPARTMENTS[0];
}

/** Returns best crew name. */
function getBestCrewName(crew: CrewMember[], skill?: CrewSkill): string {
  if (!skill || crew.length === 0) return 'Auto';
  const best = [...crew].sort((a, b) => b.skills[skill] - a.skills[skill])[0];
  return best && best.skills[skill] > 0 ? best.name.slice(0, 16) : 'Uncrewed';
}

/** Returns compartment readout. */
function getCompartmentReadout(id: string, context: ShipPlaceContext): string {
  switch (id) {
    case 'bridge':
      return `Mode ${context.stateLabel}`;
    case 'navigation':
      return `Nav ${getBestCrewSkill(context.crew, 'navigation')}  Astro ${getBestCrewSkill(context.crew, 'astroscience')}`;
    case 'survey':
      return `Astro ${getBestCrewSkill(context.crew, 'astroscience')}  Geo ${getBestCrewSkill(context.crew, 'geology')}`;
    case 'engineering':
      return `Fuel ${Math.round(context.fuel)}/${context.maxFuel}`;
    case 'medbay': {
      const wounded = context.crew.filter((member) => member.hitPoints < member.maxHitPoints).length;
      return wounded > 0 ? `${wounded} wounded` : 'Vitals green';
    }
    case 'cargo':
      return `Hold ${context.cargoTotal}/${context.cargoCapacity} m^3`;
    case 'crew':
      return `${context.crew.length} aboard  ${context.credits.toLocaleString()} Cr`;
    default:
      return 'Online';
  }
}
