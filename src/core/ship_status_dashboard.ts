import { TextDashboardLine, TextDashboardTone } from './text_ui';
import { CrewMember, getBestCrewSkill } from './crew';
import {
  getEngineFuelUseMultiplier,
  ShipDerivedStats,
  ShipModificationState,
} from './ship_modifications';

export interface ShipStatusDashboardContext {
  ship: ShipModificationState;
  stats: ShipDerivedStats;
  crew: CrewMember[];
  cargoTotal: number;
  cargoCapacity: number;
  fuel: number;
  maxFuel: number;
  credits: number;
  worldX: number;
  worldY: number;
  stateLabel: string;
  operatingState: string;
  crewHealthLabel: string;
  terrainVehicleAvailable: boolean;
}

// Layout tuning starts here. These constants are intentionally plain:
// change widths, gap, or symbols here first before editing the section builders.
const SHIP_BOX_WIDTH = 58;
const READOUT_BOX_WIDTH = 32;
const DASHBOARD_GAP = 2;
const EMPTY_CELL = '·';
const CARGO_CELL = '■';
const SPECIAL_CELL = '♦';
const PROBE_CELL = '●';
const BAR_FULL = '█';
const BAR_EMPTY = '░';

export function createShipStatusDashboard(context: ShipStatusDashboardContext): TextDashboardLine[] {
  const fuelUseMultiplier = getEngineFuelUseMultiplier(context.ship.engineClass);
  const diagram = buildShipDiagram(context, fuelUseMultiplier);
  const readout = buildReadout(context, fuelUseMultiplier);
  const rowCount = Math.max(diagram.length, readout.length);

  return Array.from({ length: rowCount }, (_, index) => joinLines(
    diagram[index] ?? textLine(' '.repeat(SHIP_BOX_WIDTH)),
    textLine(' '.repeat(DASHBOARD_GAP)),
    readout[index] ?? textLine('')
  ));
}

function buildShipDiagram(context: ShipStatusDashboardContext, fuelUseMultiplier: number): TextDashboardLine[] {
  const roverState = context.terrainVehicleAvailable ? 'ROVER SECURED' : 'ROVER MISSING';

  // Main left-hand dashboard. Add, remove, or reorder rows here to change
  // the visual layout of the ship diagram.
  return box(SHIP_BOX_WIDTH, 'SURVEY SUPERSTRUCTURE', [
    textLine(center('BRIDGE', SHIP_BOX_WIDTH - 4), 'cyan'),
    textLine('  COMMAND      flight control / watch routing', 'bright'),
    textLine('  NAV          astrometric fix and approach plot', 'green'),
    textLine('  COMMS        receiver bank / signal parser', 'cyan'),
    textLine('  SENSORS      mast feed and survey aperture', 'muted'),
    spacer(),
    textLine(center('HARDPOINT BUS', SHIP_BOX_WIDTH - 4), 'cyan'),
    joinLines(
      textLine(`  SHIELD ${context.ship.shieldClass || '-'}`, context.ship.shieldClass > 0 ? 'green' : 'muted'),
      textLine('  ───  ', 'muted'),
      textLine(`HULL ${bar(context.stats.hullIntegrityPercent, 100, 10)}`, context.stats.hullIntegrityPercent < 35 ? 'red' : 'green'),
      textLine('  ───  ', 'muted'),
      textLine(`LASER ${context.ship.laserClass || '-'}`, context.ship.laserClass > 0 ? 'amber' : 'muted')
    ),
    spacer(),
    textLine(center('DRIVE TRUNK', SHIP_BOX_WIDTH - 4), 'cyan'),
    textLine(`  ENGINE       class ${context.ship.engineClass}`, 'green'),
    textLine(`  EFFICIENCY   ${bar(context.stats.driveEfficiencyPercent, 125, 30)}`, 'green'),
    textLine(`  D/He3        ${bar(context.fuel, context.maxFuel, 30)}`, context.fuel < context.maxFuel * 0.25 ? 'amber' : 'bright'),
    textLine(`  BURN RATE    x${fuelUseMultiplier.toFixed(2)} interstellar`, 'cyan'),
    spacer(),
    textLine(center('PAYLOAD SPINE', SHIP_BOX_WIDTH - 4), 'cyan'),
    textLine(`  MISSILE BAY  ${String(context.ship.missileCount).padStart(2, '0')}/${String(context.stats.missileCapacity).padStart(2, '0')} nuclear stores`, 'amber'),
    textLine(`  CARGO        ${bayStrip(context.ship.cargoPodsInstalled, context.ship.superstructure.cargoBays, CARGO_CELL, 16)}`, 'green'),
    textLine(`  HOLD         ${formatCargoLoad(context.cargoTotal, context.cargoCapacity)} m^3`, 'bright'),
    textLine(`  SPECIAL      ${bayStrip(context.ship.specialBaysOccupied, context.ship.superstructure.specialPurposeBays, SPECIAL_CELL, 4)}   PROBE ${bayStrip(context.ship.probeBaysOccupied, context.ship.superstructure.probeBays, PROBE_CELL, 3)}`, 'cyan'),
    textLine(`  LANDING BAY  ${roverState}`, roverState.includes('MISSING') ? 'red' : 'cyan'),
    spacer(),
    textLine(`CREW BUS ${context.crew.length} aboard / ${context.crewHealthLabel} / TP ${context.crew.reduce((sum, member) => sum + member.trainingPoints, 0)}`, 'bright'),
    textLine(`NAV FIX  ${context.worldX},${context.worldY}   ${context.stateLabel}`, 'muted'),
  ]);
}

