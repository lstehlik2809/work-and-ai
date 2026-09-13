import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {AutoTokenizer,env} from '@huggingface/transformers';
import {SearchEngine} from '../src/search/engine';

const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const sha=(b:Buffer|string)=>createHash('sha256').update(b).digest('hex');
const digest=(value:unknown)=>sha(JSON.stringify(value));
const pin=read('data/evaluation/live-search-parity.json');
const engine=new SearchEngine(read('public/data/occupations.json'),read('public/data/lexicon.json'));

test('production search cohort preserves pinned live bytes',()=>{
 assert.equal(pin.baseline,'0b165d93b8bf8626b8b0935b4018d5e7d0258f58');
 for(const [path,expected] of Object.entries(pin.files) as [string,{bytes:number;sha256:string}][]){
  const actual=readFileSync(path);assert.equal(actual.length,expected.bytes,path);assert.equal(sha(actual),expected.sha256,path);
 }
});

test('complete saved MiniLM search outputs match live baseline at every result limit',()=>{
 assert.equal(pin.outcomes.rows.length,36);assert.equal(pin.outcomes.titleRows.length,11);
 for(const [path,expected] of Object.entries(pin.oracleFreeze.fixtures))assert.equal(sha(readFileSync(path)),expected,path);
 for(const row of pin.outcomes.rows){
  const recorded=read(row.fixture).rows.find((r:any)=>r.id===row.id);
  assert.equal(recorded.input,row.input);
  const scores=Object.entries(recorded.scores).map(([code,score])=>({code,score:Number(score)}));
  for(const expected of row.outputs){
   const n=expected.limit,label=`${row.fixture}:${row.id}:${n}`;
   assert.equal(digest(engine.hybrid('',row.input,scores,n)),expected.hybrid,label+' hybrid');
   assert.equal(digest(engine.lexical(row.input,n)),expected.lexical,label+' lexical');
   assert.equal(digest(engine.title(row.input,n)),expected.title,label+' title');
  }
 }
 for(const row of pin.outcomes.titleRows)for(let n=1;n<=10;n++)assert.equal(digest(engine.title(row.input,n)),row.outputs[n-1],`${row.input}:${n}`);
});

test('unpublished MPNet archive retains every original artifact byte',()=>{
 const archive=read('data/evaluation/mpnet/manifest.json');
 for(const entry of Object.values(archive.files) as {path:string;sha256:string}[])assert.equal(sha(readFileSync(entry.path)),entry.sha256,entry.path);
});

test('active MiniLM tokenizer fits production passages and rejects overflow without truncation',async()=>{
 const config=read('src/semantic/config.json');
 assert.equal(config.localName,'minilm');assert.equal(config.maxTokens,256);
 env.allowRemoteModels=false;env.localModelPath=`./public/models/${config.revision}/`;
 const tokenizer=await AutoTokenizer.from_pretrained(config.localName);
 assert.equal(tokenizer('a '.repeat(254)).input_ids.size,256);
 assert.equal(tokenizer('a '.repeat(255)).input_ids.size,257);
 assert(tokenizer('電気 '.repeat(256)+'I dispense medicines.').input_ids.size>256);
 for(const row of read('public/semantic/metadata.json').rows)for(const p of row.passages){
  assert.equal(tokenizer(p.text).input_ids.size,p.tokens);assert(p.tokens<=256);
 }
});
