import type { OrbitHost } from './stellar_body';
import { AU_IN_METERS } from '../constants/physics';

/** A named orbital instrument or contractor rendezvous, selectable but never landable. */
export class NavigationMarker {
  readonly type = 'NavigationMarker';
  systemX = 0;
  systemY = 0;

  /** Keeps marker identity and orbit separate from the natural-system generator. */
  constructor(
    readonly id: string,
    readonly name: string,
    readonly kind: 'navigation-buoy' | 'pickup' | 'deployment',
    readonly orbitHost: OrbitHost,
    readonly orbitDistance: number,
    public orbitAngle: number
  ) {}

  /** Describes the instrument without granting planetary discovery or station services. */
  getScanInfo(): string[] {
    return [
      `<h>${this.name}</h>`,
      `Type: <hl>${this.kind === 'navigation-buoy' ? 'Registered navigation buoy' : 'Contractor orbital rendezvous'}</hl>`,
      `Orbit radius: <hl>${(this.orbitDistance / AU_IN_METERS).toFixed(2)} AU</hl>`,
      this.kind === 'navigation-buoy'
        ? 'Operational navigation transmitter / uncrewed / no docking services.'
        : 'Open the heavy-haul manifest to inspect the current transfer stage.',
    ];
  }
}
