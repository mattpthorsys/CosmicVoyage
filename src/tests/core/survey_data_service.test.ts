import { describe, expect, it } from 'vitest';
import { Player } from '../../core/player';
import { SurveyDataService } from '../../core/survey_data_service';
import {
  createSurveyDataSnapshot,
  surveyObjectKey,
  SURVEY_RECEIPT_LIMIT,
  SURVEY_EVIDENCE_LIMIT,
  validateSurveyDataSnapshot,
} from '../../core/survey_data_types';
import { parseGameSave, SAVE_GAME_VERSION } from '../../core/save_game';
import { observatoryContactFixture, observatoryObservationFixture } from '../fixtures/observatory';
import { depotContractFixture, depotContractSave } from '../fixtures/depot_contracts';

const address = { worldX: 0, worldY: 0, systemSlot: 0 };

/** Creates two independent sponsors sharing one campaign payment ledger and a real player account. */
function exchangeFixture() {
  const service = new SurveyDataService();
  const player = new Player();
  service.ensureBuyer('depot-a', address);
  service.ensureBuyer('depot-b', { ...address, worldX: 1 });
  return { service, player };
}

describe('astrometric evidence and settlement', () => {
  it('pays a tier once across buyers and only pays the additional value of later improvements', () => {
    const { service, player } = exchangeFixture();
    const key = surveyObjectKey(address, 'stars');
    service.record(address, 'stars', 'Reference', 1, 'remote-spectrum', 0);
    const before = player.resources.credits;
    const first = service.upload(service.quote('depot-a', key)!, player);
    expect(first.ok).toBe(true);
    expect(service.quote('depot-b', key)!.reward).toBe(0);
    expect(service.upload(service.quote('depot-b', key)!, player).ok).toBe(false);
    service.record(address, 'stars', 'Reference', 3, 'local-scan', 1);
    const second = service.upload(service.quote('depot-b', key)!, player);
    expect(second.ok).toBe(true);
    expect(first.credits + second.credits).toBe(40);
    expect(player.resources.credits).toBe(before + 40);
    expect(service.createSnapshot().paid[key]).toBe(3);
  });

  it('refuses stale confirmations and repeated submissions without a second payment', () => {
    const { service, player } = exchangeFixture();
    const key = surveyObjectKey(address, 'stars');
    service.record(address, 'stars', 'Reference', 1, 'remote-spectrum', 0);
    const stale = service.quote('depot-a', key)!;
    service.record(address, 'stars', 'Reference', 2, 'remote-spectrum', 1);
    expect(service.upload(stale, player).ok).toBe(false);
    const current = service.quote('depot-a', key)!;
    expect(service.upload(current, player).ok).toBe(true);
    const after = player.resources.credits;
    expect(service.upload(current, player).ok).toBe(false);
    expect(player.resources.credits).toBe(after);
  });

  it('preserves unpaid observations when funds are insufficient and never resets a visited sponsor', () => {
    const { service, player } = exchangeFixture();
    service.record(address, 'planet:0', 'World', 1, 'orbital-survey', 0);
    const state = service.createSnapshot();
    state.buyers['depot-a'].credits = 1;
    service.restoreSnapshot(state);
    const key = surveyObjectKey(address, 'planet:0');
    const quote = service.quote('depot-a', key)!;
    expect(quote.reason).toContain('funds');
    expect(service.upload(quote, player).ok).toBe(false);
    service.ensureBuyer('depot-a', address);
    expect(service.availableCredits('depot-a')).toBe(1);
    expect(service.createSnapshot().paid[key]).toBeUndefined();
    expect(service.listEvidence()).toHaveLength(1);
  });

  it('rolls back evidence receipts, sponsor funding and player money when checkpointing fails', () => {
    const { service, player } = exchangeFixture();
    service.record(address, 'system', 'Local survey', 1, 'local-scan', 0);
    const before = service.createSnapshot();
    const resources = { ...player.resources };
    const result = service.upload(
      service.quote('depot-a', surveyObjectKey(address, 'system'))!,
      player,
      () => {
        throw new Error('quota');
      }
    );
    expect(result.ok).toBe(false);
    expect(service.createSnapshot()).toEqual(before);
    expect(player.resources).toEqual(resources);
  });

  it('keeps public charts separate from observations and rolls back a failed chart checkpoint', () => {
    const { service } = exchangeFixture();
    expect(service.download(address, 'Public reference', 0)).toBe(true);
    expect(service.listEvidence()).toHaveLength(0);
    expect(service.createSnapshot().paid).toEqual({});
    const before = service.createSnapshot();
    expect(
      service.download({ ...address, worldX: 9 }, 'Other reference', 1, () => {
        throw new Error('quota');
      })
    ).toBe(false);
    expect(service.createSnapshot()).toEqual(before);
  });

  it('retains receipts after detail eviction and reconstructing an already sold observation', () => {
    const { service, player } = exchangeFixture();
    const key = surveyObjectKey(address, 'stars');
    service.record(address, 'stars', 'Reference', 3, 'local-scan', 0);
    service.upload(service.quote('depot-a', key)!, player);
    const state = service.createSnapshot();
    delete state.evidence[key];
    service.restoreSnapshot(state);
    service.record(address, 'stars', 'Reobserved reference', 3, 'local-scan', 1);
    expect(service.quote('depot-b', key)!.reward).toBe(0);
  });

  it('keeps similarly named objects, bodies, companion stars and contact slots distinct', () => {
    const { service } = exchangeFixture();
    service.record(address, 'planet:0', 'Same name', 1, 'orbital-survey', 0);
    service.record({ ...address, worldX: 1 }, 'planet:0', 'Same name', 1, 'orbital-survey', 0);
    service.record({ ...address, systemSlot: 1 }, 'planet:0', 'Same name', 1, 'orbital-survey', 0);
    service.record(address, 'star:A', 'Same name', 3, 'local-scan', 0);
    service.record(address, 'star:B', 'Same name', 3, 'local-scan', 0);
    expect(service.listEvidence()).toHaveLength(5);
  });

  it('requires an actual fitted stellar observation and crosses discrete quality thresholds', () => {
    const { service } = exchangeFixture();
    const contact = observatoryContactFixture();
    service.recordRemote(
      contact,
      observatoryObservationFixture(contact, { equipmentClass: 0, quality: 1 }),
      0
    );
    service.recordRemote(contact, observatoryObservationFixture(contact, { quality: 0.34 }), 0);
    expect(service.listEvidence()).toHaveLength(0);
    for (const quality of [0.35, 0.65, 0.85])
      service.recordRemote(contact, observatoryObservationFixture(contact, { quality }), 0);
    expect(service.listEvidence()[0].evidence.tier).toBe(3);
    service.recordRemote(contact, observatoryObservationFixture(contact, { quality: 0.35 }), 0);
    expect(service.listEvidence()[0].evidence.tier).toBe(3);
  });

  it('bounds frontier premiums even for an arbitrarily remote source', () => {
    const { service } = exchangeFixture();
    const far = { worldX: 100000, worldY: 100000, systemSlot: 0 };
    service.record(far, 'planet:0', 'Remote world', 3, 'sample-analysis', 0);
    expect(service.quote('depot-a', surveyObjectKey(far, 'planet:0'))!.reward).toBe(330);
  });

  it('retains a full receipt ledger, refuses new paid identities and keeps worst-case compact state below 1 MiB', () => {
    const { service, player } = exchangeFixture();
    const state = service.createSnapshot();
    for (let index = 0; index < SURVEY_RECEIPT_LIMIT; index++) {
      const key = surveyObjectKey({ ...address, worldX: index }, 'stars');
      state.paid[key] = index < SURVEY_EVIDENCE_LIMIT ? 3 : 1;
      if (index < SURVEY_EVIDENCE_LIMIT)
        state.evidence[key] = { tier: 3, label: `Reference ${index}`, method: 'local-scan', at: 0 };
    }
    expect(JSON.stringify(state).length).toBeLessThan(1024 * 1024);
    service.restoreSnapshot(state);
    // Already-paid evidence is evictable, but its settlement identity is never removed.
    const fresh = { ...address, worldX: 99999 };
    service.record(fresh, 'stars', 'Fresh contact', 1, 'remote-spectrum', 0);
    const quote = service.quote('depot-a', surveyObjectKey(fresh, 'stars'))!;
    expect(quote.reason).toContain('ledger full');
    expect(service.upload(quote, player).ok).toBe(false);
    expect(Object.keys(service.createSnapshot().paid)).toHaveLength(SURVEY_RECEIPT_LIMIT);
  });

  it('migrates v23 without inventing paid observations and validates current funding identity and provenance', () => {
    const fixture = depotContractFixture();
    const saved = depotContractSave(fixture);
    const { surveyData: _oldData, ...legacy } = saved;
    const migrated = parseGameSave({ ...legacy, version: 23 });
    expect(migrated.version).toBe(SAVE_GAME_VERSION);
    expect(migrated.surveyData).toEqual(createSurveyDataSnapshot());
    const service = new SurveyDataService();
    service.ensureBuyer(fixture.station.id, fixture.address);
    service.record(fixture.address, 'stars', 'Reference', 1, 'remote-spectrum', 0);
    saved.surveyData = service.createSnapshot();
    expect(parseGameSave(saved).surveyData).toEqual(saved.surveyData);
    saved.surveyData.buyers[fixture.station.id].address.worldX++;
    expect(() => parseGameSave(saved)).toThrow('sponsor');
    const invalid = createSurveyDataSnapshot();
    invalid.evidence[surveyObjectKey(address, 'planet:0')] = {
      tier: 1,
      at: 0,
      label: 'Impossible remote survey',
      method: 'remote-spectrum',
    };
    expect(() => validateSurveyDataSnapshot(invalid, 0, {})).toThrow('Remote spectra');
  });
});
