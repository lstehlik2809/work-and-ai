import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OCCUPATION_FAMILIES, occupationFamilyCode, occupationFamilyName, familyOccupationMembers, representedOccupationFamilies} from '../src/domain/occupation-families';
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

test('family names use official names for canonical occupations and specialties with an unknown fallback', () => {
  assert.equal(occupationFamilyName('25-2021'), 'Educational Instruction and Library');
  assert.equal(occupationFamilyName('15-1252.00'), 'Computer and Mathematical');
  assert.equal(occupationFamilyName('13'), 'Business and Financial Operations');
  assert.equal(occupationFamilyName('99-9999'), 'Unknown job family');
  assert.equal(occupationFamilyName(''), 'Unknown job family');
});

test('family membership covers every snapshot occupation once in alphabetical order regardless of roles or ratings', () => {
  const families = representedOccupationFamilies(snapshot.occupations);
  const allMembers = families.flatMap(family => {
    const members = familyOccupationMembers(snapshot.occupations, family.code);
    const expected = snapshot.occupations.filter(occupation => occupation.code.startsWith(family.code + '-'));
    assert.deepEqual(new Set(members.map(member => member.code)), new Set(expected.map(member => member.code)));
    assert.deepEqual(members.map(member => member.title), expected.map(member => member.title).sort((a, b) => a.localeCompare(b)));
    return members;
  });
  assert.equal(allMembers.length, 831);
  assert.equal(new Set(allMembers.map(member => member.code)).size, 831);
});

test('family members deduplicate codes, break title ties by code, and leave the source untouched', () => {
  const occupations = [{code: '15-1252', title: 'B'}, {code: '13-2011', title: 'A'}, {code: '15-1251', title: 'B'}, {code: '15-1251', title: 'B'}];
  const before = structuredClone(occupations);
  assert.deepEqual(familyOccupationMembers(occupations, '15').map(occupation => occupation.code), ['15-1251', '15-1252']);
  assert.deepEqual(familyOccupationMembers(occupations, '99'), []);
  assert.deepEqual(occupations, before);
});
