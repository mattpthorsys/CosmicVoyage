const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { once } = require('node:events');
const { parseArgs } = require('node:util');
const WebSocket = require('ws');

/** Waits briefly for a browser event without altering its real-time clock. */
function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Reads Chrome's dynamically allocated debugging port after its isolated profile is ready. */
async function debuggingPort(profile, chrome, getChromeError) {
  const filename = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 200; attempt++) {
    if (fs.existsSync(filename)) return Number(fs.readFileSync(filename, 'utf8').split('\n')[0]);
    if (chrome.exitCode !== null)
      throw new Error(`Chrome exited during startup: ${chrome.exitCode}. ${getChromeError()}`);
    await delay(100);
  }
  throw new Error(`Chrome debugging port did not become available. ${getChromeError()}`);
}

/** Connects to one Chrome page and returns its request sender and socket. */
async function connectToPage(debuggingUrl) {
  const socket = new WebSocket(debuggingUrl, { perMessageDeflate: false });
  await once(socket, 'open');
  let nextId = 0;
  const pending = new Map();
  socket.on('message', (bytes) => {
    const response = JSON.parse(bytes.toString());
    const waiter = pending.get(response.id);
    if (!waiter) return;
    pending.delete(response.id);
    if (response.error) waiter.reject(new Error(response.error.message));
    else waiter.resolve(response.result);
  });
  socket.on('close', () => {
    for (const waiter of pending.values()) waiter.reject(new Error('Chrome page closed'));
    pending.clear();
  });
  return {
    socket,
    /** Sends a Chrome DevTools Protocol command to the profiled page. */
    send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
  };
}

/** Evaluates a small page expression and reports browser exceptions with context. */
async function evaluate(send, expression) {
  const response = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

/** Runs the diagnostic without virtual time and writes a compact, reproducible timing report. */
async function main() {
  const { values } = parseArgs({
    options: {
      url: { type: 'string', default: 'http://127.0.0.1:5173/tools/orbit-surface-preview.html' },
      out: { type: 'string', default: '/tmp/cosmic-cities-m5-profile.json' },
      chrome: { type: 'string', default: 'google-chrome' },
      seed: { type: 'string', default: 'orbit-surface-baseline-v1' },
      'real-colonies': { type: 'string', default: '3' },
      phase: { type: 'string', default: 'night' },
      stars: { type: 'string', default: '1' },
      cols: { type: 'string', default: '120' },
      rows: { type: 'string', default: '64' },
      body: { type: 'string' },
    },
  });
  const url = new URL(values.url);
  for (const key of ['seed', 'real-colonies', 'phase', 'stars', 'cols', 'rows', 'body']) {
    if (values[key] !== undefined) url.searchParams.set(key, values[key]);
  }
  url.searchParams.set('suite', 'settlements');
  url.searchParams.set('benchmark', '1');

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'cosmic-city-profile-'));
  const chrome = spawn(
    values.chrome,
    [
      '--headless',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-device-scale-factor=1',
      '--window-size=1600,1000',
      `--user-data-dir=${profile}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] }
  );
  let chromeError = '';
  chrome.stderr.on('data', (bytes) => {
    chromeError = (chromeError + bytes.toString()).slice(-2000);
  });
  let launchError = null;
  chrome.on('error', (error) => {
    launchError = error;
  });
  let connection = null;
  try {
    const port = await debuggingPort(profile, chrome, () => chromeError);
    if (launchError) throw launchError;
    const endpoint = `http://127.0.0.1:${port}`;
    const version = await fetch(`${endpoint}/json/version`).then((response) => response.json());
    const target = await fetch(`${endpoint}/json/new?${encodeURIComponent(url.href)}`, {
      method: 'PUT',
    }).then((response) => response.json());
    if (!target.webSocketDebuggerUrl) throw new Error('Chrome did not create a page target');
    connection = await connectToPage(target.webSocketDebuggerUrl);
    await connection.send('Runtime.enable');
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const ready = await evaluate(connection.send, 'document.body?.dataset.ready ?? ""');
      if (ready === 'true') break;
      if (ready === 'error') {
        const detail = await evaluate(connection.send, 'document.querySelector("#status")?.textContent');
        throw new Error(`Diagnostic failed: ${detail}`);
      }
      await delay(100);
    }
    if ((await evaluate(connection.send, 'document.body?.dataset.ready')) !== 'true')
      throw new Error('Timed out waiting for the planetary city diagnostic');

    const result = await evaluate(
      connection.send,
      `(() => {
        const report = JSON.parse(document.querySelector('#diagnostics').textContent);
        return {
          settings: report.settings,
          fixtures: report.fixtures.map((fixture) => ({
            id: fixture.id,
            worldX: fixture.worldX ?? null,
            worldY: fixture.worldY ?? null,
            settlementStage: fixture.settlementStage,
            type: fixture.type,
            siteCount: fixture.settlements?.sites.length ?? 0,
            cellCount: fixture.settlements?.cells.length ?? 0,
            cityEffect: fixture.cityEffect,
            groundEffect: fixture.groundEffect,
            timings: fixture.timings,
            orbitalProfile: fixture.orbitalProfile,
          })),
        };
      })()`
    );
    if (!result?.fixtures?.length || result.fixtures.some((fixture) => !fixture.orbitalProfile))
      throw new Error('Missing orbital profile data');
    const report = {
      capturedAt: new Date().toISOString(),
      sourceRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
      chromeVersion: version.Browser,
      cpuModel: os.cpus()[0]?.model ?? null,
      virtualTime: false,
      url: url.href,
      ...result,
    };
    const output = path.resolve(values.out);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ output, ...report }, null, 2));
  } finally {
    connection?.socket.terminate();
    if (chrome.exitCode === null && chrome.signalCode === null) {
      const exited = once(chrome, 'exit');
      chrome.kill('SIGTERM');
      await Promise.race([exited, delay(2000)]);
      if (chrome.exitCode === null && chrome.signalCode === null) {
        chrome.kill('SIGKILL');
        await exited;
      }
    }
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 9 || !['ENOTEMPTY', 'EBUSY'].includes(error.code)) throw error;
        await delay(250);
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
