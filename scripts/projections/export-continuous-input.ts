import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {buildContinuousMapProfiles, continuousProfilePayload} from '../../src/domain/occupation-map-continuous';
import {spaceOccupationMap} from '../../src/domain/occupation-map-spacing';
import {validateSkills} from '../../src/search/skills';
import type {Snapshot} from '../../src/domain/types';
const hash = (v: string | Buffer) => createHash('sha256').update(v).digest('hex');
const out = 'data/continuous-projection-evaluation';
const occupations = readFileSync('public/data/occupations.json'), skillBytes = readFileSync('public/data/skills.json');
const snapshot: Snapshot = JSON.parse(occupations.toString());
const skills = validateSkills(JSON.parse(skillBytes.toString()), snapshot.release.id);
const model = buildContinuousMapProfiles(snapshot, skills);
const profile = continuousProfilePayload(snapshot, skills, model);
const baselineBytes = readFileSync(`${out}/historical-umap.json`);
const baseline = JSON.parse(baselineBytes.toString());
if (baseline.schemaVersion !== 1 || baseline.nodes.length !== 772) throw Error('Expected frozen historical 772-node artifact');
const display = spaceOccupationMap(baseline.nodes);
const payload = {profile, profileCanonical: JSON.stringify(profile), profileSha256: hash(JSON.stringify(profile)),
  sourceSha256: {occupations: hash(occupations), skills: hash(skillBytes)}, baselineSha256: hash(baselineBytes),
  baselineDisplay: model.nodes.map(node => {const p = display.get(node.occupation.code)!; return [p.displayX, p.displayY];})};
mkdirSync(out, {recursive: true});
writeFileSync(`${out}/input.json`, JSON.stringify(payload) + '\n');
console.log(JSON.stringify({count: model.nodes.length, profileSha256: payload.profileSha256}));
