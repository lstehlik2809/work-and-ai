import type {Exposure, Snapshot} from './types';
import type {Skill, SkillsData} from '../search/skills';
import {buildOccupationProfiles, EXPOSURE_LEVELS, IMPORTANT_SKILL_THRESHOLD} from './occupation-map';

export type Contingency = [number, number, number, number]; // selected important, selected below, other important, other below
export interface AssociationTest {
  method: 'Pearson chi-square' | 'Fisher exact' | 'No variation' | 'Unavailable';
  p: number | null;
  statistic: number | null;
  expected: Contingency | null;
}
export interface SkillExposureRow {
  skill: Skill;
  category: Exposure;
  counts: Contingency;
  selectedKnown: number;
  otherKnown: number;
  selectedPrevalence: number | null;
  otherPrevalence: number | null;
  ratio: number | null;
  difference: number | null; // percentage points
  direction: 'more' | 'less' | 'equal' | 'unavailable';
  test: AssociationTest;
  adjustedP: number | null;
}

// Survival probability for chi-square with one degree of freedom: Q(1/2, x/2).
// Power series for the lower tail, continued fraction for the upper tail.
function chiSquareSurvival(statistic: number): number {
  const x = statistic / 2;
  if (x === 0) return 1;
  const factor = Math.exp(-x + 0.5 * Math.log(x) - Math.log(Math.PI) / 2);
  if (x < 1.5) {
    let term = 2, sum = term;
    for (let n = 1; n < 10000; n++) {
      term *= x / (0.5 + n); sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    return Math.max(0, Math.min(1, 1 - sum * factor));
  }
  const tiny = 1e-300;
  let b = x + 0.5, c = 1 / tiny, d = 1 / b, h = d;
  for (let n = 1; n < 10000; n++) {
    const an = -n * (n - 0.5); b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; const delta = d * c; h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  return Math.max(0, Math.min(1, factor * h));
}

function fisherTwoSided([a, b, c, d]: Contingency): number {
  const n = a + b + c + d, selected = a + b, important = a + c;
  const factorial = [0];
  for (let i = 1; i <= n; i++) factorial[i] = factorial[i - 1] + Math.log(i);
  const choose = (total: number, k: number) => factorial[total] - factorial[k] - factorial[total - k];
  const logProbability = (k: number) => choose(important, k) + choose(n - important, selected - k) - choose(n, selected);
  const observed = logProbability(a);
  let p = 0;
  for (let k = Math.max(0, selected + important - n); k <= Math.min(selected, important); k++) {
    const probability = logProbability(k);
    // Include equal-probability tables despite floating point log-factorial error.
    if (probability <= observed + 1e-10) p += Math.exp(probability);
  }
  return Math.min(1, p);
}

export function testAssociation(counts: Contingency): AssociationTest {
  if (counts.some(n => !Number.isSafeInteger(n) || n < 0)) throw Error('Counts must be nonnegative integers');
  const [a, b, c, d] = counts, selected = a + b, other = c + d, n = selected + other;
  if (!selected || !other) return {method: 'Unavailable', p: null, statistic: null, expected: null};
  const expected: Contingency = [selected * (a + c) / n, selected * (b + d) / n, other * (a + c) / n, other * (b + d) / n];
  if (!a && !c || !b && !d) return {method: 'No variation', p: 1, statistic: null, expected};
  if (expected.some(value => value < 5)) return {method: 'Fisher exact', p: fisherTwoSided(counts), statistic: null, expected};
  const statistic = counts.reduce((sum, value, i) => sum + (value - expected[i]) ** 2 / expected[i], 0);
  return {method: 'Pearson chi-square', p: chiSquareSurvival(statistic), statistic, expected};
}

// Unavailable tests retain their slot (equivalent to p=1), but stay unavailable.
export function benjaminiHochberg(values: (number | null)[]): (number | null)[] {
  const order = values.map((p, index) => ({p: p ?? 1, index})).sort((a, b) => a.p - b.p || a.index - b.index);
  const adjusted: (number | null)[] = values.map(() => null);
  let running = 1;
  for (let i = order.length - 1; i >= 0; i--) {
    running = Math.min(running, order[i].p * values.length / (i + 1));
    if (values[order[i].index] !== null) adjusted[order[i].index] = running;
  }
  return adjusted;
}

export function rankSkillPatterns(rows: SkillExposureRow[]): SkillExposureRow[] {
  return [...rows].sort((a, b) => {
    if (a.ratio !== b.ratio) {
      if (a.ratio === null) return 1;
      if (b.ratio === null) return -1;
      return a.ratio > b.ratio ? -1 : 1;
    }
    return a.skill.id < b.skill.id ? -1 : a.skill.id > b.skill.id ? 1 : 0;
  });
}

export function buildSkillExposureAnalysis(snapshot: Snapshot, skills: SkillsData) {
  const profiles = buildOccupationProfiles(snapshot, skills);
  const eligible = profiles.nodes.filter(node => node.occupation.exposure !== null);
  const rows: SkillExposureRow[] = EXPOSURE_LEVELS.flatMap(category => skills.skills.map((skill, index) => {
    const counts: Contingency = [0, 0, 0, 0];
    for (const node of eligible) {
      const rating = node.importance[index];
      if (rating === null) continue;
      const group = node.occupation.exposure === category ? 0 : 2;
      counts[group + (rating >= IMPORTANT_SKILL_THRESHOLD ? 0 : 1)]++;
    }
    const selectedKnown = counts[0] + counts[1], otherKnown = counts[2] + counts[3];
    const selectedPrevalence = selectedKnown ? counts[0] / selectedKnown : null;
    const otherPrevalence = otherKnown ? counts[2] / otherKnown : null;
    const ratio = selectedPrevalence === null || otherPrevalence === null || (selectedPrevalence === 0 && otherPrevalence === 0)
      ? null : otherPrevalence === 0 ? Infinity : selectedPrevalence / otherPrevalence;
    const difference = selectedPrevalence === null || otherPrevalence === null ? null : 100 * (selectedPrevalence - otherPrevalence);
    return {skill, category, counts, selectedKnown, otherKnown, selectedPrevalence, otherPrevalence, ratio, difference,
      direction: difference === null ? 'unavailable' : difference > 0 ? 'more' : difference < 0 ? 'less' : 'equal',
      test: testAssociation(counts), adjustedP: null};
  }));
  const adjusted = benjaminiHochberg(rows.map(row => row.test.p));
  rows.forEach((row, index) => {row.adjustedP = adjusted[index];});
  return {rows, comparisons: rows.length, totalOccupations: profiles.total, eligibleOccupations: eligible.length,
    unknownExposure: snapshot.occupations.filter(o => o.exposure === null).length,
    noRatings: snapshot.occupations.filter(o => o.exposure !== null && profiles.excludedCodes.includes(o.code)).length,
    categoryCounts: Object.fromEntries(EXPOSURE_LEVELS.map(category => [category, eligible.filter(node => node.occupation.exposure === category).length])) as Record<Exposure, number>};
}
