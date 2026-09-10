import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildAiContext,validateAiContextArtifacts,isExplicitAi,verifyPinnedBytes} from '../scripts/data/ai-context.mjs';
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const manifest=read('data/ai-context-source-manifest.json'),table=read(manifest.intermediate.path),snapshot=read('public/data/occupations.json');
test('AS01: pinned full table produces the exact 56-note, 50-occupation optional artifact and runtime pin',()=>{
 assert.equal(validateAiContextArtifacts().status,'PASS');assert.equal(table.rows.length,935);
 const result=buildAiContext(table,snapshot,manifest);for(const [code,count] of [['27-3011',2],['27-4014',2],['29-1224',2],['43-9041',4]])assert.equal(result.notes.filter(n=>n.code===code).length,count);
 assert.deepEqual(buildAiContext(table,snapshot,manifest),result);
});
test('AS02: explicit AI phrases accepted while generic automation and substring matches are excluded',()=>{
 for(const note of ['AI tools','artificial intelligence (AI)','MACHINE LEARNING','large language model','large language models.'])assert(isExplicitAi(note),note);
 for(const note of ['automation and productivity','automated software','email','training','retail','said','machine learner','large language modeling'])assert(!isExplicitAi(note),note);
});
test('AS02: source/intermediate corruption and invalid identities, period, rows or population fail closed',()=>{
 for(const entry of [manifest.source,manifest.intermediate]){const bytes=readFileSync(entry.path);verifyPinnedBytes(bytes,entry.sha256,'fixture');const damaged=Buffer.from(bytes);damaged[20]^=1;assert.throws(()=>verifyPinnedBytes(damaged,entry.sha256,'fixture'));assert.throws(()=>verifyPinnedBytes(bytes,'0'.repeat(64),'fixture'));}
 for(const mutate of [t=>t.startYear=2024,t=>t.endYear=2034,t=>t.sourceSha256='bad',t=>t.rows.pop(),t=>t.rows.push(t.rows[0]),t=>t.rows[1].row=t.rows[0].row,t=>t.rows[0].title='Wrong occupation',t=>t.rows[0].code='99-9999',t=>t.rows[0].industry='',t=>t.rows[0].industryCode='',t=>t.rows[0].note='Generic automation only']){const changed=structuredClone(table);mutate(changed);assert.throws(()=>buildAiContext(changed,snapshot,manifest));}
});
