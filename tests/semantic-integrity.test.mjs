import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateSemantic} from '../scripts/semantic/validate.mjs';
import {validateAssetManifest,validateAssetBytes,verifyAssets} from '../scripts/semantic/assets.mjs';
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const config=json('src/semantic/config.json'),original=json('public/semantic/metadata.json');
const vectorBytes=readFileSync('public/semantic/vectors.bin'),snapshotBytes=readFileSync('public/data/occupations.json');
const hash=b=>createHash('sha256').update(b).digest('hex');
const fresh=()=>({meta:structuredClone(original),bytes:Buffer.from(vectorBytes),snapshot:Buffer.from(snapshotBytes),expected:structuredClone(config)});
const check=f=>validateSemantic(f.meta,f.bytes,f.snapshot,f.expected);
test('committed semantic vectors and complete pinned model/runtime asset inventory verify',async()=>{assert.equal(check(fresh()).valid,true);assert.equal((await verifyAssets()).status,'PASS');});
for(const key of Object.keys(config))test(`reject incompatible encoder field ${key}`,()=>{const f=fresh();f.meta.config[key]=typeof config[key]==='number'?config[key]+1:typeof config[key]==='boolean'?!config[key]:config[key]+'-changed';assert.throws(()=>check(f),/configuration mismatch/i);});
for(const [name,mutation,expected] of [
 ['vector byte checksum',f=>{f.bytes[0]^=1;},/checksum/],
 ['source data checksum',f=>{f.snapshot[0]^=1;},/checksum/],
 ['wrong metadata vector count',f=>{f.meta.vectorCount++;},/dimensions\/count/],
 ['truncated binary with recomputed checksum',f=>{f.bytes=f.bytes.subarray(0,f.bytes.length-4);f.meta.vectorSha256=hash(f.bytes);},/dimensions\/count/],
 ['unknown occupation reference',f=>{f.meta.rows[0].code='99-9999';},/occupation/],
 ['duplicate occupation reference',f=>{f.meta.rows[1].code=f.meta.rows[0].code;},/occupation/],
 ['unknown O*NET role reference',f=>{f.meta.rows[0].passages[0].onetCode='99-9999.99';},/passage role/],
 ['mismatched data release',f=>{f.meta.release='unavailable-release';},/release/],
 ['empty passage collection',f=>{f.meta.rows[0].passages=[];},/Passage cap/],
 ['over-cap passage collection',f=>{f.meta.rows[0].passages=Array.from({length:config.maxPassages+1},()=>f.meta.rows[0].passages[0]);},/Passage cap/],
 ['over-limit tokenizer count',f=>{f.meta.rows[0].passages[0].tokens=config.maxTokens+1;},/Invalid passage/],
 ['missing passage source',f=>{f.meta.rows[0].passages[0].source='';},/Invalid passage/],
 ['empty passage text',f=>{f.meta.rows[0].passages[0].text='';},/Invalid passage/],
])test(`reject ${name}`,()=>{const f=fresh();mutation(f);assert.throws(()=>check(f),expected);});
for(const [name,value] of [['NaN',NaN],['positive infinity',Infinity],['negative infinity',-Infinity]])test(`reject ${name} vector even with recomputed hash`,()=>{const f=fresh();f.bytes.writeFloatLE(value,0);f.meta.vectorSha256=hash(f.bytes);assert.throws(()=>check(f),/normalized vector/);});
test('reject zero norm and scaled norm despite recomputed integrity hashes',()=>{for(const scale of [0,2]){const f=fresh();for(let d=0;d<config.dimensions;d++)f.bytes.writeFloatLE(f.bytes.readFloatLE(d*4)*scale,d*4);f.meta.vectorSha256=hash(f.bytes);assert.throws(()=>check(f),/normalized vector/);}});
test('reject missing entire occupation vector even when count and hashes are internally consistent',()=>{const f=fresh();f.meta.rows.pop();f.meta.vectorCount--;f.bytes=f.bytes.subarray(0,f.bytes.length-config.dimensions*4);f.meta.vectorSha256=hash(f.bytes);assert.throws(()=>check(f),/Missing occupation vector/);});
test('exact configured token/cap boundaries remain valid',()=>{const f=fresh();f.meta.rows[0].passages=Array.from({length:config.maxPassages},()=>({...f.meta.rows[0].passages[0],tokens:config.maxTokens}));assert.equal(check(f).valid,true);});
test('asset manifest rejects unpinned source, changed config, duplicate inventory and unsafe destinations',()=>{
 for(const mutation of [m=>{m.files[0].source=m.files[0].source.replace(config.revision,'main');},m=>{m.config.dtype='fp32';},m=>{m.files[1]=m.files[0];},m=>{m.files[0].path='../outside';},m=>{m.files.pop();},m=>{m.files[0].sha256='missing';}]){const m=json('public/semantic/assets.json');mutation(m);assert.throws(()=>validateAssetManifest(m,config));}
});
test('asset byte length and content hash are both checked',()=>{const f=json('public/semantic/assets.json').files[0],b=readFileSync('public/'+f.path);assert.equal(validateAssetBytes(f,b),true);assert.throws(()=>validateAssetBytes(f,b.subarray(1)),/byte length/);const corrupt=Buffer.from(b);corrupt[0]^=1;assert.throws(()=>validateAssetBytes(f,corrupt),/checksum/);});
