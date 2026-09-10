import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildOccupationMap, countExposure, EXPOSURE_LEVELS, EXPOSURE_RADIUS, nearestSkillNeighbors, projectSkillProfiles, sharedSkillSimilarity} from '../src/domain/occupation-map';
import type {MapOccupation} from '../src/domain/occupation-map';
import type {Snapshot} from '../src/domain/types';
import {validateSkills} from '../src/search/skills';
import type {SkillsData} from '../src/search/skills';

const snapshot: Snapshot = JSON.parse(readFileSync('public/data/occupations.json', 'utf8'));
const skills = validateSkills(JSON.parse(readFileSync('public/data/skills.json', 'utf8')), snapshot.release.id);
const model = buildOccupationMap(snapshot, skills);
function fixture(rows: SkillsData['roles'], occupationRoles: string[][]) {
  const data: SkillsData = {...skills, skills: skills.skills.slice(0, 3), roles: rows};
  const snap: Snapshot = {...snapshot, occupations: occupationRoles.map((codes, i) => ({...snapshot.occupations[0], code: String(i), title: `Occupation ${i}`, roles: codes.map(code => ({...snapshot.occupations[0].roles[0], code}))}))};
  return {data, snap};
}
const close = (actual: number, expected: number) => assert(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('map includes every source occupation with observed skill evidence once and reports full/subset coverage', () => {
  const roleRatings = new Map(skills.roles.map(role => [role.code, role.importance]));
  const expectedCodes = snapshot.occupations.filter(occupation => occupation.roles.some(role => roleRatings.get(role.code)?.some(value => value !== null))).map(occupation => occupation.code).sort();
  assert.equal(model.total, 831);
  assert.equal(model.nodes.length, 772);
  assert.equal(model.excludedCodes.length, 59);
  assert.deepEqual(model.nodes.map(node => node.occupation.code), expectedCodes);
  assert.equal(new Set(model.nodes.map(node => node.occupation.code)).size, 772);
  assert.equal(Object.values(model.mappedCounts).reduce((a, b) => a + b), 772);
  assert.equal(Object.values(model.fullCounts).reduce((a, b) => a + b), 831);
  assert.deepEqual(model.fullCounts, {Low: 213, Moderate: 206, High: 206, 'Very high': 206, Unavailable: 0});
  assert(model.offsetNodes > 0);
  assert(model.explainedVariance > 0.49 && model.explainedVariance < 0.51);
  for (const node of model.nodes) for (const coordinate of [node.x, node.y, node.displayX, node.displayY]) assert(Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1);
});

test('deduplicate mapped roles, average available ratings, include threshold equality and distinguish missing from low', () => {
  const {data, snap} = fixture([
    {code: 'a', importance: [5, null, 2]},
    {code: 'b', importance: [1, 4, null]},
    {code: 'low', importance: [1, 2, 2.99]},
    {code: 'null', importance: [null, null, null]},
  ], [['a', 'a', 'b', 'missing'], ['low'], ['null'], ['missing']]);
  const result = buildOccupationMap(snap, data);
  assert.deepEqual(result.nodes.map(node => node.occupation.code), ['0', '1']);
  assert.deepEqual(result.excludedCodes, ['2', '3']);
  assert.deepEqual(result.nodes[0].importance, [3, 4, 2]);
  assert.deepEqual(result.nodes[0].importantSkills, [0, 1]);
  assert.equal(result.nodes[0].mappedRoles, 3);
  assert.equal(result.nodes[0].ratedRoles, 2);
  assert.equal(result.nodes[0].unavailableRatings, 5);
  assert.deepEqual(result.nodes[1].importantSkills, []);
  assert.equal(result.nodes[1].knownSkills, 3);
  assert.equal(result.nodes[1].unavailableRatings, 0);
  const incomplete = fixture([{code: 'partial', importance: [null, 3, 1]}], [['partial']]);
  const partial = buildOccupationMap(incomplete.snap, incomplete.data).nodes[0];
  assert.deepEqual(partial.importance, [null, 3, 1]);
  assert.equal(partial.knownSkills, 2);
  assert.deepEqual(partial.importantSkills, [1]);
});

test('PCA preserves two-dimensional distances and reports independently known explained variance', () => {
  const profiles = [[0, 0], [0, 1], [1, 0], [1, 1]];
  const result = projectSkillProfiles(profiles);
  close(result.explainedVariance, 1);
  for (let i = 0; i < profiles.length; i++) for (let j = 0; j < profiles.length; j++) {
    close(Math.hypot(result.points[i][0] - result.points[j][0], result.points[i][1] - result.points[j][1]), Math.hypot(profiles[i][0] - profiles[j][0], profiles[i][1] - profiles[j][1]));
  }
  const cube = Array.from({length: 8}, (_, i) => [i & 1, (i >> 1) & 1, (i >> 2) & 1]);
  close(projectSkillProfiles(cube).explainedVariance, 2 / 3);
  const correlated = projectSkillProfiles([[0, 0], [1, 1]]);
  close(correlated.explainedVariance, 1);
  close(Math.abs(correlated.points[1][0] - correlated.points[0][0]), Math.sqrt(2));
  close(correlated.points[0][1], 0);
});

test('empty, single and constant skill profiles produce finite deterministic output', () => {
  assert.deepEqual(projectSkillProfiles([]), {points: [], explainedVariance: 0});
  assert.deepEqual(projectSkillProfiles([[1, 1, 0]]), {points: [[0, 0]], explainedVariance: 0});
  const {data, snap} = fixture([{code: 'a', importance: [3, 1, 4]}], [['a'], ['a'], ['a']]);
  const result = buildOccupationMap(snap, data);
  assert.equal(result.explainedVariance, 0);
  assert.equal(result.offsetNodes, 3);
  assert(result.nodes.every(node => node.x === 0.5 && node.y === 0.5));
  assert.equal(new Set(result.nodes.map(node => `${node.displayX},${node.displayY}`)).size, 3);
  const empty = buildOccupationMap({...snap, occupations: []}, data);
  assert.deepEqual(empty.nodes, []);
  assert.equal(empty.explainedVariance, 0);
});

test('positions, offsets and skill neighbors are independent of exposure, growth and source row order', () => {
  const changed = structuredClone(snapshot);
  changed.occupations.reverse().forEach((occupation, i) => {occupation.exposure = i % 2 ? null : 'Very high'; occupation.growth = 999; occupation.annualOpenings = 0; occupation.roles.reverse();});
  const reversedSkills = {...skills, roles: [...skills.roles].reverse()};
  const altered = buildOccupationMap(changed, reversedSkills);
  const coordinates = (nodes: MapOccupation[]) => nodes.map(node => ({code: node.occupation.code, x: node.x, y: node.y, displayX: node.displayX, displayY: node.displayY, importantSkills: node.importantSkills}));
  assert.deepEqual(coordinates(altered.nodes), coordinates(model.nodes));
  const neighbors = (nodes: MapOccupation[]) => nearestSkillNeighbors(nodes[0], nodes).map(match => ({code: match.node.occupation.code, shared: match.sharedSkills, similarity: match.similarity}));
  assert.deepEqual(neighbors(altered.nodes), neighbors(model.nodes));
});

test('nearest neighbors use exact Jaccard sets, exclude self/zero matches and deterministically break ties', () => {
  const node = (code: string, importantSkills: number[]): MapOccupation => ({...model.nodes[0], occupation: {...model.nodes[0].occupation, code}, importantSkills});
  const selected = node('s', [0, 1, 2]), exact = node('exact', [0, 1, 2]), smaller = node('smaller', [0, 1]);
  const larger = node('larger', [0, 1, 2, 3, 4]), tieB = node('b', [0, 1]), zero = node('zero', [8]);
  assert.deepEqual(sharedSkillSimilarity(selected, larger), {sharedSkills: [0, 1, 2], union: 5, similarity: 3 / 5});
  const candidates = [zero, larger, selected, smaller, exact, tieB];
  assert.deepEqual(nearestSkillNeighbors(selected, candidates).map(match => match.node.occupation.code), ['exact', 'b', 'smaller', 'larger']);
  assert.deepEqual(nearestSkillNeighbors(selected, candidates, 2).map(match => match.node.occupation.code), ['exact', 'b']);
  assert.deepEqual(nearestSkillNeighbors(selected, [...candidates].reverse()), nearestSkillNeighbors(selected, candidates));
  assert.deepEqual(nearestSkillNeighbors(node('empty', []), candidates), []);
  assert.deepEqual(sharedSkillSimilarity(node('empty', []), node('empty2', [])), {sharedSkills: [], union: 0, similarity: 0});
});

test('exposure has four ordered discrete sizes and unavailable remains its own category', () => {
  assert.equal(Object.keys(EXPOSURE_RADIUS).length, 4);
  const radii = EXPOSURE_LEVELS.map(level => EXPOSURE_RADIUS[level]);
  assert(radii.every((radius, i) => i === 0 || radius > radii[i - 1]));
  assert.deepEqual(countExposure([{...snapshot.occupations[0], exposure: null}, {...snapshot.occupations[0], exposure: 'Low'}]), {Low: 1, Moderate: 0, High: 0, 'Very high': 0, Unavailable: 1});
});
