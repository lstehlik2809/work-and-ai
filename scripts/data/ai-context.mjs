import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url);
const read=path=>readFileSync(new URL(path,root));
const json=path=>JSON.parse(read(path));
export const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
export function verifyPinnedBytes(bytes,expected,label){assert.equal(digest(bytes),expected,`${label} hash`);}
export const isExplicitAi=note=>/\b(?:AI|artificial\s+intelligence|machine\s+learning|large\s+language\s+models?)\b/i.test(note);
const text=v=>typeof v==='string'&&v.trim().length>0;
export function buildAiContext(intermediate,snapshot,manifest){
 assert.equal(intermediate.schemaVersion,1);assert.equal(intermediate.sourceSha256,manifest.source.sha256);assert.equal(intermediate.sheet,'Table 1.12');assert.equal(intermediate.startYear,2025);assert.equal(intermediate.endYear,2035);assert.equal(snapshot.release.startYear,2025);assert.equal(snapshot.release.endYear,2035);assert.equal(intermediate.rows.length,935);
 const rows=new Set();for(const r of intermediate.rows){assert(Number.isInteger(r.row)&&r.row>=3&&r.row<=937);assert(!rows.has(r.row),'duplicate source row');rows.add(r.row);assert(/^\d{2}-\d{4}$/.test(r.code));assert([r.title,r.industry,r.industryCode,r.note].every(text));}
 const canonical=new Map(snapshot.occupations.map(o=>[o.code,o.title]));
 const notes=intermediate.rows.filter(r=>isExplicitAi(r.note)).sort((a,b)=>a.row-b.row).map(r=>{assert.equal(canonical.get(r.code),r.title,`canonical identity ${r.code}`);return {...r};});
 assert.equal(notes.length,56);assert.equal(new Set(notes.map(r=>r.code)).size,50);
 return {schemaVersion:1,release:snapshot.release.id,startYear:2025,endYear:2035,source:{url:manifest.source.url,page:manifest.source.page,sheet:'Table 1.12',sha256:manifest.source.sha256},notes};
}
export function prepareAiContext(){const manifest=json('data/ai-context-source-manifest.json');verifyPinnedBytes(read(manifest.source.path),manifest.source.sha256,'workbook');verifyPinnedBytes(read(manifest.intermediate.path),manifest.intermediate.sha256,'intermediate');return buildAiContext(json(manifest.intermediate.path),json('public/data/occupations.json'),manifest);}
export function validateAiContextArtifacts(){const expected=JSON.stringify(prepareAiContext())+'\n';assert.equal(read('public/data/ai-context.json').toString(),expected,'exact source subset reproduction');assert.deepEqual(json('src/domain/ai-context-pin.json'),{sha256:digest(expected),bytes:Buffer.byteLength(expected)},'runtime integrity pin');return {status:'PASS',notes:56,occupations:50,bytes:Buffer.byteLength(expected)};}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 if(process.argv.includes('--fetch')){const manifest=json('data/ai-context-source-manifest.json');const response=await fetch(manifest.source.url,{signal:AbortSignal.timeout(60000)});assert(response.ok,`HTTP ${response.status}`);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(digest(bytes),manifest.source.sha256,'upstream workbook changed; deliberate release review required');writeFileSync(new URL(manifest.source.path,root),bytes);}
 if(!process.argv.includes('--check')){const output=JSON.stringify(prepareAiContext())+'\n';writeFileSync(new URL('public/data/ai-context.json',root),output);writeFileSync(new URL('src/domain/ai-context-pin.json',root),JSON.stringify({sha256:digest(output),bytes:Buffer.byteLength(output)})+'\n');}
 console.log(JSON.stringify(validateAiContextArtifacts()));
}
