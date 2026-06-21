import { describe, expect, it } from 'vitest';
import {
  applyShipDamage,
  createDefaultShipModifications,
  createShipyardUpgradeOptions,
  getAvailableCargoPodBays,
  getEngineFuelUseMultiplier,
  getShipDamageSummary,
  getShipCargoCapacity,
  getShipDerivedStats,
  getShipRepairCost,
  getStarbaseShipyardProfile,
  installShipyardUpgrade,
} from '../../../core/ship_modifications';

describe('ship modifications', () => {
  it('creates the default survey superstructure and starter fittings', () => {
    const ship = createDefaultShipModifications();

    expect(ship.superstructure.engineMounts).toBe(1);
    expect(ship.superstructure.shieldMounts).toBe(1);
    expect(ship.superstructure.laserMounts).toBe(1);
    expect(ship.superstructure.missileBayMounts).toBe(1);
    expect(ship.superstructure.specialPurposeBays).toBe(4);
    expect(ship.superstructure.landingBays).toBe(1);
    expect(ship.superstructure.probeBays).toBe(3);
    expect(ship.superstructure.cargoBays).toBe(16);
    expect(ship.cargoPodsInstalled).toBe(4);
    expect(ship.surveyEquipmentClass).toBe(1);
    expect(getShipCargoCapacity(ship)).toBe(100);
    expect(ship.missileCount).toBe(5);
    expect(ship.shieldClass).toBe(0);
    expect(ship.laserClass).toBe(0);
    expect(getShipDerivedStats(ship)).toMatchObject({
      cargoCapacity: 100,
      emptyCargoBays: 12,
      shieldRating: 0,
      laserRating: 0,
      missileCapacity: 10,
      missileLoadPercent: 50,
      probeCapacity: 3,
      emptyProbeBays: 3,
      specialBayCapacity: 4,
      emptySpecialPurposeBays: 3,
      landingBayCapacity: 1,
      sensorRating: 25,
    });
  });

  it('makes lower engine classes consume more interstellar fuel without changing drive class speed', () => {
    expect(getEngineFuelUseMultiplier(1)).toBeGreaterThan(getEngineFuelUseMultiplier(3));
    expect(getEngineFuelUseMultiplier(3)).toBeGreaterThan(getEngineFuelUseMultiplier(5));
    expect(getEngineFuelUseMultiplier(0)).toBe(getEngineFuelUseMultiplier(1));
    expect(getEngineFuelUseMultiplier(9)).toBe(getEngineFuelUseMultiplier(5));
  });

  it('installs cargo pods, shields, lasers, and missiles within superstructure limits', () => {
    const ship = createDefaultShipModifications();

    expect(installShipyardUpgrade(ship, 'shipyard:cargo-pod')).toContain('Installed cargo pod');
    expect(ship.cargoPodsInstalled).toBe(5);
    expect(getShipCargoCapacity(ship)).toBe(125);

    expect(installShipyardUpgrade(ship, 'shipyard:shield:3')).toBe('Installed Shield Class 3.');
    expect(ship.shieldClass).toBe(3);
    expect(installShipyardUpgrade(ship, 'shipyard:laser:2')).toBe('Installed Laser Class 2.');
    expect(ship.laserClass).toBe(2);
    expect(installShipyardUpgrade(ship, 'shipyard:missile')).toContain('Loaded nuclear missile');
    expect(ship.missileCount).toBe(6);
    expect(installShipyardUpgrade(ship, 'shipyard:survey:3')).toBe('Installed Survey Suite Class 3.');
    expect(ship.surveyEquipmentClass).toBe(3);

    const stats = getShipDerivedStats(ship);
    expect(stats.cargoCapacity).toBe(125);
    expect(stats.shieldRating).toBeGreaterThan(0);
    expect(stats.laserRating).toBeGreaterThan(0);
    expect(stats.driveEfficiencyPercent).toBeGreaterThanOrEqual(65);
    expect(stats.sensorRating).toBe(75);
  });

  it('marks unavailable shipyard upgrades disabled', () => {
    const ship = createDefaultShipModifications();
    ship.shieldClass = 2;
    ship.cargoPodsInstalled = 16;

    const options = createShipyardUpgradeOptions(ship);

    expect(getAvailableCargoPodBays(ship)).toBe(0);
    expect(options.find((option) => option.id === 'shipyard:cargo-pod')?.disabled).toBe(true);
    expect(options.find((option) => option.id === 'shipyard:shield:1')?.disabled).toBe(true);
    expect(options.find((option) => option.id === 'shipyard:shield:3')?.disabled).toBe(false);
  });

  it('derives deterministic starbase shipyard availability from station identity', () => {
    const ship = createDefaultShipModifications();
    const frontier = getStarbaseShipyardProfile('Frontier Test Starbase Delta');
    const repeated = getStarbaseShipyardProfile('Frontier Test Starbase Delta');

    expect(repeated).toEqual(frontier);
    const options = createShipyardUpgradeOptions(ship, {
      ...frontier,
      maxShieldClass: 1,
      maxLaserClass: 1,
      sellsMissiles: false,
    });
    expect(options.find((option) => option.id === 'shipyard:missile')?.disabled).toBe(true);
    expect(options.find((option) => option.id === 'shipyard:shield:2')?.disabled).toBe(true);
    expect(options.find((option) => option.id === 'shipyard:laser:1')?.disabled).toBe(false);
  });

  it('tracks hull and subsystem damage and repairs it through shipyard orders', () => {
    const ship = createDefaultShipModifications();

    expect(applyShipDamage(ship, 12, 'drive')).toContain('Drive affected');
    expect(ship.damage.hullIntegrity).toBe(88);
    expect(getShipDerivedStats(ship).driveEfficiencyPercent).toBeLessThan(100);
    expect(getShipDamageSummary(ship)).toContain('Drive');
    expect(getShipRepairCost(ship)).toBeGreaterThan(0);

    const repair = createShipyardUpgradeOptions(ship).find((option) => option.id === 'shipyard:repair');
    expect(repair?.disabled).toBe(false);
    expect(installShipyardUpgrade(ship, 'shipyard:repair')).toBe('Hull and subsystem damage repaired.');
    expect(ship.damage.hullIntegrity).toBe(100);
    expect(getShipRepairCost(ship)).toBe(0);
  });
});
