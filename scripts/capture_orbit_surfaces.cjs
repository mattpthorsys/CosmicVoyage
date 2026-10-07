const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { parseArgs } = require('node:util');

/** Collects native PNGs, a contact sheet, and metrics from the production rendering diagnostic. */
async function main() {
  const { values } = parseArgs({
    options: {
      url: { type: 'string', default: 'http://127.0.0.1:5173/tools/orbit-surface-preview.html' },
      out: { type: 'string', default: '/tmp/cosmic-orbit-surfaces' },
      chrome: { type: 'string', default: 'google-chrome' },
      phase: { type: 'string', default: 'full' },
      stars: { type: 'string', default: '1' },
      radius: { type: 'string', default: '26' },
      seed: { type: 'string', default: 'orbit-surface-baseline-v1' },
      suite: { type: 'string', default: 'surfaces' },
      body: { type: 'string' },
      rotation: { type: 'string' },
      pressure: { type: 'string' },
    },
  });
  const url = new URL(values.url);
  for (const key of ['phase', 'stars', 'radius', 'seed', 'suite', 'body', 'rotation', 'pressure']) {
    if (values[key] !== undefined) url.searchParams.set(key, values[key]);
  }
  const output = path.resolve(values.out);
  fs.mkdirSync(output, { recursive: true });
  const browserProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'cosmic-surface-browser-'));
  let result;
  try {
    result = spawnSync(
      values.chrome,
      [
        '--headless',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--force-device-scale-factor=1',
        `--user-data-dir=${browserProfile}`,
        '--window-size=1680,3600',
        '--virtual-time-budget=120000',
        '--run-all-compositor-stages-before-draw',
        `--screenshot=${path.join(output, 'contact-sheet.png')}`,
        '--dump-dom',
        url.href,
      ],
      { encoding: 'utf8', timeout: 180000, maxBuffer: 48 * 1024 * 1024 }
    );
  } finally {
    fs.rmSync(browserProfile, { recursive: true, force: true, maxRetries: 3 });
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Chrome exited ${result.status}: ${result.stderr.slice(-2500)}`);

  // Parse the returned document with the repository's existing DOM dependency;
  // script loading/evaluation is disabled in this second, read-only document.
  const { Window } = await import('happy-dom');
  const window = new Window({
    settings: {
      disableJavaScriptEvaluation: true,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
    },
  });
  let report;
  try {
    const document = new window.DOMParser().parseFromString(result.stdout, 'text/html');
    if (document.body.dataset.ready !== 'true') {
      throw new Error(
        `Capture incomplete: ${document.querySelector('#status')?.textContent ?? 'page did not load'}`
      );
    }
    report = JSON.parse(document.querySelector('#diagnostics').textContent);
  } finally {
    await window.happyDOM.close();
  }
  if (report.version !== 1 || !report.fixtures?.length) throw new Error('Invalid diagnostic report');
  const root = path.resolve(__dirname, '..');
  report.sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  report.modifiedSourceFiles = execFileSync('git', ['diff', 'HEAD', '--name-only', '--', 'src'], {
    cwd: root,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter(Boolean);
  report.url = url.href;
  for (const fixture of report.fixtures) {
    for (const [stage, image] of Object.entries(fixture.stages)) {
      const prefix = 'data:image/png;base64,';
      if (!image.png.startsWith(prefix)) throw new Error(`Missing PNG: ${fixture.id}/${stage}`);
      const filename = `${fixture.id}-${stage}.png`;
      fs.writeFileSync(path.join(output, filename), Buffer.from(image.png.slice(prefix.length), 'base64'));
      delete image.png;
      image.file = filename;
    }
  }
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        output,
        sourceRevision: report.sourceRevision,
        settings: report.settings,
        fixtures: report.fixtures.map((fixture) => ({
          body: fixture.id,
          pressureBar: fixture.atmosphere.pressure,
          albedo: fixture.stages.albedo.statistics,
          bare: fixture.stages.bare.statistics,
          atmosphere: fixture.stages.atmosphere.statistics,
          cityEffect: fixture.cityEffect,
          captureMeanMs:
            fixture.frames.reduce((sum, frame) => sum + frame.milliseconds, 0) / fixture.frames.length,
        })),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
