import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SearchEngine,normalize} from '../src/search/engine';
import type {Lexicon,Snapshot,SearchOutcome} from '../src/domain/types';
const snapshot:Snapshot=JSON.parse(readFileSync('public/data/occupations.json','utf8'));
const lexicon:Lexicon=JSON.parse(readFileSync('public/data/lexicon.json','utf8'));
const engine=new SearchEngine(snapshot,lexicon);
const publicCodes=new Set(snapshot.occupations.map(o=>o.code));
function assertEvidence(out:SearchOutcome){assert(out.candidates.length<=3);assert.equal(new Set(out.candidates.map(c=>c.code)).size,out.candidates.length);for(const c of out.candidates){assert(publicCodes.has(c.code));const o=snapshot.occupations.find(o=>o.code===c.code)!,role=o.roles.find(r=>r.code===c.roleCode);assert(role,'excerpt role must belong to canonical occupation');if(c.excerptKind==='description'){assert.equal(c.excerpt,role.description);assert.equal(c.source,role.source);assert.equal(c.taskId,undefined);}else{assert.equal(c.excerptKind,'task');const task=role.tasks.find(t=>t.id===c.taskId);assert(task,'excerpt must retain original task ID');assert.equal(c.excerpt,task.text);assert.equal(c.source,task.source);}}}
test('complete source aliases retain unique exact matches and ambiguity in both modes',()=>{
 // Oracle is assembled independently from the source-reconciled public alias tuples.
 const oracle=new Map<string,Set<string>>();for(const a of lexicon.aliases){const key=a.title.toLowerCase().normalize('NFKC').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');if(!oracle.has(key))oracle.set(key,new Set());oracle.get(key)!.add(a.code);}
 for(const [q,codes] of oracle){
  const a=engine.title(q);assert(a.exact,`exact: ${q}`);assertEvidence(a);
  if(codes.size===1)assert.deepEqual(a.candidates.map(c=>c.code),[...codes],q);
  else if(codes.size<=3&&a.state==='candidates')assert.deepEqual(a.candidates.map(c=>c.code).sort(),[...codes].sort(),q);
  else assert.equal(a.state,'clarify',q);
  assert.deepEqual(engine.hybrid(q,'completely unrelated words',[]),a,`hybrid exact preservation: ${q}`);
 }
});
test('normalization preserves role distinctions and source descriptions',()=>{
 for(const [q,code] of [['  SOFTWARE---DEVELOPERS ','15-1252'],['dental assistant','31-9091'],['dental hygienist','29-1292'],['human resources manager','11-3121'],['human resources assistant','43-4161'],['Chief Sustainability Officers','11-1011']]){const o=engine.title(q);assert.equal(o.candidates[0]?.code,code);assertEvidence(o);}
 assert.notEqual(normalize('engineering technician'),normalize('engineering manager'));
});
test('nonsense, vague responsibilities and unrelated questions cannot force candidates',()=>{
 for(const q of ['qzxv blorpt 739','What is the weather tomorrow?'])assert.equal(engine.title(q).candidates.length,0,q);
 assert.equal(engine.lexical('I work with people and solve problems.').state,'clarify');
 assert.equal(engine.title('engineer').state,'clarify');
});
test('published statistics cannot influence lexical or hybrid ranking',()=>{
 const changed=structuredClone(snapshot);changed.occupations.forEach((o,i)=>{o.exposure=['Low','Moderate','High','Very high'][i%4] as typeof o.exposure;o.growth=1000-i;o.annualOpenings=i;});const alternate=new SearchEngine(changed,lexicon);
 for(const q of ['Accountants and auditors','electrcian','I install and repair electrical wiring and circuit breakers in buildings.']){
  assert.deepEqual(alternate.title(q),engine.title(q));assert.deepEqual(alternate.bm25(q).map(r=>[r.code,r.score]),engine.bm25(q).map(r=>[r.code,r.score]));
  const evidence=engine.bm25(q).slice(0,10).map((r,i)=>({code:r.code,score:.8-i*.01}));assert.deepEqual(alternate.hybrid('',q,evidence),engine.hybrid('',q,evidence));
 }
});
test('repeated canonical semantic evidence does not change shortlist or add weight',()=>{
 const query='I install and repair electrical wiring and circuit breakers in buildings.';const evidence=engine.bm25(query).slice(0,12).map((r,i)=>({code:r.code,score:.8-i*.02}));const expected=engine.hybrid('',query,evidence);
 for(const copies of [2,10])assert.deepEqual(engine.hybrid('',query,Array.from({length:copies},()=>evidence).flat().reverse()),expected);
});
test('F-SR01 recorded evidence replay preserves rankings and validates description/task provenance',()=>{
 const report=JSON.parse(readFileSync('data/evaluation/heldout-results.json','utf8'));
 for(const row of report.rows){const f=row.fixture;const baseline=f.type==='title'?engine.title(f.input):engine.lexical(f.input),hybrid=engine.hybrid(f.type==='title'?f.input:'',f.input,row.semanticRanks);for(const [actual,prior] of [[baseline,row.baseline],[hybrid,row.hybrid]] as [SearchOutcome,SearchOutcome][]){assert.equal(actual.state,prior.state,f.id);assert.equal(actual.exact,prior.exact,f.id);assert.deepEqual(actual.candidates.map(c=>c.code),prior.candidates.map(c=>c.code),f.id);assert.deepEqual(actual.candidates.map(c=>c.excerpt),prior.candidates.map(c=>c.excerpt),f.id);assertEvidence(actual);}}
});
test('F-SR01 H12 receipt task retains source URL and task identity in lexical and hybrid candidates',()=>{
 const row=JSON.parse(readFileSync('data/evaluation/heldout-results.json','utf8')).rows.find((r:{fixture:{id:string}})=>r.fixture.id==='H12');
 const outputs=[engine.lexical(row.fixture.input),engine.hybrid('',row.fixture.input,row.semanticRanks)];
 for(const out of outputs){assertEvidence(out);for(const c of out.candidates.filter(c=>c.excerptKind==='task')){assert.equal(c.source,snapshot.occupations.find(o=>o.code===c.code)!.roles.find(r=>r.code===c.roleCode)!.tasks.find(t=>t.id===c.taskId)!.source);}}
 const receipt=outputs[1].candidates.find(c=>c.code==='41-2011');assert(receipt);assert.equal(receipt.excerptKind,'task');assert.match(receipt.excerpt??'',/receipts/i);assert(receipt.taskId);assert.match(receipt.source??'',/task_statements\.csv$/);
});
