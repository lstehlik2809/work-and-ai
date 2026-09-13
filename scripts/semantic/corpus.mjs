import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

// Passage selection is deliberately independent of the replacement tokenizer.
export function validateCorpus(bytes, sourceBytes, config) {
 const hash=b=>createHash('sha256').update(b).digest('hex');
 assert.equal(hash(bytes),config.corpusSha256,'Frozen passage checksum mismatch');
 const corpus=JSON.parse(bytes),snapshot=JSON.parse(sourceBytes);
 assert.equal(corpus.dataSha256,hash(sourceBytes),'Frozen passage source mismatch');
 assert.equal(corpus.release,snapshot.release.id,'Frozen passage release mismatch');
 assert.deepEqual(corpus.rows.map(r=>r.code),snapshot.occupations.map(o=>o.code),'Frozen canonical order mismatch');
 assert.equal(corpus.rows.length,831);assert.equal(corpus.rows.reduce((n,r)=>n+r.passages.length,0),952);
 for(const [i,row] of corpus.rows.entries()) {
  const occupation=snapshot.occupations[i];
  assert(row.passages.length>0&&row.passages.length<=config.maxPassages);
  assert.equal(row.sourceRoleCount,new Set(occupation.roles.map(r=>r.code)).size);
  for(const p of row.passages) {
   const role=occupation.roles.find(r=>r.code===p.onetCode);
   if(!role){assert.equal(p.onetCode,null);assert.equal(p.text,occupation.title);assert.equal(p.source,occupation.source);assert.deepEqual(p.taskIds,[]);continue;}
   assert.equal(p.source,role.source);
   const prefix=`${occupation.title}. ${role.title}.`;assert(p.text.startsWith(prefix));
   let tail=p.text.slice(prefix.length);
   for(const fragment of [...(role.description.match(/[^.!?]+[.!?]*/g)||[]),...role.tasks.map(t=>t.text)]) {
    const next=' '+fragment.trim();if(tail.startsWith(next))tail=tail.slice(next.length);
   }
   assert.equal(tail,'','Passage contains non-source text or changed fragment order');
   assert.deepEqual(p.taskIds,role.tasks.filter(t=>p.text.includes(t.text)).map(t=>t.id));
  }
 }
 return corpus;
}
export const loadCorpus=(sourceBytes,config)=>validateCorpus(readFileSync('data/semantic-passages.json'),sourceBytes,config);
