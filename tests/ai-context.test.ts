import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {validateAiContext,loadAiContext,exposureExplanation} from '../src/domain/ai-context';
import {ExposureContext} from '../src/components/AiContext';
import type {Snapshot,Exposure} from '../src/domain/types';
const snapshot:Snapshot=JSON.parse(readFileSync('public/data/occupations.json','utf8'));
const bytes=readFileSync('public/data/ai-context.json'),reference=JSON.parse(bytes.toString());
test('AS03: all notes use current canonical identities and multiple-industry scope, independent of specialties',()=>{
 const data=validateAiContext(reference,snapshot);for(const note of data.notes)assert.equal(snapshot.occupations.find(o=>o.code===note.code)!.title,note.title);
 assert(data.notes.some(n=>n.industryCode==='TE1000'));assert(data.notes.some(n=>n.industryCode!=='TE1000'));
 assert.equal(data.notes.filter(n=>n.code==='15-2051').length,0);assert(snapshot.occupations.find(o=>o.code==='15-2051')!.roles.length>1);
 const altered=structuredClone(snapshot);altered.occupations.forEach(o=>{o.growth=99;o.exposure=null;});assert.deepEqual(validateAiContext(reference,altered),data);
});
test('AS02/05: malformed or incompatible reference rejected; verified fetch returns complete data',async()=>{
 for(const mutate of [d=>d.release='wrong',d=>d.startYear=2024,d=>d.source.url='https://example.com',d=>d.source.sha256='bad',d=>d.notes.pop(),d=>d.notes[0].title='wrong',d=>d.notes[0].industry='',d=>d.notes[0].industryCode='',d=>d.notes[0].note='automation',d=>d.notes[1].row=d.notes[0].row] as ((d:any)=>void)[]){const changed=structuredClone(reference);mutate(changed);assert.throws(()=>validateAiContext(changed,snapshot));}
 assert.throws(()=>validateAiContext(null,snapshot));
 const signal=new AbortController().signal;let requested='';const fetcher:typeof fetch=async(url,init)=>{requested=String(url);assert.equal(init?.signal,signal);return new Response(bytes);};assert.deepEqual(await loadAiContext(snapshot,signal,fetcher),reference);assert.equal(requested,'/data/ai-context.json');
 for(const response of [new Response('unavailable',{status:503}),new Response('{not JSON'),new Response(JSON.stringify({...reference,endYear:2034})),new Response(bytes.toString().replace('Productivity','Unverified'))])await assert.rejects(loadAiContext(snapshot,signal,async()=>response));
 await assert.rejects(loadAiContext(snapshot,signal,async()=>{throw Error('network');}));
});
test('AS07: all four ordinal categories and missing category render independent timeframe and caveats',()=>{
 assert.equal(new Set(Object.values(exposureExplanation)).size,4);
 for(const category of [...Object.keys(exposureExplanation),null] as (Exposure|null)[]){const html=renderToStaticMarkup(createElement(ExposureContext,{category}));assert.match(html,/August 27, 2026/);assert.match(html,/2020 and 2023/);assert.match(html,/2024–2025/);assert.match(html,/not a measurement of today/);assert.match(html,/do not distinguish assistance from automation/);assert(!/\d+%/.test(html));if(category)assert(html.includes(exposureExplanation[category]));else assert.match(html,/No published exposure category is available/);}
});
