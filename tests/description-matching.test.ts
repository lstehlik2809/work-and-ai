import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SearchEngine} from '../src/search/engine';
import type {Snapshot,Lexicon,SemanticEvidence,SearchOutcome} from '../src/domain/types';

const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const snapshot:Snapshot=read('public/data/occupations.json'),lexicon:Lexicon=read('public/data/lexicon.json');
const engine=new SearchEngine(snapshot,lexicon);
const recorded=read('tests/fixtures/description-semantic-evidence.json') as {
 fixtureSha256:string;metadataSha256:string;rows:{id:string;input:string;scores:Record<string,number>}[];
};
interface Fixture {id:string;input:string;expectedLead?:string;required?:string[];allowed?:string[];excluded?:string[];expectedState?:string;expectedRoles?:Record<string,string>;leadAnyOf?:string[];requiredAnyOf?:string[];excludedRoles?:string[]}
const fixtures:Fixture[]=read('data/evaluation/matching-v2-development.json').cases;
const evidenceFor=(id:string)=>{const row=recorded.rows.find(r=>r.id===id)!;return {...row,evidence:Object.entries(row.scores).map(([code,score]):SemanticEvidence=>({code,score}))};};
function verifySources(out:SearchOutcome){
 assert(out.candidates.length<=3);assert.equal(new Set(out.candidates.map(c=>c.code)).size,out.candidates.length);
 for(const c of out.candidates){
  const occupation=snapshot.occupations.find(o=>o.code===c.code),role=occupation?.roles.find(r=>r.code===c.roleCode);
  assert(role,'candidate role belongs to its canonical result');
  if(c.excerptKind==='description'){assert.equal(c.excerpt,role.description);assert.equal(c.source,role.source);assert.equal(c.taskId,undefined);}
  else{assert.equal(c.excerptKind,'task');const task=role.tasks.find(t=>t.id===c.taskId);assert(task);assert.equal(c.excerpt,task.text);assert.equal(c.source,task.source);}
 }
}

test('development replay is bound to approved cases and pinned source/index metadata',()=>{
 const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
 assert.equal(hash('data/evaluation/matching-v2-development.json'),recorded.fixtureSha256);
 assert.equal(hash('public/semantic/metadata.json'),recorded.metadataSha256);
 assert.deepEqual(recorded.rows.map(r=>[r.id,r.input]),fixtures.map(f=>[f.id,f.input]));
});
function verifyExpected(fixture:Fixture,evidence:SemanticEvidence[]){
 const out=engine.hybrid('',fixture.input,evidence),codes=out.candidates.map(c=>c.code);
 if(fixture.expectedState)assert.equal(out.state,fixture.expectedState);
 if(fixture.expectedLead)assert.equal(codes[0],fixture.expectedLead);
 if(fixture.leadAnyOf)assert(fixture.leadAnyOf.includes(codes[0]));
 if(fixture.requiredAnyOf)assert(fixture.requiredAnyOf.some(c=>codes.includes(c)));
 for(const code of fixture.required||[])assert(codes.includes(code),`missing ${code}`);
 for(const c of out.candidates){if(fixture.allowed)assert(fixture.allowed.includes(c.code),`unexpected ${c.code}`);assert(!fixture.excluded?.includes(c.code));if(fixture.expectedRoles?.[c.code])assert.equal(c.roleCode,fixture.expectedRoles[c.code]);assert(!fixture.excludedRoles?.includes(c.roleCode||''));}
 verifySources(out);
}
for(const fixture of fixtures)test(`AS-M1 ${fixture.id}: development responsibilities and sourced specialty`,()=>{
 verifyExpected(fixture,evidenceFor(fixture.id).evidence);
});

