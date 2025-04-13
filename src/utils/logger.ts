// src/utils/logger.ts (Simplified argument handling)

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

// *** MODIFIED: Internal helper now expects a single pre-formatted message string ***
function _logAndBuffer(level: LogLevel, levelStr: string, message: string): void {
    const timestamp = new Date().toISOString();
    // Message is already formatted, just add timestamp and level prefix
    const formattedMessage = `[${timestamp}] [${levelStr}] ${message}`;

    logBuffer.push(formattedMessage);
    if (logBuffer.length > MAX_LOG_BUFFER_SIZE) {
        logBuffer.shift();
    }

    // Output to console based on level
    switch (level) {
        case LogLevel.DEBUG: console.debug(formattedMessage); break;
        case LogLevel.INFO:  console.log(formattedMessage);   break;
        case LogLevel.WARN:  console.warn(formattedMessage);  break;
        case LogLevel.ERROR: console.error(formattedMessage); break;
    }
}

// Helper function to stringify arguments before joining
function formatArgs(...args: (string | number | boolean | object | null | undefined)[]): string {
    return args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
            try { return JSON.stringify(arg); } catch { return String(arg); }
        }
        return String(arg);
    }).join(' '); // Join with spaces
}


// --- Logger Object Definition ---
interface Logger {
    debug(...args: (string | number | boolean | object | null | undefined)[]): void;
    info(...args: (string | number | boolean | object | null | undefined)[]): void;
    warn(...args: (string | number | boolean | object | null | undefined)[]): void;
    error(...args: (string | number | boolean | object | null | undefined)[]): void;

    setLogLevel(level: LogLevel): void;
    getCurrentLogLevel(): LogLevel;
    clearLogBuffer(): void;
    getLogBufferAsString(includeHeader?: boolean): string;
    downloadLogFile(filename?: string): void;
}


// Export the logger object containing all methods
export const logger: Logger = {
    /** Logs messages only if the configured level is DEBUG or higher. */
    debug(...args: (string | number | boolean | object | null | undefined)[]): void {
        if (currentLogLevel >= LogLevel.DEBUG) {
            // *** MODIFIED: Format message before calling internal helper ***
            _logAndBuffer(LogLevel.DEBUG, 'DEBUG', formatArgs(...args));
        }
    },
    /** Logs messages only if the configured level is INFO or higher. */
    info(...args: (string | number | boolean | object | null | undefined)[]): void {
        if (currentLogLevel >= LogLevel.INFO) {
             // *** MODIFIED: Format message before calling internal helper ***
            _logAndBuffer(LogLevel.INFO, 'INFO', formatArgs(...args));
        }
    },
    /** Logs messages only if the configured level is WARN or higher. */
    warn(...args: (string | number | boolean | object | null | undefined)[]): void {
        if (currentLogLevel >= LogLevel.WARN) {
             // *** MODIFIED: Format message before calling internal helper ***
            _logAndBuffer(LogLevel.WARN, 'WARN', formatArgs(...args));
        }
    },
    /** Logs messages only if the configured level is ERROR or higher. */
    error(...args: (string | number | boolean | object | null | undefined)[]): void {
        if (currentLogLevel >= LogLevel.ERROR) {
             // *** MODIFIED: Format message before calling internal helper ***
            _logAndBuffer(LogLevel.ERROR, 'ERROR', formatArgs(...args));
        }
    },
    /** Allows changing the log level at runtime (e.g., from console). */
    setLogLevel(level: LogLevel): void {
         if (level >= LogLevel.NONE && level <= LogLevel.DEBUG) {
              currentLogLevel = level;
              const levelChangeMsg = `Log level set to ${LogLevel[level]} (${level})`;
              // Only log level change to console, not buffer
              if (currentLogLevel >= LogLevel.INFO) { // Check *new* level
                   console.log(`[Logger INFO] ${levelChangeMsg}`);
              }
         } else {
              const invalidLevelMsg = `Attempted to set invalid log level: ${level}`;
              console.warn(`[Logger WARN] ${invalidLevelMsg}`);
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
         // Only log clear action to console, not buffer
         if (currentLogLevel >= LogLevel.INFO) {
             console.log("[Logger INFO] " + clearMsg);
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
        // Log the attempt using the logger's own method
        this.info("--- Preparing log file for download... ---");
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

             this.info(`Log file download triggered as "${finalFilename}".`);
         } catch (error) {
              const errorMsg = `Failed to prepare or trigger log file download: ${error instanceof Error ? error.message : String(error)}`;
              this.error(`${errorMsg} ${error}`); // Log the error message and the error object itself
         }
    }
}; // End logger object definition