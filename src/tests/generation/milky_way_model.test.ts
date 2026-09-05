import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { MilkyWayModel } from '../../generation/milky_way_model';
import { PRNG } from '../../utils/prng';

describe('MilkyWayModel', () => {
  it.each(['haunting beauty', 'galaxy-anchor', 'dust-lanes'])(
    'has no grid-aligned texture streaks for seed %s',
    (seed) => {
      const model = new MilkyWayModel(seed);
      let horizontalVariation = 0;
      let verticalVariation = 0;
      for (let y = -12000; y <= 12000; y += 380) {
        for (let x = -12000; x <= 12000; x += 380) {
          const base = model.sampleGalaxyField(x, y).texture;
          horizontalVariation += (model.sampleGalaxyField(x + 140, y).texture - base) ** 2;
          verticalVariation += (model.sampleGalaxyField(x, y + 140).texture - base) ** 2;
        }
      }
      // Adjacent-coordinate FNV noise previously varied mainly across X, producing stripes.
      expect(horizontalVariation).toBeGreaterThan(1);
      expect(horizontalVariation / verticalVariation).toBeGreaterThan(0.7);
      expect(horizontalVariation / verticalVariation).toBeLessThan(1.4);
    }
  );

  it('uses the same stellar density for map samples and generated cell environments', () => {
    const model = new MilkyWayModel('shared-distribution');
    for (const [x, y] of [
      [0, 0],
      [12500, -23000],
      [-40000, 7000],
    ]) {
      const context = model.getCellContext(x, y);
      const field = model.sampleGalaxyField(context.galactocentricXpc, context.galactocentricYpc);
      const boost = context.cluster
        ? 1 + context.cluster.influence * (context.cluster.kind === 'open' ? 2.2 : 3.5)
        : 1;
      expect(context.relativeStellarDensity).toBeCloseTo(field.density * boost, 10);
    }
  });

  it('keeps an old stellar disk between arms and a genuinely elongated central bar', () => {
    const model = new MilkyWayModel('smooth-populations');
    const beta = (CONFIG.GALACTIC_BAR_ANGLE_DEG * Math.PI) / 180;
    const along = model.sampleGalaxyField(3000 * Math.sin(beta), -3000 * Math.cos(beta));
    const across = model.sampleGalaxyField(3000 * Math.cos(beta), 3000 * Math.sin(beta));
    expect(along.barDensity).toBeGreaterThan(across.barDensity * 10);
    expect(along.oldStellarDensity).toBeGreaterThan(across.oldStellarDensity * 1.2);
    const outer = model.sampleGalaxyField(0, -14000);
    const edge = model.sampleGalaxyField(0, -16000);
    expect(outer.oldStellarDensity).toBeGreaterThan(edge.oldStellarDensity);
    for (let i = 0; i < 36; i++) {
      const angle = (i * Math.PI) / 18;
      expect(
        model.sampleGalaxyField(8150 * Math.sin(angle), -8150 * Math.cos(angle)).oldStellarDensity
      ).toBeGreaterThan(0.9);
    }
  });

  it('anchors the player near the Solar galactocentric radius and remains order-independent', () => {
    const model = new MilkyWayModel('galaxy-anchor');
    const origin = model.getCellContext(0, 0);
    const first = model.getCellContext(240, -175);

    model.getCellContext(-9000, 3200);
    const rebuilt = model.getCellContext(240, -175);

    expect(origin.galactocentricRadiusPc).toBeCloseTo(CONFIG.GALACTIC_SOLAR_RADIUS_PC, 6);
    expect(origin.armName).toBe('Local Arm');
    expect(rebuilt).toEqual(first);
  });

  it('places Sol below the core with decreasing world Y pointing to Galactic north', () => {
    const model = new MilkyWayModel('galactic-orientation');
    const sol = model.worldToGalactocentric(0, 0);
    const north = model.worldToGalactocentric(0, -100);
    const east = model.worldToGalactocentric(100, 0);

    expect(sol).toEqual({ xPc: 0, yPc: -CONFIG.GALACTIC_SOLAR_RADIUS_PC });
    expect(north.yPc).toBeGreaterThan(sol.yPc);
    expect(east.xPc).toBeGreaterThan(sol.xPc);
    const roundTrip = model.galactocentricToWorld(north.xPc, north.yPc);
    expect(roundTrip.worldX).toBeCloseTo(0, 10);
    expect(roundTrip.worldY).toBeCloseTo(-100, 10);
  });

  it('uses the tripled inhabited radius and keeps automated logistics beyond the frontier', () => {
    const model = new MilkyWayModel('human-envelope');
    const coreCells = Math.floor(1200 / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS);
    const settledCells = Math.floor(2500 / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS);
    const frontierCells = Math.floor(4000 / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS);
    const emptyCells = Math.ceil(5000 / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS);
    const depotCells = Math.floor(9000 / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS);
    const beyondDepotCells = Math.ceil(12500 / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS);

    expect(model.getHumanPresence(coreCells, 0).region).toBe('core');
    expect(model.getHumanPresence(settledCells, 0).region).toBe('settled');
    expect(model.getHumanPresence(frontierCells, 0).region).toBe('frontier');
    expect(model.getHumanPresence(emptyCells, 0).settlementIntensity).toBe(0);
    expect(model.getHumanPresence(depotCells, 0).depotIntensity).toBeGreaterThan(0);
    expect(model.getHumanPresence(beyondDepotCells, 0).depotIntensity).toBe(0);
  });

  it('raises density and metallicity toward the inner Galaxy while preserving a sparse outer disk', () => {
    const model = new MilkyWayModel('galactic-gradient');
    const inner = model.getCellContext(0, -5500);
    const local = model.getCellContext(0, 0);
    const outer = model.getCellContext(0, 5500);

    expect(inner.relativeStellarDensity).toBeGreaterThan(local.relativeStellarDensity);
    expect(local.relativeStellarDensity).toBeGreaterThan(outer.relativeStellarDensity);
    expect(inner.meanMetallicityFeH).toBeGreaterThan(outer.meanMetallicityFeH);
  });

  it('samples bounded old halo and younger thin-disk populations from explicit local weights', () => {
    const model = new MilkyWayModel('population-sampling');
    const context = model.getCellContext(0, 0);
    const samples = Array.from({ length: 200 }, (_, index) =>
      model.sampleStellarPopulation(context, new PRNG(`population-${index}`))
    );

    expect(samples.every((sample) => sample.ageGyr > 0 && sample.ageGyr <= 13.2)).toBe(true);
    expect(samples.every((sample) => sample.metallicityFeH >= -2.35 && sample.metallicityFeH <= 0.62)).toBe(
      true
    );
    expect(samples.some((sample) => sample.population === 'thin-disk')).toBe(true);
  });

  it('creates sparse deterministic clusters with coherent age and metallicity', () => {
    const model = new MilkyWayModel('cluster-population');
    const clustered = [];
    let sampled = 0;
    const radiusCells = Math.round((1200 * 3.26156) / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS);
    const stepCells = Math.max(1, Math.round((12 * 3.26156) / CONFIG.HYPERSPACE_CELL_LIGHT_YEARS));

    for (let y = -radiusCells; y <= radiusCells; y += stepCells) {
      for (let x = -radiusCells; x <= radiusCells; x += stepCells) {
        sampled++;
        const context = model.getCellContext(x, y);
        if (context.cluster) clustered.push(context.cluster);
      }
    }

    expect(clustered.length).toBeGreaterThan(0);
    expect(clustered.length).toBeLessThan(sampled * 0.05);
    expect(
      clustered.every((cluster) =>
        cluster.kind === 'open'
          ? cluster.ageGyr > 0 && cluster.ageGyr < 4.3 && cluster.metallicityFeH > -0.3
          : cluster.ageGyr > 10 && cluster.metallicityFeH < -1
      )
    ).toBe(true);
  });

  it('provides a cheap analytical whole-Galaxy field without generating systems', () => {
    const model = new MilkyWayModel('galaxy-raster');
    const centre = model.sampleGalaxyField(0, 0);
    const solar = model.sampleGalaxyField(0, -CONFIG.GALACTIC_SOLAR_RADIUS_PC);
    const outside = model.sampleGalaxyField(0, -CONFIG.GALACTIC_DISK_RADIUS_PC * 1.3);

    expect(centre.density).toBeGreaterThan(solar.density);
    expect(solar.insideMainDisk).toBe(true);
    expect(outside.insideMainDisk).toBe(false);
    expect(outside.density).toBeLessThan(solar.density);
  });

  it('reproduces the measured Local Arm ridge at its Reid et al. kink', () => {
    const model = new MilkyWayModel('measured-arm-ridge');
    const beta = (9 * Math.PI) / 180;
    const radiusPc = 8260;
    const field = model.sampleGalaxyField(Math.sin(beta) * radiusPc, -Math.cos(beta) * radiusPc);

    expect(field.armInfluence).toBeGreaterThan(0.95);
    expect(field.youngStellarDensity).toBeGreaterThan(0.25);
    expect(field.dustLaneDensity).toBeGreaterThan(0);
  });

  it('connects the measured Norma and Outer structures without repeating circular fits', () => {
    const model = new MilkyWayModel('bounded-arm-tracks');
    const beta = (18 * Math.PI) / 180;
    const norma = model.sampleGalaxyField(Math.sin(beta) * 4460, -Math.cos(beta) * 4460);
    const outer = model.sampleGalaxyField(Math.sin(beta) * 12240, -Math.cos(beta) * 12240);

    expect(norma.armInfluence).toBeGreaterThan(0.95);
    expect(outer.armInfluence).toBeGreaterThan(0.95);

    const crossingCounts = Array.from({ length: 12 }, (_, index) => {
      const sampleBeta = ((index * 30 - 180) * Math.PI) / 180;
      let count = 0;
      let insideArm = false;
      for (let radiusPc = 2200; radiusPc <= 16000; radiusPc += 40) {
        const field = model.sampleGalaxyField(
          Math.sin(sampleBeta) * radiusPc,
          -Math.cos(sampleBeta) * radiusPc
        );
        const isStrongArm = field.armInfluence >= 0.55;
        if (isStrongArm && !insideArm) count++;
        insideArm = isStrongArm;
      }
      return count;
    });

    expect(Math.max(...crossingCounts)).toBeLessThanOrEqual(6);
    expect(crossingCounts.reduce((sum, count) => sum + count, 0) / crossingCounts.length).toBeLessThan(4.8);
  });

  it('adds a broad two-armed old-stellar response from the ends of the bar', () => {
    const model = new MilkyWayModel('stellar-arm-response');
    const radiusPc = 8000;
    const barAngle = (CONFIG.GALACTIC_BAR_ANGLE_DEG * Math.PI) / 180;
    const pitch = (12.5 * Math.PI) / 180;
    const referenceRadiusPc = CONFIG.GALACTIC_BAR_HALF_LENGTH_PC * 0.92;
    const ridgeBeta = barAngle - Math.log(radiusPc / referenceRadiusPc) / Math.tan(pitch);
    const ridge = model.sampleGalaxyField(Math.sin(ridgeBeta) * radiusPc, -Math.cos(ridgeBeta) * radiusPc);
    const interarm = model.sampleGalaxyField(
      Math.sin(ridgeBeta + Math.PI / 2) * radiusPc,
      -Math.cos(ridgeBeta + Math.PI / 2) * radiusPc
    );

    expect(ridge.stellarArmInfluence).toBeGreaterThan(0.9);
    expect(interarm.stellarArmInfluence).toBeLessThan(0.1);
  });
});