test('F-M1-SR01: exposed first-evaluation regressions preserve strong semantic secondary evidence',()=>{
 const exposed=read('tests/fixtures/description-exposed-regression-evidence.json') as typeof recorded;
 const fixtures:Fixture[]=read('data/evaluation/matching-v2-reserved.json').cases;
 const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
 assert.equal(hash('data/evaluation/matching-v2-reserved.json'),exposed.fixtureSha256);
 assert.equal(hash('public/semantic/metadata.json'),exposed.metadataSha256);
 assert.deepEqual(exposed.rows.map(r=>[r.id,r.input]),fixtures.map(f=>[f.id,f.input]));
 for(const fixture of fixtures){
  const row=exposed.rows.find(r=>r.id===fixture.id)!;
  const evidence=Object.entries(row.scores).map(([code,score])=>({code,score}));
  verifyExpected(fixture,evidence);
  assert.deepEqual(engine.hybrid('',fixture.input,[...evidence,...evidence].reverse()),engine.hybrid('',fixture.input,evidence));
 }
});

test('long descriptions retain canonical results and source excerpts under duplicates, ordering and statistics changes',()=>{
 const changed=structuredClone(snapshot);
 changed.occupations.reverse();
 for(const [i,o] of changed.occupations.entries()){
  o.roles=[...o.roles,...o.roles].reverse();for(const r of o.roles)r.tasks=[...r.tasks,...r.tasks].reverse();
  o.growth=1000-i;o.annualOpenings=i;o.exposure=i%2?'Low':'Very high';
 }
 const alternate=new SearchEngine(changed,lexicon);
 for(const id of ['U01','V02','V06']){
  const row=evidenceFor(id),expected=engine.hybrid('',row.input,row.evidence);
  const duplicated=[...row.evidence,...row.evidence,...row.evidence.map(r=>({...r,score:r.score-.1}))].reverse();
  assert.deepEqual(alternate.hybrid('',row.input,duplicated),expected,id);verifySources(expected);
 }
});

test('high semantic scores cannot force a result without lexical corroboration',()=>{
 const evidence=evidenceFor('U01').evidence.map(r=>({...r,score:.95}));
 for(const input of ['qzxv blorpt 739','I work with people, attend meetings, answer emails, and help solve problems.','qzxv blorpt plonk zzzxxx ggguuu qqqsss rrrttt pppeee xxxyyy fffhhh nnnuuu bbbvvv'])assert.equal(engine.hybrid('',input,evidence).candidates.length,0,input);
 assert.equal(engine.hybrid('',evidenceFor('U01').input,[]).state,'none');
});

test('M2: broad audit preserves every previously correct lead and does not invent cook supervision',()=>{
 const audit=read('tests/fixtures/description-audit-regression-evidence.json') as Omit<typeof recorded,'rows'>&{rows:(typeof recorded.rows[number]&{baselineLead?:string})[]};
 const fixtures:Fixture[]=read('data/evaluation/matching-v2-occupational-audit.json').cases;
 const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
 assert.equal(hash('data/evaluation/matching-v2-occupational-audit.json'),audit.fixtureSha256);
 assert.equal(hash('public/semantic/metadata.json'),audit.metadataSha256);
 assert.deepEqual(audit.rows.map(r=>[r.id,r.input]),fixtures.map(f=>[f.id,f.input]));
 let preserved=0;
 for(const fixture of fixtures){
  const row=audit.rows.find(r=>r.id===fixture.id)!;
  const evidence=Object.entries(row.scores).map(([code,score])=>({code,score}));
  const out=engine.hybrid('',fixture.input,evidence);verifySources(out);
  if(fixture.expectedLead&&row.baselineLead===fixture.expectedLead){
   assert.equal(out.candidates[0]?.code,fixture.expectedLead,fixture.id);preserved++;
   if(fixture.expectedRoles?.[fixture.expectedLead])assert.equal(out.candidates[0]?.roleCode,fixture.expectedRoles[fixture.expectedLead],fixture.id);
  }
  if(fixture.allowed?.length===0)assert.equal(out.candidates.length,0,fixture.id);
  if(fixture.id==='AUD-10')assert(!out.candidates.some(c=>c.code==='35-1011'),'restaurant duties do not imply chef/head cook supervision');
 }
 assert.equal(preserved,10,'the original broad audit had ten correct occupational leads');
});

