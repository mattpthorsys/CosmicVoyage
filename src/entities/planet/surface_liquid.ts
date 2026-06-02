import type { Atmosphere } from '../planet';

export interface SurfaceLiquidOverlay {
  kind: 'water' | 'brine' | 'hycean' | 'acid' | 'methane' | 'nitrogen' | 'ammonia';
  label: string;
  seaLevel: number;
  coverage: number;
  colour: string;
  reflectiveColour: string;
}

export function createSurfaceLiquidOverlay(args: {
  planetType: string;
  hydrosphere: string;
  surfaceTemp: number;
  atmosphere: Atmosphere;
  heightmap: number[][];
}): SurfaceLiquidOverlay | null {
  const coverage = getLiquidCoverage(args.planetType, args.hydrosphere, args.surfaceTemp, args.atmosphere);
  if (coverage <= 0 || args.heightmap.length === 0) return null;
  const seaLevel = getSeaLevelForCoverage(args.heightmap, coverage);
  const kind = getLiquidKind(args.planetType, args.hydrosphere, args.surfaceTemp);
  const colours = getLiquidColours(kind);
  return {
    kind,
    label: getLiquidLabel(kind),
    seaLevel,
    coverage,
    colour: colours.colour,
    reflectiveColour: colours.reflectiveColour,
  };
}

export function isLiquidCovered(height: number, overlay: SurfaceLiquidOverlay | null | undefined): boolean {
  return !!overlay && height <= overlay.seaLevel;
}

function getLiquidCoverage(planetType: string, hydrosphere: string, surfaceTemp: number, atmosphere: Atmosphere): number {
  const hydro = hydrosphere.toLowerCase();
  if (hydro.includes('desiccated') || hydro.includes('dry') || hydro.includes('no stable surface ocean')) return 0;
  if (hydro.includes('global ice shell') || hydro.includes('global ice sheet')) return 0;
  if (planetType === 'Oceanic' && hydro.includes('global saline ocean')) return 0.82;
  if (planetType === 'Hycean' && hydro.includes('global high-pressure ocean')) return 0.92;
  if (hydro.includes('global saline ocean') || hydro.includes('global high-pressure ocean')) return 0.86;
  if (hydro.includes('shallow saline seas')) return 0.36;
  if (hydro.includes('cold brine seas')) return 0.22;
  if (hydro.includes('supercritical global water')) return atmosphere.pressure > 22 ? 0.32 : 0;
  if (hydro.includes('significant oceans')) return 0.48;
  if (hydro.includes('small seas')) return 0.28;
  if (hydro.includes('connected shallow seas')) return 0.42;
  if (hydro.includes('lakes') || hydro.includes('rivers')) return 0.18;
  if (hydro.includes('methane/ethane') || hydro.includes('hydrocarbon')) return surfaceTemp >= 88 && surfaceTemp <= 190 ? 0.12 : 0;
  if (hydro.includes('nitrogen frost plains') || hydro.includes('nitrogen/methane frosts')) return surfaceTemp >= 55 && surfaceTemp <= 115 ? 0.06 : 0;
  if (hydro.includes('ammonia-water') || hydro.includes('cryolava reservoirs')) return surfaceTemp >= 170 && surfaceTemp <= 260 ? 0.08 : 0;
  if (hydro.includes('trace liquid')) return 0.04;
  if (hydro.includes('supercritical fluid') && atmosphere.pressure > 5) return 0.12;
  if (hydro.includes('acid') && atmosphere.pressure > 0.5) return 0.1;
  if ((hydro.includes('methane') || hydro.includes('nitrogen')) && surfaceTemp >= 65 && surfaceTemp <= 125) return 0.08;
  return 0;
}

function getSeaLevelForCoverage(heightmap: number[][], coverage: number): number {
  const values = heightmap.flat().filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (values.length === 0) return 0;
  const index = Math.max(0, Math.min(values.length - 1, Math.floor(values.length * Math.max(0.01, Math.min(0.96, coverage)))));
  return Math.round(values[index]);
}

function getLiquidKind(planetType: string, hydrosphere: string, surfaceTemp: number): SurfaceLiquidOverlay['kind'] {
  const hydro = hydrosphere.toLowerCase();
  if (planetType === 'Hycean') return 'hycean';
  if (hydro.includes('acid')) return 'acid';
  if (hydro.includes('hydrocarbon') || hydro.includes('ethane')) return 'methane';
  if (hydro.includes('methane')) return 'methane';
  if (hydro.includes('nitrogen')) return 'nitrogen';
  if (hydro.includes('ammonia') || hydro.includes('cryolava')) return 'ammonia';
  if (hydro.includes('brine')) return 'brine';
  if (surfaceTemp < 245) return 'brine';
  return 'water';
}

function getLiquidLabel(kind: SurfaceLiquidOverlay['kind']): string {
  switch (kind) {
    case 'hycean': return 'deep high-pressure ocean';
    case 'acid': return 'acidic liquid basin';
    case 'methane': return 'liquid methane basin';
    case 'nitrogen': return 'liquid nitrogen basin';
    case 'ammonia': return 'ammonia-water basin';
    case 'brine': return 'cold brine sea';
    case 'water':
    default: return 'liquid water ocean';
  }
}

function getLiquidColours(kind: SurfaceLiquidOverlay['kind']): { colour: string; reflectiveColour: string } {
  switch (kind) {
    case 'hycean': return { colour: '#123B68', reflectiveColour: '#73BDE8' };
    case 'acid': return { colour: '#7B8E2F', reflectiveColour: '#D2E46D' };
    case 'methane': return { colour: '#1F6D82', reflectiveColour: '#8FD7EA' };
    case 'nitrogen': return { colour: '#547EA8', reflectiveColour: '#C0D8F0' };
    case 'ammonia': return { colour: '#4C9A9A', reflectiveColour: '#B4F0E8' };
    case 'brine': return { colour: '#1D5D7E', reflectiveColour: '#9BD8F4' };
    case 'water':
    default: return { colour: '#145F95', reflectiveColour: '#A8E8FF' };
  }
}
