const path = require('node:path');
const Module = require('node:module');
const { execFileSync } = require('node:child_process');
const { buildSync } = require('esbuild');

/** Loads pure TypeScript optics through the project's existing build dependency. */
function loadOptics(relativePath, gitRef) {
  const filename = path.resolve(relativePath);
  const input = gitRef
    ? {
        stdin: {
          contents: execFileSync('git', ['show', `${gitRef}:${relativePath}`], { encoding: 'utf8' }),
          sourcefile: filename,
          resolveDir: path.dirname(filename),
          loader: 'ts',
        },
      }
    : { entryPoints: [filename] };
  const output = buildSync({
    ...input,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
  });
  const compiled = new Module(filename, module);
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

const optics = loadOptics('src/rendering/scenes/orbit_atmosphere.ts');
const optimized = process.argv.includes('--optimized');
const samplerRef = process.argv
  .find((arg) => arg.startsWith('--sampler-ref='))
  ?.slice('--sampler-ref='.length);
const frameCount = Number(
  process.argv.find((arg) => arg.startsWith('--frames='))?.slice('--frames='.length) ?? 4
);
if (samplerRef && !optimized) throw new Error('--sampler-ref requires --optimized');
if (!Number.isInteger(frameCount) || frameCount < 2) throw new Error('--frames must be an integer >= 2');
const samplerModule = optimized
  ? loadOptics('src/rendering/scenes/orbit_atmosphere_sampler.ts', samplerRef)
  : null;
const fixtures = [
  {
    name: 'Earth',
    pressure: 1.01325,
    temperature: 288,
    gravity: 1,
    diameter: 12742,
    gases: { Nitrogen: 78, Oxygen: 21, Argon: 1 },
  },
  {
    name: 'Dense CO2',
    pressure: 90,
    temperature: 735,
    gravity: 0.9,
    diameter: 12104,
    gases: { 'Carbon Dioxide': 96, Nitrogen: 4 },
  },
];
const results = [];
let checksum = 0;
for (const fixture of fixtures) {
  const air = optics.createOrbitAtmosphere(
    fixture.pressure,
    fixture.temperature,
    fixture.gravity,
    fixture.diameter,
    fixture.gases
  );
  for (const radius of [24, 48]) {
    for (const starCount of [1, 3]) {
      const setupStart = performance.now();
      const sampler = samplerModule ? new samplerModule.OrbitAtmosphereSampler(air) : null;
      const setupMs = performance.now() - setupStart;
      const bound = Math.ceil(radius * air.projectedLayers.at(-1) + 1);
      const times = [];
      for (let frame = 0; frame < frameCount; frame++) {
        const start = performance.now();
        for (let y = -bound; y <= bound; y++) {
          for (let x = -bound; x <= bound; x++) {
            for (let star = 0; star < starCount; star++) {
              const angle = 2.8 + frame * 0.035 - star * 0.7;
              const sun = { x: Math.sin(angle), y: 0, z: Math.cos(angle) };
              const value = sampler
                ? sampler.samplePixel(x / radius, y / radius, 1 / radius, sun)
                : optics.sampleOrbitAtmospherePixelTransfer(x / radius, y / radius, 1 / radius, sun, air);
              checksum += value.scattering.r + value.surface.b;
            }
          }
        }
        times.push(performance.now() - start);
      }
      results.push({
        atmosphere: fixture.name,
        radius,
        stars: starCount,
        setupMs: +setupMs.toFixed(2),
        firstFrameMs: +times[0].toFixed(2),
        warmMeanMs: +(times.slice(1).reduce((a, b) => a + b, 0) / (frameCount - 1)).toFixed(2),
        cache: sampler?.getCacheStats(),
      });
    }
  }
}
console.log(
  JSON.stringify(
    {
      mode: optimized ? 'optimized' : 'reference',
      samplerRef: samplerRef ?? null,
      frames: frameCount,
      results,
      checksum,
    },
    null,
    2
  )
);