test('M2: expanded supporting roles cannot introduce absent role-level qualifiers',()=>{
 // Controlled source-title variants isolate the guard; model scores stay fixed.
 // Query and lead-title support must each independently permit the qualifier.
 const row=evidenceFor('V01');
 for(const qualifier of ['Assistant','Technician','Manager','Supervisor','Director','Chief','Head']){
  const changed=structuredClone(snapshot);
  const role=changed.occupations.find(o=>o.code==='19-3032')!.roles.find(r=>r.code==='19-3032.00')!;
  role.title=`${qualifier} ${role.title}`;
  const alternate=new SearchEngine(changed,lexicon);
  assert.deepEqual(alternate.hybrid('',row.input,row.evidence).candidates.map(c=>c.code),['15-2051'],qualifier);
  const querySupported=alternate.hybrid('',`${row.input} ${qualifier}`,row.evidence);
  assert(querySupported.candidates.some(c=>c.code==='19-3032'),`explicit query supports ${qualifier}`);
  const primaryRole=changed.occupations.find(o=>o.code==='15-2051')!.roles.find(r=>r.code==='15-2051.00')!;
  primaryRole.title=`${qualifier} ${primaryRole.title}`;
  const leadSupported=new SearchEngine(changed,lexicon).hybrid('',row.input,row.evidence);
  assert(leadSupported.candidates.some(c=>c.code==='19-3032'),`supporting lead title permits ${qualifier}`);
  assert(alternate.hybrid('industrial-organizational psychologist',row.input,row.evidence).candidates.some(c=>c.code==='19-3032'),'exact aliases bypass expansion guards');
 }
});

test('M2r3: exposed mixed-role fallback recovers a corroborated lexical primary without changing grounded roles',()=>{
 const exposed=read('tests/fixtures/description-replacement-regression-evidence.json') as typeof recorded;
 const fixtures:Fixture[]=read('data/evaluation/matching-v2-replacement-check.json').cases;
 const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
 assert.equal(hash('data/evaluation/matching-v2-replacement-check.json'),exposed.fixtureSha256);
 assert.equal(hash('public/semantic/metadata.json'),exposed.metadataSha256);
 assert.deepEqual(exposed.rows.map(r=>[r.id,r.input]),fixtures.map(f=>[f.id,f.input]));
 for(const fixture of fixtures){
  const row=exposed.rows.find(r=>r.id===fixture.id)!;
  const evidence=Object.entries(row.scores).map(([code,score])=>({code,score}));
  verifyExpected(fixture,evidence);
  assert.deepEqual(engine.hybrid('',fixture.input,[...evidence,...evidence].reverse()),engine.hybrid('',fixture.input,evidence));
 }
 // Lexical prominence alone cannot admit a primary with unsupported semantics.
 const mixed=exposed.rows.find(r=>r.id==='H-M2-01')!;
 const weakEvidence=Object.entries(mixed.scores).map(([code,score])=>({code,score:code==='15-2051'?.2:score}));
 assert(!engine.hybrid('',mixed.input,weakEvidence).candidates.some(c=>c.code==='15-2051'));
 // The other exposed mixed-research case has Training Managers at lexical #1;
 // an unsupported managerial title must not replace its psychology primary.
 const prior=read('tests/fixtures/description-exposed-regression-evidence.json') as typeof recorded;
 const psychology=prior.rows.find(r=>r.id==='H-M1-02')!;
 const out=engine.hybrid('',psychology.input,Object.entries(psychology.scores).map(([code,score])=>({code,score})));
 assert.equal(out.candidates[0]?.roleCode,'19-3032.00');
 assert(!out.candidates.some(c=>c.code==='11-3131'));
});
