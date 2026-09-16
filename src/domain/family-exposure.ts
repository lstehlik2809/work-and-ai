import type {Exposure, Occupation} from './types';
import {occupationFamilyCode, representedOccupationFamilies} from './occupation-families';
import {EXPOSURE_LEVELS} from './occupation-map';

export type FamilyExposure = Exposure | 'Unavailable';
export interface FamilyExposureRow {
  code: string;
  name: string;
  total: number;
  counts: Record<FamilyExposure, number>;
  highShare: number;
}

/** Count canonical BLS occupations, never their mapped O*NET roles or employment. */
export function aggregateFamilyExposure(occupations: readonly Pick<Occupation, 'code' | 'exposure'>[]): FamilyExposureRow[] {
  const unique = [...new Map(occupations.map(occupation => [occupation.code, occupation])).values()];
  return representedOccupationFamilies(unique).map(family => {
    const members = unique.filter(occupation => occupationFamilyCode(occupation.code) === family.code);
    const counts: Record<FamilyExposure, number> = {Low: 0, Moderate: 0, High: 0, 'Very high': 0, Unavailable: 0};
    for (const occupation of members) counts[occupation.exposure ?? 'Unavailable']++;
    return {...family, total: members.length, counts, highShare: (counts.High + counts['Very high']) / members.length};
  }).sort((a, b) => b.highShare - a.highShare || a.name.localeCompare(b.name));
}

export function familyExposureColumns(rows: readonly FamilyExposureRow[]): FamilyExposure[] {
  return rows.some(row => row.counts.Unavailable > 0) ? [...EXPOSURE_LEVELS, 'Unavailable'] : [...EXPOSURE_LEVELS];
}
