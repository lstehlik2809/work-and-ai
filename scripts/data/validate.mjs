import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
export const root = fileURLToPath(new URL('../../', import.meta.url));
const hash = b => createHash('sha256').update(b).digest('hex');
export const read = p => JSON.parse(readFileSync(resolve(root, p), 'utf8'));
const text = v => typeof v === 'string' && v.trim().length > 0;
const metric = v => v === null || typeof v === 'number' && Number.isFinite(v);
const norm = s => s.toLowerCase().replace(/[^\p{L}\p{N}_]+/gu, ' ').trim();

export function validateRelations(occupations, mappings) {
  const expected = new Set(mappings.map(m => `${m.code}|${m.onetCode}`));
  assert.equal(expected.size, mappings.length, 'duplicate crosswalk relationship');
  const actual = [];
  for (const o of occupations) for (const role of o.roles) actual.push(`${o.code}|${role.code}`);
  assert.equal(new Set(actual).size, actual.length, 'duplicate role relationship');
  assert.deepEqual(new Set(actual), expected, 'missing or invented crosswalk relationship');
}

export function validateData(snapshot, lexicon, reference) {
  const {release, occupations} = snapshot;
  assert.equal(release.id, reference.release, 'release mismatch');
  assert.equal(lexicon.release, release.id, 'lexicon release mismatch');
  assert(text(release.bls) && text(release.onet) && Number.isFinite(Date.parse(release.retrieved)), 'release provenance');
  assert.equal(release.startYear, reference.startYear, 'start year');
  assert.equal(release.endYear, reference.endYear, 'end year');
  for (const k of ['exposure','methodology','outlook','mapping','directory','onet','license']) assert(/^https:\/\//.test(release.sources[k]), `release source ${k}`);
  assert.equal(reference.units.annualOpenings, 'jobs per year; source thousands multiplied by 1000', 'openings unit');
  assert.equal(reference.units.growth, 'percent change over projection period', 'growth unit');
  const canon = new Map(reference.detailed.map(o => [o.code, o]));
  assert.equal(canon.size, reference.detailed.length, 'duplicate source detailed ID');
  assert.equal(occupations.length, canon.size, 'full population coverage');
  assert.equal(new Set(occupations.map(o => o.code)).size, occupations.length, 'duplicate canonical ID');
  const aliases = new Set();
  const byCode = new Map(occupations.map(o => [o.code, o]));
  for (const o of occupations) {
    assert(canon.has(o.code) && !reference.summaryCodes.includes(o.code), `non-detailed ID ${o.code}`);
    const src = canon.get(o.code);
    assert.equal(o.title, src.title, 'official title');
    assert.equal(o.sourceRow, src.row, 'source row');
    assert.equal(o.source, reference.source['ai-exposure-categories.xlsx'], 'exposure provenance');
    assert.equal(o.mappingSource, reference.source['bls-crosswalk.xlsx'], 'mapping provenance');
    assert.equal(o.startYear, release.startYear, 'occupation start year');
    assert.equal(o.endYear, release.endYear, 'occupation end year');
    assert(o.exposure === null || ['Low','Moderate','High','Very high'].includes(o.exposure), 'category');
    for (const field of ['growth','annualOpenings']) assert(metric(o[field]), `malformed metric ${field}`);
    assert(o.annualOpenings === null || Number.isInteger(o.annualOpenings) && o.annualOpenings >= 0, 'openings count');
    for (const field of ['exposure','growth','annualOpenings']) assert.equal(o[field], src[field], `source value ${field}`);
    for (const role of o.roles) {
      assert(/^\d{2}-\d{4}\.\d{2}$/.test(role.code) && text(role.title) && text(role.description), 'role schema');
      assert.equal(role.source, reference.source['occupation_data.csv'], 'role provenance');
      assert.equal(role.broader, o.roles.length > 1 || norm(role.title) !== norm(o.title), 'broader mapping label');
      assert(role.tasks.length <= 3 && new Set(role.tasks.map(t => t.id)).size === role.tasks.length, 'task bound/duplicates');
      for (const task of role.tasks) assert(/^\d+$/.test(task.id) && text(task.text) && /^\d{2}\/\d{4}$/.test(task.date) && task.source === reference.source['task_statements.csv'], 'task provenance');
    }
  }
  validateRelations(occupations, reference.mappings);
  for (const a of lexicon.aliases) {
    assert(text(a.title) && byCode.has(a.code), 'alias reference');
    assert(a.onetCode === null || byCode.get(a.code).roles.some(r => r.code === a.onetCode), 'alias role relationship');
    const key = JSON.stringify([a.title,a.code,a.onetCode]);
    assert(!aliases.has(key), 'duplicate alias'); aliases.add(key);
  }
  assert.equal(aliases.size, reference.aliasCount, 'full alias coverage');
  for (const o of occupations) {
    assert(aliases.has(JSON.stringify([o.title,o.code,null])), 'official alias coverage');
    for (const r of o.roles) assert(aliases.has(JSON.stringify([r.title,o.code,r.code])), 'role title coverage');
  }
  return {occupations: occupations.length, relations: reference.mappings.length, aliases: aliases.size};
}

export function validateCommitted() {
  const manifest = read('data/source-manifest.json');
  for (const f of manifest.files) {
    const stored = readFileSync(resolve(root, f.path));
    assert.equal(hash(stored), f.storedSha256, `stored source checksum ${f.id}`);
    const raw = f.path.endsWith('.gz') ? gunzipSync(stored) : stored;
    assert.equal(hash(raw), f.sha256, `raw source checksum ${f.id}`);
    assert.equal(raw.length, f.bytes, 'source bytes');
    assert(/^https:\/\/(www\.)?(bls.gov|onetcenter.org)\//.test(f.url) && text(f.release) && text(f.license) && Number.isFinite(Date.parse(f.retrieved)), 'source manifest provenance');
  }
  const reference = read('data/source-reference.json');
  const snapshot = read('public/data/occupations.json');
  const stats = validateData(snapshot, read('public/data/lexicon.json'), reference);
  assert.equal(snapshot.release.retrieved, manifest.files.map(f=>f.retrieved).sort().at(-1), 'retrieval metadata');
  const exceptions = read('data/exceptions.json');
  assert.equal(exceptions.release, reference.release, 'exception release');
  const mapped = new Set(reference.mappings.map(m=>m.onetCode));
  const same = (a,b,label) => assert.deepEqual([...a].sort(),[...b].sort(),label);
  same(exceptions.unmappedOnet.map(r=>r.code),reference.onetCodes.filter(c=>!mapped.has(c)),'unmapped O*NET report');
  same(exceptions.excludedSummaryCodes,reference.summaryCodes,'summary exclusion report');
  same(exceptions.unmappedBls,snapshot.occupations.filter(o=>!o.roles.length).map(o=>o.code),'unmapped BLS report');
  same(exceptions.missingExposure,snapshot.occupations.filter(o=>o.exposure===null).map(o=>o.code),'missing exposure report');
  same(exceptions.withoutCoreTasks,[...new Set(snapshot.occupations.flatMap(o=>o.roles.filter(r=>!r.tasks.length).map(r=>r.code)))],'missing task report');
  same(exceptions.broaderMappings.map(m=>`${m.code}|${m.onetCode}`),snapshot.occupations.flatMap(o=>o.roles.filter(r=>r.broader).map(r=>`${o.code}|${r.code}`)),'broader report');
  for(const [field,from,to] of [['oneOnetToManyBls','onetCode','code'],['manyOnetToOneBls','code','onetCode']]) {
    const grouped = new Map();
    for(const m of reference.mappings) grouped.set(m[from],[...(grouped.get(m[from])??[]),m[to]]);
    const expected=Object.fromEntries([...grouped].filter(([,v])=>v.length>1));
    assert.deepEqual(exceptions[field],expected,`${field} cardinality report`);
  }
  for (const [path, key] of [['occupations','snapshotSha256'],['lexicon','lexiconSha256']]) assert.equal(hash(readFileSync(resolve(root, `public/data/${path}.json`))), reference[key], `${path} artifact checksum`);
  return {status:'PASS', ...stats, sources:manifest.files.length};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { console.log(JSON.stringify(validateCommitted())); }
  catch (e) { console.error(JSON.stringify({status:'FAIL',error:e.message})); process.exitCode = 1; }
}