function buildReadout(context: ShipStatusDashboardContext, fuelUseMultiplier: number): TextDashboardLine[] {
  // Right-hand panels. These are separate boxes so they can be moved, removed,
  // or expanded without touching the large ship diagram above.
  return [
    ...box(READOUT_BOX_WIDTH, 'CORE', [
      textLine(`Hull      ${context.stats.hullIntegrityPercent}%`, context.stats.hullIntegrityPercent < 35 ? 'red' : 'green'),
      textLine(`Drive     C${context.ship.engineClass} / ${context.stats.driveEfficiencyPercent}% eff.`, 'green'),
      textLine(`Fuel      ${context.fuel}/${context.maxFuel}`, context.fuel < context.maxFuel * 0.25 ? 'amber' : 'bright'),
      textLine(`Economy   x${fuelUseMultiplier.toFixed(2)}`, 'cyan'),
    ]),
    spacer(),
    ...box(READOUT_BOX_WIDTH, 'BAYS', [
      textLine(`Cargo     ${context.ship.cargoPodsInstalled}/${context.ship.superstructure.cargoBays}`, 'green'),
      textLine(`Hold      ${formatCargoLoad(context.cargoTotal, context.cargoCapacity)} m^3`, 'bright'),
      textLine(`Special   ${context.stats.emptySpecialPurposeBays}/${context.stats.specialBayCapacity} free`, 'cyan'),
      textLine(`Probe     ${context.stats.emptyProbeBays}/${context.stats.probeCapacity} free`, 'cyan'),
    ]),
    spacer(),
    ...box(READOUT_BOX_WIDTH, 'WATCH', [
      textLine(`Mode      ${context.operatingState}`, 'bright'),
      textLine(`State     ${context.stateLabel}`, 'muted'),
      textLine(`Nav/Astro ${getBestCrewSkill(context.crew, 'navigation')}/${getBestCrewSkill(context.crew, 'astroscience')}`, 'green'),
      textLine(`Credits   ${context.credits.toLocaleString()} Cr`, 'amber'),
    ]),
  ];
}

function box(width: number, title: string, body: TextDashboardLine[]): TextDashboardLine[] {
  const innerWidth = Math.max(4, width - 2);
  const titleText = ` ${title} `;
  const leftRule = Math.max(1, Math.floor((innerWidth - titleText.length) / 2));
  const rightRule = Math.max(1, innerWidth - titleText.length - leftRule);
  return [
    textLine(`┌${'─'.repeat(leftRule)}${titleText}${'─'.repeat(rightRule)}┐`.slice(0, width), 'cyan'),
    ...body.map((line) => framedLine(line, innerWidth)),
    textLine(`└${'─'.repeat(innerWidth)}┘`, 'cyan'),
  ];
}

function framedLine(line: TextDashboardLine, innerWidth: number): TextDashboardLine {
  const clippedLine = clipLine(line, innerWidth);
  const textLength = lineLength(clippedLine);
  return {
    segments: [
      { text: '│', tone: 'cyan' },
      ...clippedLine.segments,
      { text: ' '.repeat(Math.max(0, innerWidth - textLength)), tone: 'normal' },
      { text: '│', tone: 'cyan' },
    ],
  };
}

function clipLine(line: TextDashboardLine, maxLength: number): TextDashboardLine {
  const segments: TextDashboardLine['segments'] = [];
  let remaining = Math.max(0, maxLength);
  for (const segment of line.segments) {
    if (remaining <= 0) break;
    const text = segment.text.slice(0, remaining);
    segments.push({ ...segment, text });
    remaining -= text.length;
  }
  return { segments };
}

function textLine(text: string, tone: TextDashboardTone = 'normal'): TextDashboardLine {
  return { segments: [{ text, tone }] };
}

function spacer(): TextDashboardLine {
  return textLine('');
}

function joinLines(...lines: TextDashboardLine[]): TextDashboardLine {
  return { segments: lines.flatMap((line) => line.segments) };
}

function lineLength(line: TextDashboardLine): number {
  return line.segments.reduce((sum, segment) => sum + segment.text.length, 0);
}

function bar(value: number, max: number, width: number): string {
  const safeMax = Math.max(1, max);
  const ratio = Math.max(0, Math.min(1, value / safeMax));
  const filled = Math.round(ratio * width);
  return `[${BAR_FULL.repeat(filled)}${BAR_EMPTY.repeat(Math.max(0, width - filled))}]`;
}

function bayStrip(occupied: number, capacity: number, marker: string, width: number): string {
  const safeCapacity = Math.max(1, capacity);
  const shown = Math.max(1, Math.min(width, safeCapacity));
  const occupiedShown = Math.round((Math.max(0, Math.min(occupied, safeCapacity)) / safeCapacity) * shown);
  return `[${marker.repeat(occupiedShown)}${EMPTY_CELL.repeat(Math.max(0, shown - occupiedShown))}]`;
}

function center(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  const left = Math.floor((width - text.length) / 2);
  return `${' '.repeat(left)}${text}`.padEnd(width);
}

function formatCargoLoad(current: number, capacity: number): string {
  return `${Number(current.toFixed(1))}/${capacity}`;
}
