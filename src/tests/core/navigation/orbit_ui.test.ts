import { describe, expect, it } from 'vitest';
import { AU_IN_METERS, MineralRichness } from '../../../constants';
import { Planet } from '../../../entities/planet';
import { PlanetCharacteristics } from '../../../entities/planet/planet_characteristics_generator';
import { PRNG } from '../../../utils/prng';
import { createOrbitScreenModel, getOrbitReferenceLabel } from '../../../core/orbit_ui';
import { OrbitDossier, buildOrbitDossierLines } from '../../../core/orbit_dossier';
import { formatDistanceAu } from '../../../utils/space_scale';

/** Creates characteristics. */
function createCharacteristics(): PlanetCharacteristics {
  return {
    diameter: 46000,
    density: 1.45,
    gravity: 0.95,
    mass: 1.9e26,
    escapeVelocity: 24000,
    atmosphere: {
      density: 'Superdense',
      pressure: 160,
      composition: { Hydrogen: 52, Helium: 18, Methane: 18, Ammonia: 12 },
    },
    surfaceTemp: 38,
    surfaceTempMin: 36,
    surfaceTempMax: 41,
    hydrosphere: 'Deep volatile atmosphere',
    lithosphere: 'No solid surface',
    mineralRichness: MineralRichness.NONE,
    baseMinerals: 0,
    elementAbundance: { 'Water Ice': 34, 'Methane Ice': 22, Hydrogen: 16 },
    magneticFieldStrength: 300,
    axialTilt: 0.1,
    tidallyLocked: false,
    rotationPeriodHours: 17.2,
    orbitalInclination: 0,
  };
}

describe('Orbit UI formatting', () => {
  it('names the actual stellar host and uses a moon radius without adding its parent orbit', () => {
    const parent = new Planet(
      'C-I',
      'IceGiant',
      AU_IN_METERS,
      0,
      new PRNG('host-label'),
      'G',
      createCharacteristics(),
      undefined,
      { kind: 'circumstellar', starId: 'C' }
    );
    const moon = new Planet('C-I.1', 'Lunar', 4e8, Math.PI, new PRNG('moon-label'), 'G');
    parent.moons.push(moon);
    expect(getOrbitReferenceLabel(parent, parent)).toBe('star C');
    expect(getOrbitReferenceLabel(moon, parent)).toBe('planet C-I');
    for (const body of [parent, moon]) {
      const model = createOrbitScreenModel({
        parentPlanet: parent,
        selectedBody: body,
        selectedIndex: body === parent ? 0 : 1,
        mode: 'overview',
        landingCursorX: 0,
        landingCursorY: 0,
        rotationPhase: 0,
        illuminationPhase: 0,
      });
      expect(model.summary[1]).toBe(
        `${formatDistanceAu(body.orbitDistance)} / ${getOrbitReferenceLabel(body, parent)}`
      );
      expect(model.summary.join('\n')).not.toContain('system primary');
    }
  });

  it('describes planet classes and shows no orbit for free-floating primaries', () => {
    const planet = new Planet(
      'Rogue Ice',
      'IceGiant',
      0,
      0,
      new PRNG('rogue-orbit-format'),
      'ROGUE',
      createCharacteristics(),
      { starType: 'ROGUE', ageGyr: 6, metallicityFeH: -0.2 }
    );

    const model = createOrbitScreenModel({
      parentPlanet: planet,
      selectedBody: planet,
      selectedIndex: 0,
      mode: 'overview',
      landingCursorX: 0,
      landingCursorY: 0,
      rotationPhase: 0,
      illuminationPhase: 0,
    });

    expect(model.summary[0]).toBe('ICE GIANT');
    expect(model.summary[1]).toBe('Free-floating world');
    expect(model.summary).toContain('[D] PLANETARY DOSSIER');
    expect(model.summary.join('\n')).not.toContain('0.000 AU');
  });

  it('formats a sectioned dossier within narrow and wide viewport widths without leaking unsurveyed resources', () => {
    const body = new Planet(
      'C-I',
      'IceGiant',
      AU_IN_METERS,
      0,
      new PRNG('dossier-content'),
      'G',
      createCharacteristics()
    );
    const source = { id: 'A', primary: true, brightness: 1, colour: '#fff', irradianceWm2: 1361 };
    for (const width of [30, 68]) {
      body.scanned = false;
      const pending = buildOrbitDossierLines(body, body, [source], width);
      const pendingText = pending
        .map((line) => line.segments.map((segment) => segment.text).join(''))
        .join('\n');
      expect(pendingText).toContain('ORBIT AND SPIN');
      expect(pendingText).toContain('Stellar flux');
      expect(pendingText).toContain('Orbital survey');
      expect(pendingText).toContain('required');
      expect(pendingText).not.toContain('Hydrogen 52.0%');
      expect(
        pending.every((line) => line.segments.reduce((sum, segment) => sum + segment.text.length, 0) <= width)
      ).toBe(true);
      body.scanned = true;
      const surveyed = buildOrbitDossierLines(body, body, [source], width);
      const surveyedText = surveyed
        .map((line) => line.segments.map((segment) => segment.text).join(''))
        .join('\n');
      expect(surveyedText).toContain('ATMOSPHERE AND SURFACE');
      expect(surveyedText).toContain('Hydrogen');
      expect(surveyedText).toContain('RESOURCE SURVEY');
      expect(
        surveyed.every(
          (line) => line.segments.reduce((sum, segment) => sum + segment.text.length, 0) <= width
        )
      ).toBe(true);
    }
  });

  it('bounds dossier scrolling to the content and available viewport', () => {
    const body = new Planet(
      'Rogue',
      'Frozen',
      0,
      0,
      new PRNG('dossier-scroll'),
      'ROGUE',
      createCharacteristics()
    );
    const dossier = new OrbitDossier();
    dossier.open();
    const small = dossier.createModel(body, body, [], 48, 22);
    expect(small.dashboard!.length).toBeGreaterThan(small.visibleRowCount);
    dossier.scroll(1000, small.dashboard!.length, 22);
    expect(dossier.viewOffset).toBe(small.dashboard!.length - small.visibleRowCount);
    dossier.scroll(-1000, small.dashboard!.length, 22);
    expect(dossier.viewOffset).toBe(0);
    dossier.scroll(20, small.dashboard!.length, 22);
    const large = dossier.createModel(body, body, [], 120, 80);
    expect(large.viewOffset).toBe(0);
    dossier.close();
    expect(dossier.isOpen).toBe(false);
    expect(dossier.viewOffset).toBe(0);
  });
});
