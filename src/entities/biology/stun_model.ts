import type { EvidenceLevel, SpeciesDefinition, StunPower } from './biology_types';

export interface StunOutcome {
  stunned: number;
  dead: number;
  active: number;
  recoverySeconds: number;
}

/** Evaluates a fictional dose-response profile with mutually exclusive live-stun and death outcomes. */
export function stunOutcome(
  species: SpeciesDefinition,
  power: StunPower,
  exposure = 0,
  injury = 0,
  rangeMetres = 0
): StunOutcome {
  if (species.susceptibility === 0) return { stunned: 0, dead: 0, active: 1, recoverySeconds: 0 };
  const dose =
    ([0.7, 1.4, 2.5][power] * species.susceptibility * (1 + exposure * 0.22 + injury * 0.3)) /
    ((1 + species.massKg / 60 + species.armour) * (1 + Math.pow(rangeMetres / 45, 2)));
  const dead = 0.002 + 0.7 / (1 + Math.exp(-4 * (dose - 2.15)));
  const stunned = (1 - dead) / (1 + Math.exp(-6 * (dose - 0.72)));
  return {
    stunned,
    dead,
    active: 1 - dead - stunned,
    recoverySeconds: Math.round((130 + species.massKg) * (1 + power * 0.6)),
  };
}

/** Projects uncertainty through plausible mass/susceptibility profiles instead of unrelated percentage noise. */
export function estimateStun(
  species: SpeciesDefinition,
  power: StunPower,
  level: EvidenceLevel,
  exposure = 0,
  injury = 0,
  rangeMetres = 0
): { stun: string; mortality: string; recovery: string } {
  if (species.susceptibility === 0 && level >= 2)
    return { stun: 'Not applicable', mortality: '--', recovery: '--' };
  const uncertainty = level >= 3 ? 0.08 : level >= 2 && species.recognised ? 0.15 : level >= 2 ? 0.4 : 0.75;
  const susceptibility = level >= 3 || (level >= 2 && species.recognised) ? species.susceptibility : 1;
  const profiles = [-1, 0, 1].map((direction) =>
    stunOutcome(
      {
        ...species,
        massKg: Math.max(0.1, species.massKg * (1 - direction * uncertainty)),
        susceptibility: susceptibility * (1 + direction * uncertainty),
      },
      power,
      exposure,
      injury,
      rangeMetres
    )
  );
  /** Formats the bounds obtained from the same outcome model used when firing. */
  const range = (key: 'stunned' | 'dead') => {
    const values = profiles.map((profile) => Math.round(profile[key] * 100));
    return `${Math.min(...values)}-${Math.max(...values)}%`;
  };
  const recovery = profiles.map((profile) => profile.recoverySeconds);
  return {
    stun: range('stunned'),
    mortality: range('dead'),
    recovery: `${Math.round(Math.min(...recovery) / 60)}-${Math.ceil(Math.max(...recovery) / 60)} min`,
  };
}
