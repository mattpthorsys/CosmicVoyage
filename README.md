# Cosmic Voyage 🚀

**A retro-inspired, ASCII-based space exploration roguelike running in your browser.**

[![Status](https://img.shields.io/badge/status-🚧%20Work%20in%20Progress-yellow)](https://github.com/mattpthorsys/CosmicVoyage)
[![Language](https://img.shields.io/badge/language-TypeScript-blue)](https://www.typescriptlang.org/)
[![Build Tool](https://img.shields.io/badge/build-Vite-purple)](https://vitejs.dev/)

---

## About The Game

Cosmic Voyage takes inspiration from classic space exploration games like *Starflight*, bringing procedural generation and resource management to a terminal-style ASCII interface powered by HTML Canvas[cite: 33, 35]. Navigate a vast procedurally generated universe, explore unique star systems, land on diverse planets, scan for resources, manage your fuel and cargo, and trade at starbases[cite: 34, 35].

**Status:** ⚠️ **Work in Progress** ⚠️

This game is under active development[cite: 31]. Features are continuously being added and refined. Expect bugs, incomplete mechanics, and potential changes[cite: 31, 32].

## Core Features

* **Procedural Generation:** Explore unique star systems, planets, moons, and nebulae generated using seeded PRNGs and noise algorithms[cite: 34, 359, 468, 1485, 1492, 1501, 2071, 2149, 2180, 2202].
* **Realistic Physics (Simplified):**
    * Planetary orbits calculated based on mass and distance[cite: 1749, 1750].
    * Moon orbits calculated based on planetary mass and orbital distance[cite: 1758, 1759, 1760, 1761].
    * Physics-based atmospheric retention simulation[cite: 5, 2298, 2301, 2315, 2316, 2326, 2327].
    * Surface temperature influenced by star luminosity, orbit, albedo, and atmospheric greenhouse effect[cite: 5, 2006, 2009, 2014, 2026, 2034, 2052].
* **Multi-Level Navigation:** Seamlessly transition between hyperspace, star system view, and planetary surfaces[cite: 34, 2501, 2522, 2529, 2550, 2578, 2584, 2614, 2615, 2621, 2627].
* **System View Zoom:** Zoom in and out of the system view to get a better perspective, affecting movement speed and time scale[cite: 3, 8, 9, 10, 11, 15, 16, 17, 18, 19, 20, 435, 611, 615, 627, 629, 2648, 2649, 2650, 2651, 2707, 2708, 2709, 2710, 2711, 2712, 2713, 2740, 2741, 2742, 2743, 2744, 2846, 2847, 2848, 2849, 2850, 2851, 2914, 2915, 2916].
* **Surface Exploration:** Land on planets and starbases[cite: 34]. Explore generated terrain on solid bodies[cite: 34, 1048, 1054, 1166, 1171].
* **Resource Management:** Scan planets for resources, mine valuable elements, manage cargo space, and track fuel consumption[cite: 34, 35, 2369, 2370, 2406, 2407, 2918, 2919].
* **Starbase Interaction:** Dock at starbases to trade goods and refuel your ship[cite: 35, 1051, 1079, 1169, 1196, 2427, 2428, 2922, 2938].
* **ASCII Rendering:** Retro terminal aesthetic achieved using HTML Canvas and custom fonts[cite: 35, 334, 358, 2428, 3223, 3227, 3229].
* **Detailed Logging:** Comprehensive logging system with configurable levels and downloadable log files for debugging[cite: 36, 494, 502, 520, 528].

## Technology Stack

* **Language:** TypeScript [cite: 27, 30, 36]
* **Build Tool / Dev Server:** Vite [cite: 1, 24, 36, 57]
* **Rendering:** HTML Canvas API [cite: 35, 330, 334, 884, 891, 1221, 1225]
* **Core Libraries:**
    * *(No major external runtime libraries like rot-js seem essential based on package.json, though it's listed as a dependency)* [cite: 58, 59]
* **Development:** Node.js[cite: 1], npm[cite: 1], ESLint[cite: 346, 348], Vitest [cite: 26]

## Prerequisites

* [Node.js](https://nodejs.org/) (v20.5.1 or compatible recommended) [cite: 1, 37]
* [npm](https://www.npmjs.com/) (v9.8.0 or compatible recommended, usually included with Node.js) [cite: 1, 37]

## Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/mattpthorsys/CosmicVoyage.git](https://github.com/mattpthorsys/CosmicVoyage.git)
    cd CosmicVoyage
    ```
    [cite: 1, 37]
2.  **Install dependencies:**
    ```bash
    npm install
    ```
    [cite: 37]

## Running the Game

1.  **Start the development server:**
    ```bash
    npm run dev
    ```
    [cite: 57]
2.  **Open your browser:** Navigate to the local URL provided by Vite (e.g., `http://localhost:5173`)[cite: 38].

## Key Bindings

*(Based on `src/config.ts` [cite: 434, 435])*

### Movement
* **Hyperspace/System/Planet:** `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`
* **Fine Control (System View):** `Shift` + Movement Keys
* **Boost (Not Implemented?):** `Control` (Currently mapped, functionality TBD)

### Navigation & Actions
* **Enter System:** `Enter` (from Hyperspace)
* **Leave System:** `Backspace` (from System, near edge)
* **Land/Liftoff:** `l` (Context-dependent: System -> Land, Planet/Starbase -> Liftoff)
* **Scan:**
    * `s` (System View): Scans nearby object or star [cite: 434]
    * `v` (Planet Surface): Scans the planet [cite: 39]
* **Mine:** `m` (Planet Surface, after scanning) [cite: 39]
* **Trade:** `t` (Starbase) [cite: 39]
* **Refuel:** `r` (Starbase) [cite: 39]

### Utility
* **Zoom In (System View):** `=` / `+` / `NumpadAdd` [cite: 435]
* **Zoom Out (System View):** `-` / `NumpadSubtract` [cite: 435]
* **Download Log:** `p` [cite: 39]
* **Quit Game:** `Escape` (Stops loop, requires refresh) [cite: 39]

## Development Notes

* **ECS-lite:** The codebase uses an entity-component-system (ECS) inspired approach with data components (`src/core/components.ts` [cite: 3048]) and systems (`src/systems/` [cite: 601, 647, 650]) managing logic.
* **Event Driven:** An event manager (`src/core/event_manager.ts` [cite: 3024]) is used for decoupling actions and state changes.
* **State Management:** The `GameStateManager` (`src/core/game_state_manager.ts` [cite: 2490]) controls transitions between hyperspace, system, planet, and starbase views.
* **Rendering Pipeline:** Uses a double-buffer system (`src/rendering/screen_buffer.ts` [cite: 879]) with a background layer for stars [cite: 1219, 2670, 2882] and a main layer for game objects, composited onto the canvas.
* **Configuration:** Game constants and settings are primarily managed in `src/config.ts` [cite: 431] and `src/constants.ts`[cite: 372].
* **Testing:** Unit tests are written using Vitest[cite: 26]. Run with `npm test`.