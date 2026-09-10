import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SkillsEngine,validateSkills} from '../src/search/skills';
import type {SkillsData} from '../src/search/skills';
import type {Snapshot} from '../src/domain/types';
const snapshot:Snapshot=JSON.parse(readFileSync('public/data/occupations.json','utf8'));
const data:SkillsData=validateSkills(JSON.parse(readFileSync('public/data/skills.json','utf8')),snapshot.release.id);
const engine=new SkillsEngine(data,snapshot);
const ids=(...names:string[])=>names.map(name=>data.skills.find(s=>s.name===name)!.id);
test('source-grounded skill combinations distinguish technical, mechanical and teaching roles',()=>{
 const mechanical=engine.search(ids('Equipment Maintenance','Repairing'),10);assert.equal(mechanical.candidates[0].roleCode,'49-3011.00');assert.match(mechanical.candidates[0].reason!,/4.88\/5/);
 const programming=engine.search(ids('Programming','Systems Analysis'),10);assert.equal(programming.candidates[0].roleCode,'15-1251.00');
 const broad=engine.search(ids('Active Listening','Speaking'),10),specific=engine.search(ids('Active Listening','Speaking','Programming'),10);assert.notDeepEqual(specific.candidates.map(c=>c.code),broad.candidates.map(c=>c.code));assert(specific.candidates.some(c=>c.code.startsWith('15-')));
 const teaching=engine.search(ids('Instructing','Learning Strategies'),10);assert(teaching.candidates.filter(c=>c.code.startsWith('25-')).length>=5);
 for(const out of [mechanical,programming,broad,specific,teaching])for(const c of out.candidates){const role=snapshot.occupations.find(o=>o.code===c.code)!.roles.find(r=>r.code===c.roleCode)!;assert(role);assert.equal(c.excerpt,role.description);assert.equal(c.source,role.source);}
});
test('selection boundaries, stable prefixes and missing data exclusions',()=>{
 const selected=ids('Programming','Systems Analysis');assert.equal(engine.search([]).candidates.length,0);assert.equal(engine.search(['invalid']).candidates.length,0);assert.deepEqual(engine.search([...selected,selected[0],'bad']),engine.search(selected));assert.deepEqual(engine.search([...selected].reverse()),engine.search(selected));
 const all=engine.search(selected,10);for(const limit of [1,5,10])assert.deepEqual(engine.search(selected,limit).candidates,all.candidates.slice(0,limit));assert.equal(engine.search(selected,0).candidates.length,1);assert.equal(engine.search(selected,99).candidates.length,10);assert.equal(engine.search(selected,NaN).candidates.length,5);
 assert.equal(new Set(all.candidates.map(c=>c.code)).size,all.candidates.length);for(const c of all.candidates)assert(!data.coverage.missingRoles.includes(c.roleCode!));
});
test('published statistics and unselected skills cannot determine ranking',()=>{
 const changed=structuredClone(snapshot);changed.occupations.forEach(o=>{o.exposure='Very high';o.growth=999;o.annualOpenings=0;});assert.deepEqual(new SkillsEngine(data,changed).search(ids('Programming')),engine.search(ids('Programming')));
 const altered=structuredClone(data),index=data.skills.findIndex(s=>s.name==='Programming');for(const r of altered.roles)r.importance=r.importance.map((v,i)=>i===index?v:5);assert.deepEqual(new SkillsEngine(altered,snapshot).search(ids('Programming')),engine.search(ids('Programming')));
});
test('rare important skill outweighs common skills; strongest mapped role survives deduplication',()=>{
 const small={...data,skills:data.skills.slice(0,2),roles:[{code:'a',importance:[5,2]},{code:'b',importance:[3,5]},{code:'c',importance:[5,null]},{code:'d',importance:[5,1]}]} as SkillsData;
 const snap={...snapshot,occupations:[{...snapshot.occupations[0],code:'one',roles:[{...snapshot.occupations[0].roles[0],code:'a'},{...snapshot.occupations[0].roles[0],code:'b'}]},{...snapshot.occupations[1],code:'two',roles:[{...snapshot.occupations[1].roles[0],code:'c'}]}]};
 const e=new SkillsEngine(small,snap);assert.equal(e.search(small.skills.map(s=>s.id)).candidates[0].roleCode,'b');assert.equal(e.search([small.skills[1].id]).candidates.length,1);assert.match(e.search(small.skills.map(s=>s.id)).candidates[1].reason!,/unavailable/);
});
test('bad or mismatched lazy datasets fail safely',()=>{assert.throws(()=>validateSkills({},snapshot.release.id));assert.throws(()=>validateSkills(data,'bad-release'));const broken=structuredClone(data);broken.roles[0].importance[0]=6;assert.throws(()=>validateSkills(broken,snapshot.release.id));});
