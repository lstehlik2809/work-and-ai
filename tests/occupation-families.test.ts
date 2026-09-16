import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OCCUPATION_FAMILIES, occupationFamilyCode, representedOccupationFamilies} from '../src/domain/occupation-families';
import type {Snapshot} from '../src/domain/types';

const snapshot: Snapshot = JSON.parse(readFileSync('public/data/occupations.json', 'utf8'));

test('all snapshot occupations and mapped roles agree on one represented civilian O*NET family', () => {
  const families = representedOccupationFamilies(snapshot.occupations);
  assert.equal(families.length, 22);
  assert(!families.some(family => family.code === '55'));
  assert.deepEqual(families.map(family => family.name), families.map(family => family.name).sort((a, b) => a.localeCompare(b)));
  for (const occupation of snapshot.occupations) {
    const code = occupationFamilyCode(occupation.code);
    assert(families.some(family => family.code === code), `${occupation.code} has an official family`);
    for (const role of occupation.roles) assert.equal(occupationFamilyCode(role.code), code, `${role.code} agrees with ${occupation.code}`);
  }
  assert.equal(OCCUPATION_FAMILIES.find(family => family.code === '25')?.name, 'Educational Instruction and Library');
});

test('family options reflect the supplied population without duplicates or unrepresented families', () => {
  assert.deepEqual(representedOccupationFamilies([]), []);
  assert.deepEqual(representedOccupationFamilies([{code: '29-1141'}, {code: '15-1251'}, {code: '15-1252'}]), [
    {code: '15', name: 'Computer and Mathematical'},
    {code: '29', name: 'Healthcare Practitioners and Technical'},
  ]);
});
