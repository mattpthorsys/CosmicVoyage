import { describe, expect, it } from 'vitest';
import { SystemDataGenerator, SystemMapProperties } from '../generation/system_data_generator';
import { HyperspaceSurveyService } from './hyperspace_survey';

const emptySystem: SystemMapProperties = {
  exists: false,
  starType: null,
  name: null,
  hasStarbase: false,
  objectKind: null,
};

describe('HyperspaceSurveyService', () => {
  it('reuses a complete survey for the same player position and viewport', () => {
    let mapCalls = 0;
    let phenomenonCalls = 0;
    let fullSystemCalls = 0;
    const generator = {
      getSystemMapProperties: (x: number, y: number): SystemMapProperties => {
        mapCalls++;
        if (x === 2 && y === 0) {
          return { exists: true, starType: 'G2V', name: 'Survey-2', hasStarbase: true, objectKind: 'stellar' };
        }
        return emptySystem;
      },
      getSystemProperties: () => {
        fullSystemCalls++;
        return emptySystem;
      },
      getDeepSpacePhenomenonProperties: () => {
        phenomenonCalls++;
        return { exists: false, type: null, name: null, classification: null, signal: null, char: null, colour: null, rarity: null };
      },
      getInterstellarMediumProperties: () => ({
        kind: 'diffuse-hydrogen',
        label: 'diffuse neutral hydrogen',
        summary: 'ordinary low-density interstellar hydrogen',
        density: 1,
        electronDensity: 0.03,
        dustExtinction: 0,
        radiation: 0.04,
        gravitationalShear: 0,
        sensorRangeMultiplier: 1,
        driftBiasX: 0,
        driftBiasY: 0,
      }),
    } as unknown as SystemDataGenerator;

    const service = new HyperspaceSurveyService(generator);
    const first = service.getSurvey(0, 0, 11, 9);
    const callsAfterFirst = { mapCalls, phenomenonCalls, fullSystemCalls };
    const second = service.getSurvey(0, 0, 11, 9);

    expect(second).toBe(first);
    expect({ mapCalls, phenomenonCalls, fullSystemCalls }).toEqual(callsAfterFirst);
    expect(fullSystemCalls).toBe(0);
    expect(first.nearestSystemContact?.system?.name).toBe('Survey-2');
    expect(first.starbaseMarkers.some((marker) => marker.x === 7 && marker.y === 4)).toBe(true);
  });
});
