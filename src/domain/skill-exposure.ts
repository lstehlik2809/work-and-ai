import type {Exposure, Snapshot} from './types';
import type {Skill, SkillsData} from '../search/skills';
import {buildOccupationProfiles, EXPOSURE_LEVELS, IMPORTANT_SKILL_THRESHOLD} from './occupation-map';
import {bayesianPrevalence} from './bayesian-prevalence';
import type {BayesianEvidence, Contingency} from './bayesian-prevalence';
export type {Contingency} from './bayesian-prevalence';
export type SkillBaseline = 'overall' | 'rest';
export interface SkillExposureRow {
  skill: Skill;
  category: Exposure;
  counts: Contingency; // Always disjoint selected/rest important/below counts.
  selectedKnown: number;
  otherKnown: number;
  selectedPrevalence: number | null;
  otherPrevalence: number | null;
  overallKnown: number;
  overallImportant: number;
  overallPrevalence: number | null;
  restEvidence: BayesianEvidence | null;
  baseline: SkillBaseline;
  baselineKnown: number;
  baselineImportant: number;
  baselinePrevalence: number | null;
  ratio: number | null;
  difference: number | null; // percentage points against the active baseline
  direction: 'more' | 'less' | 'equal' | 'unavailable';
  evidence: BayesianEvidence | null;
}

// Project from immutable disjoint counts/posteriors; toggles never rerun draws or
// scale an already-scaled interval. The whole includes the selected occupations.
export function selectSkillBaseline(row: SkillExposureRow, baseline: SkillBaseline): SkillExposureRow {
  const baselineKnown = baseline === 'overall' ? row.overallKnown : row.otherKnown;
  const baselineImportant = baseline === 'overall' ? row.overallImportant : row.counts[2];
  const baselinePrevalence = baseline === 'overall' ? row.overallPrevalence : row.otherPrevalence;
  const selected = row.selectedPrevalence;
  const ratio = selected === null || baselinePrevalence === null || (selected === 0 && baselinePrevalence === 0)
    ? null : baselinePrevalence === 0 ? Infinity : selected / baselinePrevalence;
  const difference = selected === null || baselinePrevalence === null ? null : 100 * (selected - baselinePrevalence);
  const scale = baseline === 'overall' ? row.otherKnown / row.overallKnown : 1;
  const evidence = baseline === 'rest' || row.restEvidence === null ? row.restEvidence : {
    ...row.restEvidence,
    meanDifference: scale * row.restEvidence.meanDifference,
    interval: row.restEvidence.interval.map(value => scale * value) as [number, number],
  };
  return {...row, baseline, baselineKnown, baselineImportant, baselinePrevalence, ratio, difference, evidence,
    direction: difference === null ? 'unavailable' : difference > 0 ? 'more' : difference < 0 ? 'less' : 'equal'};
}

export function buildSkillExposureRow(skill: Skill, category: Exposure, counts: Contingency, restEvidence: BayesianEvidence | null = bayesianPrevalence(counts)): SkillExposureRow {
  const selectedKnown = counts[0] + counts[1], otherKnown = counts[2] + counts[3];
  const overallKnown = selectedKnown + otherKnown, overallImportant = counts[0] + counts[2];
  return selectSkillBaseline({skill, category, counts, selectedKnown, otherKnown,
    selectedPrevalence: selectedKnown ? counts[0] / selectedKnown : null,
    otherPrevalence: otherKnown ? counts[2] / otherKnown : null,
    overallKnown, overallImportant, overallPrevalence: overallKnown ? overallImportant / overallKnown : null,
    restEvidence, baseline: 'overall', baselineKnown: 0, baselineImportant: 0,
    baselinePrevalence: null, ratio: null, difference: null, direction: 'unavailable', evidence: null}, 'overall');
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
    return buildSkillExposureRow(skill, category, counts);
  }));
  return {rows, comparisons: rows.length, totalOccupations: profiles.total, eligibleOccupations: eligible.length,
    unknownExposure: snapshot.occupations.filter(o => o.exposure === null).length,
    noRatings: snapshot.occupations.filter(o => o.exposure !== null && profiles.excludedCodes.includes(o.code)).length,
    categoryCounts: Object.fromEntries(EXPOSURE_LEVELS.map(category => [category, eligible.filter(node => node.occupation.exposure === category).length])) as Record<Exposure, number>};
}
