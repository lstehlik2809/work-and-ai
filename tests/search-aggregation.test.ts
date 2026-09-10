import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error Production build helper is an ESM JavaScript module.
import {selectRoles,uniquePassages,normalizedCentroid} from '../scripts/semantic/aggregation.mjs';
import {SearchEngine} from '../src/search/engine';
import {readFileSync} from 'node:fs';
import type {Snapshot,Lexicon} from '../src/domain/types';
test('production role selection is invariant to duplicate relationships and source ordering',()=>{
 const roles=[{code:'x'},{code:'a'},{code:'z'},{code:'c'},{code:'q'}];const selected=selectRoles(roles,3);assert.deepEqual(selected.map((r:{code:string})=>r.code),['a','q','z']);
 for(const copies of [2,10])assert.deepEqual(selectRoles(Array.from({length:copies},()=>roles).flat().reverse(),3),selected);
});
test('production passage dedupe and normalized centroid cannot gain weight from representation duplication',()=>{
 const passages=[{text:'financial accounting'},{text:'audit records'},{text:'prepare statements'}];const vectors=[new Float32Array([1,0,0]),new Float32Array([0,1,0]),new Float32Array([0,0,1])];const original=normalizedCentroid(vectors);
 const rank=(v:Float32Array)=>[{code:'A',score:v[0]+v[1]+v[2]},{code:'B',score:v[0]},{code:'C',score:-v[2]}].sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code)).map(r=>r.code);
 for(const copies of [2,10]){const repeated=Array.from({length:copies},()=>passages).flat().reverse();assert.deepEqual(uniquePassages(repeated).map((p:{text:string})=>p.text).sort(),passages.map(p=>p.text).sort());const next=normalizedCentroid([...Array.from({length:copies},()=>vectors).flat(),vectors[0]].reverse());assert(Math.abs(Math.hypot(...next)-1)<1e-6);for(let i=0;i<original.length;i++)assert(Math.abs(next[i]-original[i])<1e-6);assert.deepEqual(rank(next),rank(original));}
});
test('duplicated specialist relationships and passage order leave canonical lexical ranking unchanged',()=>{
 const snapshot:Snapshot=JSON.parse(readFileSync('public/data/occupations.json','utf8')),lexicon:Lexicon=JSON.parse(readFileSync('public/data/lexicon.json','utf8'));const original=new SearchEngine(snapshot,lexicon);
 const changed=structuredClone(snapshot);for(const o of changed.occupations){o.roles=[...o.roles,...o.roles].reverse();for(const r of o.roles)r.tasks=[...r.tasks,...r.tasks].reverse();}const repeated=new SearchEngine(changed,lexicon);
 for(const q of ['I reconcile financial accounts and prepare audited financial statements.','I install and repair electrical wiring and circuit breakers in buildings.']){const a=original.bm25(q),b=repeated.bm25(q);assert.deepEqual(b.map(r=>r.code),a.map(r=>r.code));for(let i=0;i<a.length;i++)assert(Math.abs(a[i].score-b[i].score)<1e-8);assert.deepEqual(repeated.lexical(q).candidates.map(c=>c.code),original.lexical(q).candidates.map(c=>c.code));}
});
