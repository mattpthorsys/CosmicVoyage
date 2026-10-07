import { CONFIG } from '../../config';
import {
  createSurfaceCommandWindow,
  createSurfaceCrewLines,
  type SurfaceScreenLayout,
  type SurfaceVehicleOverlayModel,
} from '../../core/surface_ui';
import { wrapDashboardLines, type TextDashboardLine } from '../../core/text_ui';
import type { DrawingContext } from '../drawing_context';
import type { ScreenBuffer } from '../screen_buffer';
import { drawShortcutText } from '../shortcut_text';
import { TEXT_PALETTE, textToneColour } from '../text_palette';

/** Draws prepared surface readings in reserved rows, keeping controls and crew clear of the terrain. */
export class SurfaceTelemetryRenderer {
  /** Shares the normal terminal buffer and panel drawing context. */
  constructor(
    private readonly buffer: ScreenBuffer,
    private readonly drawing: DrawingContext
  ) {}

  /** Renders resources, wrapped notices and the visible selected action at either layout width. */
  draw(model: SurfaceVehicleOverlayModel, layout: SurfaceScreenLayout): void {
    const { viewport } = layout;
    const fuelPercent = model.maxFuel > 0 ? Math.round((Math.max(0, model.fuel) / model.maxFuel) * 100) : 0;
    const cargoPercent = model.cargoCapacity > 0 ? Math.round((model.cargo / model.cargoCapacity) * 100) : 0;
    const mode = model.mapExpanded
      ? 'MAP'
      : model.onFoot
        ? 'ON FOOT'
        : !model.deployed
          ? 'EMBARKED'
          : model.moving
            ? 'MOVING'
            : 'STOPPED';
    const fuel = `FUEL ${model.fuel.toFixed(1)}/${model.maxFuel} ${fuelPercent}%`;
    const cargo = `CARGO ${model.cargo.toFixed(1)}/${model.cargoCapacity} m^3 ${cargoPercent}%`;
    this.line(
      layout.resourceRows === 3 ? `${mode} FUEL ${fuelPercent}%` : `${mode}  ${fuel}`,
      viewport.x,
      layout.resourcesY,
      viewport.width,
      TEXT_PALETTE.cyan
    );
    if (layout.resourceRows === 1)
      this.line(cargo, viewport.x + 36, layout.resourcesY, viewport.width - 36, TEXT_PALETTE.greenSoft);
    else if (layout.resourceRows === 2)
      this.line(cargo, viewport.x, layout.resourcesY + 1, viewport.width, TEXT_PALETTE.greenSoft);
    else {
      this.line(
        `CARGO ${cargoPercent}%`,
        viewport.x,
        layout.resourcesY + 1,
        viewport.width,
        TEXT_PALETTE.greenSoft
      );
      this.line(
        `${model.cargo.toFixed(1)}/${model.cargoCapacity} m^3`,
        viewport.x,
        layout.resourcesY + 2,
        viewport.width,
        TEXT_PALETTE.greenSoft
      );
    }

    if (model.settlement)
      this.dashboard(
        [{ segments: [{ text: `SECTOR ${model.settlement}`, tone: 'cyan' }] }],
        viewport.x,
        layout.settlementY,
        viewport.width,
        layout.settlementRows
      );
    if (layout.sidebar) this.drawSidebar(model, layout);
    else {
      this.line(model.dateTime, viewport.x, layout.dateY!, viewport.width, TEXT_PALETTE.textMuted);
      this.line(this.shipReading(model), viewport.x, layout.shipY!, viewport.width, TEXT_PALETTE.amber);
      let crew = createSurfaceCrewLines(model.crew, viewport.width);
      if (crew.length > layout.crewRows) {
        // A large crew uses Operations for its full roster. Keep the most
        // injured visible in the small strip rather than concealing a casualty.
        crew = createSurfaceCrewLines(
          [...model.crew].sort(
            (a, b) => a.hitPoints / Math.max(1, a.maxHitPoints) - b.hitPoints / Math.max(1, b.maxHitPoints)
          ),
          viewport.width
        ).slice(0, layout.crewRows - 1);
        crew.push({ segments: [{ text: 'O full crew status', tone: 'cyan' }] });
      }
      this.dashboard(crew, viewport.x, layout.crewY!, viewport.width, layout.crewRows);
    }

    const notices = model.notifications.length
      ? model.notifications.slice(0, 2)
      : ['Surface systems nominal.'];
    this.dashboard(
      [
        {
          segments: [
            { text: 'LOG ', tone: 'muted' },
            { text: notices.join(' / '), tone: 'amber' },
          ],
        },
      ],
      viewport.x,
      layout.notificationsY,
      viewport.width,
      2
    );
    if (model.deployed && !model.onFoot && !model.mapExpanded) {
      this.drawCommands(model, layout);
      const selected = model.items[model.selectedIndex];
      if (selected)
        this.dashboard(
          [
            {
              segments: [
                { text: `${selected.label}: `, tone: 'cyan' },
                { text: selected.status, tone: 'muted' },
              ],
            },
          ],
          viewport.x,
          layout.detailY,
          viewport.width,
          2
        );
    } else {
      const detail = model.mapExpanded
        ? 'Regional map'
        : model.onFoot
          ? 'Return to the parked ship to embark.'
          : model.available
            ? 'Terrain vehicle aboard.'
            : 'Terrain vehicle lost; replacement required.';
      this.dashboard(
        [{ segments: [{ text: detail, tone: 'cyan' }] }],
        viewport.x,
        layout.detailY,
        viewport.width,
        2
      );
    }
    const controls = model.mapExpanded
      ? 'Enter/Esc return'
      : model.onFoot || !model.deployed
        ? viewport.width < 32
          ? 'Arrows travel O ops'
          : 'Arrows travel  O operations'
        : model.moving
          ? viewport.width < 32
            ? 'Arrows Enter stop'
            : 'Arrows drive  Enter stop'
          : viewport.width < 32
            ? '<> select Enter'
            : 'Arrows select  Enter act';
    drawShortcutText(
      this.buffer,
      controls,
      viewport.x,
      layout.controlsY,
      TEXT_PALETTE.cyan,
      CONFIG.DEFAULT_BG_COLOUR
    );
  }

