import { describe, expect, it } from 'vitest';
import { CONFIG } from '../../config';
import { MilkyWayModel } from '../../generation/milky_way_model';
import { PRNG } from '../../utils/prng';

describe('MilkyWayModel', () => {
  it('anchors the player near the Solar galactocentric radius and remains order-independent', () => {
    const model = new MilkyWayModel('galaxy-anchor');
    const origin = model.getCellContext(0, 0);
    const first = model.getCellContext(240, -175);

    model.getCellContext(-9000, 3200);
    const rebuilt = model.getCellContext(240, -175);

    expect(origin.galactocentricRadiusPc).toBeCloseTo(CONFIG.GALACTIC_SOLAR_RADIUS_PC, 6);
    expect(origin.armName).toBe('Local Spur');
    expect(rebuilt).toEqual(first);
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
    const inner = model.getCellContext(5500, 0);
    const local = model.getCellContext(0, 0);
    const outer = model.getCellContext(-5500, 0);

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

    for (let y = -1200; y <= 1200; y += 12) {
      for (let x = -1200; x <= 1200; x += 12) {
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
    const solar = model.sampleGalaxyField(CONFIG.GALACTIC_SOLAR_RADIUS_PC, 0);
    const outside = model.sampleGalaxyField(CONFIG.GALACTIC_DISK_RADIUS_PC * 1.3, 0);

    expect(centre.density).toBeGreaterThan(solar.density);
    expect(solar.insideMainDisk).toBe(true);
    expect(outside.insideMainDisk).toBe(false);
    expect(outside.density).toBeLessThan(solar.density);
  });
});
