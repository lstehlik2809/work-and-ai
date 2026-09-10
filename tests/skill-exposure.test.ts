import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {benjaminiHochberg, buildSkillExposureAnalysis, rankSkillPatterns, testAssociation} from '../src/domain/skill-exposure';
import type {Exposure, Snapshot} from '../src/domain/types';
import type {SkillsData} from '../src/search/skills';

const snapshot: Snapshot = JSON.parse(readFileSync('public/data/occupations.json', 'utf8'));
const skills: SkillsData = JSON.parse(readFileSync('public/data/skills.json', 'utf8'));
const close = (actual: number | null, expected: number) => assert(actual !== null && Math.abs(actual - expected) <= Math.max(1e-14, Math.abs(expected) * 1e-10), `${actual} != ${expected}`);
function fixture() {
  const roles = [{code: 'a', importance: [5, 2, null, 1]}, {code: 'b', importance: [1, 2, 3, 1]}, {code: 'c', importance: [4, 1, null, 1]}, {code: 'd', importance: [2, 3, 4, 1]}, {code: 'e', importance: [2, 1, 2, 1]}, {code: 'all', importance: [5, 5, 5, 5]}];
  const mapped: [Exposure | null, string[]][] = [['Very high', ['a', 'a', 'b']], ['Very high', ['c']], ['Low', ['d']], ['Moderate', ['e']], [null, ['all']], ['High', ['missing']]];
  const data: SkillsData = {...skills, skills: skills.skills.slice(0, 4), roles};
  const snap: Snapshot = {...snapshot, occupations: mapped.map(([exposure, codes], i) => ({...snapshot.occupations[0], code: String(i), exposure, roles: codes.map(code => ({...snapshot.occupations[0].roles[0], code}))}))};
  return {snap, data};
}

test('one BLS observation, unique role means, inclusive threshold, skill-specific denominators and unknown exposure exclusion', () => {
  const {snap, data} = fixture(), analysis = buildSkillExposureAnalysis(snap, data);
  const rows = analysis.rows.filter(row => row.category === 'Very high');
  assert.deepEqual(rows.map(row => row.counts), [[2, 0, 0, 2], [0, 2, 1, 1], [1, 0, 1, 1], [0, 2, 0, 2]]);
  assert.deepEqual(rows.map(row => row.ratio), [Infinity, 0, 2, null]);
  assert.deepEqual(rows.map(row => row.direction), ['more', 'less', 'more', 'equal']);
  assert.deepEqual(rows.map(row => row.difference), [100, -50, 50, 0]);
  assert.equal(rows[2].selectedKnown, 1);
  assert.equal(analysis.eligibleOccupations, 4);
  assert.equal(analysis.unknownExposure, 1);
  assert.equal(analysis.noRatings, 1);
  assert.deepEqual(analysis.categoryCounts, {Low: 1, Moderate: 1, High: 0, 'Very high': 2});
  const high = analysis.rows.filter(row => row.category === 'High');
  assert(high.every(row => row.ratio === null && row.difference === null && row.test.p === null && row.adjustedP === null));
});

test('ranking orders infinity, finite, zero, undefined; ties resolve by skill ID without mutating input', () => {
  const {snap, data} = fixture(), rows = buildSkillExposureAnalysis(snap, data).rows.filter(row => row.category === 'Very high');
  assert.deepEqual(rankSkillPatterns(rows).map(row => row.skill.id), [data.skills[0].id, data.skills[2].id, data.skills[1].id, data.skills[3].id]);
  const tied = rows.map(row => ({...row, ratio: Infinity})).reverse();
  assert.deepEqual(rankSkillPatterns(tied).map(row => row.skill.id), data.skills.map(skill => skill.id).sort());
  assert.deepEqual(rows.map(row => row.skill.id), data.skills.map(skill => skill.id));
});

