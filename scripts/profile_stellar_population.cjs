const path = require('node:path');
const Module = require('node:module');
const { buildSync } = require('esbuild');

/** Bundles the real generator and diagnostics together without producing build artifacts. */
function loadModel() {
  const filename = path.resolve('src/population-diagnostics.ts');
  const output = buildSync({
    stdin: {
      contents: `export { CONFIG } from './config';
        export { PRNG } from './utils/prng';
        export { SystemDataGenerator } from './generation/system_data_generator';
        export { getStellarPopulationDistribution } from './generation/stellar_population';
        export { getStellarDetectionRadii } from './core/stellar_detection';`,
      sourcefile: filename,
      resolveDir: path.dirname(filename),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    alias: { '@': path.resolve('src') },
    write: false,
  });
  const compiled = new Module(filename, module);
  compiled.paths = module.paths;
  compiled._compile(output.outputFiles[0].text, filename);
  return compiled.exports;
}

const { CONFIG, PRNG, SystemDataGenerator, getStellarPopulationDistribution, getStellarDetectionRadii } =
  loadModel();
const radius = Number(process.argv.find((arg) => arg.startsWith('--radius='))?.slice(9) ?? 250);
const seed = process.argv.find((arg) => arg.startsWith('--seed='))?.slice(7) ?? CONFIG.SEED;
if (!Number.isInteger(radius) || radius < 10 || radius > 1000)
  throw new Error('--radius must be 10..1000 cells');
const generator = new SystemDataGenerator(new PRNG(seed));
const start = performance.now();
const counts = {};
const examples = {};
let stellarSystems = 0;
let brownDwarfs = 0;
let expectedSystems = 0;
for (let y = -radius; y <= radius; y++) {
  for (let x = -radius; x <= radius; x++) {
    expectedSystems += generator.getGalacticContext(x, y).expectedResolvedSystems;
    for (const props of generator.getResolvedSystemMapProperties(x, y)) {
      if (props.objectKind === 'brown-dwarf') {
        brownDwarfs++;
        continue;
      }
      stellarSystems++;
      const stage = props.stellarEvolution?.stage ?? 'main-sequence';
      const category = stage === 'main-sequence' ? `${props.starType[0]} dwarf` : stage;
      counts[category] = (counts[category] ?? 0) + 1;
      if (stage !== 'main-sequence' || /^[OB]/.test(props.starType)) {
        examples[category] ??= [];
        if (examples[category].length < 5)
          examples[category].push({
            x,
            y,
            slot: props.systemSlot,
            type: props.starType,
            ageGyr: props.stellarPopulation?.ageGyr,
          });
      }
    }
  }
}

const context = { ...generator.getGalacticContext(0, 0), cluster: null };
const cohorts = {};
for (const population of ['thin-disk', 'thick-disk', 'bulge', 'halo']) {
  const distribution = getStellarPopulationDistribution(context, {
    population,
    ageGyr: 4.6,
    metallicityFeH: 0,
  });
  const categories = {};
  for (const option of distribution) {
    const stage = option.evolution.stage;
    const category = stage === 'main-sequence' ? `${option.starType[0]} dwarf` : stage;
    const row = (categories[category] ??= { fraction: 0, encounterRatePerLy: 0 });
    row.fraction += option.probability;
    const horizonLy =
      getStellarDetectionRadii({
        starType: option.starType,
        objectKind: 'stellar',
        stellarEvolution: option.evolution,
      }).statusRadius * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS;
    // Straight-path acquisition through a homogeneous 2D Poisson field: rate = 2 R Sigma.
    row.encounterRatePerLy +=
      ((2 * horizonLy * context.expectedResolvedSystems) / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS ** 2) *
      option.probability;
  }
  cohorts[population] = Object.fromEntries(
    Object.entries(categories).map(([key, row]) => [
      key,
      {
        percent: +(row.fraction * 100).toFixed(5),
        idealisedMeanRouteLy: +(1 / row.encounterRatePerLy).toFixed(1),
      },
    ])
  );
}
console.log(
  JSON.stringify(
    {
      seed,
      generationVersion: CONFIG.GALAXY_MODEL_VERSION,
      radiusCells: radius,
      elapsedMs: Math.round(performance.now() - start),
      stellarSystems,
      expectedSystems: Math.round(expectedSystems),
      brownDwarfs,
      counts,
      examples,
      cohorts,
      caveat:
        'Route estimates assume a homogeneous, pure-cohort field at local density and full sensor coverage, not a viewport or a guaranteed itinerary. No extra O/B placements are injected.',
    },
    null,
    2
  )
);