  /** Draws crew and supporting readings beside the terrain when a sidebar fits. */
  private drawSidebar(model: SurfaceVehicleOverlayModel, layout: SurfaceScreenLayout): void {
    const rect = layout.sidebar!;
    this.drawing.drawBox(
      rect.x - 1,
      rect.y - 1,
      rect.width + 2,
      rect.height + 1,
      TEXT_PALETTE.cyanDeep,
      CONFIG.DEFAULT_BG_COLOUR,
      ' '
    );
    this.line('TELEMETRY', rect.x + 1, rect.y - 1, rect.width - 1, TEXT_PALETTE.cyan, 'thick');
    this.dashboard(
      [
        { segments: [{ text: model.dateTime, tone: 'muted' }] },
        { segments: [{ text: this.shipReading(model), tone: 'amber' }] },
        ...(model.altitudeBand
          ? [{ segments: [{ text: `RELIEF ${model.altitudeBand.current}`, tone: 'cyan' as const }] }]
          : []),
        { segments: [] },
        ...createSurfaceCrewLines(model.crew, rect.width),
      ],
      rect.x,
      rect.y + 1,
      rect.width,
      rect.height - 2
    );
  }

  /** Moves the horizontal action window with selection, showing arrows for additional commands. */
  private drawCommands(model: SurfaceVehicleOverlayModel, layout: SurfaceScreenLayout): void {
    const { viewport } = layout;
    const window = createSurfaceCommandWindow(model.items, model.selectedIndex, viewport.width);
    if (window.start > 0) this.line('<', viewport.x, layout.commandsY, 1, TEXT_PALETTE.textMuted);
    if (window.end < model.items.length)
      this.line('>', viewport.x + viewport.width - 1, layout.commandsY, 1, TEXT_PALETTE.textMuted);
    let x = viewport.x + 2;
    for (let i = window.start; i < window.end; i++) {
      const selected = i === model.selectedIndex && !model.moving;
      const label = window.labels[i];
      const green = model.items[i].tone === 'green';
      const foreground = selected
        ? TEXT_PALETTE.inverseText
        : green
          ? TEXT_PALETTE.greenSoft
          : TEXT_PALETTE.text;
      const background = selected
        ? green
          ? TEXT_PALETTE.greenAction
          : TEXT_PALETTE.cyanActive
        : CONFIG.DEFAULT_BG_COLOUR;
      drawShortcutText(this.buffer, label, x, layout.commandsY, foreground, background);
      x += label.length + 2;
    }
  }

  /** Formats return range independently of the current action's help text. */
  private shipReading(model: SurfaceVehicleOverlayModel): string {
    if (model.atShip) return 'SHIP / AT LANDING SITE';
    if (!model.shipDistance) return 'SHIP / POSITION UNAVAILABLE';
    const distance = model.shipDistance.distanceKm;
    return `SHIP ${distance >= 100 ? distance.toFixed(0) : distance.toFixed(1)} km ${model.shipDistance.direction}`;
  }

  /** Draws wrapped thin text without allowing content to enter another telemetry region. */
  private dashboard(lines: TextDashboardLine[], x: number, y: number, width: number, rows: number): void {
    wrapDashboardLines(lines, width)
      .slice(0, rows)
      .forEach((line, index) => {
        let cursor = x;
        for (const segment of line.segments) {
          this.buffer.drawString(
            segment.text,
            cursor,
            y + index,
            textToneColour(segment.tone ?? 'normal'),
            CONFIG.DEFAULT_BG_COLOUR,
            segment.font ?? 'thin'
          );
          cursor += segment.text.length;
        }
      });
  }

  /** Draws one bounded terminal reading; longer descriptive values use dashboard wrapping. */
  private line(
    text: string,
    x: number,
    y: number,
    width: number,
    colour: string,
    font: 'thin' | 'thick' = 'thin'
  ): void {
    if (width <= 0 || y >= this.buffer.getRows()) return;
    this.buffer.drawString(text.slice(0, width), x, y, colour, CONFIG.DEFAULT_BG_COLOUR, font);
  }
}
