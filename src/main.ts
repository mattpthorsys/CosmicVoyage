// src/main.ts

import './assets/fonts/fonts.css';

// Import logger first to ensure logging is available early
import { logger } from './utils/logger';

// Import other necessary modules
import { CONFIG } from './config'; // CONFIG needed for seed reporting
import { ApplicationController } from './core/application_controller';
import { setSurfaceGenerationProvider } from './entities/planet/surface_generation_provider';
import { WorkerSurfaceGenerationProvider } from './entities/planet/surface_generation_worker_client';
import { setNebulaColourProvider } from './rendering/nebula_colour_provider';
import { WorkerNebulaColourProvider } from './rendering/nebula_generation_worker_client';
import { setHyperspaceSurveyCellProvider } from './core/hyperspace_survey_cell_provider';
import { WorkerHyperspaceSurveyCellProvider } from './core/hyperspace_survey_worker_client';
import { setHyperspaceTileGenerationProvider } from './rendering/hyperspace_tile_generation_provider';

logger.info('main.ts executing...');

setSurfaceGenerationProvider(new WorkerSurfaceGenerationProvider());
logger.info('Surface generation worker provider registered.');
setNebulaColourProvider(new WorkerNebulaColourProvider());
logger.info('Nebula generation worker provider registered.');
const hyperspaceWorkerProvider = new WorkerHyperspaceSurveyCellProvider(CONFIG.SEED);
setHyperspaceSurveyCellProvider(hyperspaceWorkerProvider);
logger.info('Hyperspace survey worker provider registered.');
setHyperspaceTileGenerationProvider(hyperspaceWorkerProvider);
logger.info('Complete hyperspace tile worker provider registered.');

/** Renders fatal initialization error. */
function renderFatalInitializationError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? (error.stack ?? '') : '';
  const wrapper = document.createElement('div');
  wrapper.style.color = 'red';
  wrapper.style.backgroundColor = 'black';
  wrapper.style.padding = '20px';
  wrapper.style.fontFamily = 'monospace';
  wrapper.style.border = '2px solid red';

  const heading = document.createElement('h1');
  heading.textContent = 'Fatal Initialization Error';
  const messageParagraph = document.createElement('p');
  messageParagraph.textContent = message;
  const stackPre = document.createElement('pre');
  stackPre.textContent = stack;

  wrapper.appendChild(heading);
  wrapper.appendChild(messageParagraph);
  wrapper.appendChild(stackPre);
  document.body.replaceChildren(wrapper);
}

window.onload = () => {
  logger.info('DOM fully loaded.');
  const statusBar = document.getElementById('statusBar'); // Get status bar for errors

  try {
    logger.info('Initializing application controller...');
    new ApplicationController();
    logger.info(`Application ready with default seed: "${CONFIG.SEED}"`);
  } catch (error) {
    logger.error('Failed to initialize or start game:', error);
    // Display error in the status bar as fallback
    if (statusBar) {
      statusBar.textContent = `FATAL ERROR: ${error instanceof Error ? error.message : String(error)}. See console (F12).`;
      statusBar.style.color = 'red';
      statusBar.style.backgroundColor = 'black'; // Ensure visibility
    }
    renderFatalInitializationError(error);
  }
};

// Log any potential errors during script loading/parsing itself
window.addEventListener('error', (event) => {
  logger.error('Unhandled window error:', event.error, event.message);
});
window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection:', event.reason);
});

logger.info('main.ts finished initial execution.');
