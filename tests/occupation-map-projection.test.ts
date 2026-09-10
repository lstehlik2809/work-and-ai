import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {Snapshot} from '../src/domain/types';
import {validateSkills} from '../src/search/skills';
import {buildOccupationMap, nearestSkillNeighbors} from '../src/domain/occupation-map';
import {applyUmapProjection, loadUmapProjection, occupationProfileFingerprint, validateUmapProjection} from '../src/domain/occupation-map-projection';
import type {UmapProjection} from '../src/domain/occupation-map-projection';

const snapshot: Snapshot = JSON.parse(readFileSync('public/data/occupations.json', 'utf8'));
const skills = validateSkills(JSON.parse(readFileSync('public/data/skills.json', 'utf8')), snapshot.release.id);
const pca = buildOccupationMap(snapshot, skills);
const fingerprint = await occupationProfileFingerprint(snapshot, skills, pca);
const fixture: UmapProjection = {
  schemaVersion: 1, release: snapshot.release.id, profileSha256: fingerprint, defaultProjection: 'umap', method: 'umap',
  parameters: {n_neighbors: 15, min_dist: 0.1, n_components: 2, metric: 'precomputed-jaccard', random_state: 11, n_epochs: 500},
  versions: {'umap-learn': 'test-fixture'},
  evaluation: {pca: {'5': 0.3, '10': 0.4, '20': 0.5}, umap: {'5': 0.6, '10': 0.7, '20': 0.8}, summary: 'Synthetic validation fixture; not empirical results.'},
  nodes: pca.nodes.map((node, i) => ({code: node.occupation.code, x: (i % 29) / 28, y: Math.floor(i / 29) / 26})),
};
const hash = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const loadBytes = (bytes: string, expectedHash = hash(bytes)) => loadUmapProjection(snapshot, skills, pca, new AbortController().signal, expectedHash, async () => new Response(bytes));

test('AS04 committed UMAP artifact passes its independent byte pin and current skill-profile contract', async () => {
  const bytes = readFileSync('public/data/occupation-map-umap.json', 'utf8');
  const pin = JSON.parse(readFileSync('src/domain/occupation-map-umap-pin.json', 'utf8')) as {sha256: string};
  assert.equal(hash(bytes), pin.sha256);
  const artifact = await loadBytes(bytes, pin.sha256);
  const projected = applyUmapProjection(pca, artifact);
  assert.equal(artifact.profileSha256, fingerprint);
  assert.equal(projected.nodes.length, pca.nodes.length);
  assert.equal(new Set(projected.nodes.map(node => node.occupation.code)).size, 772);
  assert(projected.nodes.some((node, i) => node.x !== pca.nodes[i].x || node.y !== pca.nodes[i].y));
});

test('AS04 profile fingerprint matches the source protocol and ignores statistics and occupation/role row ordering', async () => {
  assert.equal(fingerprint, 'c88aacb2509cfe449f906e24446ede8b860c1ce0d08a6a715b3cb260835c5001');
  const changed = structuredClone(snapshot);
  changed.occupations.reverse().forEach((occupation, i) => {occupation.exposure = i % 2 ? null : 'Very high'; occupation.growth = -999; occupation.annualOpenings = 999; occupation.roles.reverse();});
  const reorderedSkills = {...skills, roles: [...skills.roles].reverse()};
  const changedModel = buildOccupationMap(changed, reorderedSkills);
  assert.equal(await occupationProfileFingerprint(changed, reorderedSkills, changedModel), fingerprint);
  const alteredSkills = structuredClone(skills);
  assert(pca.nodes.some(node => node.importantSkills.includes(0)));
  alteredSkills.roles.forEach(role => {role.importance[0] = 1;});
  const alteredModel = buildOccupationMap(snapshot, alteredSkills);
  assert.notEqual(await occupationProfileFingerprint(snapshot, alteredSkills, alteredModel), fingerprint);
});

test('AS04 complete valid projections join by code and preserve all occupation evidence and exact skill neighbors', () => {
  const before = structuredClone(pca);
  const reversed = {...fixture, nodes: [...fixture.nodes].reverse()};
  const validated = validateUmapProjection(reversed, snapshot, pca, fingerprint);
  const projected = applyUmapProjection(pca, validated);
  assert.equal(projected.nodes.length, 772);
  projected.nodes.forEach((node, i) => {
    const expected = fixture.nodes[i];
    assert.deepEqual([node.x, node.y], [expected.x, expected.y]);
    assert.strictEqual(node.occupation, pca.nodes[i].occupation);
    assert.strictEqual(node.importantSkills, pca.nodes[i].importantSkills);
    assert.strictEqual(node.importance, pca.nodes[i].importance);
    assert.deepEqual({...node, x: 0, y: 0, displayX: 0, displayY: 0}, {...pca.nodes[i], x: 0, y: 0, displayX: 0, displayY: 0});
  });
  for (const code of [pca.nodes[0].occupation.code, '15-1251', pca.nodes.at(-1)!.occupation.code]) {
    const matches = (model: typeof pca) => nearestSkillNeighbors(model.nodes.find(node => node.occupation.code === code)!, model.nodes).map(match => ({code: match.node.occupation.code, shared: match.sharedSkills, union: match.union, similarity: match.similarity}));
    assert.deepEqual(matches(projected), matches(pca));
  }
  assert.deepEqual(pca, before);
  assert.equal(validateUmapProjection({...fixture, defaultProjection: 'pca'}, snapshot, pca, fingerprint).defaultProjection, 'pca');
});

