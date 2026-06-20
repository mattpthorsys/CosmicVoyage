import { describe, expect, it } from 'vitest';
import { SystemDataGenerator, SystemMapProperties } from '../../../generation/system_data_generator';
import { HyperspaceSurveyService } from '../../../core/hyperspace_survey';
import {
  HyperspaceSurveyCellData,
  HyperspaceSurveyCellProvider,
} from '../../../core/hyperspace_survey_cell_provider';

const emptySystem: SystemMapProperties = {
  exists: false,
  starType: null,
  name: null,
  hasStarbase: false,
  objectKind: null,
};

/** Creates a promise whose completion is controlled by the test. */
function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe('HyperspaceSurveyService', () => {
  it('reuses a complete survey for the same player position and viewport', () => {
    let mapCalls = 0;
    let phenomenonCalls = 0;
    let fullSystemCalls = 0;
    const generator = {
      getSystemMapProperties: (x: number, y: number): SystemMapProperties => {
        mapCalls++;
        if (x === 2 && y === 0) {
          return {
            exists: true,
            starType: 'G2V',
            name: 'Survey-2',
            hasStarbase: true,
            objectKind: 'stellar',
          };
        }
        return emptySystem;
      },
      getSystemProperties: () => {
        fullSystemCalls++;
        return emptySystem;
      },
      getDeepSpacePhenomenonProperties: () => {
        phenomenonCalls++;
        return {
          exists: false,
          type: null,
          name: null,
          classification: null,
          signal: null,
          char: null,
          colour: null,
          rarity: null,
        };
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

  it('finds nearest system contact by outward shells before scanning the full brown-dwarf horizon', () => {
    let farMapCalls = 0;
    const generator = {
      getSystemMapProperties: (x: number, y: number): SystemMapProperties => {
        if (Math.abs(x) > 6 || Math.abs(y) > 6) farMapCalls++;
        if (x === 2 && y === 0) {
          return { exists: true, starType: 'K4V', name: 'Near-2', hasStarbase: false, objectKind: 'stellar' };
        }
        if (x === 28 && y === 0) {
          return {
            exists: true,
            starType: 'T5',
            name: 'Brown-28',
            hasStarbase: false,
            objectKind: 'brown-dwarf',
          };
        }
        return emptySystem;
      },
      getDeepSpacePhenomenonProperties: () => ({
        exists: false,
        type: null,
        name: null,
        classification: null,
        signal: null,
        char: null,
        colour: null,
        rarity: null,
      }),
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

    const survey = new HyperspaceSurveyService(generator).getSurvey(0, 0, 5, 5);

    expect(survey.nearestSystemContact?.system?.name).toBe('Near-2');
    expect(farMapCalls).toBe(0);
  });

  it('collects full overlay contacts lazily when the astrometric overlay asks for them', () => {
    const generator = {
      getSystemMapProperties: (x: number, y: number): SystemMapProperties => {
        if (x === 2 && y === 0) {
          return { exists: true, starType: 'K4V', name: 'Near-2', hasStarbase: false, objectKind: 'stellar' };
        }
        if (x === 28 && y === 0) {
          return {
            exists: true,
            starType: 'T5',
            name: 'Brown-28',
            hasStarbase: false,
            objectKind: 'brown-dwarf',
          };
        }
        return emptySystem;
      },
      getDeepSpacePhenomenonProperties: () => ({
        exists: false,
        type: null,
        name: null,
        classification: null,
        signal: null,
        char: null,
        colour: null,
        rarity: null,
      }),
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
    const survey = service.getSurvey(0, 0, 5, 5);

    expect(survey.overlayContacts).toEqual([]);

    const overlayContacts = service.getOverlayContacts(survey);

    expect(overlayContacts.map((contact) => contact.system?.name)).toContain('Near-2');
    expect(overlayContacts.map((contact) => contact.system?.name)).toContain('Brown-28');
    expect(service.getOverlayContacts(survey)).toBe(overlayContacts);
  });

  it('prefetches nearby survey cells into the shared coordinate cache', async () => {
    class AsyncProvider implements HyperspaceSurveyCellProvider {
      syncCalls = 0;
      asyncCalls = 0;
      largestBatch = 0;

      /** Returns cell data. */
      getCellData(worldX: number, worldY: number): HyperspaceSurveyCellData {
        this.syncCalls++;
        return {
          worldX,
          worldY,
          system:
            worldX === 2 && worldY === 0
              ? { exists: true, starType: 'K4V', name: 'Near-2', hasStarbase: false, objectKind: 'stellar' }
              : emptySystem,
          phenomenon: {
            exists: false,
            type: null,
            name: null,
            classification: null,
            signal: null,
            char: null,
            colour: null,
            rarity: null,
          },
        };
      }

      /** Returns cell data batch async. */
      getCellDataBatchAsync(
        requests: readonly { worldX: number; worldY: number }[]
      ): Promise<HyperspaceSurveyCellData[]> {
        this.asyncCalls++;
        this.largestBatch = Math.max(this.largestBatch, requests.length);
        return Promise.resolve(
          requests.map(({ worldX, worldY }) => ({
            worldX,
            worldY,
            system:
              worldX === 2 && worldY === 0
                ? { exists: true, starType: 'K4V', name: 'Near-2', hasStarbase: false, objectKind: 'stellar' }
                : emptySystem,
            phenomenon: {
              exists: false,
              type: null,
              name: null,
              classification: null,
              signal: null,
              char: null,
              colour: null,
              rarity: null,
            },
          }))
        );
      }

      /** Clears cache. */
      clearCache(): void {}
    }

    const generator = {
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
    const provider = new AsyncProvider();
    const service = new HyperspaceSurveyService(generator, provider);

    service.getSurvey(0, 0, 5, 5);
    const syncAfterFirstSurvey = provider.syncCalls;
    await new Promise((resolve) => setTimeout(resolve, 0));
    service.getSurvey(1, 0, 5, 5);

    expect(provider.asyncCalls).toBeGreaterThan(0);
    expect(provider.largestBatch).toBeLessThanOrEqual(512);
    expect(provider.syncCalls).toBe(syncAfterFirstSurvey);
  });

  it('keeps only the newest queued survey prefetch during rapid movement', async () => {
    const firstBatch = deferred<HyperspaceSurveyCellData[]>();
    const batches: Array<readonly { worldX: number; worldY: number }[]> = [];
    const provider: HyperspaceSurveyCellProvider = {
      getCellData: (worldX, worldY) => ({
        worldX,
        worldY,
        system: emptySystem,
        phenomenon: {
          exists: false,
          type: null,
          name: null,
          classification: null,
          signal: null,
          char: null,
          colour: null,
          rarity: null,
        },
      }),
      getCellDataBatchAsync: (requests) => {
        batches.push(requests);
        if (batches.length === 1) return firstBatch.promise;
        return Promise.resolve(
          requests.map(({ worldX, worldY }) => ({
            worldX,
            worldY,
            system: emptySystem,
            phenomenon: {
              exists: false,
              type: null,
              name: null,
              classification: null,
              signal: null,
              char: null,
              colour: null,
              rarity: null,
            },
          }))
        );
      },
      clearCache: () => undefined,
    };
    const generator = {
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
    const service = new HyperspaceSurveyService(generator, provider);

    service.getSurvey(0, 0, 5, 5);
    service.getSurvey(1000, 0, 5, 5);
    service.getSurvey(2000, 0, 5, 5);
    firstBatch.resolve([]);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(batches).toHaveLength(2);
    expect(batches[1].every((request) => request.worldX > 1900)).toBe(true);
  });
});
