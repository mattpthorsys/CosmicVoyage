export const ENCOUNTER_ACTIONS = [
  { kind: 'observe', label: 'Observe', key: 'V', action: 'SCAN' },
  { kind: 'analyse', label: 'Analyse', key: 'A', action: 'APPROACH_TARGET' },
  { kind: 'stun', label: 'Stun', key: 'T', action: 'TRADE' },
  { kind: 'sample', label: 'Sample', key: 'S', action: 'SCAN_SYSTEM_OBJECT' },
  { kind: 'collect', label: 'Collect', key: 'C', action: 'BIOLOGY_COLLECT' },
  { kind: 'shoot', label: 'Shoot', key: 'K', action: 'BIOLOGY_SHOOT' },
  { kind: 'wait', label: 'Wait', key: 'W', action: 'BIOLOGY_WAIT' },
  { kind: 'dossier', label: 'Dossier', key: 'D', action: 'ORBIT_DOSSIER' },
  { kind: 'catalogue', label: 'Species', key: 'N', action: 'TARGET_MENU' },
  { kind: 'cargo', label: 'Cargo', key: 'O', action: 'SHIP_MENU' },
  { kind: 'operations', label: 'Operations', key: 'P', action: 'OPEN_SHIP_MENU' },
  { kind: 'missions', label: 'Missions', key: 'J', action: 'MISSION_JOURNAL' },
  { kind: 'science', label: 'Science log', key: 'X', action: 'SCIENCE_LOG' },
  { kind: 'leave', label: 'Withdraw', key: 'Esc', action: 'QUIT' },
] as const;

export type EncounterAction = (typeof ENCOUNTER_ACTIONS)[number]['kind'];
