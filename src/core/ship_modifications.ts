export type ShipMountKind =
  | 'engine'
  | 'shield'
  | 'laser'
  | 'missileBay'
  | 'special'
  | 'landing'
  | 'probe'
  | 'cargo';
export type ShipDamageSubsystem =
  | 'drive'
  | 'shield'
  | 'laser'
  | 'missileBay'
  | 'cargoBay'
  | 'probeBay'
  | 'landingBay'
  | 'specialBay';
export type ShipyardKind = 'frontier' | 'commercial' | 'industrial' | 'research' | 'naval';

export interface ShipSuperstructure {
  name: string;
  engineMounts: number;
  shieldMounts: number;
  laserMounts: number;
  missileBayMounts: number;
  specialPurposeBays: number;
  landingBays: number;
  probeBays: number;
  cargoBays: number;
}

export interface ShipDamageState {
  hullIntegrity: number;
  maxHullIntegrity: number;
  subsystemDamage: Partial<Record<ShipDamageSubsystem, number>>;
}

export interface ShipModificationState {
  superstructure: ShipSuperstructure;
  engineClass: number;
  shieldClass: number;
  laserClass: number;
  missileCount: number;
  missileCapacity: number;
  cargoPodsInstalled: number;
  cargoPodCapacity: number;
  probeBaysOccupied: number;
  specialBaysOccupied: number;
  damage: ShipDamageState;
}

export interface ShipDerivedStats {
  cargoCapacity: number;
  emptyCargoBays: number;
  shieldRating: number;
  laserRating: number;
  missileCapacity: number;
  missileLoadPercent: number;
  probeCapacity: number;
  emptyProbeBays: number;
  specialBayCapacity: number;
  emptySpecialPurposeBays: number;
  landingBayCapacity: number;
  driveEfficiencyPercent: number;
  fittedLoadPercent: number;
  hullIntegrityPercent: number;
  damagedSubsystemCount: number;
}

export interface ShipyardUpgradeOption {
  id: string;
  label: string;
  cost: number;
  eta: string;
  workOrder: string;
  detail: string;
  disabled?: boolean;
}

export interface StarbaseShipyardProfile {
  kind: ShipyardKind;
  label: string;
  maxShieldClass: number;
  maxLaserClass: number;
  sellsMissiles: boolean;
  sellsCargoPods: boolean;
  repairQuality: 'patch' | 'standard' | 'full';
}

export const SHIELD_CLASS_COSTS = [0, 900, 2200, 4800, 9500, 18000];
export const LASER_CLASS_COSTS = [0, 700, 1800, 3900, 7600, 14500];
export const NUCLEAR_MISSILE_COST = 250;
export const CARGO_POD_COST = 650;
export const DEFAULT_CARGO_POD_CAPACITY = 25;
export const HULL_REPAIR_COST_PER_POINT = 12;
export const SUBSYSTEM_REPAIR_COST_PER_POINT = 18;

/** Returns engine fuel use multiplier. */
export function getEngineFuelUseMultiplier(engineClass: number): number {
  const normalizedClass = Math.max(1, Math.min(5, Math.round(engineClass)));
  const multipliers = [0, 1.4, 1.15, 1.0, 0.85, 0.72];
  return multipliers[normalizedClass] ?? 1.4;
}

/** Creates default ship modifications. */
export function createDefaultShipModifications(): ShipModificationState {
  const superstructure: ShipSuperstructure = {
    name: 'Survey Superstructure I',
    engineMounts: 1,
    shieldMounts: 1,
    laserMounts: 1,
    missileBayMounts: 1,
    specialPurposeBays: 4,
    landingBays: 1,
    probeBays: 3,
    cargoBays: 16,
  };
  return {
    superstructure,
    engineClass: 1,
    shieldClass: 0,
    laserClass: 0,
    missileCount: 5,
    missileCapacity: 10,
    cargoPodsInstalled: 4,
    cargoPodCapacity: DEFAULT_CARGO_POD_CAPACITY,
    probeBaysOccupied: 0,
    specialBaysOccupied: 0,
    damage: {
      hullIntegrity: 100,
      maxHullIntegrity: 100,
      subsystemDamage: {},
    },
  };
}

/** Returns ship cargo capacity. */
export function getShipCargoCapacity(ship: ShipModificationState): number {
  return ship.cargoPodsInstalled * ship.cargoPodCapacity;
}

/** Returns available cargo pod bays. */
export function getAvailableCargoPodBays(ship: ShipModificationState): number {
  return Math.max(0, ship.superstructure.cargoBays - ship.cargoPodsInstalled);
}