test('Pearson uncorrected statistic and upper tail match independently known values', () => {
  const result = testAssociation([30, 20, 20, 30]);
  assert.equal(result.method, 'Pearson chi-square');
  assert.deepEqual(result.expected, [25, 25, 25, 25]);
  close(result.statistic, 4);
  close(result.p, 0.04550026389635857);
  close(testAssociation([10, 10, 10, 10]).p, 1);
  assert.equal(testAssociation([5, 5, 5, 5]).method, 'Pearson chi-square');
});

test('sparse Fisher is two-sided, symmetric, and includes equal-probability tails', () => {
  const result = testAssociation([1, 9, 8, 2]);
  assert.equal(result.method, 'Fisher exact');
  close(result.p, 0.005477494641581329);
  close(testAssociation([8, 2, 1, 9]).p, result.p!);
  close(testAssociation([9, 1, 2, 8]).p, result.p!);
  // Six equally likely assignments of two important statuses; both extreme tables count.
  close(testAssociation([2, 0, 0, 2]).p, 1 / 3);
});

test('degenerate and empty groups are explicit; invalid counts fail', () => {
  assert.equal(testAssociation([0, 3, 0, 7]).method, 'No variation');
  assert.equal(testAssociation([0, 3, 0, 7]).p, 1);
  assert.equal(testAssociation([3, 0, 7, 0]).p, 1);
  assert.equal(testAssociation([0, 0, 3, 7]).p, null);
  assert.equal(testAssociation([0, 0, 0, 0]).p, null);
  assert.throws(() => testAssociation([-1, 2, 3, 4]));
  assert.throws(() => testAssociation([1.5, 2, 3, 4]));
  const {snap, data} = fixture();
  const empty = buildSkillExposureAnalysis({...snap, occupations: []}, data);
  assert.equal(empty.rows.length, 16);
  assert(empty.rows.every(row => row.ratio === null && row.adjustedP === null));
});

test('BH monotone adjustment preserves original order, ties and unavailable slots', () => {
  assert.deepEqual(benjaminiHochberg([0.04, 0.01, 0.03, 0.002]), [0.04, 0.02, 0.04, 0.008]);
  assert.deepEqual(benjaminiHochberg([0.01, null, 0.04, 0.01]), [0.02, null, 0.16 / 3, 0.02]);
  assert.deepEqual(benjaminiHochberg([0, 1, null]), [0, 1, null]);
  assert.deepEqual(benjaminiHochberg([]), []);
});

test('snapshot has fixed 140-test family and recognizable rare-skill counts; filtering cannot recompute adjustment', () => {
  const analysis = buildSkillExposureAnalysis(snapshot, skills);
  assert.equal(analysis.comparisons, 140);
  assert.equal(analysis.rows.length, 140);
  assert.equal(analysis.eligibleOccupations, 772);
  assert.equal(analysis.noRatings, 59);
  const ranked = rankSkillPatterns(analysis.rows.filter(row => row.category === 'Very high'));
  assert.equal(ranked.length, 35);
  assert.equal(ranked[0].skill.name, 'Programming');
  assert.equal(ranked[0].ratio, Infinity);
  assert.deepEqual(ranked[0].counts, [19, 156, 0, 343]);
  assert.equal(ranked[1].skill.name, 'Technology Design');
  assert.deepEqual(ranked[1].counts, [5, 165, 1, 488]);
  close(ranked[1].ratio, (5 / 170) / (1 / 489));
  assert.equal(ranked.filter(row => row.skill.name.includes('Technology'))[0].adjustedP, analysis.rows.find(row => row.category === 'Very high' && row.skill.name === 'Technology Design')!.adjustedP);
  const {snap, data} = fixture();
  const original = buildSkillExposureAnalysis(snap, data);
  const reordered = buildSkillExposureAnalysis({...snap, occupations: [...snap.occupations].reverse()}, {...data, roles: [...data.roles].reverse()});
  assert.deepEqual(reordered, original);
});