test('AS04 missing, extra, duplicate and unexpected occupations or invalid coordinates cannot partially apply', () => {
  const mutations: [string, (data: UmapProjection) => void][] = [
    ['missing', data => {data.nodes.pop();}],
    ['extra', data => {data.nodes.push({code: 'extra', x: 0.5, y: 0.5});}],
    ['duplicate', data => {data.nodes[1].code = data.nodes[0].code;}],
    ['unknown', data => {data.nodes[1].code = 'unknown';}],
    ['NaN', data => {data.nodes[1].x = NaN;}],
    ['infinite', data => {data.nodes[1].y = Infinity;}],
    ['below bounds', data => {data.nodes[1].x = -0.001;}],
    ['above bounds', data => {data.nodes[1].y = 1.001;}],
  ];
  const before = structuredClone(pca);
  for (const [name, mutate] of mutations) {
    const broken = structuredClone(fixture); mutate(broken);
    assert.throws(() => validateUmapProjection(broken, snapshot, pca, fingerprint), name);
    assert.throws(() => applyUmapProjection(pca, broken), name);
    assert.deepEqual(pca, before, name);
  }
});

test('AS04 rejects incompatible profiles, releases, schemas, methods, parameters and metric values', () => {
  const bad: unknown[] = [null, [], {}, {...fixture, schemaVersion: 2}, {...fixture, release: 'another-release'}, {...fixture, profileSha256: '0'.repeat(64)}, {...fixture, method: 'tsne'}, {...fixture, defaultProjection: 'auto'},
    {...fixture, versions: {}}, {...fixture, versions: {umap: 1}}, {...fixture, evaluation: {...fixture.evaluation, summary: ''}},
    ...[{n_neighbors: 1}, {n_neighbors: pca.nodes.length}, {n_neighbors: 2.5}, {min_dist: -1}, {min_dist: NaN}, {n_components: 3}, {metric: 'cosine'}, {random_state: 42}, {n_epochs: 1}].map(parameters => ({...fixture, parameters: {...fixture.parameters, ...parameters}})),
    ...[NaN, Infinity, -0.1, 1.1, '0.5', undefined].map(value => ({...fixture, evaluation: {...fixture.evaluation, umap: {...fixture.evaluation.umap, '10': value}}})),
  ];
  for (const value of bad) assert.throws(() => validateUmapProjection(value, snapshot, pca, fingerprint));
  assert.throws(() => validateUmapProjection(fixture, snapshot, pca, '1'.repeat(64)));
});

test('AS04 loader checks exact artifact bytes and profile compatibility before accepting coordinates', async () => {
  const bytes = JSON.stringify(fixture);
  let requested = '';
  const controller = new AbortController();
  const fetched = await loadUmapProjection(snapshot, skills, pca, controller.signal, hash(bytes), async (url, options) => {
    requested = String(url); assert.strictEqual(options?.signal, controller.signal); return new Response(bytes);
  });
  assert.equal(requested, '/data/occupation-map-umap.json');
  assert.deepEqual(fetched, fixture);
  await assert.rejects(loadBytes(bytes + '\n', hash(bytes)), /integrity/);
  await assert.rejects(loadBytes(bytes, 'bad-pin'), /pin/);
  await assert.rejects(loadBytes('{invalid json'), SyntaxError);
  await assert.rejects(loadBytes(JSON.stringify({...fixture, profileSha256: '0'.repeat(64)})), /incompatible/);
  await assert.rejects(loadBytes(JSON.stringify({...fixture, nodes: fixture.nodes.slice(1)})), /coverage/);
  const changed = structuredClone(skills); changed.roles.forEach(role => {role.importance[0] = 1;});
  await assert.rejects(loadUmapProjection(snapshot, changed, buildOccupationMap(snapshot, changed), controller.signal, hash(bytes), async () => new Response(bytes)), /incompatible/);
});

test('AS04 request failure and cancellation leave PCA unchanged', async () => {
  const before = structuredClone(pca), bytes = JSON.stringify(fixture);
  const controller = new AbortController();
  await assert.rejects(loadUmapProjection(snapshot, skills, pca, controller.signal, hash(bytes), async () => new Response('', {status: 503})), /request failed/);
  await assert.rejects(loadUmapProjection(snapshot, skills, pca, controller.signal, hash(bytes), async () => {throw Error('Network unavailable');}), /Network unavailable/);
  controller.abort();
  await assert.rejects(loadUmapProjection(snapshot, skills, pca, controller.signal, hash(bytes), async () => new Response(bytes)), {name: 'AbortError'});
  assert.deepEqual(pca, before);
});
