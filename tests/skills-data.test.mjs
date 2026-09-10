import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareSkills,parseCsv,usableImportance} from '../scripts/data/skills.mjs';
test('skills artifact exactly reproduces hash-pinned official source and crosswalk population',()=>{
 const expected=prepareSkills(),actual=JSON.parse(readFileSync('public/data/skills.json','utf8'));assert.deepEqual(actual,expected);assert.equal(actual.skills.length,35);assert.equal(actual.roles.length,910);assert.equal(actual.coverage.missingRoles.length,86);assert.equal(actual.coverage.unavailableRatings,3515);
 for(const r of actual.roles)assert.equal(r.importance.length,35);
});
test('source flags and absent ratings cannot become zero or usable match evidence',()=>{
 const pair={IM:{'Data Value':'4.25','Recommend Suppress':'N','Not Relevant':''},LV:{'Not Relevant':'N','Recommend Suppress':'N'}};
 assert.equal(usableImportance(pair),4.25);
 for(const [scale,key] of [['IM','Recommend Suppress'],['IM','Not Relevant'],['LV','Not Relevant']]){const changed=structuredClone(pair);changed[scale][key]='Y';assert.equal(usableImportance(changed),null);}
 assert.equal(usableImportance({}),null);assert.equal(usableImportance({...pair,IM:{...pair.IM,'Data Value':''}}),null);
 assert.deepEqual(parseCsv('id,text\r\nx,"a, b\n""quoted"""\r\n'),[{id:'x',text:'a, b\n"quoted"'}]);
});
