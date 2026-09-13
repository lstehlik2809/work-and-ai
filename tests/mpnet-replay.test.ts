import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SearchEngine} from '../src/search/engine';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const report=read('data/evaluation/mpnet-application.json'),cases=read('data/evaluation/embedding-exposed-cases.json').cases;
const engine=new SearchEngine(read('public/data/occupations.json'),read('public/data/lexicon.json'));
test('MPNet replay is bound to the actual encoder/index/source and unchanged exposed labels',()=>{
 for(const p of ['src/semantic/config.json','public/semantic/metadata.json','public/semantic/vectors.bin','public/data/occupations.json','public/data/lexicon.json','data/evaluation/embedding-exposed-cases.json'])assert.equal(createHash('sha256').update(readFileSync(p)).digest('hex'),report.freeze.files[p],p);
 assert.equal(report.rows.length,48);assert.equal(report.config.model,'Xenova/all-mpnet-base-v2');
});
test('actual MPNet scores replay the application results and preserve every requested prefix',()=>{
 for(const row of report.rows){
  const evidence=Object.entries(row.scores).map(([code,score])=>({code,score:Number(score)}));
  const run=(n:number)=>row.kind==='title'?engine.title(row.input,n):engine.hybrid('',row.input,evidence,n);
  assert.deepEqual(JSON.parse(JSON.stringify(run(10).candidates)),row.result.candidates,row.id);
  for(let n=1;n<=10;n++)assert.deepEqual(run(n).candidates.map(c=>c.code),row.after.slice(0,n),row.id);
 }
});
test('reported specific and vague outcomes agree with independently authored exposed labels',()=>{
 const specific=cases.filter((c:any)=>c.kind==='specific'),vague=cases.filter((c:any)=>c.kind==='vague');
 const output=(f:any)=>report.rows.find((r:any)=>r.id===f.id).after;
 assert.equal(specific.filter((f:any)=>f.acceptableLeadCodes.includes(output(f)[0])).length,report.summary.specificLead);
 assert.equal(vague.filter((f:any)=>output(f).length===0).length,report.summary.vagueAbstained);
 // These are reproducibility/reporting checks. They do not waive release gates.
 assert.match(report.releaseStatus,/NOT APPROVED/);
});
