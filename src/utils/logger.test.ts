// src/utils/logger.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { logger, LogLevel } from './logger'; // Import logger and LogLevel
import { CONFIG } from '../config'; // Needed for header check

// Reset log level and buffer before *each* test
beforeEach(() => {
    // Restore any mocks/spies *before* setting level/clearing buffer
    vi.restoreAllMocks();
    logger.setLogLevel(LogLevel.DEBUG); // Set default test level (logs to console only)
    logger.clearLogBuffer(); // Clear buffer (logs to console only)
});

afterEach(() => {
     vi.restoreAllMocks();
     // Clean up buffer after tests
     logger.clearLogBuffer();
});


describe('Logger', () => {
    let consoleSpy: {
        log: ReturnType<typeof vi.spyOn> | undefined,
        warn: ReturnType<typeof vi.spyOn> | undefined,
        error: ReturnType<typeof vi.spyOn> | undefined,
        debug: ReturnType<typeof vi.spyOn> | undefined
    } = { log: undefined, warn: undefined, error: undefined, debug: undefined };

    beforeEach(() => {
        // Spy on console methods *after* global beforeEach setup
        consoleSpy = {
            log: vi.spyOn(console, 'log').mockImplementation(() => { }),
            warn: vi.spyOn(console, 'warn').mockImplementation(() => { }),
            error: vi.spyOn(console, 'error').mockImplementation(() => { }),
            debug: vi.spyOn(console, 'debug').mockImplementation(() => { })
        };
    });

    afterEach(() => {
        // Restore console spies after each test
        Object.values(consoleSpy).forEach(spy => spy?.mockRestore());
        consoleSpy = { log: undefined, warn: undefined, error: undefined, debug: undefined };
    });

    it('should respect log levels (Console Output)', () => {
        // Set level to INFO (console log happens here, but we clear spies next)
        logger.setLogLevel(LogLevel.INFO);
        // Clear spies *immediately* before the logs we want to test
        Object.values(consoleSpy).forEach(spy => spy?.mockClear());

        // Make log calls
        logger.debug('This should not be logged');
        logger.info('Info log'); // Should call console.log
        logger.warn('Warning log'); // Should call console.warn
        logger.error('Error log'); // Should call console.error

        // Check spies
        expect(consoleSpy.debug).not.toHaveBeenCalled();
        expect(consoleSpy.log).toHaveBeenCalledTimes(1); // <<< Check: Should be exactly 1 now
        expect(consoleSpy.warn).toHaveBeenCalledTimes(1);
        expect(consoleSpy.error).toHaveBeenCalledTimes(1);
        expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining('[INFO] Info log'));
        expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('[WARN] Warning log'));
        expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('[ERROR] Error log'));

        // --- Test higher level ---
        // Set level to WARN (console log happens here)
        logger.setLogLevel(LogLevel.WARN);
        // Clear spies *immediately* before the logs we want to test
        Object.values(consoleSpy).forEach(spy => spy?.mockClear());


        // Make log calls again
        logger.debug('Debug again');
        logger.info('Info again'); // Should be ignored now
        logger.warn('Warn again'); // Should call console.warn
        logger.error('Error again'); // Should call console.error

        // Check spies again
        expect(consoleSpy.debug).not.toHaveBeenCalled();
        expect(consoleSpy.log).not.toHaveBeenCalled(); // Info ignored
        expect(consoleSpy.warn).toHaveBeenCalledTimes(1); // Only the explicit warn call
        expect(consoleSpy.error).toHaveBeenCalledTimes(1);
        expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('[WARN] Warn again'));
        expect(consoleSpy.error).toHaveBeenCalledWith(expect.stringContaining('[ERROR] Error again'));
    });

    it('should buffer log messages correctly', () => {
        // Buffer is cleared in global beforeEach
        logger.info('First message'); // Buffered
        logger.warn('Second message'); // Buffered
        logger.setLogLevel(LogLevel.ERROR); // Set level (Console only log)
        logger.error('Third message'); // Buffered
        logger.warn('Fourth message'); // Not buffered (level is ERROR)

        const bufferContent = logger.getLogBufferAsString(false);
        const lines = bufferContent.split('\n').filter(line => line.length > 0);

        expect(lines.length).toBe(3); // Should still be 3 (INFO, WARN, ERROR)
        expect(lines[0]).toContain('[INFO] First message');
        expect(lines[1]).toContain('[WARN] Second message');
        expect(lines[2]).toContain('[ERROR] Third message');
        expect(bufferContent).not.toContain('Fourth message');
    });

    it('clearLogBuffer should empty the buffer', () => {
        logger.info('Message before clear');
        expect(logger.getLogBufferAsString(false)).toContain('Message before clear');

        // Clear buffer (logs to console only)
        logger.clearLogBuffer();

        expect(logger.getLogBufferAsString(false)).toBe(''); // Buffer should be empty
    });

    it('getLogBufferAsString should include header when requested', () => {
        logger.info('Test log entry');
        const bufferWithHeader = logger.getLogBufferAsString(true);
        expect(bufferWithHeader).toMatch(/^--- Cosmic Voyage Log ---/);
        expect(bufferWithHeader).toContain(`Game Seed: "${CONFIG.SEED}"`);
        expect(bufferWithHeader).toContain('[INFO] Test log entry');

        const bufferWithoutHeader = logger.getLogBufferAsString(false);
        expect(bufferWithoutHeader).not.toMatch(/^--- Cosmic Voyage Log ---/);
        expect(bufferWithoutHeader).toContain('[INFO] Test log entry');
    });

    it('setLogLevel should change the current log level', () => {
        logger.setLogLevel(LogLevel.WARN);
        expect(logger.getCurrentLogLevel()).toBe(LogLevel.WARN);

        logger.setLogLevel(LogLevel.DEBUG);
        expect(logger.getCurrentLogLevel()).toBe(LogLevel.DEBUG);
    });

    it('setLogLevel should handle invalid levels', () => {
        const initialLevel = logger.getCurrentLogLevel();
        // Clear console mocks first
        Object.values(consoleSpy).forEach(spy => spy?.mockClear());

        logger.setLogLevel(-1 as LogLevel);
        expect(logger.getCurrentLogLevel()).toBe(initialLevel);
        expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('Attempted to set invalid log level: -1'));

        consoleSpy.warn?.mockClear();

        logger.setLogLevel(10 as LogLevel);
        expect(logger.getCurrentLogLevel()).toBe(initialLevel);
        expect(consoleSpy.warn).toHaveBeenCalledWith(expect.stringContaining('Attempted to set invalid log level: 10'));
    });

    it('should log complex objects as JSON strings', () => {
        const obj = { a: 1, b: { c: 'test' } };
        const arr = [1, 'two', true];
        logger.info('Logging object:', obj, 'and array:', arr);

        // Check console spy
        expect(consoleSpy.log).toHaveBeenCalledTimes(1);
        expect(consoleSpy.log).toHaveBeenCalledWith(expect.stringContaining(
            '[INFO] Logging object: {"a":1,"b":{"c":"test"}} and array: [1,"two",true]'
        ));

        // Check buffer content
        const bufferContent = logger.getLogBufferAsString(false);
        expect(bufferContent).toContain(JSON.stringify(obj));
        expect(bufferContent).toContain(JSON.stringify(arr));
        expect(bufferContent).toContain('[INFO] Logging object: {"a":1,"b":{"c":"test"}} and array: [1,"two",true]');
    });

    // --- downloadLogFile Tests ---
    describe('downloadLogFile', () => {
        let createElementSpy: ReturnType<typeof vi.spyOn> | undefined;
        let appendChildSpy: ReturnType<typeof vi.spyOn> | undefined;
        let removeChildSpy: ReturnType<typeof vi.spyOn> | undefined;
        let createObjectURLSpy: ReturnType<typeof vi.spyOn> | undefined;
        let revokeObjectURLSpy: ReturnType<typeof vi.spyOn> | undefined;
        let mockLink: HTMLAnchorElement;

        beforeEach(() => {
             // Clear console spies from outer block
             Object.values(consoleSpy).forEach(spy => spy?.mockClear());

            mockLink = {
                href: '',
                download: '',
                click: vi.fn(),
                style: { display: '' }
            } as unknown as HTMLAnchorElement;

            try {
                createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockLink);
                 if (!document.body) {
                      document.body = document.createElement('body');
                 }
                appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink);
                removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink);
                createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/fake-blob-url');
                revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => { });
            } catch (e) {
                 console.error("Error setting up DOM spies in logger test (downloadLogFile block):", e);
                 createElementSpy = undefined;
                 appendChildSpy = undefined;
                 removeChildSpy = undefined;
                 createObjectURLSpy = undefined;
                 revokeObjectURLSpy = undefined;
            }
        });

        afterEach(() => {
            createElementSpy?.mockRestore();
            appendChildSpy?.mockRestore();
            removeChildSpy?.mockRestore();
            createObjectURLSpy?.mockRestore();
            revokeObjectURLSpy?.mockRestore();
        });

        it('should attempt to create and click a download link', () => {
            if (!createElementSpy) return this.skip(); // Skip if setup failed

            logger.info('Log entry before download');
            logger.downloadLogFile();

            expect(createElementSpy).toHaveBeenCalledWith('a');
            expect(createObjectURLSpy).toHaveBeenCalledOnce();
            expect(mockLink.href).toBe('blob:http://localhost/fake-blob-url');
            expect(mockLink.download).toMatch(/^cosmic_voyage_log_.*\.txt$/);
            expect(appendChildSpy).toHaveBeenCalledWith(mockLink);
            expect(mockLink.click).toHaveBeenCalledOnce();
            expect(removeChildSpy).toHaveBeenCalledWith(mockLink);
            expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:http://localhost/fake-blob-url');
        });

        it('should use the provided filename if given', () => {
             if (!createElementSpy) return this.skip();
            const customFilename = 'my_game_log.log';
            logger.downloadLogFile(customFilename);
            expect(mockLink.download).toBe(customFilename);
        });

        it('should log info messages during download process (Buffer Check)', () => {
             if (!createElementSpy) return this.skip();
             logger.clearLogBuffer(); // Clear buffer before download
             logger.downloadLogFile();
             const buffer = logger.getLogBufferAsString(false);
             expect(buffer).toContain('[INFO] Preparing log file for download...');
             expect(buffer).toContain('[INFO] Log file download triggered as');
        });

        it('should log error if DOM manipulation fails', () => {
             if (!createElementSpy || !appendChildSpy) return this.skip();

            // Simulate an error during appendChild
            appendChildSpy.mockImplementationOnce(() => { throw new Error('Simulated DOM error'); });
            logger.clearLogBuffer(); // Clear buffer before test
            consoleSpy.error?.mockClear(); // Clear console spy before test

            logger.downloadLogFile();

             // Check console.error spy - expecting a single string argument
             expect(consoleSpy.error).toHaveBeenCalledOnce();
             expect(consoleSpy.error).toHaveBeenCalledWith(
                 // Match the formatted string from _logAndBuffer
                 expect.stringMatching(/\[ERROR\] Failed to prepare or trigger log file download: Simulated DOM error/)
             );

             // Check buffer content for the error message
             const buffer = logger.getLogBufferAsString(false);
             expect(buffer).toContain('[ERROR] Failed to prepare or trigger log file download: Simulated DOM error');

             // Ensure click wasn't called
             expect(mockLink.click).not.toHaveBeenCalled();
        });
    });
});