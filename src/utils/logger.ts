// src/utils/logger.ts (Correctly exporting buffer/download functions)

import { CONFIG } from '../config';

/** Defines logging severity levels. */
export enum LogLevel {
    NONE = 0,
    ERROR = 1,
    WARN = 2,
    INFO = 3,
    DEBUG = 4,
}

// --- Log Buffering ---
let logBuffer: string[] = [];
const MAX_LOG_BUFFER_SIZE = 20000; // Max number of log lines to keep in memory

// Function to get the configured log level safely
function getConfiguredLogLevel(): LogLevel {
    const defaultLevel = LogLevel.INFO;
    try {
        const configLevelString = CONFIG?.LOG_LEVEL?.toUpperCase();
        switch (configLevelString) {
            case 'NONE': return LogLevel.NONE;
            case 'ERROR': return LogLevel.ERROR;
            case 'WARN': return LogLevel.WARN;
            case 'INFO': return LogLevel.INFO;
            case 'DEBUG': return LogLevel.DEBUG;
            default:
                if (defaultLevel >= LogLevel.WARN) {
                    console.warn(`[Logger Init WARN] Invalid LOG_LEVEL in CONFIG: "${CONFIG?.LOG_LEVEL}". Defaulting to ${LogLevel[defaultLevel]}.`);
                }
                return defaultLevel;
        }
    } catch (e) {
        console.error("[Logger Init ERROR] Failed to read LOG_LEVEL from CONFIG. Defaulting to INFO.", e);
        return LogLevel.INFO;
    }
}

// Determine the initial log level based on configuration
let currentLogLevel = getConfiguredLogLevel();

// Helper function to format and buffer log messages (Remains internal)
function _logAndBuffer(level: LogLevel, levelStr: string, args: any[]): void {
    const timestamp = new Date().toISOString();
    const messageParts = args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
            try { return JSON.stringify(arg); } catch { return String(arg); }
        }
        return String(arg);
    });
    const formattedMessage = `[${timestamp}] [${levelStr}] ${messageParts.join(' ')}`;

    logBuffer.push(formattedMessage);
    if (logBuffer.length > MAX_LOG_BUFFER_SIZE) {
        logBuffer.shift();
    }

    // Output to console based on level
    switch (level) {
        case LogLevel.DEBUG: console.debug(formattedMessage); break;
        case LogLevel.INFO: console.log(formattedMessage); break;
        case LogLevel.WARN: console.warn(formattedMessage); break;
        case LogLevel.ERROR: console.error(formattedMessage); break;
    }
}

// --- Logger Object Definition ---
// Define the logger object structure explicitly for clarity and type safety
interface Logger {
    debug(...args: any[]): void;
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
    setLogLevel(level: LogLevel): void;
    getCurrentLogLevel(): LogLevel;
    clearLogBuffer(): void;
    getLogBufferAsString(includeHeader?: boolean): string; // Made optional
    downloadLogFile(filename?: string): void;
}


