# CosmicVoyage

A simple ascii-based roguelike space explorer inspired by Starflight and Starflight 2.

**Status:** ⚠️ Work in Progress ⚠️

This game is currently under active development. Expect bugs, incomplete features, and potential changes. It may not work fully as intended yet.

## About The Game

Cosmic Voyage aims to recreate some of the exploration and discovery feel of classic space games like Starflight within a terminal-like ASCII interface running in a web browser. Navigate hyperspace, explore star systems, land on planets, and manage resources.

## Features (Current / Planned)

* Procedurally generated star systems and planets.
* Hyperspace, system, and planetary surface navigation.
* Basic resource scanning and mining mechanics.
* Simple trading and refueling at starbases.
* ASCII rendering using HTML Canvas.
* Logging framework with downloadable log files.

## Technology Stack

* **Language:** TypeScript
* **Build Tool:** Vite [cite: 3879]
* **Rendering:** HTML Canvas API
* **Dependencies:** rot-js (potentially used for RNG or other roguelike utilities) [cite: 2339, 3806]

## Prerequisites

* [Node.js](https://nodejs.org/) (Version v20.5.1 or compatible recommended [cite: 1])
* [npm](https://www.npmjs.com/) (Version 9.8.0 or compatible recommended[cite: 1], usually comes with Node.js)

## Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/mattpthorsys/CosmicVoyage.git](https://github.com/mattpthorsys/CosmicVoyage.git)
    ```
    *(Repository URL based on snapshot [cite: 1])*
2.  **Navigate into the project directory:**
    ```bash
    cd CosmicVoyage
    ```
3.  **Install dependencies:**
    ```bash
    npm install
    ```

## Running the Game (Development)

1.  **Start the Vite development server:**
    ```bash
    npm run dev
    ```
    *(Script defined in package.json [cite: 7, 3901])*
2.  **Open your web browser:** Navigate to the local URL provided by Vite (usually `http://localhost:5173` or similar). The game should load automatically.

## Key Bindings

*(Based on src/config.ts [cite: 2750])*

* **Movement (Hyperspace, System, Planet):**
    * `ArrowUp`: Move Up / Forward
    * `ArrowDown`: Move Down / Backward
    * `ArrowLeft`: Move Left
    * `ArrowRight`: Move Right
    * `Shift` + Movement Keys (System View): Fine Control / Slower Movement
* **Navigation & Actions:**
    * `Enter`: Enter System (from Hyperspace)
    * `Backspace`: Leave System (to Hyperspace)
    * `l`: Land on Planet/Starbase OR Liftoff from Planet/Starbase
    * `v`: Scan Planet (when landed)
    * `m`: Mine Planet (when landed, if applicable)
    * `t`: Trade (at Starbase)
    * `r`: Refuel (at Starbase)
* **Utility:**
    * `p`: Download Log File
    * `Escape`: Quit Game (Stops the loop, requires refresh)

## Building for Production (Optional)

You can create an optimized build for deployment using:

```bash
npm run build