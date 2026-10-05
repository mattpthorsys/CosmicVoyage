const path = require('node:path');
const Module = require('node:module');
const { parseArgs } = require('node:util');
const { buildSync } = require('esbuild');

/** Loads the production planetary and biological generators in memory without generating terrain or build files. */
function loadModel() {
  const filename = path.resolve('src/biosphere-population-diagnostics.ts');
  const output = buildSync({
    stdin: {
      contents: `export { CONFIG } from './config';
        export { PRNG } from './utils/prng';
        export { logger, LogLevel } from './utils/logger';
        export { SystemDataGenerator } from './generation/system_data_generator';
        export { SolarSystem } from './entities/solar_system';
        export { createBiologyEnvironment, generateBiosphere } from './entities/biology/biosphere_generator';
        export { selectBiosphereComplexity } from './entities/biology/biosphere_complexity';
        export { supportsPressureCommunity } from './entities/biology/pressure_biosphere';
        export { getManagedSurfaceWaterPhase } from './entities/planet/surface_liquid';
        export { BIOLOGY_VERSION } from './entities/biology/biology_types';
        export { validateSpecies } from './entities/biology/biology_validation';`,
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

/** Records planets and nested moons using the same hierarchical address convention as game saves. */
function visitBodies(bodies, visit, prefix = '', kind = 'planet') {
  bodies.forEach((body, index) => {
    if (!body) return;
    const bodyPath = `${prefix}${kind}:${index}`;
    visit(body, bodyPath);
    visitBodies(body.moons, visit, `${bodyPath}/`, 'moon');
  });
}

/** Samples finite local/remote catalogues; generated frequency is not the conditional biological prior. */
function profileCatalogue(model, seed, centre, requested) {
  const {
    PRNG,
    SystemDataGenerator,
    SolarSystem,
    createBiologyEnvironment,
    generateBiosphere,
    supportsPressureCommunity,
    getManagedSurfaceWaterPhase,
    validateSpecies,
  } = model;
  const root = new PRNG(seed);
  const generator = new SystemDataGenerator(root);
  const addresses = new PRNG(seed).seedNew('biosphere-probe', centre.name);
  const visited = new Set();
  const counts = {
    systems: 0,
    bodies: 0,
    nativeEligible: 0,
    nativeLiving: 0,
    managedLiving: 0,
    'microbial-only': 0,
    'simple-multicellular': 0,
    'complex-multicellular': 0,
  };
  const examples = [];
  for (let attempt = 0; attempt < requested * 80 && counts.systems < requested; attempt++) {
    const x = centre.x + addresses.randomInt(-180, 180);
    const y = centre.y + addresses.randomInt(-180, 180);
    const key = `${x},${y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    for (const descriptor of generator.getResolvedSystemMapProperties(x, y)) {
      if (counts.systems >= requested) break;
      if (!descriptor.exists || descriptor.objectKind !== 'stellar') continue;
      const slot = descriptor.systemSlot ?? 0;
      const system = new SolarSystem(generator.getSystemProperties(x, y, slot), x, y, root);
      counts.systems++;
      visitBodies(system.planets, (body, bodyPath) => {
        counts.bodies++;
        const environment = createBiologyEnvironment(body, system, bodyPath);
        if (
          environment.origin === 'native' &&
          environment.landable &&
          environment.waterCoverage > 0 &&
          environment.temperatureK >= 273.15 &&
          environment.temperatureK <= 345 &&
          environment.pressureBar >= 0.04 &&
          (environment.pressureBar <= 15 || supportsPressureCommunity(environment)) &&
          environment.gravity <= 3 &&
          environment.ageGyr >= 0.3 &&
          getManagedSurfaceWaterPhase(environment.temperatureK, environment.pressureBar) === 'liquid'
        )
          counts.nativeEligible++;
        const biosphere = generateBiosphere(environment);
        if (!biosphere) return;
        biosphere.species.forEach(validateSpecies);
        if (body.isSurfaceReady()) throw new Error('Population probe unexpectedly generated terrain.');
        if (biosphere.origin === 'introduced') counts.managedLiving++;
        else {
          counts.nativeLiving++;
          counts[biosphere.complexity]++;
          if (examples.filter((entry) => entry.complexity === biosphere.complexity).length < 3)
            examples.push({
              x,
              y,
              slot,
              system: system.name,
              body: body.name,
              bodyPath,
              complexity: biosphere.complexity,
              temperatureK: environment.temperatureK,
              pressureBar: environment.pressureBar,
              oxygenBar: environment.oxygenBar,
              ageGyr: environment.ageGyr,
              pigmentCover: biosphere.pigmentCover,
              recognisedTaxa: biosphere.species.filter((species) => species.recognised).length,
              totalTaxa: biosphere.species.length,
            });
        }
      });
    }
  }
  return { seed, region: centre.name, requestedSystems: requested, counts, examples };
}

/** Reports controlled priors separately from real canonical planet populations across independent seeds. */
function main() {
  const model = loadModel();
  model.logger.setLogLevel(model.LogLevel.NONE);
  const { values } = parseArgs({
    options: {
      systems: { type: 'string', default: '150' },
      samples: { type: 'string', default: '1200' },
      seeds: { type: 'string', default: `${model.CONFIG.SEED},biosphere-probe-b,biosphere-probe-c` },
    },
  });
  const systems = Number(values.systems);
  const samples = Number(values.samples);
  const seeds = values.seeds.split(',').filter(Boolean);
  if (
    !Number.isInteger(systems) ||
    systems < 1 ||
    systems > 3000 ||
    !Number.isInteger(samples) ||
    samples < 100 ||
    samples > 10000 ||
    !seeds.length ||
    seeds.length > 8
  )
    throw new Error('Use --systems=1..3000, --samples=100..10000 and one to eight comma-separated seeds.');
  const environment = {
    bodyId: 'probe',
    bodyName: 'Controlled reference',
    seed: '',
    origin: 'native',
    temperatureK: 294,
    pressureBar: 1,
    oxygenBar: 0.21,
    gravity: 1,
    ageGyr: 4,
    waterCoverage: 0.3,
    humanIntensity: 0,
    distanceLy: 0,
    landable: true,
    stellarFluxWm2: 1361,
    carbonDioxideBar: 0.0004,
  };
  const priors = [];
  for (const seed of seeds)
    for (const context of [
      { name: 'temperate-oxic', patch: {} },
      { name: 'temperate-anoxic', patch: { oxygenBar: 0 } },
      { name: 'young', patch: { ageGyr: 0.5 } },
      { name: 'old', patch: { ageGyr: 9 } },
    ]) {
      const counts = { 'microbial-only': 0, 'simple-multicellular': 0, 'complex-multicellular': 0 };
      let inhabited = 0;
      for (let index = 0; index < samples; index++) {
        const e = { ...environment, ...context.patch, seed: `${seed}:reference:${index}` };
        counts[model.selectBiosphereComplexity(e)]++;
        if (model.generateBiosphere(e)) inhabited++;
      }
      priors.push({ seed, context: context.name, conditionalComplexity: counts, inhabited, total: samples });
    }
  const start = performance.now();
  const catalogues = [];
  for (const seed of seeds)
    for (const centre of [
      { name: 'near-human-space', x: model.CONFIG.PLAYER_START_X, y: model.CONFIG.PLAYER_START_Y },
      { name: 'remote-space', x: 4000, y: -2000 },
    ])
      catalogues.push(profileCatalogue(model, seed, centre, systems));
  console.log(
    JSON.stringify(
      {
        biologyVersion: model.BIOLOGY_VERSION,
        generationVersion: model.CONFIG.GALAXY_MODEL_VERSION,
        elapsedMs: Math.round(performance.now() - start),
        priors,
        catalogues,
        caveat:
          'Complexity coefficients are conditional gameplay priors, not measured alien-life statistics. Actual populations depend on canonical planet generation. No life placements or atmospheres are injected; example coordinates include nonzero slots which travel cannot yet enter.',
      },
      null,
      2
    )
  );
}

main();