/** Returns subsystem damage. */
export function getSubsystemDamage(ship: ShipModificationState, subsystem: ShipDamageSubsystem): number {
  return Math.max(0, Math.min(100, Math.round(ship.damage.subsystemDamage[subsystem] ?? 0)));
}

/** Returns ship repair cost. */
export function getShipRepairCost(ship: ShipModificationState): number {
  const hullDamage = Math.max(0, ship.damage.maxHullIntegrity - ship.damage.hullIntegrity);
  const subsystemDamage = Object.values(ship.damage.subsystemDamage).reduce(
    (sum, damage) => sum + Math.max(0, damage ?? 0),
    0
  );
  return Math.ceil(
    hullDamage * HULL_REPAIR_COST_PER_POINT + subsystemDamage * SUBSYSTEM_REPAIR_COST_PER_POINT
  );
}

/** Returns ship damage summary. */
export function getShipDamageSummary(ship: ShipModificationState): string {
  const damaged = Object.entries(ship.damage.subsystemDamage)
    .filter(([, damage]) => (damage ?? 0) > 0)
    .map(
      ([subsystem, damage]) =>
        `${formatSubsystemLabel(subsystem as ShipDamageSubsystem)} ${Math.round(damage ?? 0)}%`
    );
  const hull = `${Math.round(ship.damage.hullIntegrity)}/${ship.damage.maxHullIntegrity} hull`;
  return damaged.length > 0 ? `${hull}; ${damaged.join(', ')}` : `${hull}; no subsystem damage`;
}

/** Applies ship damage. */
export function applyShipDamage(
  ship: ShipModificationState,
  amount: number,
  subsystem?: ShipDamageSubsystem
): string {
  const damage = Math.max(0, Math.round(amount));
  if (damage <= 0) return 'No ship damage registered.';
  ship.damage.hullIntegrity = Math.max(0, ship.damage.hullIntegrity - damage);
  if (subsystem) {
    ship.damage.subsystemDamage[subsystem] = Math.min(
      100,
      getSubsystemDamage(ship, subsystem) + Math.ceil(damage * 1.5)
    );
  }
  return `Ship damage recorded: ${damage} hull${subsystem ? `, ${formatSubsystemLabel(subsystem)} affected` : ''}.`;
}

/** Repairs ship damage using the supplied repair capacity. */
export function repairShipDamage(ship: ShipModificationState): string {
  const cost = getShipRepairCost(ship);
  if (cost <= 0) return 'No ship damage requires repair.';
  ship.damage.hullIntegrity = ship.damage.maxHullIntegrity;
  ship.damage.subsystemDamage = {};
  return 'Hull and subsystem damage repaired.';
}

/** Returns ship derived stats. */
export function getShipDerivedStats(ship: ShipModificationState): ShipDerivedStats {
  const superstructure = ship.superstructure;
  const occupiedMounts =
    Math.min(superstructure.engineMounts, ship.engineClass > 0 ? 1 : 0) +
    Math.min(superstructure.shieldMounts, ship.shieldClass > 0 ? 1 : 0) +
    Math.min(superstructure.laserMounts, ship.laserClass > 0 ? 1 : 0) +
    Math.min(superstructure.missileBayMounts, ship.missileCapacity > 0 ? 1 : 0) +
    Math.min(superstructure.specialPurposeBays, ship.specialBaysOccupied) +
    Math.min(superstructure.probeBays, ship.probeBaysOccupied) +
    Math.min(superstructure.cargoBays, ship.cargoPodsInstalled);
  const totalMounts =
    superstructure.engineMounts +
    superstructure.shieldMounts +
    superstructure.laserMounts +
    superstructure.missileBayMounts +
    superstructure.specialPurposeBays +
    superstructure.probeBays +
    superstructure.cargoBays;
  const fittedLoadPercent = totalMounts > 0 ? Math.round((occupiedMounts / totalMounts) * 100) : 0;
  const shieldRating = applyDamagePenalty(
    ship.shieldClass > 0 ? ship.shieldClass * ship.shieldClass * 12 : 0,
    getSubsystemDamage(ship, 'shield')
  );
  const laserRating = applyDamagePenalty(
    ship.laserClass > 0 ? ship.laserClass * ship.laserClass * 10 : 0,
    getSubsystemDamage(ship, 'laser')
  );
  const payloadDrag = Math.round(fittedLoadPercent * 0.18);
  const engineBonus = Math.max(0, ship.engineClass - 1) * 8;
  const driveDamage = getSubsystemDamage(ship, 'drive');
  const damagedSubsystemCount = Object.values(ship.damage.subsystemDamage).filter(
    (damage) => (damage ?? 0) > 0
  ).length;

  return {
    cargoCapacity: getShipCargoCapacity(ship),
    emptyCargoBays: getAvailableCargoPodBays(ship),
    shieldRating,
    laserRating,
    missileCapacity: ship.missileCapacity,
    missileLoadPercent:
      ship.missileCapacity > 0 ? Math.round((ship.missileCount / ship.missileCapacity) * 100) : 0,
    probeCapacity: superstructure.probeBays,
    emptyProbeBays: Math.max(0, superstructure.probeBays - ship.probeBaysOccupied),
    specialBayCapacity: superstructure.specialPurposeBays,
    emptySpecialPurposeBays: Math.max(0, superstructure.specialPurposeBays - ship.specialBaysOccupied),
    landingBayCapacity: superstructure.landingBays,
    driveEfficiencyPercent: applyDamagePenalty(
      Math.max(65, Math.min(125, 100 + engineBonus - payloadDrag)),
      driveDamage
    ),
    fittedLoadPercent,
    hullIntegrityPercent:
      ship.damage.maxHullIntegrity > 0
        ? Math.round((ship.damage.hullIntegrity / ship.damage.maxHullIntegrity) * 100)
        : 0,
    damagedSubsystemCount,
  };
}

