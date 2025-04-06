// src/main.ts

import './assets/fonts/fonts.css';

// Import logger first to ensure logging is available early
import { logger } from './utils/logger';

// Import other necessary modules
import { Game } from './core/game';
import { CONFIG } from './config'; // CONFIG needed for seed reporting

logger.info("main.ts executing...");

window.onload = () => {
    logger.info("DOM fully loaded.");
    const statusBar = document.getElementById('statusBar'); // Get status bar for errors

    try {
        logger.info("Initializing game...");
        // Pass the seed from config to the Game constructor
        const game = new Game('gameCanvas', 'statusBar', CONFIG.SEED);
        logger.info(`Game constructed with seed: "${CONFIG.SEED}"`);

        game.startGame(); // Start the main game loop
        logger.info("Game loop started.");

    } catch (error) {
        logger.error("Failed to initialize or start game:", error);
        // Display error in the status bar as fallback
        if (statusBar) {
            statusBar.textContent = `FATAL ERROR: ${error instanceof Error ? error.message : String(error)}. See console (F12).`;
            statusBar.style.color = 'red';
            statusBar.style.backgroundColor = 'black'; // Ensure visibility
        }
        // Optionally display error more prominently in the body
        document.body.innerHTML = `<div style="color: red; background: black; padding: 20px; font-family: monospace; border: 2px solid red;"><h1>Fatal Initialization Error</h1><p>${error instanceof Error ? error.message : String(error)}</p><pre>${error instanceof Error ? error.stack : ''}</pre></div>`;
    }
};

// Log any potential errors during script loading/parsing itself
window.addEventListener('error', (event) => {
     logger.error('Unhandled window error:', event.error, event.message);
});
window.addEventListener('unhandledrejection', (event) => {
     logger.error('Unhandled promise rejection:', event.reason);
});

logger.info("main.ts finished initial execution.");