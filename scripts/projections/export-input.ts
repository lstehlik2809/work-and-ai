import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {dirname} from 'node:path';
import {buildOccupationMap} from '../../src/domain/occupation-map';
import {validateSkills} from '../../src/search/skills';
import type {Snapshot} from '../../src/domain/types';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const occupationsBytes = readFileSync('public/data/occupations.json');
const skillsBytes = readFileSync('public/data/skills.json');
const snapshot: Snapshot = JSON.parse(occupationsBytes.toString('utf8'));
const skills = validateSkills(JSON.parse(skillsBytes.toString('utf8')), snapshot.release.id);
const map = buildOccupationMap(snapshot, skills);
const profile = {release: snapshot.release.id, skills: skills.skills.map(skill => skill.id),
  occupations: map.nodes.map(node => [node.occupation.code, ...skills.skills.map((_, i) => node.importantSkills.includes(i) ? 1 : 0)])};
const payload = {profile, profileSha256: hash(JSON.stringify(profile)),
  sourceSha256: {occupations: hash(occupationsBytes), skills: hash(skillsBytes)},
  pcaRaw: map.nodes.map(node => [node.x, node.y]), pcaDisplay: map.nodes.map(node => [node.displayX, node.displayY]),
  pcaExplainedVariance: map.explainedVariance};
const output = process.argv[2] ?? 'data/projection-evaluation/input.json';
mkdirSync(dirname(output), {recursive: true});
writeFileSync(output, JSON.stringify(payload) + '\n');
console.log(JSON.stringify({output, profileSha256: payload.profileSha256, count: map.nodes.length}));