/** Returns starbase shipyard profile. */
export function getStarbaseShipyardProfile(starbaseName: string): StarbaseShipyardProfile {
  const hash = hashString(starbaseName);
  const kindIndex = Math.abs(hash) % 100;
  if (kindIndex < 18) {
    return {
      kind: 'frontier',
      label: 'Frontier Yard',
      maxShieldClass: 1,
      maxLaserClass: 1,
      sellsMissiles: true,
      sellsCargoPods: true,
      repairQuality: 'patch',
    };
  }
  if (kindIndex < 46) {
    return {
      kind: 'commercial',
      label: 'Commercial Yard',
      maxShieldClass: 2,
      maxLaserClass: 2,
      sellsMissiles: true,
      sellsCargoPods: true,
      repairQuality: 'standard',
    };
  }
  if (kindIndex < 70) {
    return {
      kind: 'industrial',
      label: 'Industrial Yard',
      maxShieldClass: 4,
      maxLaserClass: 3,
      sellsMissiles: true,
      sellsCargoPods: true,
      repairQuality: 'full',
    };
  }
  if (kindIndex < 88) {
    return {
      kind: 'research',
      label: 'Research Yard',
      maxShieldClass: 4,
      maxLaserClass: 2,
      sellsMissiles: false,
      sellsCargoPods: true,
      repairQuality: 'standard',
    };
  }
  return {
    kind: 'naval',
    label: 'Naval Yard',
    maxShieldClass: 5,
    maxLaserClass: 5,
    sellsMissiles: true,
    sellsCargoPods: false,
    repairQuality: 'full',
  };
}

