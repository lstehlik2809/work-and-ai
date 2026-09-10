import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import type {Snapshot} from '../src/domain/types';
import {validateSkills} from '../src/search/skills';
import {buildOccupationMap, EXPOSURE_RADIUS, nearestSkillNeighbors} from '../src/domain/occupation-map';
import {applyUmapProjection, type UmapProjection} from '../src/domain/occupation-map-projection';
import {spaceOccupationMap} from '../src/domain/occupation-map-spacing';

const snapshot: Snapshot = JSON.parse(readFileSync('public/data/occupations.json', 'utf8'));
const skills = validateSkills(JSON.parse(readFileSync('public/data/skills.json', 'utf8')), snapshot.release.id);
const model = buildOccupationMap(snapshot, skills);
const artifact: UmapProjection = JSON.parse(readFileSync('public/data/occupation-map-umap.json', 'utf8'));

test('UMAP spacing reduces real circle intersections while retaining bounded local positions and raw coordinates', context => {
  const before = structuredClone(artifact);
  const start = performance.now();
  const projected = applyUmapProjection(model, artifact);
  const elapsed = performance.now() - start;
  let rawOverlaps = 0, displayOverlaps = 0;
  const displacements: number[] = [];
  const raw = new Map(artifact.nodes.map(node => [node.code, node]));
  for (const [i, node] of projected.nodes.entries()) {
    const position = raw.get(node.occupation.code)!;
    assert.deepEqual([node.x, node.y], [position.x, position.y]);
    assert(node.displayX >= 0 && node.displayX <= 1 && node.displayY >= 0 && node.displayY <= 1);
    const displacement = Math.hypot(node.displayX - node.x, node.displayY - node.y) * 600;
    assert(displacement <= 12 + 1e-9);
    displacements.push(displacement);
    const radius = EXPOSURE_RADIUS[node.occupation.exposure ?? 'Moderate'];
    for (const other of projected.nodes.slice(i + 1)) {
      const radii = radius + EXPOSURE_RADIUS[other.occupation.exposure ?? 'Moderate'];
      if (Math.hypot(node.x - other.x, node.y - other.y) * 600 < radii) rawOverlaps++;
      if (Math.hypot(node.displayX - other.displayX, node.displayY - other.displayY) * 600 < radii) displayOverlaps++;
    }
  }
  assert.equal(projected.nodes.length, 772);
  assert(rawOverlaps > 0);
  assert(displayOverlaps <= rawOverlaps * 0.6, `${rawOverlaps} raw overlaps, ${displayOverlaps} display overlaps`);
  displacements.sort((a, b) => a - b);
  // Geometry is the acceptance oracle; elapsed time is evidence, not a flaky CI gate.
  context.diagnostic(JSON.stringify({rawOverlaps, displayOverlaps, reduction: 1 - displayOverlaps / rawOverlaps,
    meanShift: displacements.reduce((a, b) => a + b, 0) / displacements.length,
    medianShift: displacements[Math.floor(displacements.length / 2)], p95Shift: displacements[Math.floor(displacements.length * 0.95)], maxShift: displacements.at(-1), elapsedMs: elapsed}));
  assert.deepEqual(artifact, before);
});

test('full-population spacing is deterministic, exposure-independent and invariant to either input row order', () => {
  const before = structuredClone(model);
  const projected = applyUmapProjection(model, artifact);
  assert.deepEqual(applyUmapProjection(model, artifact), projected);
  const altered = {...model, nodes: [...model.nodes].reverse().map((node, i) => ({...node, occupation: {...node.occupation, exposure: i % 2 ? null : 'Very high' as const}}))};
  const reordered = applyUmapProjection(altered, {...artifact, nodes: [...artifact.nodes].reverse()});
  const coordinates = (nodes: typeof model.nodes) => [...nodes].sort((a, b) => a.occupation.code < b.occupation.code ? -1 : 1)
    .map(node => [node.occupation.code, node.x, node.y, node.displayX, node.displayY]);
  assert.deepEqual(coordinates(reordered.nodes), coordinates(projected.nodes));
  for (const node of model.nodes) {
    const projectedNode = projected.nodes.find(other => other.occupation.code === node.occupation.code)!;
    const neighbors = (selected: typeof node, nodes: typeof model.nodes) => nearestSkillNeighbors(selected, nodes)
      .map(match => [match.node.occupation.code, match.similarity, match.sharedSkills, match.union]);
    assert.deepEqual(neighbors(projectedNode, projected.nodes), neighbors(node, model.nodes));
  }
  assert.deepEqual(model, before);
});

test('coincident points separate deterministically at the center and boundaries without moving isolated points', () => {
  assert.deepEqual([...spaceOccupationMap([])], []);
  for (const origin of [0, 0.5, 1]) {
    const points = ['a', 'b', 'c', 'd'].map(code => ({code, x: origin, y: origin}));
    const before = structuredClone(points);
    const spaced = spaceOccupationMap(points);
    assert.deepEqual(spaced, spaceOccupationMap([...points].reverse()));
    assert.equal(new Set([...spaced.values()].map(point => `${point.displayX},${point.displayY}`)).size, points.length);
    for (const point of spaced.values()) {
      assert(point.displayX >= 0 && point.displayX <= 1 && point.displayY >= 0 && point.displayY <= 1);
      assert(Math.hypot(point.displayX - origin, point.displayY - origin) * 600 <= 12 + 1e-9);
    }
    assert.deepEqual(points, before);
  }
  const isolated = [{code: 'left', x: 0.1, y: 0.1}, {code: 'right', x: 0.9, y: 0.9}];
  assert.deepEqual([...spaceOccupationMap(isolated).values()], [{displayX: 0.1, displayY: 0.1}, {displayX: 0.9, displayY: 0.9}]);
});
