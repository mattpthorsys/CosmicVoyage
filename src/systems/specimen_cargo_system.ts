import type { CargoComponent } from '../core/components';
import { CargoSystem } from './cargo_systems';
import type {
  SpeciesDefinition,
  SpecimenContainer,
  IndividualMineralisation,
} from '../entities/biology/biology_types';
import { individualPhysicalProfile } from '../entities/biology/biology_rules';
import { preservationKit } from '../entities/biology/preservation';
import { propagulePreservationProfile, supportsPropagules } from '../entities/biology/propagules';

/** Checks the reproductive batch rather than applying whole-parent mass/substrate requirements. */
export function propaguleCompatibility(species: SpeciesDefinition, equipmentClass: number): string | null {
  if (!supportsPropagules(species)) return 'No verified viable propagule profile';
  return stasisCompatibility(propagulePreservationProfile(species), equipmentClass);
}

/** Both live organisms and viable reproductive batches occupy one finite preservation slot. */
export function needsStasis(container: SpecimenContainer): boolean {
  return container.kind === 'live' || container.kind === 'propagule';
}

/** Returns the visible capability envelope of the fitted ship/portable preservation kit. */
export function stasisCompatibility(
  species: SpeciesDefinition,
  equipmentClass: number,
  sizeScale = 1,
  mineralisation?: IndividualMineralisation
): string | null {
  const kit = preservationKit(equipmentClass);
  if (!kit) return 'No stasis kit fitted';
  if (!kit.solvents.includes(species.preservation?.solvent ?? 'water'))
    return 'Solvent chemistry unsupported by fitted preservation kit';
  if (species.temperatureK < kit.temperatureK[0] || species.temperatureK > kit.temperatureK[1])
    return 'Temperature outside preservation envelope';
  if (species.pressureBar < kit.pressureBar[0] || species.pressureBar > kit.pressureBar[1])
    return 'Pressure outside preservation envelope';
  if (species.preservation?.retainsSubstrate && !kit.retainsSubstrate)
    return 'Pressure-preserving cradle required: retain isolated native substrate';
  if (individualPhysicalProfile(species, sizeScale, mineralisation).massKg > 80)
    return 'Beyond rover handling mass (80 kg)';
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
    if (
      (container.kind === 'live' || container.kind === 'dead') &&
      individualPhysicalProfile(container.species, container.sizeScale, container.mineralisation).massKg > 80
    )
      return 'Whole specimen exceeds rover handling mass (80 kg); tissue remains obtainable';
    if (needsStasis(container)) {
      const incompatibility =
        container.kind === 'propagule'
          ? propaguleCompatibility(container.species, equipmentClass)
          : stasisCompatibility(
              container.species,
              equipmentClass,
              container.sizeScale,
              container.mineralisation
            );
      if (incompatibility) return incompatibility;
      if (
        (hold.specimens ?? []).filter(needsStasis).length >= (preservationKit(equipmentClass)?.liveSlots ?? 0)
      )
        return 'All live stasis slots occupied (organisms and viable propagules)';
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