/** Creates shipyard upgrade options. */
export function createShipyardUpgradeOptions(
  ship: ShipModificationState,
  profile: StarbaseShipyardProfile = getStarbaseShipyardProfile('default shipyard')
): ShipyardUpgradeOption[] {
  const repairCost = getShipRepairCost(ship);
  const options: ShipyardUpgradeOption[] = [
    {
      id: 'shipyard:repair',
      label: 'Damage repair',
      cost: repairCost,
      eta: profile.repairQuality === 'patch' ? '6h' : profile.repairQuality === 'standard' ? '4h' : '2h',
      workOrder:
        repairCost > 0
          ? `${getShipDamageSummary(ship)}; ${profile.label.toLowerCase()} crews assigned`
          : 'Hull and subsystems nominal',
      detail:
        repairCost > 0
          ? `Repair hull and subsystem damage. ${profile.label} repair quality: ${profile.repairQuality}.`
          : 'No repair work is currently required.',
      disabled: repairCost <= 0,
    },
    {
      id: 'shipyard:missile',
      label: 'Nuclear missile',
      cost: NUCLEAR_MISSILE_COST,
      eta: 'Now',
      workOrder: profile.sellsMissiles
        ? `${ship.missileCount}/${ship.missileCapacity} missile magazine`
        : `${profile.label} has no missile locker`,
      detail: profile.sellsMissiles
        ? 'Purchase one nuclear-tipped ship missile for the existing missile bay magazine.'
        : 'This station is not licensed or equipped to sell nuclear-tipped missiles.',
      disabled: !profile.sellsMissiles || ship.missileCount >= ship.missileCapacity,
    },
    {
      id: 'shipyard:cargo-pod',
      label: 'Cargo pod',
      cost: CARGO_POD_COST,
      eta: '2h',
      workOrder: profile.sellsCargoPods
        ? `${ship.cargoPodsInstalled}/${ship.superstructure.cargoBays} cargo bays fitted`
        : `${profile.label} does not stock pod frames`,
      detail: profile.sellsCargoPods
        ? `Install one ${ship.cargoPodCapacity} m^3 modular cargo pod into an empty cargo bay.`
        : 'This station cannot supply standard cargo pod frames.',
      disabled: !profile.sellsCargoPods || getAvailableCargoPodBays(ship) <= 0,
    },
  ];

  for (let shipClass = 1; shipClass <= 5; shipClass++) {
    const available = shipClass <= profile.maxShieldClass;
    options.push({
      id: `shipyard:shield:${shipClass}`,
      label: `Shield Class ${shipClass}`,
      cost: SHIELD_CLASS_COSTS[shipClass],
      eta: `${shipClass + 1}h`,
      workOrder: available
        ? ship.shieldClass >= shipClass
          ? 'Installed or superseded'
          : 'Install shield generator'
        : `${profile.label} max shield class ${profile.maxShieldClass}`,
      detail: available
        ? `Class ${shipClass} defensive shield generator. Higher classes draw more power but absorb more damage.`
        : `This ${profile.label.toLowerCase()} cannot fit or certify Shield Class ${shipClass}.`,
      disabled: !available || ship.shieldClass >= shipClass,
    });
  }

  for (let shipClass = 1; shipClass <= 5; shipClass++) {
    const available = shipClass <= profile.maxLaserClass;
    options.push({
      id: `shipyard:laser:${shipClass}`,
      label: `Laser Class ${shipClass}`,
      cost: LASER_CLASS_COSTS[shipClass],
      eta: `${shipClass + 1}h`,
      workOrder: available
        ? ship.laserClass >= shipClass
          ? 'Installed or superseded'
          : 'Install laser emitter'
        : `${profile.label} max laser class ${profile.maxLaserClass}`,
      detail: available
        ? `Class ${shipClass} ship laser. Higher classes improve sustained beam output and combat reach.`
        : `This ${profile.label.toLowerCase()} cannot fit or certify Laser Class ${shipClass}.`,
      disabled: !available || ship.laserClass >= shipClass,
    });
  }

  return options;
}

/** Applies a purchased shipyard upgrade to the ship. */
export function installShipyardUpgrade(ship: ShipModificationState, optionId: string): string {
  if (optionId === 'shipyard:repair') {
    return repairShipDamage(ship);
  }
  if (optionId === 'shipyard:missile') {
    if (ship.missileCount >= ship.missileCapacity) return 'Missile magazine is already full.';
    ship.missileCount += 1;
    return `Loaded nuclear missile ${ship.missileCount}/${ship.missileCapacity}.`;
  }
  if (optionId === 'shipyard:cargo-pod') {
    if (getAvailableCargoPodBays(ship) <= 0) return 'All cargo bays already have cargo pods.';
    ship.cargoPodsInstalled += 1;
    return `Installed cargo pod ${ship.cargoPodsInstalled}/${ship.superstructure.cargoBays}.`;
  }
  const shieldMatch = optionId.match(/^shipyard:shield:(\d)$/);
  if (shieldMatch) {
    const shipClass = Number(shieldMatch[1]);
    if (shipClass < 1 || shipClass > 5) return 'Unsupported shield class.';
    if (ship.shieldClass >= shipClass) return `Shield Class ${ship.shieldClass} is already installed.`;
    ship.shieldClass = shipClass;
    return `Installed Shield Class ${shipClass}.`;
  }
  const laserMatch = optionId.match(/^shipyard:laser:(\d)$/);
  if (laserMatch) {
    const shipClass = Number(laserMatch[1]);
    if (shipClass < 1 || shipClass > 5) return 'Unsupported laser class.';
    if (ship.laserClass >= shipClass) return `Laser Class ${ship.laserClass} is already installed.`;
    ship.laserClass = shipClass;
    return `Installed Laser Class ${shipClass}.`;
  }
  return 'Shipyard order unavailable.';
}

/** Applies damage penalty. */
function applyDamagePenalty(value: number, damagePercent: number): number {
  return Math.max(0, Math.round(value * (1 - Math.max(0, Math.min(95, damagePercent)) / 100)));
}

/** Formats subsystem label. */
function formatSubsystemLabel(subsystem: ShipDamageSubsystem): string {
  return subsystem.replace(/([A-Z])/g, ' $1').replace(/^./, (first) => first.toUpperCase());
}

/** Returns whether h string is present. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}
