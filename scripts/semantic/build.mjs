import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { pipeline, env } from '@huggingface/transformers';
import {normalizedCentroid} from './aggregation.mjs';
import {loadCorpus} from './corpus.mjs';
const config=JSON.parse(readFileSync('src/semantic/config.json'));
const raw=readFileSync('public/data/occupations.json'), snapshot=JSON.parse(raw);
if(process.argv.slice(2).some(arg=>arg!=='--check'))throw Error('Usage: node scripts/semantic/build.mjs [--check]');
const corpus=loadCorpus(raw,config);
const checkMode=process.argv.includes('--check'),started=new Date().toISOString();
const committedPaths=['public/semantic/vectors.bin','data/evaluation/primary-vectors.bin','public/semantic/metadata.json'];
const committed=checkMode?committedPaths.map(path=>({path,bytes:readFileSync(path)})):[];
env.localModelPath=`./public/models/${config.revision}/`; env.allowRemoteModels=false; env.allowLocalModels=true;
const encoder=await pipeline('feature-extraction',config.localName,{dtype:config.dtype,device:'cpu',session_options:{intraOpNumThreads:1,interOpNumThreads:1}});
const tokenCount=text=>encoder.tokenizer(text).input_ids.size;
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const rows=[], vectors=[], primaryVectors=[];
for(const occupation of snapshot.occupations){
 const row=corpus.rows[rows.length];
 const passages=row.passages.map(p=>({...p,tokens:tokenCount(p.text)}));
 if(passages.some(p=>p.tokens>config.maxTokens))throw Error('Frozen passage exceeds encoder limit; no text was truncated');
 const output=await encoder(passages.map(p=>p.text),{pooling:config.pooling,normalize:true});
 if(output.dims[0]!==passages.length||output.dims[1]!==config.dimensions||!output.data.every(Number.isFinite))throw Error('Encoder dimension mismatch');
 for(let i=0;i<passages.length;i++)if(Math.abs(Math.hypot(...output.data.slice(i*config.dimensions,(i+1)*config.dimensions))-1)>0.001)throw Error('Invalid normalized passage vector');
 const centroid=normalizedCentroid(passages.map((_,r)=>output.data.slice(r*config.dimensions,(r+1)*config.dimensions)));
 vectors.push(...centroid);primaryVectors.push(...output.data.slice(0,config.dimensions));
 rows.push({code:occupation.code,passages,sourceRoleCount:row.sourceRoleCount});
 if(rows.length%100===0)console.log(`Encoded ${rows.length} occupations`);
}
const binary=Buffer.from(new Float32Array(vectors).buffer);
const primaryBinary=Buffer.from(new Float32Array(primaryVectors).buffer);
const metadata={schema:1,config,release:snapshot.release.id,dataSha256:hash(raw),vectorSha256:hash(binary),vectorCount:rows.length,created:new Date().toISOString(),aggregation:'One L2-normalized mean vector per canonical occupation; deduplicated passages, at most three. No per-passage max score.',rows};
if(checkMode){
 const prior=JSON.parse(committed[2].bytes);
 const withoutCreated=({created,...rest})=>rest;
 const checks={
  vectorsSha256:hash(binary)===hash(committed[0].bytes)&&hash(binary)===prior.vectorSha256,
  vectorsExactBytes:binary.equals(committed[0].bytes),
  primaryVectorsExactBytes:primaryBinary.equals(committed[1].bytes),
  config:isDeepStrictEqual(metadata.config,prior.config),
  release:metadata.release===prior.release,
  dataSha256:metadata.dataSha256===prior.dataSha256,
  vectorCount:metadata.vectorCount===prior.vectorCount,
  rowsAndPassages:isDeepStrictEqual(metadata.rows,prior.rows),
  completeMetadataExceptCreationTime:isDeepStrictEqual(withoutCreated(metadata),withoutCreated(prior)),
  committedArtifactsUnchanged:committed.every(({path,bytes})=>bytes.equals(readFileSync(path))),
  sourceDataUnchanged:raw.equals(readFileSync('public/data/occupations.json')),
 };
 const pass=Object.values(checks).every(Boolean);
 const evidence={status:pass?'PASS':'FAIL',command:'node scripts/semantic/build.mjs --check',cwd:process.cwd(),started,completed:new Date().toISOString(),exitStatus:pass?0:1,mode:'Pinned source corpus re-embedding reproduction; no heldout query encoding or ranking tuning',runtime:process.version,platform:process.platform,checks,vectorCount:rows.length,dimensions:config.dimensions,bytes:binary.length,generatedVectorSha256:hash(binary),committedVectorSha256:hash(committed[0].bytes),generatedPrimarySha256:hash(primaryBinary),committedPrimarySha256:hash(committed[1].bytes),committedMetadataSha256:hash(committed[2].bytes),buildScriptSha256:hash(readFileSync('scripts/semantic/build.mjs')),aggregationHelperSha256:hash(readFileSync('scripts/semantic/aggregation.mjs')),config,limitation:'Exact reproduction on this Node CPU environment; browser execution is verified separately. Creation timestamp is the only ignored metadata field.'};
 writeFileSync('data/semantic-reproduction.json',JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify(evidence));
 if(!pass)process.exitCode=1;
}else{
 mkdirSync('public/semantic',{recursive:true});mkdirSync('data/evaluation',{recursive:true});
 writeFileSync('public/semantic/vectors.bin',binary);
 writeFileSync('data/evaluation/primary-vectors.bin',primaryBinary);
 writeFileSync('public/semantic/metadata.json',JSON.stringify(metadata));
 console.log(JSON.stringify({vectors:rows.length,dimensions:config.dimensions,bytes:binary.length,sha256:hash(binary)}));
}
