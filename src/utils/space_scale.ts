import { CONFIG } from '../config';
import { AU_IN_METERS, LIGHT_SPEED_M_PER_S } from '../constants/physics';

const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

export function formatDistanceAu(distanceMeters: number): string {
  const au = distanceMeters / AU_IN_METERS;
  if (!Number.isFinite(au)) return 'unknown AU';
  if (Math.abs(au) < 0.01) return `${au.toFixed(4)} AU`;
  if (Math.abs(au) < 10) return `${au.toFixed(2)} AU`;
  return `${au.toFixed(1)} AU`;
}

export function formatLightTimeFromMeters(distanceMeters: number): string {
  const seconds = distanceMeters / LIGHT_SPEED_M_PER_S;
  if (!Number.isFinite(seconds) || seconds < 0) return 'signal delay unknown';
  if (seconds < 90) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} light-sec`;
  const minutes = seconds / 60;
  if (minutes < 90) return `${minutes.toFixed(minutes < 10 ? 1 : 0)} light-min`;
  const hours = minutes / 60;
  if (hours < 72) return `${hours.toFixed(hours < 10 ? 1 : 0)} light-hr`;
  const days = hours / 24;
  if (days < 365) return `${days.toFixed(days < 10 ? 1 : 0)} light-day`;
  const years = days / 365.25;
  return `${years.toFixed(years < 10 ? 2 : 1)} light-yr`;
}

export function formatHyperspaceSpan(cells: number): string {
  const lightYears = cells * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS;
  if (!Number.isFinite(lightYears)) return 'unknown ly';
  if (lightYears < 10) return `${lightYears.toFixed(1)} ly`;
  if (lightYears < 100) return `${lightYears.toFixed(0)} ly`;
  return `${lightYears.toFixed(0)} ly`;
}

export function formatHyperspaceSignalDelay(cells: number): string {
  const lightYears = cells * CONFIG.HYPERSPACE_CELL_LIGHT_YEARS;
  if (!Number.isFinite(lightYears)) return 'signal delay unknown';
  const years = lightYears;
  if (years < 1) return `${(years * SECONDS_PER_YEAR / 86400).toFixed(1)} days at c`;
  return `${years.toFixed(years < 10 ? 1 : 0)} years at c`;
}
