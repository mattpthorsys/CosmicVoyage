// src/utils/logger.ts

// Import CONFIG *after* it might be defined elsewhere (circular dependency risk otherwise, handle carefully)
// We'll import it dynamically within functions if needed, or rely on global init order.
// For simplicity now, we assume CONFIG is available when logger methods are called.
import { CONFIG } from '../config';

/** Defines logging severity levels. */
export enum LogLevel {
    NONE = 0,
    ERROR = 1,
    WARN = 2,
    INFO = 3,
    DEBUG = 4,
}

// Function to get the configured log level safely
function getConfiguredLogLevel(): LogLevel {
    // Default level if CONFIG or LOG_LEVEL is not set
    const defaultLevel = LogLevel.INFO;

    try {
        // Access config value safely
        const configLevelString = CONFIG?.LOG_LEVEL?.toUpperCase();

        switch (configLevelString) {
            case 'NONE': return LogLevel.NONE;
            case 'ERROR': return LogLevel.ERROR;
            case 'WARN': return LogLevel.WARN;
            case 'INFO': return LogLevel.INFO;
            case 'DEBUG': return LogLevel.DEBUG;
            default:
                // Log a warning if the config value is invalid, but only if warnings are enabled by default
                if (defaultLevel >= LogLevel.WARN) {
                    console.warn(`[WARN] Invalid LOG_LEVEL in CONFIG: "${CONFIG?.LOG_LEVEL}". Defaulting to ${LogLevel[defaultLevel]}.`);
                }
                return defaultLevel;
        }
    } catch (e) {
        // Fallback if accessing CONFIG fails for any reason during initialization
        console.error("[ERROR] Failed to read LOG_LEVEL from CONFIG. Defaulting to INFO.", e);
        return LogLevel.INFO;
    }
}

// Determine the current log level based on configuration
let currentLogLevel = getConfiguredLogLevel();

export const logger = {
    /** Logs messages only if the configured level is DEBUG or higher. */
    debug(...args: any[]): void {
        if (currentLogLevel >= LogLevel.DEBUG) {
            console.debug('[DEBUG]', ...args);
        }
    },
    /** Logs messages only if the configured level is INFO or higher. */
    info(...args: any[]): void {
        if (currentLogLevel >= LogLevel.INFO) {
            // console.info is often styled the same as log, use console.log for clarity
            console.log('[INFO]', ...args);
        }
    },
    /** Logs messages only if the configured level is WARN or higher. */
    warn(...args: any[]): void {
        if (currentLogLevel >= LogLevel.WARN) {
            console.warn('[WARN]', ...args);
        }
    },
    /** Logs messages only if the configured level is ERROR or higher. */
    error(...args: any[]): void {
        if (currentLogLevel >= LogLevel.ERROR) {
            console.error('[ERROR]', ...args);
        }
    },
    /** Allows changing the log level at runtime (e.g., from console). */
    setLogLevel(level: LogLevel): void {
         if (level >= LogLevel.NONE && level <= LogLevel.DEBUG) {
              currentLogLevel = level;
              console.log(`[INFO] Log level set to ${LogLevel[level]} (${level})`);
         } else {
              console.warn(`[WARN] Attempted to set invalid log level: ${level}`);
         }
    },
    /** Gets the current numeric log level. */
    getCurrentLogLevel(): LogLevel {
         return currentLogLevel;
    }
};

// Log the initial level being used
logger.info(`Logger initialized with level ${LogLevel[currentLogLevel]} (${currentLogLevel})`);

// Example of how to change level from console:
// logger.setLogLevel(LogLevel.DEBUG)
// logger.setLogLevel(LogLevel.INFO)