// Export the logger object containing all methods
export const logger: Logger = {
    /** Logs messages only if the configured level is DEBUG or higher. */
    debug(...args: any[]): void {
        if (currentLogLevel >= LogLevel.DEBUG) {
            _logAndBuffer(LogLevel.DEBUG, 'DEBUG', args); // Use internal helper
        }
    },
    /** Logs messages only if the configured level is INFO or higher. */
    info(...args: any[]): void {
        if (currentLogLevel >= LogLevel.INFO) {
            _logAndBuffer(LogLevel.INFO, 'INFO', args); // Use internal helper
        }
    },
    /** Logs messages only if the configured level is WARN or higher. */
    warn(...args: any[]): void {
        if (currentLogLevel >= LogLevel.WARN) {
            _logAndBuffer(LogLevel.WARN, 'WARN', args); // Use internal helper
        }
    },
    /** Logs messages only if the configured level is ERROR or higher. */
    error(...args: any[]): void {
        if (currentLogLevel >= LogLevel.ERROR) {
            _logAndBuffer(LogLevel.ERROR, 'ERROR', args); // Use internal helper
        }
    },
    /** Allows changing the log level at runtime (e.g., from console). */
    setLogLevel(level: LogLevel): void {
         if (level >= LogLevel.NONE && level <= LogLevel.DEBUG) {
              currentLogLevel = level;
              const levelChangeMsg = `Log level set to ${LogLevel[level]} (${level})`;
              console.log(`[Logger INFO] ${levelChangeMsg}`);
              _logAndBuffer(LogLevel.INFO, 'INFO', [levelChangeMsg]); // Log the change
         } else {
              const invalidLevelMsg = `Attempted to set invalid log level: ${level}`;
              console.warn(`[Logger WARN] ${invalidLevelMsg}`);
              if (currentLogLevel >= LogLevel.WARN) {
                   _logAndBuffer(LogLevel.WARN, 'WARN', [invalidLevelMsg]); // Log the attempt
              }
         }
    },
    /** Gets the current numeric log level. */
    getCurrentLogLevel(): LogLevel {
         return currentLogLevel;
    },

    /** Clears the internal log buffer. */
    clearLogBuffer(): void {
         logBuffer = [];
         const clearMsg = "Internal log buffer cleared.";
         console.log("[Logger INFO] " + clearMsg);
         // Log the clear action itself if INFO is enabled
         if (currentLogLevel >= LogLevel.INFO) {
             // Avoid calling _logAndBuffer directly if it might call clear itself
             // _logAndBuffer(LogLevel.INFO, 'INFO', [clearMsg]);
         }
    },

    /** Generates the full log content as a string, optionally with a header. */
    getLogBufferAsString(includeHeader: boolean = true): string { // Default includeHeader to true
         let logContent = "";
         if (includeHeader) {
             logContent += `--- Cosmic Voyage Log ---\n`;
             logContent += `Timestamp: ${new Date().toISOString()}\n`;
             try {
                 logContent += `Game Seed: "${CONFIG?.SEED ?? 'CONFIG_UNAVAILABLE'}"\n`;
                 logContent += `Log Level Setting: ${CONFIG?.LOG_LEVEL ?? 'CONFIG_UNAVAILABLE'} (Active: ${LogLevel[currentLogLevel]})\n`;
             } catch (e) {
                 logContent += `Game Seed: CONFIG_ERROR\n`;
                 logContent += `Log Level: ${LogLevel[currentLogLevel]} (${currentLogLevel}) (CONFIG error: ${e})\n`;
             }
             logContent += `Max Buffer Size: ${MAX_LOG_BUFFER_SIZE}\n`;
             logContent += `Current Buffer Size: ${logBuffer.length}\n`;
             logContent += `-------------------------\n\n`;
         }
         logContent += logBuffer.join('\n');
         return logContent;
    },

    /** Triggers a browser download for the buffered logs. */
    downloadLogFile(filename?: string): void {
         const downloadMsgStart = "Preparing log file for download...";
         console.log("[Logger INFO] " + downloadMsgStart);
         _logAndBuffer(LogLevel.INFO, 'INFO', [downloadMsgStart]); // Log the attempt

         const defaultFilename = `cosmic_voyage_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
         const finalFilename = filename || defaultFilename;

         try {
             const logContent = this.getLogBufferAsString(true); // Get content with header
             const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
             const url = URL.createObjectURL(blob);

             const link = document.createElement('a');
             link.href = url;
             link.download = finalFilename;
             link.style.display = 'none';

             document.body.appendChild(link);
             link.click();
             document.body.removeChild(link);

             URL.revokeObjectURL(url);

             const downloadMsgEnd = `Log file download triggered as "${finalFilename}".`;
             console.log(`[Logger INFO] ${downloadMsgEnd}`);
             _logAndBuffer(LogLevel.INFO, 'INFO', [downloadMsgEnd]);

         } catch (error) {
              const errorMsg = `Failed to prepare or trigger log file download: ${error instanceof Error ? error.message : String(error)}`;
              console.error("[Logger ERROR] " + errorMsg, error);
              if (currentLogLevel >= LogLevel.ERROR) {
                   _logAndBuffer(LogLevel.ERROR, 'ERROR', [errorMsg]);
              }
         }
    }
}; // End logger object definition

// Log the initial level being used (will also be buffered now)
logger.info(`Logger initialized with level ${LogLevel[currentLogLevel]} (${currentLogLevel})`);