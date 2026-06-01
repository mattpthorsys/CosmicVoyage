export type ShipMountKind = 'engine' | 'shield' | 'laser' | 'missileBay' | 'special' | 'landing' | 'probe' | 'cargo';

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

export const SHIELD_CLASS_COSTS = [0, 900, 2200, 4800, 9500, 18000];
export const LASER_CLASS_COSTS = [0, 700, 1800, 3900, 7600, 14500];
export const NUCLEAR_MISSILE_COST = 250;
export const CARGO_POD_COST = 650;
export const DEFAULT_CARGO_POD_CAPACITY = 25;

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
  };
}

export function getShipCargoCapacity(ship: ShipModificationState): number {
  return ship.cargoPodsInstalled * ship.cargoPodCapacity;
}

export function getAvailableCargoPodBays(ship: ShipModificationState): number {
  return Math.max(0, ship.superstructure.cargoBays - ship.cargoPodsInstalled);
}

export function createShipyardUpgradeOptions(ship: ShipModificationState): ShipyardUpgradeOption[] {
  const options: ShipyardUpgradeOption[] = [
    {
      id: 'shipyard:missile',
      label: 'Nuclear missile',
      cost: NUCLEAR_MISSILE_COST,
      eta: 'Now',
      workOrder: `${ship.missileCount}/${ship.missileCapacity} missile magazine`,
      detail: 'Purchase one nuclear-tipped ship missile for the existing missile bay magazine.',
      disabled: ship.missileCount >= ship.missileCapacity,
    },
    {
      id: 'shipyard:cargo-pod',
      label: 'Cargo pod',
      cost: CARGO_POD_COST,
      eta: '2h',
      workOrder: `${ship.cargoPodsInstalled}/${ship.superstructure.cargoBays} cargo bays fitted`,
      detail: `Install one ${ship.cargoPodCapacity} m^3 modular cargo pod into an empty cargo bay.`,
      disabled: getAvailableCargoPodBays(ship) <= 0,
    },
  ];

  for (let shipClass = 1; shipClass <= 5; shipClass++) {
    options.push({
      id: `shipyard:shield:${shipClass}`,
      label: `Shield Class ${shipClass}`,
      cost: SHIELD_CLASS_COSTS[shipClass],
      eta: `${shipClass + 1}h`,
      workOrder: ship.shieldClass >= shipClass ? 'Installed or superseded' : 'Install shield generator',
      detail: `Class ${shipClass} defensive shield generator. Higher classes draw more power but absorb more damage.`,
      disabled: ship.shieldClass >= shipClass,
    });
  }

  for (let shipClass = 1; shipClass <= 5; shipClass++) {
    options.push({
      id: `shipyard:laser:${shipClass}`,
      label: `Laser Class ${shipClass}`,
      cost: LASER_CLASS_COSTS[shipClass],
      eta: `${shipClass + 1}h`,
      workOrder: ship.laserClass >= shipClass ? 'Installed or superseded' : 'Install laser emitter',
      detail: `Class ${shipClass} ship laser. Higher classes improve sustained beam output and combat reach.`,
      disabled: ship.laserClass >= shipClass,
    });
  }

  return options;
}

export function installShipyardUpgrade(ship: ShipModificationState, optionId: string): string {
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
