import { PRNG } from '../../utils/prng';
import {
  getSurfaceSettlementCell,
  type SurfaceSettlementLayer,
  type SurfaceSettlementSite,
} from './surface_settlements';

export interface SettlementIdentity {
  readonly site: SurfaceSettlementSite;
  readonly name: string;
  readonly classification: string;
  readonly description: string;
  readonly x: number;
  readonly y: number;
}

const NAMES = [
  'Aster',
  'Meridian',
  'Pelagos',
  'Concord',
  'Vesper',
  'Lumen',
  'Faraday',
  'Kepler',
  'Horizon',
  'Sagan',
  'Tycho',
  'Nacre',
];
const IDENTITIES = {
  urban: {
    suffixes: ['Reach', 'Haven', 'Landing', 'Vale'],
    classification: 'Open-air urban settlement',
    description:
      'Low-rise districts and transport corridors occupy prepared ground under managed planetary air.',
  },
  sealed: {
    suffixes: ['Enclave', 'Habitat', 'Shelter', 'Bastion'],
    classification: 'Sealed habitat complex',
    description:
      'Pressure-isolated living modules and protected passages form a compact settlement on hostile ground.',
  },
  industrial: {
    suffixes: ['Works', 'Yard', 'Foundry', 'Complex'],
    classification: 'Industrial settlement',
    description:
      'Processing blocks, service yards and utility corridors form an industrial district with associated habitation.',
  },
} as const;
const catalogs = new WeakMap<SurfaceSettlementLayer, readonly SettlementIdentity[]>();

/** Derives names on an independent identity seed; never consumes terrain or placement randomness. */
export function getSettlementCatalog(
  layer: SurfaceSettlementLayer | null | undefined
): readonly SettlementIdentity[] {
  if (!layer) return [];
  const cached = catalogs.get(layer);
  if (cached) return cached;
  const catalog = layer.sites.map((site, index) => {
    const prng = new PRNG(site.id).seedNew('settlement-identity-v1');
    const identity = IDENTITIES[site.archetype];
    return {
      site,
      // The ordinal distinguishes repeated names in this small local atlas.
      name: `${NAMES[prng.randomInt(0, NAMES.length - 1)]} ${identity.suffixes[prng.randomInt(0, identity.suffixes.length - 1)]} ${String(index + 1).padStart(2, '0')}`,
      classification: identity.classification,
      description: identity.description,
      x: ((Math.floor(site.x) % layer.longitudePeriod) + layer.longitudePeriod) % layer.longitudePeriod,
      y: Math.max(0, Math.min(layer.sourceHeight - 1, Math.floor(site.y))),
    };
  });
  catalogs.set(layer, catalog);
  return catalog;
}

/** Identifies a mapped regional footprint, not a literal building beneath the vehicle. */
export function getSurfaceSettlementIdentity(
  layer: SurfaceSettlementLayer | null | undefined,
  x: number,
  y: number
): SettlementIdentity | undefined {
  if (!layer) return undefined;
  const cell = getSurfaceSettlementCell(layer, x, y);
  return cell ? getSettlementCatalog(layer)[cell.siteIndex] : undefined;
}
