import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SearchEngine} from '../src/search/engine';
import type {Lexicon,Snapshot,SearchOutcome} from '../src/domain/types';

const published:Snapshot=JSON.parse(readFileSync('public/data/occupations.json','utf8'));
const aliases:Lexicon=JSON.parse(readFileSync('public/data/lexicon.json','utf8'));
const engine=new SearchEngine(published,aliases);
// Ten equally supported occupations and ninety unrelated ones make the four
// shared terms informative, with independent, predictable ranking/count oracles.
const snapshot:Snapshot={release:published.release,occupations:Array.from({length:100},(_,i)=>{
 const code=`test-${String(i).padStart(3,'0')}`,title=i<10?`Quantum craft ${i}`:`Unrelated occupation ${i}`;
 return {...published.occupations[0],code,title,source:`source:${code}`,roles:[{
  code:`${code}.00`,title,description:i<10?'zircon prism lattice quartz':'unrelated ordinary material',
  source:`role:${code}`,broader:false,tasks:[],
 }]};
})};
const lexicon:Lexicon={release:aliases.release,aliases:snapshot.occupations.slice(0,10).map(o=>({title:'Crystal operator',code:o.code,onetCode:o.roles[0].code}))};
const controlled=new SearchEngine(snapshot,lexicon);
const codes=snapshot.occupations.slice(0,10).map(o=>o.code);
const evidence=codes.map((code,i)=>({code,score:.65-i*.001}));
const short='zircon prism';
const long='zircon prism lattice quartz amber garnet sapphire ruby emerald opal topaz diamond';
function verifySources(out:SearchOutcome,data:Snapshot,limit:number){
 assert(out.candidates.length<=limit);
 assert.equal(new Set(out.candidates.map(c=>c.code)).size,out.candidates.length);
 for(const candidate of out.candidates){
  const occupation=data.occupations.find(o=>o.code===candidate.code);
  const role=occupation?.roles.find(r=>r.code===candidate.roleCode);
  assert(role,'each candidate must retain a role from the canonical source');
  if(candidate.excerptKind==='description'){
   assert.equal(candidate.excerpt,role.description);assert.equal(candidate.source,role.source);
   assert.equal(candidate.taskId,undefined);
  }else{
   assert.equal(candidate.excerptKind,'task');const task=role.tasks.find(t=>t.id===candidate.taskId);
   assert(task);assert.equal(candidate.excerpt,task.text);assert.equal(candidate.source,task.source);
  }
 }
}
test('explicit 1/5/10 preserve title, lexical and strict hybrid prefixes and source identity',()=>{
 for(const run of [
  (n:number)=>controlled.title('Crystal operator',n),
  (n:number)=>controlled.lexical(short,n),
  (n:number)=>controlled.hybrid('',short,evidence,n),
  (n:number)=>controlled.hybrid('Crystal operator','unrelated',[],n),
 ])for(const n of [1,5,10]){
  const out=run(n);assert.deepEqual(out.candidates.map(c=>c.code),codes.slice(0,n));
  assert.deepEqual(out.candidates,run(10).candidates.slice(0,n));verifySources(out,snapshot,n);
 }
 assert.equal(controlled.lexical(short).candidates.length,3);
 assert.equal(controlled.hybrid('',short,evidence).candidates.length,3);
});
test('explicit title cutoff is ten independent of requested length across lookup paths',()=>{
 for(const query of ['Crystal operator','Crystal operators','quantum','Crystl operator']){
  assert.equal(controlled.title(query).state,'clarify',query);
  for(const n of [1,5,10])assert.deepEqual(controlled.title(query,n).candidates.map(c=>c.code),codes.slice(0,n),query);
 }
 const crowded=new SearchEngine(snapshot,{...lexicon,aliases:[...lexicon.aliases,{title:'Crystal operator',code:snapshot.occupations[10].code,onetCode:null}]});
 for(const n of [1,5,10])assert.equal(crowded.title('Crystal operator',n).state,'clarify');
 for(const n of [1,5,10])assert.equal(engine.title('engineer',n).state,'clarify');
});
test('explicit hybrid expansion supports ten results while preserving legacy two and role guards',()=>{
 const semantic=codes.map((code,i)=>({code,score:i===0?.8:.61}));
 assert.equal(controlled.hybrid('',long,semantic).candidates.length,2);
 for(const n of [1,5,10]){
  const out=controlled.hybrid('',long,semantic,n);
  assert.deepEqual(out.candidates.map(c=>c.code),codes.slice(0,n));verifySources(out,snapshot,n);
 }
 const changed=structuredClone(snapshot);changed.occupations[1].roles[0].title='Quantum supervisor';
 const guarded=new SearchEngine(changed,lexicon).hybrid('',long,semantic,10);
 assert.equal(guarded.candidates[0].code,codes[0]);
 assert.deepEqual(guarded.candidates.map(c=>c.code),codes.filter(c=>c!==codes[1]));
});
test('limits never pad insufficient evidence or loosen abstention and semantic thresholds',()=>{
 for(const n of [1,5,10]){
  for(const query of ['qzxv blorpt 739','I work with people and attend meetings']){
   assert.equal(controlled.lexical(query,n).candidates.length,0);
   assert.equal(controlled.hybrid('',query,evidence.map(r=>({...r,score:.99})),n).candidates.length,0);
  }
  assert.equal(controlled.hybrid('',short,evidence.map(r=>({...r,score:.37})),n).candidates.length,0);
  assert.equal(controlled.hybrid('',short,[],n).candidates.length,0);
  const single=controlled.hybrid('',short,[evidence[0]],n);
  assert.deepEqual(single.candidates.map(c=>c.code),[codes[0]]);
 }
 const insufficient=evidence.map((r,i)=>({...r,score:i===1?.58:r.score}));
 assert.deepEqual(controlled.hybrid('',short,insufficient,10).candidates.map(c=>c.code),codes.filter(c=>c!==codes[1]));
});
test('explicit limits are finite integers clamped to 1..10',()=>{
 for(const run of [(n:number)=>controlled.title('Crystal operator',n),(n:number)=>controlled.lexical(short,n),(n:number)=>controlled.hybrid('',short,evidence,n)]){
  for(const [input,count] of [[0,1],[-3,1],[1.9,1],[5.9,5],[99,10],[NaN,5],[Infinity,5],[-Infinity,5]])assert.equal(run(input).candidates.length,count);
 }
});
test('published expanded title matches retain strict source provenance and stable prefixes',()=>{
 const out=engine.title('electrical',5);
 assert.equal(engine.title('electrical').state,'clarify');
 assert.equal(out.candidates.length,5);
 for(const n of [1,5,10]){
  const result=engine.title('electrical',n);
  assert.deepEqual(result.candidates,engine.title('electrical',10).candidates.slice(0,n));
  verifySources(result,published,n);
 }
});
