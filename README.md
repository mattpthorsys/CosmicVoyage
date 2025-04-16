# Cosmic Voyage 🚀

**A retro-inspired, ASCII-based space exploration roguelike running in your browser.**

[![Status](https://img.shields.io/badge/status-🚧%20Work%20in%20Progress-yellow)](https://github.com/mattpthorsys/CosmicVoyage)
[![Language](https://img.shields.io/badge/language-TypeScript-blue)](https://www.typescriptlang.org/)
[![Build Tool](https://img.shields.io/badge/build-Vite-purple)](https://vitejs.dev/)

---

## About The Game

Cosmic Voyage takes inspiration from classic space exploration games like *Starflight*, bringing procedural generation and resource management to a terminal-style ASCII interface powered by HTML Canvas. Navigate a vast procedurally generated universe, explore unique star systems, land on diverse planets, scan for resources, manage your fuel and cargo, and trade at starbases.

**Status:** ⚠️ **Work in Progress** ⚠️

This game is under active development. Features are continuously being added and refined. Expect bugs, incomplete mechanics, and potential changes.

## Core Features

* **Procedural Generation:** Explore unique star systems, planets, moons, and nebulae generated using seeded PRNGs and noise algorithms.
* **Realistic Physics (Simplified):**
    * Planetary orbits calculated based on mass and distance.
    * Moon orbits calculated based on planetary mass and orbital distance.
    * Physics-based atmospheric retention simulation.
    * Surface temperature influenced by star luminosity, orbit, albedo, and atmospheric greenhouse effect.
* **Multi-Level Navigation:** Seamlessly transition between hyperspace, star system view, and planetary surfaces.
* **System View Zoom:** Zoom in and out of the system view to get a better perspective, affecting movement speed and time scale.
* **Surface Exploration:** Land on planets and starbases. Explore generated terrain on solid bodies.
* **Resource Management:** Scan planets for resources, mine valuable elements, manage cargo space, and track fuel consumption.
* **Starbase Interaction:** Dock at starbases to trade goods and refuel your ship.
* **ASCII Rendering:** Retro terminal aesthetic achieved using HTML Canvas and custom fonts.
* **Detailed Logging:** Comprehensive logging system with configurable levels and downloadable log files for debugging.

## Technology Stack

* **Language:** TypeScript
* **Build Tool / Dev Server:** Vite
* **Rendering:** HTML Canvas API
* **Core Libraries:**
    * *(No major external runtime libraries like rot-js seem essential based on package.json, though it's listed as a dependency)*
* **Development:** Node.js, npm, ESLint, Vitest

## Prerequisites

* [Node.js](https://nodejs.org/) (v20.5.1 or compatible recommended)
* [npm](https://www.npmjs.com/) (v9.8.0 or compatible recommended, usually included with Node.js)

## Setup & Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/mattpthorsys/CosmicVoyage.git](https://github.com/mattpthorsys/CosmicVoyage.git)
    cd CosmicVoyage
    ```
   
2.  **Install dependencies:**
    ```bash
    npm install
    ```
   

## Running the Game

1.  **Start the development server:**
    ```bash
    npm run dev
    ```
   
2.  **Open your browser:** Navigate to the local URL provided by Vite (e.g., `http://localhost:5173`).

## Key Bindings

*(Based on `src/config.ts`)*

### Movement
* **Hyperspace/System/Planet:** `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`
* **Fine Control (System View):** `Shift` + Movement Keys
* **Boost (Not Implemented?):** `Control` (Currently mapped, functionality TBD)

### Navigation & Actions
* **Enter System:** `Enter` (from Hyperspace)
* **Leave System:** `Backspace` (from System, near edge)
* **Land/Liftoff:** `l` (Context-dependent: System -> Land, Planet/Starbase -> Liftoff)
* **Scan:**
    * `s` (System View): Scans nearby object or star
    * `v` (Planet Surface): Scans the planet
* **Mine:** `m` (Planet Surface, after scanning)
* **Trade:** `t` (Starbase)
* **Refuel:** `r` (Starbase)

### Utility
* **Zoom In (System View):** `=` / `+` / `NumpadAdd`
* **Zoom Out (System View):** `-` / `NumpadSubtract`
* **Download Log:** `p`
* **Quit Game:** `Escape` (Stops loop, requires refresh)

## Development Notes

* **ECS-lite:** The codebase uses an entity-component-system (ECS) inspired approach with data components (`src/core/components.ts`) and systems (`src/systems/`) managing logic.
* **Event Driven:** An event manager (`src/core/event_manager.ts`) is used for decoupling actions and state changes.
* **State Management:** The `GameStateManager` (`src/core/game_state_manager.ts`) controls transitions between hyperspace, system, planet, and starbase views.
* **Rendering Pipeline:** Uses a double-buffer system (`src/rendering/screen_buffer.ts`) with a background layer for stars and a main layer for game objects, composited onto the canvas.
* **Configuration:** Game constants and settings are primarily managed in `src/config.ts` and `src/constants.ts`.
* **Testing:** Unit tests are written using Vitest. Run with `npm test`.