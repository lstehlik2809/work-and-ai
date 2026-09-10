import { pipeline, env } from '@huggingface/transformers';
import config from './config.json';
const scope=self as unknown as {postMessage:(data:unknown)=>void;onmessage:((event:{data:any})=>void)|null};
let encoder:any=null, metadata:any=null, vectors:Float32Array|null=null;
const sha=async(bytes:ArrayBuffer)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
scope.onmessage=async({data})=>{
 const{id,text,base,fault}=data;const start=performance.now();let initialized=0;
 const status=(message:string)=>scope.postMessage({id,status:message});
 try{
  if(fault==='hang')return;
  if(!encoder){
   status('Checking the local search index…');
   const[m,v,sourceData]=await Promise.all([fetch(base+'semantic/metadata.json').then(r=>{if(!r.ok)throw Error('index');return r.json();}),fetch(base+'semantic/vectors.bin').then(r=>{if(!r.ok)throw Error('vectors');return r.arrayBuffer();}),fetch(base+'data/occupations.json').then(r=>{if(!r.ok)throw Error('data');return r.arrayBuffer();})]);
   if(fault==='mismatch')m.config.dimensions++;
   if(JSON.stringify(m.config)!==JSON.stringify(config)||v.byteLength!==m.vectorCount*config.dimensions*4||await sha(v)!==m.vectorSha256||await sha(sourceData)!==m.dataSha256)throw Error('The search model and index do not match. Ordinary title search is still available.');
   metadata=m;vectors=new Float32Array(v);
   // Transformers 4.2 metadata discovery checks root-relative local paths.
   // Absolute HTTP local paths skip that branch when remote models are disabled.
   // CacheStorage remains the persistent cache. Avoid HTTP-cache writer races
   // when model discovery and loading overlap in Chromium.
   env.fetch=(input,init)=>fetch(input,{...init,cache:'no-store'});
   env.allowLocalModels=true;env.allowRemoteModels=false;env.localModelPath=new URL(base+`models/${config.revision}/`).pathname;
   env.backends.onnx.wasm!.numThreads=1;
   const runtime=base+`runtime/${config.browserRuntime}/`;
   env.backends.onnx.wasm!.wasmPaths={mjs:runtime+'ort-wasm-simd-threaded.asyncify.mjs',wasm:runtime+'ort-wasm-simd-threaded.asyncify.wasm'};
   // Supported cache options: runtime/model cache failures are handled independently.
   try{if(fault==='cache')throw Error('Simulated unavailable CacheStorage');await caches.open('transformers-cache');env.useBrowserCache=true;}catch{env.useBrowserCache=false;env.useWasmCache=false;status('Browser storage is unavailable. The model will load without a persistent cache.');}
   if(fault==='download'){env.localModelPath=base+'unavailable-model/';}
   if(fault==='wasm'){env.backends.onnx.wasm!.wasmPaths={mjs:runtime+'missing.mjs',wasm:runtime+'missing.wasm'};}
   if(fault==='memory')throw Error('Simulated memory allocation failure');
   status('Loading the search model on your device…');
   encoder=await pipeline('feature-extraction',config.localName,{dtype:'q8',device:'wasm',progress_callback:(p:any)=>{if(p.status==='progress'&&p.file?.endsWith('.onnx'))status(`Downloading the search model: ${Math.round(p.progress??0)}%`);}});
   initialized=performance.now()-start;
  }
  const tokens=encoder.tokenizer(text).input_ids.size;
  if(tokens>config.maxTokens)throw Error(`Please shorten your description. This model supports ${config.maxTokens} tokens (word pieces); your text has ${tokens}. No text was discarded.`);
  status('Matching your description against occupational references…');
  const begin=performance.now();const output=await encoder(text,{pooling:'mean',normalize:true});
  if(output.dims[1]!==config.dimensions||!output.data.every(Number.isFinite)||Math.abs(Math.hypot(...output.data)-1)>0.001)throw Error('The query encoder is incompatible with the index.');
  const evidence=metadata.rows.map((r:any,i:number)=>{let score=0;for(let d=0;d<config.dimensions;d++)score+=output.data[d]*vectors![i*config.dimensions+d];return {code:r.code,score,excerpt:r.passages[0].text,source:r.passages[0].source};}).sort((a:any,b:any)=>b.score-a.score);
  const resources=performance.getEntriesByType('resource').map(e=>{const r=e as PerformanceResourceTiming;return{url:r.name,transfer:r.transferSize,encoded:r.encodedBodySize};});
  scope.postMessage({id,result:{evidence,resources,timings:{initializationMs:initialized,queryMs:performance.now()-begin,totalMs:performance.now()-start}}});
 }catch(error){const message=error instanceof Error?error.message:'';scope.postMessage({id,error:/^(Please shorten|The search model|The query encoder)/.test(message)?message:'Enhanced matching could not load or run. Check your connection and retry, or use ordinary title search.'});}
};
