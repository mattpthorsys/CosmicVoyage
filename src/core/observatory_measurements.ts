import { AU_IN_METERS, SOLAR_LUMINOSITY_W } from '../constants/physics';
import type { SolarSystem } from '../entities/solar_system';
import type { Planet } from '../entities/planet';
import { createBiologyEnvironment, generateBiosphere } from '../entities/biology/biosphere_generator';
import { PRNG } from '../utils/prng';
import {
  observatoryDistanceLy,
  type ObservatoryCapabilities,
  type ObservatoryContact,
  type ObservatoryObservation,
} from './observatory_types';

interface PlanetaryMeasurement {
  planet: Planet;
  path: string;
  quality: number;
  score: number;
  features: string[];
  managed: boolean;
}

/** Converts canonical physical inputs into evidence; it never changes atmospheres or exposes species. */
export function measureObservatoryContact(
  contact: ObservatoryContact,
  system: SolarSystem | null,
  capabilities: ObservatoryCapabilities,
  x: number,
  y: number,
  mediumEfficiency: number,
  exposure: number
): ObservatoryObservation {
  const rangeLy = observatoryDistanceLy(x, y, contact);
  const record: ObservatoryObservation = {
    address: { worldX: contact.worldX, worldY: contact.worldY, systemSlot: contact.systemSlot },
    quality: 0,
    biology: 'unmeasured',
    technology: 'unmeasured',
    origin: 'unknown',
    features: [],
    bodyName: null,
    bodyPath: null,
    observedFromX: x,
    observedFromY: y,
    rangeLy,
    equipmentClass: capabilities.equipmentClass,
    exposure: Math.max(0, Math.min(3, exposure)),
  };
  if (!capabilities.equipmentClass) {
    record.features = ['Planetary spectroscopy requires an Observatory Suite.'];
    return record;
  }
  const radioReach = capabilities.contactRadiusLy * mediumEfficiency;
  record.technology = rangeLy <= radioReach ? 'no-signal' : 'unmeasured';
  if (contact.kind === 'signal' && rangeLy <= radioReach) {
    record.quality = Math.min(capabilities.qualityCeiling, 0.65 + capabilities.equipmentClass * 0.08);
    record.technology = 'unidentified';
    record.features = [
      'Narrowband source; no matching human beacon registry.',
      contact.phenomenon?.signal ?? 'Repeating emission detected.',
      'Artificial-source candidate; age and origin unestablished.',
    ];
    return record;
  }
  if (!system) return record;
  if (system.stations.length && rangeLy <= radioReach) {
    record.technology = 'registered';
    record.features.push(`Registered facility carrier: ${system.stations[0].name}`);
  }
  const spectroscopyReach = capabilities.atmosphericRadiusLy * mediumEfficiency;
  if (rangeLy > spectroscopyReach || spectroscopyReach <= 0) {
    record.biology = 'insufficient';
    record.features.push('Planetary spectra below useful sensitivity at this distance.');
    return record;
  }
  const measurements: PlanetaryMeasurement[] = [];
  system.planets.forEach((planet, index) => {
    if (!planet) return;
    measurements.push(
      measurePlanet(
        planet,
        `planet:${index}`,
        planet.orbitDistance,
        system,
        capabilities,
        rangeLy,
        mediumEfficiency,
        exposure
      )
    );
    planet.moons.forEach((moon, moonIndex) =>
      measurements.push(
        measurePlanet(
          moon,
          `planet:${index}/moon:${moonIndex}`,
          planet.orbitDistance,
          system,
          capabilities,
          rangeLy,
          mediumEfficiency,
          exposure
        )
      )
    );
  });
  // Prefer the strongest interpretable evidence, not simply the first planet or a hidden life flag.
  measurements.sort((a, b) => b.score - a.score || b.quality - a.quality);
  const best = measurements[0];
  if (!best || best.quality < 0.12) {
    record.biology = 'insufficient';
    record.features.push('No usable terrestrial atmospheric spectrum resolved.');
    return record;
  }
  record.quality = best.quality;
  record.features.push(...best.features);
  record.bodyName = best.quality >= 0.48 ? best.planet.name : null;
  record.bodyPath = best.quality >= 0.48 ? best.path : null;
  record.biology =
    best.score >= 0.64 && best.quality >= 0.65 ? 'strong' : best.score >= 0.24 ? 'candidate' : 'no-signal';
  // Introduced life is catalogue knowledge only where an actual registered colony exists.
  if (best.managed && record.technology === 'registered') {
    record.biology = 'catalogued';
    record.origin = 'managed';
    record.features.push('Registry identifies an established managed biosphere.');
  } else if (record.biology === 'candidate' || record.biology === 'strong')
    record.features.push('Abiotic alternatives remain; orbital follow-up recommended.');
  else record.features.push('No diagnostic signal above sensitivity; biology is not excluded.');
  return record;
}

