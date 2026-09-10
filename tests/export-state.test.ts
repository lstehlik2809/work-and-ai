import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {comparisonCsv,csvCell} from '../src/export/csv';
import {readShare,shareHash} from '../src/state/share';
import type {Snapshot} from '../src/domain/types';
const snapshot:Snapshot=JSON.parse(readFileSync('public/data/occupations.json','utf8'));
// Independent character-state parser, including escaped quotes and embedded CR/LF.
function parse(csv:string){const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;for(let i=0;i<csv.length;i++){const c=csv[i];if(c==='"'){if(quoted&&csv[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(!quoted&&c===','){row.push(cell);cell='';}else if(!quoted&&(c==='\r'||c==='\n')){if(c==='\r'&&csv[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;}assert(!quoted);row.push(cell);rows.push(row);return rows;}
test('all formula prefixes are inert while real numeric projections remain numeric',()=>{
 for(const value of ['=1+1','+SUM(A1:A2)','-2+3','@SUM(A1)','\tSUM(A1)','\rSUM(A1)','  =1+1',' \t+SUM(A1)','\n@A1']) assert.equal(parse(csvCell(value))[0][0],`'${value}`);
 assert.equal(csvCell(-6.5),'-6.5');assert.equal(csvCell(0),'0');assert.equal(csvCell(null),'"Unavailable"');
});
test('CSV round trip retains public fields, definitions, source, multiline quotes, zero and null',()=>{
 const o=structuredClone(snapshot.occupations[0]);o.title='Example, "quoted"\r\nsecond line';o.exposure=null;o.growth=0;o.annualOpenings=null;
 const csv=comparisonCsv([o],snapshot.release),rows=parse(csv);
 assert.equal(rows.length,2);assert.equal(rows[0].length,13);assert.equal(rows[1].length,13);
 assert.deepEqual(rows[1].slice(0,8),[o.code,o.title,'Unavailable','0',String(o.startYear),String(o.endYear),'Unavailable',snapshot.release.id]);
 assert.match(rows[1][8],/not job-loss probability/);assert.match(rows[1][9],/not an AI-specific effect/);assert.match(rows[1][10],/replacement needs/);
 assert.equal(rows[1][11],o.source);assert.equal(rows[1][12],o.mappingSource);
 assert(!csv.includes('sentinel-private-responsibilities-82731'));
});
test('malicious public title is neutralized through complete export',()=>{const o={...snapshot.occupations[0],title:'  =HYPERLINK("https://example.invalid","open")'};assert.equal(parse(comparisonCsv([o],snapshot.release))[1][1],"'"+o.title);});
test('share serializes only release and deduplicated maximum three codes',()=>{
 const codes=snapshot.occupations.slice(0,4).map(o=>o.code);const hash=shareHash([codes[0],codes[0],...codes.slice(1)],snapshot.release.id);const params=new URLSearchParams(hash.slice(1));
 assert.deepEqual([...params.keys()].sort(),['release','roles']);assert.deepEqual(readShare(hash,snapshot),{codes:codes.slice(0,3),warning:''});
});
test('unknown codes are excluded and unavailable historical release is disclosed',()=>{
 const code=snapshot.occupations[0].code;const invalid=readShare(`#roles=${code},99-9999,${code}&release=${snapshot.release.id}`,snapshot);assert.deepEqual(invalid.codes,[code]);assert.match(invalid.warning,/unavailable/);
 const old=readShare(`#roles=${code}&release=historical-not-bundled`,snapshot);assert.deepEqual(old.codes,[code]);assert.match(old.warning,/unavailable data release/);assert.match(old.warning,/do not reproduce the older release/);
 assert.deepEqual(readShare('',snapshot),{codes:[],warning:''});
});
