import { describe, expect, it } from 'vitest';
import { comparisonCandidates, speciesComparisonLines } from '../../core/species_comparison';
import { generateBiosphere } from '../../entities/biology/biosphere_generator';
import { biologyFixture } from '../fixtures/biology';
import type { SpeciesEvidence } from '../../entities/biology/biology_types';

/** Supplies acquired evidence without requiring a field or exposing generation ancestry. */
function record(index: number, level = 2): SpeciesEvidence {
  return {
    species: generateBiosphere(biologyFixture())!.species[index],
    level: level as SpeciesEvidence['level'],
    submittedLevel: 0,
    collected: false,
  };
}

describe('evidence-based species comparison', () => {
  it('excludes unobserved counterparts and masks chemistry until both records are analysed', () => {
    const a = record(0),
      b = record(2, 3);
    expect(comparisonCandidates(a, [a, b, record(3, 1)]).map((entry) => entry.species.id)).toEqual([
      b.species.id,
    ]);
    const text = speciesComparisonLines(a, b)
      .flatMap((line) => line.segments.map((span) => span.text))
      .join(' ');
    expect(text).toContain('A unresolved');
    expect(text).not.toContain(a.species.lineage);
    expect(text).not.toContain(a.species.covering);
  });
  it('does not let hidden lineage labels establish or change an inferred relationship', () => {
    const a = record(0, 3),
      b = record(2, 3);
    const before = structuredClone([a, b]);
    const report = speciesComparisonLines(a, b);
    expect(
      speciesComparisonLines(a, { ...b, species: { ...b.species, lineage: a.species.lineage } })
    ).toEqual(report);
    expect([a, b]).toEqual(before);
    expect(report.flatMap((line) => line.segments.map((span) => span.text)).join(' ')).toContain(
      'ancestry remains unconfirmed'
    );
  });
});