/** Approximates spectroscopy and reflectance sensitivity without expensive line-by-line radiative transfer. */
function measurePlanet(
  planet: Planet,
  path: string,
  hostSeparationM: number,
  system: SolarSystem,
  capabilities: ObservatoryCapabilities,
  rangeLy: number,
  mediumEfficiency: number,
  exposure: number
): PlanetaryMeasurement {
  const environment = createBiologyEnvironment(planet, system, path);
  const atmosphere = planet.effectiveAtmosphere;
  const gas = atmosphere.composition;
  const radiusEarth = planet.diameter / 12_742_000;
  const stellarLuminosity =
    system.stars.reduce((sum, star) => sum + star.luminosityW, 0) / SOLAR_LUMINOSITY_W;
  const separationAu = Math.max(0.01, hostSeparationM / AU_IN_METERS);
  // Very close planets are harder to separate from glare. Companions add contamination, not free sensitivity.
  const separation = Math.min(1, separationAu / Math.max(0.15, rangeLy * 0.015));
  const companionPenalty = 1 / (1 + Math.max(0, system.stars.length - 1) * 0.12);
  const photons = Math.min(1, Math.sqrt(Math.max(0.01, stellarLuminosity)) * Math.max(0.03, radiusEarth));
  const distanceFactor = 1 / (1 + (rangeLy / Math.max(1, capabilities.atmosphericRadiusLy * 0.65)) ** 2);
  const pressureFactor =
    atmosphere.pressure < 0.001 ? 0.35 : Math.min(1, 0.85 + Math.log10(1 + atmosphere.pressure) * 0.3);
  const quality = Math.max(
    0,
    Math.min(
      1,
      capabilities.qualityCeiling *
        mediumEfficiency *
        distanceFactor *
        separation *
        companionPenalty *
        photons *
        pressureFactor *
        (0.7 + Math.min(3, exposure) * 0.1)
    )
  );
  const features: string[] = [];
  const usable = quality >= 0.16;
  const temperate = environment.temperatureK >= 265 && environment.temperatureK <= 345;
  const water = usable && ((gas['Water Vapor'] ?? 0) >= 0.05 || environment.waterCoverage > 0);
  const oxygen = usable && ((gas.Oxygen ?? 0) * atmosphere.pressure) / 100 >= 0.01;
  const methane = quality >= 0.28 && ((gas.Methane ?? 0) * atmosphere.pressure) / 100 >= 1e-6;
  if (water) features.push('Water-bearing atmosphere or surface reflectance: supported.');
  if (oxygen) features.push(`Oxygen absorption: ${quality >= 0.5 ? 'supported' : 'tentative'}.`);
  if (methane) features.push(`Methane absorption: ${quality >= 0.55 ? 'supported' : 'tentative'}.`);
  if (usable && (gas['Carbon Dioxide'] ?? 0) > 0.1) features.push('Carbon dioxide absorption: supported.');
  if (usable)
    features.push(
      `Thermal interpretation: ${temperate ? 'temperate candidate' : environment.temperatureK < 265 ? 'cold' : 'hot'}; model-dependent.`
    );
  const biosphere = generateBiosphere(environment);
  const producers = biosphere?.species.filter((species) => species.metabolism !== 'heterotroph').length ?? 0;
  const geology = new PRNG(planet.mapSeed).seedNew('observatory-reflectance', 1);
  // A modest shared producer-cover proxy is not an ecosystem simulation. Mineral surfaces can mimic it.
  const cover = producers ? Math.min(0.8, 0.15 + environment.waterCoverage * 0.5) : 0;
  const mineralMimic = temperate && environment.landable && geology.random() < 0.06;
  const surfaceTransmission = Math.exp(-Math.max(0, atmosphere.pressure - 1) * 0.12);
  const pigment =
    quality >= 0.3 &&
    surfaceTransmission * quality > 0.2 &&
    ((cover > 0.2 && quality * cover > 0.1) || mineralMimic);
  if (pigment) features.push('Surface reflectance discontinuity: candidate; mineral mimic possible.');
  let evidence =
    (water && temperate ? 0.18 : 0) +
    (oxygen ? 0.24 : 0) +
    (methane && water && temperate ? 0.12 : 0) +
    (pigment ? 0.38 : 0);
  if (oxygen && methane && temperate && water) evidence += 0.2;
  // UV-driven oxygen and hot/cold chemistry receive less weight, regardless of generated life.
  if (system.stars.some((star) => /^[OB]/.test(star.starType))) evidence *= 0.55;
  if (!temperate || !water) evidence *= 0.35;
  if (planet.type === 'GasGiant' || planet.type === 'IceGiant') {
    evidence *= 0.1;
    if (usable) features.push('Gas-dominated atmosphere; these gases are not diagnostic of biology.');
  }
  return {
    planet,
    path,
    quality,
    score: evidence * Math.min(1, quality / 0.35),
    features,
    managed: environment.origin === 'introduced' && Boolean(biosphere),
  };
}
