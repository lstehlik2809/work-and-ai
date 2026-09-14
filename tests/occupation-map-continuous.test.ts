import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildOccupationProfiles, continuousSkillSimilarity, nearestContinuousNeighbors} from '../src/domain/occupation-map';
import {buildContinuousMapProfiles, continuousProfilePayload, CONTINUOUS_MAP_POLICY} from '../src/domain/occupation-map-continuous';
import {occupationProfileFingerprint, validateUmapProjection} from '../src/domain/occupation-map-projection';
import type {Snapshot} from '../src/domain/types';
import {validateSkills} from '../src/search/skills';
const snapshot: Snapshot = JSON.parse(readFileSync('public/data/occupations.json', 'utf8'));
const skills = validateSkills(JSON.parse(readFileSync('public/data/skills.json', 'utf8')), snapshot.release.id);
const model = buildContinuousMapProfiles(snapshot, skills);

test('C01 map-specific support excludes nineteen ratings without changing general profiles or counts', () => {
  const general = buildOccupationProfiles(snapshot, skills);
  assert.equal(general.nodes.length, 772);
  assert.equal(general.excludedCodes.length, 59);
  assert.equal(general.nodes.find(n => n.occupation.code === '41-9012')?.knownSkills, 19);
  assert.equal(model.nodes.length, 771);
  assert.equal(model.excludedCodes.length, 60);
  assert.deepEqual(model.mappedCounts, {Low: 202, Moderate: 187, High: 190, 'Very high': 192, Unavailable: 0});
  assert.deepEqual(model.fullCounts, general.fullCounts);
  const first = snapshot.occupations[0];
  const fixture = {...snapshot, occupations: [{...first, roles: [first.roles[0], first.roles[0], {...first.roles[0], code: 'second'}]}]};
  const rows = {...skills, roles: [{...skills.roles[0], code: first.roles[0].code, importance: Array(35).fill(2)}, {...skills.roles[0], code: 'second', importance: [4, null, ...Array(33).fill(null)]}]};
  const node = buildContinuousMapProfiles(fixture, rows).nodes[0];
  assert.deepEqual(node.importance, [3, ...Array(34).fill(2)]);
  assert.equal(node.mappedRoles, 2);
  assert.equal(node.ratedRoles, 2);
  for (const known of [19, 20]) {
    const boundary = {...skills, roles: [{...skills.roles[0], code: first.roles[0].code, importance: [...Array(known).fill(2), ...Array(35-known).fill(null)]}]};
    assert.equal(buildOccupationProfiles(fixture, boundary).nodes.length, 1);
    assert.equal(buildContinuousMapProfiles(fixture, boundary).nodes.length, known === 20 ? 1 : 0);
  }
});

test('C02 continuous similarity has exact support boundaries, scale and canonical tie ranking', () => {
  const node = (code: string, values: (number|null)[]) => ({...model.nodes[0], occupation: {...model.nodes[0].occupation, code}, importance: values});
  const a = node('a', Array(35).fill(1)), b = node('b', Array(35).fill(5));
  assert.equal(continuousSkillSimilarity(a, b).similarity, 0);
  assert.equal(continuousSkillSimilarity(a, a).similarity, 1);
  assert.equal(continuousSkillSimilarity(a, node('c', [...Array(19).fill(1), ...Array(16).fill(null)])).similarity, null);
  const twenty = node('c', [...Array(20).fill(1), ...Array(15).fill(null)]);
  assert.equal(continuousSkillSimilarity(a, twenty).similarity, 1);
  assert.equal(continuousSkillSimilarity(node('x', Array(35).fill(2)), node('y', Array(35).fill(2.5))).similarity, .875);
  assert.deepEqual(nearestContinuousNeighbors(a, [twenty, node('z', a.importance), node('d', a.importance), a]).map(m => m.node.occupation.code), ['d', 'z', 'c']);
});

test('C07 canonical numeric/null/policy identity detects below-threshold changes and rejects obsolete schema', async () => {
  const fingerprint = await occupationProfileFingerprint(snapshot, skills, model);
  const payload = continuousProfilePayload(snapshot, skills, model);
  assert.equal(createHash('sha256').update(JSON.stringify(payload)).digest('hex'), fingerprint);
  for (const value of [2.1, null]) {
    const changed = structuredClone(model);
    const index = changed.nodes[0].importance.findIndex(v => v !== null && v < 3);
    assert(index >= 0); changed.nodes[0].importance[index] = value;
    assert.notEqual(await occupationProfileFingerprint(snapshot, skills, changed), fingerprint);
  }
  const filled = structuredClone(model);
  const missing = filled.nodes.find(n => n.importance.includes(null))!;
  missing.importance[missing.importance.indexOf(null)] = 2;
  assert.notEqual(await occupationProfileFingerprint(snapshot, skills, filled), fingerprint);
  assert.notEqual(await occupationProfileFingerprint(snapshot, {...skills, skills: [...skills.skills].reverse()}, model), fingerprint);
  const artifact = JSON.parse(readFileSync('public/data/occupation-map-umap.json', 'utf8'));
  for (const policy of [{...CONTINUOUS_MAP_POLICY, normalization: 5}, {...CONTINUOUS_MAP_POLICY, minimumJointRatings: 19}, {...CONTINUOUS_MAP_POLICY, minimumKnownRatings: 19}, {...CONTINUOUS_MAP_POLICY, missing: 'zero'}]) {
    assert.notEqual(createHash('sha256').update(JSON.stringify({...payload, policy})).digest('hex'), fingerprint);
    assert.throws(() => validateUmapProjection({...artifact, policy}, snapshot, model, fingerprint));
  }
  assert.throws(() => validateUmapProjection({...artifact, schemaVersion: 1}, snapshot, model, fingerprint));
});

test('C07 independent literal canonical identity includes numeric values, nulls, skill ordering and policy', async () => {
  const fixtureSnapshot = {...snapshot, release: {...snapshot.release, id: 'fixture'}};
  const fixtureSkills = {...skills, skills: skills.skills.slice(0, 2).map((skill, i) => ({...skill, id: `s${i}`}))};
  const fixtureModel = {...model, nodes: [{...model.nodes[0], occupation: {...model.nodes[0].occupation, code: 'a'}, importance: [2.25, null]}]};
  // Literal independently specified serialization; no exporter or payload helper.
  const canonical = '{"release":"fixture","policy":{"metric":"mean-absolute-importance-difference","normalization":4,"minimumJointRatings":20,"minimumKnownRatings":20,"missing":"pairwise-available-no-imputation","aggregation":"mean-distinct-mapped-roles"},"skills":["s0","s1"],"occupations":[["a",2.25,null]]}';
  assert.equal(await occupationProfileFingerprint(fixtureSnapshot, fixtureSkills, fixtureModel), createHash('sha256').update(canonical).digest('hex'));
});
