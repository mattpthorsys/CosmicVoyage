#!/usr/bin/env node

const readline = require('readline');

// Regex to capture the timestamp and the rest of the message.
// It looks for a pattern like "[YYYY-MM-DDTHH:mm:ss.sssZ]"
// It handles optional prefixes like "logger.ts:62 ".
// Group 1: The timestamp (e.g., "2025-04-05T09:37:57.384Z")
// Group 2: The rest of the log message (e.g., "[INFO] >>> Game._processInput...")
const logRegex = /\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\]\s*(.*)/;

let previousMessage = null;
let count = 0;
let firstTimestamp = null;
let lastTimestamp = null;
let firstFullLine = null; // Store the first line of a sequence

// Function to print the consolidated or original log entry
function outputPreviousLog() {
    if (previousMessage === null) {
        return; // Nothing stored yet
    }

    if (count > 1) {
        // Output consolidated log entry for repeated messages
        console.log(`[repeated ${count} time(s)] [${firstTimestamp} - ${lastTimestamp}] ${previousMessage}`);
    } else if (firstFullLine) {
        // Output the original single line if it wasn't repeated
        // This preserves the original formatting including any prefixes
        console.log(firstFullLine);
    }
    // Otherwise (count is 1 but firstFullLine is null somehow?), do nothing.
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false // Important for processing piped input
});

// Process each line from the input stream
rl.on('line', (line) => {
    const match = line.match(logRegex);

    if (match) {
        const currentTimestamp = match[1];
        const currentMessage = match[2].trim(); // Trim whitespace for accurate comparison

        if (currentMessage === previousMessage) {
            // Same message as the previous one, increment count and update last timestamp
            count++;
            lastTimestamp = currentTimestamp;
        } else {
            // Different message, output the previous stored log (if any)
            outputPreviousLog();

            // Start tracking the new message sequence
            previousMessage = currentMessage;
            count = 1;
            firstTimestamp = currentTimestamp;
            lastTimestamp = currentTimestamp;
            firstFullLine = line; // Store the raw original line
        }
    } else {
        // Line doesn't match the expected log format
        // Output any pending log sequence first
        outputPreviousLog();
        // Then print the non-matching line as is
        console.log(line);
        // Reset tracking
        previousMessage = null;
        count = 0;
        firstTimestamp = null;
        lastTimestamp = null;
        firstFullLine = null;
    }
});

// When the input stream closes, make sure to output the last tracked log sequence
rl.on('close', () => {
    outputPreviousLog();
});

// Handle potential errors on input stream
process.stdin.on('error', (err) => {
    if (err.code === 'EPIPE') {
        // This happens when the pipe is closed (e.g., piping to `head`), not necessarily an error.
        process.exit(0);
    } else {
        console.error("Input stream error:", err);
        process.exit(1);
    }
});