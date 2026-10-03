import type { CargoComponent } from '../core/components';
import { CargoSystem } from './cargo_systems';
import type { SpeciesDefinition, SpecimenContainer } from '../entities/biology/biology_types';

/** Returns the visible capability envelope of the fitted ship/portable preservation kit. */
export function stasisCompatibility(species: SpeciesDefinition, equipmentClass: number): string | null {
  if (equipmentClass < 1) return 'No stasis kit fitted';
  const range = equipmentClass >= 2 ? [273, 345, 0.04, 12] : [280, 315, 0.3, 2];
  if (species.temperatureK < range[0] || species.temperatureK > range[1])
    return 'Temperature outside preservation envelope';
  if (species.pressureBar < range[2] || species.pressureBar > range[3])
    return 'Pressure outside preservation envelope';
  if (species.massKg > 80) return 'Beyond rover handling mass';
  return null;
}

/** Manages indivisible biological containers without putting them in commodity stock. */
export class SpecimenCargoSystem {
  private readonly cargo = new CargoSystem();

  /** Returns an expected refusal before any source or carrier is changed. */
  canAdd(hold: CargoComponent, container: SpecimenContainer, equipmentClass: number): string | null {
    if (hold.specimens?.some((item) => item.id === container.id)) return 'Container already aboard';
    if (this.cargo.getTotalUnits(hold) + container.volumeM3 > hold.capacity + 1e-8)
      return 'Insufficient cargo volume';
    if (container.kind === 'live') {
      const incompatibility = stasisCompatibility(container.species, equipmentClass);
      if (incompatibility) return incompatibility;
      if (
        (hold.specimens ?? []).filter((item) => item.kind === 'live').length >= (equipmentClass >= 2 ? 6 : 2)
      )
        return 'All live stasis slots occupied';
    }
    return null;
  }

  /** Stores an entire container after validation; returns a refusal without mutation. */
  add(hold: CargoComponent, container: SpecimenContainer, equipmentClass: number): string | null {
    const refusal = this.canAdd(hold, container, equipmentClass);
    if (refusal) return refusal;
    (hold.specimens ??= []).push(container);
    return null;
  }

  /** Transfers one container atomically, leaving its source unchanged on destination refusal. */
  transfer(
    source: CargoComponent,
    destination: CargoComponent,
    id: string,
    equipmentClass: number
  ): string | null {
    const container = source.specimens?.find((item) => item.id === id);
    if (!container) return 'Container not aboard';
    const refusal = this.canAdd(destination, container, equipmentClass);
    if (refusal) return refusal;
    (destination.specimens ??= []).push(container);
    source.specimens = (source.specimens ?? []).filter((item) => item.id !== id);
    return null;
  }
}
