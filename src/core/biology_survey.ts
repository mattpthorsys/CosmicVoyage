import type {
  BiologySite,
  BiosphereDefinition,
  HabitatKind,
  XenobiologySnapshot,
} from '../entities/biology/biology_types';
import { hasDiscoveryLevel, type DiscoveryRecord } from './discovery';

const TERRAIN: Record<HabitatKind, string> = {
  'moist-margin': 'Low-relief land beside surface water',
  'rocky-margin': 'Broken rock beside surface water',
  'sheltered-ground': 'Broken relief with potential shelter',
  'exposed-ground': 'Open, low-relief substrate',
  'upland-ground': 'Elevated, exposed substrate',
};

/** Separates instrument evidence from the generator's knowledge of whether a biosphere exists. */
export function biologySurveySummary(
  discovery: DiscoveryRecord,
  biosphere: BiosphereDefinition | null
): string {
  if (!hasDiscoveryLevel(discovery.level, 'observed')) return 'Biological survey unresolved';
  if (!hasDiscoveryLevel(discovery.level, 'surveyed'))
    return biosphere ? 'Possible biosignatures / survey required' : 'Biological assessment pending survey';
  return biosphere
    ? `${biosphere.origin === 'introduced' ? 'Managed biosphere' : 'Probable native biosignatures'} / B habitats`
    : 'No resolved accessible biosignatures';
}

/** Shows terrain and acquired site evidence without disclosing the site's unobserved species or abundance. */
export function habitatLandingPreview(site: BiologySite, snapshot: XenobiologySnapshot): string[] {
  const field = snapshot.fields[site.id];
  const observed = Object.values(snapshot.evidence).filter((entry) =>
    entry.origins?.some((origin) => origin.surface.siteId === site.id && (origin.level ?? 0) >= 2)
  );
  const analysed = observed.filter((entry) =>
    entry.origins?.some((origin) => origin.surface.siteId === site.id && origin.level === 3)
  );
  return [
    `${site.label}: X${site.x} Y${site.y} / ${field ? 'VISITED' : 'UNVISITED'}`,
    site.habitat ? TERRAIN[site.habitat.kind] : 'Regional terrain profile not recorded',
    `${observed.length} observed taxa / ${analysed.length} analysed here`,
    observed.length ? 'Species records retained in the science log.' : 'Surface investigation required.',
  ];
}

/** Builds a readable planetary planning report from survey progress and saved expedition records. */
export function biologySurveyReport(
  discovery: DiscoveryRecord,
  biosphere: BiosphereDefinition | null,
  snapshot: XenobiologySnapshot,
  environment: { temperatureK: number; pressureBar: number },
  selected?: { x: number; y: number }
): string[] {
  const summary = biologySurveySummary(discovery, biosphere);
  if (!hasDiscoveryLevel(discovery.level, 'surveyed')) return [summary];
  if (!biosphere) return [summary, 'This does not rule out microscopic, buried or inaccessible life.'];
  const lines = [
    summary,
    'Orbital signatures are not species identification or proof of ancestry.',
    `Planetary mean: ${environment.temperatureK.toFixed(0)} K / surface pressure ${environment.pressureBar.toFixed(2)} bar. Local conditions can differ.`,
  ];
  const landing = selected && biosphere.sites.find((site) => site.x === selected.x && site.y === selected.y);
  if (landing) lines.push('SELECTED LANDING HABITAT', ...habitatLandingPreview(landing, snapshot), '');
  for (const site of biosphere.sites) lines.push(...habitatLandingPreview(site, snapshot), '');
  lines.push(
    biosphere.sites.length
      ? 'B cycles surveyed accessible habitat coordinates; Enter confirms landing.'
      : 'Accessible habitat coordinates pending terrain preparation.'
  );
  return lines;
}
