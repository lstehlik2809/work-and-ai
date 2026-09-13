import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {AutoTokenizer,env} from '@huggingface/transformers';
import {validateCorpus} from '../scripts/semantic/corpus.mjs';
import {installAsset} from '../scripts/semantic/assets.mjs';
const read=p=>JSON.parse(readFileSync(p));
const config=read('src/semantic/config.json'),source=readFileSync('public/data/occupations.json'),bytes=readFileSync('data/semantic-passages.json');
const sha=b=>createHash('sha256').update(b).digest('hex');
test('MPNet preserves every frozen MiniLM passage, association, task and source in order',()=>{
 const corpus=validateCorpus(bytes,source,config),archive=readFileSync('data/evaluation/minilm-metadata.json');
 assert.equal(sha(archive),corpus.construction.metadataSha256);
 assert.deepEqual(corpus.rows,JSON.parse(archive).rows);
 const actual=read('public/semantic/metadata.json');
 assert.deepEqual(actual.rows.map(r=>({...r,passages:r.passages.map(({tokens,...p})=>p)})),corpus.rows.map(r=>({...r,passages:r.passages.map(({tokens,...p})=>p)})));
 assert.throws(()=>validateCorpus(Buffer.concat([bytes,Buffer.from(' ')]),source,config),/checksum/);
 assert.throws(()=>validateCorpus(bytes,Buffer.concat([source,Buffer.from(' ')]),config),/source/);
});
test('actual MPNet tokenizer fits every frozen passage and distinguishes 384 from 385 without truncation',async()=>{
 env.allowRemoteModels=false;env.localModelPath=`./public/models/${config.revision}/`;
 const tokenizer=await AutoTokenizer.from_pretrained(config.localName);
 assert.equal(tokenizer('a '.repeat(382)).input_ids.size,384);
 assert.equal(tokenizer('a '.repeat(383)).input_ids.size,385);
 assert(tokenizer('電気 '.repeat(384)+'I dispense medicines.').input_ids.size>384);
 const actual=read('public/semantic/metadata.json');
 for(const r of actual.rows)for(const p of r.passages){assert.equal(tokenizer(p.text).input_ids.size,p.tokens);assert(p.tokens<=384);}
});
test('asset installation rejects incomplete/corrupt bytes without replacing good assets, then retry restores',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'work-ai-asset-')),target=join(folder,'model.onnx'),good=Buffer.from('pinned model bytes');
 const entry={path:'model.onnx',bytes:good.length,sha256:sha(good)};
 try{
  await installAsset(target,entry,good);
  for(const bad of [good.subarray(1),Buffer.alloc(good.length)]){await assert.rejects(()=>installAsset(target,entry,bad));assert.deepEqual(await readFile(target),good);}
  await writeFile(target,'interrupted download');await installAsset(target,entry,good);assert.deepEqual(await readFile(target),good);
 }finally{await rm(folder,{recursive:true,force:true});}
});
