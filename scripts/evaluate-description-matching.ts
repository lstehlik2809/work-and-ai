import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {pipeline,env} from '@huggingface/transformers';
import {SearchEngine} from '../src/search/engine';
import type {Snapshot,Lexicon,SemanticEvidence,SearchOutcome} from '../src/domain/types';

interface Case {
 id:string; input:string; expectedLead?:string; required?:string[]; allowed?:string[];
 excluded?:string[]; expectedState?:SearchOutcome['state']; expectedRoles?:Record<string,string>;
 leadAnyOf?:string[]; requiredAnyOf?:string[]; excludedRoles?:string[];
 rationale?:string;
}
const [fixturePath,destination,enginePath='src/search/engine.ts']=process.argv.slice(2);
if(!fixturePath||!destination)throw Error('Usage: npx tsx scripts/evaluate-description-matching.ts FIXTURES.json REPORT.json [ENGINE.ts]');
if(!destination.replaceAll('\\','/').startsWith('verification/local/'))throw Error('Write reports under verification/local/; historical evaluations are immutable.');
const read=(path:string)=>JSON.parse(readFileSync(path,'utf8'));
const hash=(path:string)=>createHash('sha256').update(readFileSync(path)).digest('hex');
const fixtures=read(fixturePath) as {cases:Case[]};
const config=read('src/semantic/config.json'),meta=read('public/semantic/metadata.json');
const snapshot=read('public/data/occupations.json') as Snapshot,lexicon=read('public/data/lexicon.json') as Lexicon;
assert.equal(meta.dataSha256,hash('public/data/occupations.json'));
assert.equal(meta.vectorSha256,hash('public/semantic/vectors.bin'));
assert.deepEqual(meta.config,config);
const bytes=readFileSync('public/semantic/vectors.bin');
const vectors=new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
const Engine:typeof SearchEngine=enginePath==='src/search/engine.ts'?SearchEngine:(await import(pathToFileURL(resolve(enginePath)).href)).SearchEngine;
const engine=new Engine(snapshot,lexicon);
env.allowRemoteModels=false;env.allowLocalModels=true;
env.localModelPath=`./public/models/${config.revision}/`;
const encoder=await pipeline('feature-extraction',config.localName,{dtype:config.dtype,device:'cpu'});
const rows=[];
for(const fixture of fixtures.cases){
 const tokens=encoder.tokenizer(fixture.input).input_ids.size;
 assert(tokens<=config.maxTokens,`${fixture.id}: query exceeds tokenizer limit`);
 const encoded=await encoder(fixture.input,{pooling:config.pooling,normalize:true});
 const evidence:SemanticEvidence[]=meta.rows.map((row:{code:string},i:number)=>{
  let score=0;for(let d=0;d<config.dimensions;d++)score+=Number(encoded.data[d])*vectors[i*config.dimensions+d];
  return{code:row.code,score};
 }).sort((a:SemanticEvidence,b:SemanticEvidence)=>b.score-a.score||a.code.localeCompare(b.code));
 const outcome=engine.hybrid('',fixture.input,evidence),codes=outcome.candidates.map(c=>c.code);
 const failures:string[]=[];
 if(fixture.expectedState&&outcome.state!==fixture.expectedState)failures.push(`state ${outcome.state}, expected ${fixture.expectedState}`);
 if(fixture.expectedLead&&codes[0]!==fixture.expectedLead)failures.push(`lead ${codes[0]}, expected ${fixture.expectedLead}`);
 if(fixture.leadAnyOf&&!fixture.leadAnyOf.includes(codes[0]))failures.push(`lead ${codes[0]} outside ${fixture.leadAnyOf.join(', ')}`);
 if(fixture.requiredAnyOf&&!fixture.requiredAnyOf.some(code=>codes.includes(code)))failures.push(`missing any of ${fixture.requiredAnyOf.join(', ')}`);
 for(const code of fixture.required||[])if(!codes.includes(code))failures.push(`missing ${code}`);
 for(const code of codes){
  if(fixture.allowed&&!fixture.allowed.includes(code))failures.push(`unexpected ${code}`);
  if(fixture.excluded?.includes(code))failures.push(`excluded ${code}`);
 }
 if(codes.length>3||new Set(codes).size!==codes.length)failures.push('invalid canonical shortlist');
 for(const candidate of outcome.candidates){
  const occupation=snapshot.occupations.find(o=>o.code===candidate.code);
  const role=occupation?.roles.find(r=>r.code===candidate.roleCode);
  const source=candidate.excerptKind==='task'?role?.tasks.find(t=>t.id===candidate.taskId):role;
  if(!source||candidate.source!==source.source||candidate.excerpt!==('text' in source?source.text:source.description))failures.push(`invalid source evidence ${candidate.code}`);
  if(fixture.expectedRoles?.[candidate.code]&&fixture.expectedRoles[candidate.code]!==candidate.roleCode)failures.push(`role ${candidate.roleCode}, expected ${fixture.expectedRoles[candidate.code]}`);
  if(candidate.roleCode&&fixture.excludedRoles?.includes(candidate.roleCode))failures.push(`excluded role ${candidate.roleCode}`);
 }
 rows.push({fixture,tokens,outcome,failures,semanticRanks:evidence,lexicalRanks:engine.bm25(fixture.input).map(({code,score,support,coverage})=>({code,score,support,coverage}))});
 console.log(JSON.stringify({id:fixture.id,candidates:outcome.candidates.map(c=>({code:c.code,role:c.roleCode})),failures}));
}
const failures=rows.filter(r=>r.failures.length);
mkdirSync(dirname(destination),{recursive:true});
writeFileSync(destination,JSON.stringify({status:failures.length?'FAIL':'PASS',date:new Date().toISOString(),fixturePath,fixtureSha256:hash(fixturePath),enginePath,engineSha256:hash(enginePath),metadataSha256:hash('public/semantic/metadata.json'),runtime:process.version,backend:'Pinned local Node CPU encoder; browser WASM verified separately',provenance:'Authored source-grounded cases, not independent expert validation',passed:rows.length-failures.length,total:rows.length,rows},null,2)+'\n');
if(failures.length)process.exitCode=1;
