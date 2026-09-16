import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {aggregateFamilyExposure, familyExposureColumns} from '../src/domain/family-exposure';
import type {Snapshot} from '../src/domain/types';

const snapshot: Snapshot = JSON.parse(readFileSync('public/data/occupations.json', 'utf8'));

test('the complete snapshot yields 22 families and all 831 occupations with exact exposure counts', () => {
  const rows = aggregateFamilyExposure(snapshot.occupations);
  assert.equal(rows.length, 22);
  assert.equal(rows.reduce((sum, row) => sum + row.total, 0), 831);
  assert.deepEqual(familyExposureColumns(rows), ['Low', 'Moderate', 'High', 'Very high']);
  for (const row of rows) {
    const members = snapshot.occupations.filter(occupation => occupation.code.startsWith(row.code + '-'));
    assert.equal(row.total, members.length);
    assert.equal(Object.values(row.counts).reduce((sum, count) => sum + count, 0), members.length);
    for (const exposure of familyExposureColumns(rows)) {
      assert.equal(row.counts[exposure], members.filter(occupation => occupation.exposure === exposure).length);
    }
    assert.equal(row.highShare, members.filter(occupation => occupation.exposure === 'High' || occupation.exposure === 'Very high').length / members.length);
  }
  assert.equal(rows.find(row => row.code === '13')!.counts['Very high'], 26);
  assert.deepEqual(rows.reduce((sum, row) => sum.map((count, i) => count + row.counts[familyExposureColumns(rows)[i]]), [0, 0, 0, 0]), [213, 206, 206, 206]);
});

test('canonical BLS codes count once; missing exposure stays separate and in the denominator', () => {
  const rows = aggregateFamilyExposure([
    {code: '15-1251', exposure: 'High'}, {code: '15-1251', exposure: 'High'},
    {code: '15-1252', exposure: null}, {code: '15-1253', exposure: 'Low'},
  ]);
  assert.equal(rows[0].total, 3);
  assert.deepEqual(rows[0].counts, {Low: 1, Moderate: 0, High: 1, 'Very high': 0, Unavailable: 1});
  assert.equal(rows[0].highShare, 1 / 3);
  assert.deepEqual(familyExposureColumns(rows), ['Low', 'Moderate', 'High', 'Very high', 'Unavailable']);
  assert.equal((rows[0].counts.Unavailable / rows[0].total * 100).toFixed(1), '33.3');
});

test('ranking uses High plus Very high occupation shares and alphabetical ties, independent of input order', () => {
  const occupations = [
    {code: '15-1251', exposure: 'High' as const}, {code: '15-1252', exposure: 'Low' as const},
    {code: '13-2011', exposure: 'Very high' as const}, {code: '13-2012', exposure: 'Moderate' as const},
    {code: '23-1011', exposure: 'High' as const}, {code: '29-1141', exposure: null},
  ];
  const rows = aggregateFamilyExposure(occupations);
  assert.deepEqual(rows.map(row => row.code), ['23', '13', '15', '29']);
  assert.deepEqual(rows.map(row => row.highShare), [1, 0.5, 0.5, 0]);
  assert.deepEqual(aggregateFamilyExposure([...occupations].reverse()), rows);
  assert.deepEqual(aggregateFamilyExposure([]), []);
});
