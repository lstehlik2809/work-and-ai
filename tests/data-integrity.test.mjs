import test from 'node:test';
import assert from 'node:assert/strict';
import {read,validateData,validateRelations,validateCommitted} from '../scripts/data/validate.mjs';
const fresh=()=>[read('public/data/occupations.json'),read('public/data/lexicon.json'),read('data/source-reference.json')];
test('committed raw hashes, population, mapping, units, metadata and aliases',()=>assert.equal(validateCommitted().status,'PASS'));
for(const [name,mutation] of [
  ['invalid category',s=>s.occupations[0].exposure='Safe'],
  ['summary result',s=>s.occupations[0].code='11-0000'],
  ['duplicate canonical',s=>s.occupations[1]=s.occupations[0]],
  ['invented metric',s=>s.occupations[0].growth=99],
  ['malformed metric',s=>s.occupations[0].growth='3.2'],
  ['nonfinite metric',s=>s.occupations[0].growth=Infinity],
  ['missing provenance',s=>s.occupations[0].source=''],
  ['wrong row',s=>s.occupations[0].sourceRow=4],
  ['wrong period',s=>s.occupations[0].endYear=2034],
  ['wrong openings units',s=>s.occupations[0].annualOpenings=19.1],
  ['broken mapping',s=>s.occupations[0].roles[0].code='11-9999.00'],
  ['dropped mapping',s=>s.occupations[0].roles.pop()],
  ['hidden broader scope',s=>s.occupations[0].roles[1].broader=false],
  ['missing task source',s=>s.occupations[0].roles[0].tasks[0].source=''],
]) test(`reject ${name}`,()=>{const args=fresh();mutation(args[0]);assert.throws(()=>validateData(...args));});
test('missing and invalid lexical coverage rejected',()=>{const args=fresh();args[1].aliases.pop();assert.throws(()=>validateData(...args));});
test('null is preserved and zero remains a measured zero with matching source fixture',()=>{const args=fresh();for(const field of ['growth','annualOpenings','exposure']){args[0].occupations[0][field]=null;args[2].detailed[0][field]=null;}args[0].occupations[1].growth=0;args[2].detailed[1].growth=0;assert.doesNotThrow(()=>validateData(...args));assert.equal(args[0].occupations[0].growth,null);assert.equal(args[0].occupations[1].growth,0);});
test('isolated many-to-one and one-to-many retain exact documented relationships',()=>{const occupations=[{code:'A',roles:[{code:'x'},{code:'y'}]},{code:'B',roles:[{code:'x'}]}];const mappings=[{code:'A',onetCode:'x'},{code:'A',onetCode:'y'},{code:'B',onetCode:'x'}];assert.doesNotThrow(()=>validateRelations(occupations,mappings));assert.throws(()=>validateRelations(occupations,mappings.slice(0,2)));occupations[0].roles.push({code:'x'});assert.throws(()=>validateRelations(occupations,mappings));});
