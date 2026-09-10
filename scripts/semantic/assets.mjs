import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,resolve,sep} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const modelFiles=['config.json','tokenizer.json','tokenizer_config.json','special_tokens_map.json','onnx/model_quantized.onnx'];
const runtimeFiles=['ort-wasm-simd-threaded.asyncify.mjs','ort-wasm-simd-threaded.asyncify.wasm'];

export function validateAssetManifest(manifest,config){
 assert.deepEqual(manifest.config,config,'Asset encoder configuration mismatch');
 assert(/^[a-f0-9]{40}$/.test(config.revision),'Model revision must be immutable');
 const expected=new Map([
  ...modelFiles.map(name=>[`models/${config.revision}/${config.localName}/${name}`,`https://huggingface.co/${config.model}/resolve/${config.revision}/${name}`]),
  ...runtimeFiles.map(name=>[`runtime/${config.browserRuntime}/${name}`,`https://www.npmjs.com/package/onnxruntime-web/v/${config.browserRuntime}`]),
 ]);
 assert.equal(manifest.files.length,expected.size,'Asset inventory count mismatch');
 const seen=new Set();
 for(const f of manifest.files){
  assert(expected.has(f.path)&&!seen.has(f.path),'Unexpected, duplicate or unsafe asset path');seen.add(f.path);
  assert.equal(f.source,expected.get(f.path),'Pinned asset source mismatch');
  assert(Number.isInteger(f.bytes)&&f.bytes>0&&/^[a-f0-9]{64}$/.test(f.sha256),'Malformed asset integrity metadata');
 }
 return true;
}

export function validateAssetBytes(file,bytes){
 assert.equal(bytes.length,file.bytes,`Asset byte length mismatch: ${file.path}`);
 assert.equal(sha(bytes),file.sha256,`Asset checksum mismatch: ${file.path}`);
 return true;
}

export async function verifyAssets({fetchAssets=false}={}){
 const config=JSON.parse(await readFile(resolve(root,'src/semantic/config.json'),'utf8'));
 const manifest=JSON.parse(await readFile(resolve(root,'public/semantic/assets.json'),'utf8'));
 validateAssetManifest(manifest,config);
 const publicRoot=resolve(root,'public');
 const staged=[];
 if(fetchAssets){
  const installed=JSON.parse(await readFile(resolve(root,'node_modules/onnxruntime-web/package.json'),'utf8'));
  assert.equal(installed.version,config.browserRuntime,'Installed onnxruntime-web version differs from pinned runtime');
  for(const f of manifest.files){
   let bytes;
   if(f.path.startsWith('models/')){
    const response=await fetch(f.source,{signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw Error(`Pinned model acquisition failed: ${f.path}, HTTP ${response.status}`);
    bytes=Buffer.from(await response.arrayBuffer());
   }else bytes=await readFile(resolve(root,'node_modules/onnxruntime-web/dist',f.path.split('/').at(-1)));
   validateAssetBytes(f,bytes);staged.push({file:f,bytes});
  }
  // Every source must verify before any public asset is restored.
  for(const {file,bytes} of staged){
   const target=resolve(publicRoot,file.path);
   assert(target.startsWith(publicRoot+sep),'Asset destination escapes public directory');
   await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);
  }
 }
 let bytes=0;
 for(const f of manifest.files){const content=await readFile(resolve(publicRoot,f.path));validateAssetBytes(f,content);bytes+=content.length;}
 return {status:'PASS',files:manifest.files.length,bytes,model:config.model,revision:config.revision,runtime:config.browserRuntime,restored:fetchAssets,verifiedAt:new Date().toISOString()};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{if(process.argv.slice(2).some(a=>a!=='--fetch'))throw Error('Usage: node scripts/semantic/assets.mjs [--fetch]');console.log(JSON.stringify(await verifyAssets({fetchAssets:process.argv.includes('--fetch')})));}
 catch(error){console.error(JSON.stringify({status:'FAIL',error:error.message}));process.exitCode=1;}
}
