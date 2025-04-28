// FILE: src/core/components.ts
// Defines the interfaces for data components used in the ECS-lite pattern.

import { GLYPHS } from "../constants"; // Import needed constants if defaults are used

/** Component storing entity position across different game contexts. */
export interface PositionComponent {
    worldX: number;
    worldY: number;
    systemX: number;
    systemY: number;
    surfaceX: number;
    surfaceY: number;
}

/** Component storing data needed for rendering the entity. */
export interface RenderComponent {
    /** The character glyph currently representing the entity. */
    char: string;
    /** The colour of the character glyph. */
    fgColor: string;
    /** Optional background colour for the character cell. */
    bgColor?: string | null;
    /** The visual orientation/direction glyph (e.g., for the ship). */
    directionGlyph: string; // Renamed from shipDirection for generality
}

/** Component storing quantifiable resources like fuel and credits. */
export interface ResourceComponent {
    credits: number;
    fuel: number;
    maxFuel: number;
    // Could potentially add energy, shields, etc. here later
}

/** Component managing the entity's inventory/cargo hold. */
export interface CargoComponent {
    /** Maximum number of units the cargo hold can contain. */
    capacity: number;
    /** Record storing the quantity of each element held (key: element string ID, value: quantity). */
    items: Record<string, number>;
}

// --- Optional: Default Initializers ---
// These functions can help create default component states when creating new entities.

export function createDefaultPosition(): PositionComponent {
    return { worldX: 0, worldY: 0, systemX: 0, systemY: 0, surfaceX: 0, surfaceY: 0 };
}

export function createDefaultRender(char: string, color: string, direction: string = GLYPHS.SHIP_NORTH): RenderComponent {
    return { char: char, fgColor: color, bgColor: null, directionGlyph: direction };
}

export function createDefaultResource(credits: number, fuel: number, maxFuel: number): ResourceComponent {
    return { credits, fuel, maxFuel };
}

export function createDefaultCargo(capacity: number): CargoComponent {
    return { capacity: capacity, items: {} };
}