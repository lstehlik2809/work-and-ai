import type {Exposure, Occupation, Snapshot} from './types';
import type {SkillsData} from '../search/skills';

export const EXPOSURE_LEVELS = ['Low', 'Moderate', 'High', 'Very high'] as const;
export const EXPOSURE_RADIUS: Record<Exposure, number> = {Low: 3, Moderate: 4.5, High: 6, 'Very high': 8};
export const EXPOSURE_COLOR: Record<Exposure, string> = {Low: '#788e82', Moderate: '#4b8194', High: '#ae743c', 'Very high': '#963f47'};
export const IMPORTANT_SKILL_THRESHOLD = 3;
export type ExposureCounts = Record<Exposure | 'Unavailable', number>;
export interface MapOccupation {
  occupation: Occupation;
  importance: (number | null)[];
  importantSkills: number[];
  knownSkills: number;
  ratedRoles: number;
  mappedRoles: number;
  unavailableRatings: number;
  x: number;
  y: number;
  displayX: number;
  displayY: number;
}
export interface OccupationMapData {
  nodes: MapOccupation[];
  excludedCodes: string[];
  total: number;
  fullCounts: ExposureCounts;
  mappedCounts: ExposureCounts;
  explainedVariance: number;
  offsetNodes: number;
}
const compareCode = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function countExposure(occupations: Occupation[]): ExposureCounts {
  const counts: ExposureCounts = {Low: 0, Moderate: 0, High: 0, 'Very high': 0, Unavailable: 0};
  occupations.forEach(o => counts[o.exposure ?? 'Unavailable']++);
  return counts;
}

// Jacobi rotations diagonalize the small symmetric skill covariance matrix.
// Fixed scan/tie order and axis signs keep the projection reproducible.
export function projectSkillProfiles(profiles: number[][]): {points: [number, number][]; explainedVariance: number} {
  if (!profiles.length) return {points: [], explainedVariance: 0};
  const dimensions = profiles[0].length;
  if (!dimensions) return {points: profiles.map(() => [0, 0]), explainedVariance: 0};
  const means = Array.from({length: dimensions}, (_, i) => profiles.reduce((sum, row) => sum + row[i], 0) / profiles.length);
  const centered = profiles.map(row => row.map((value, i) => value - means[i]));
  const matrix = Array.from({length: dimensions}, (_, i) => Array.from({length: dimensions}, (_, j) => centered.reduce((sum, row) => sum + row[i] * row[j], 0) / profiles.length));
  const vectors: number[][] = Array.from({length: dimensions}, (_, i) => Array.from({length: dimensions}, (_, j) => i === j ? 1 : 0));
  const totalVariance = matrix.reduce((sum, row, i) => sum + row[i], 0);
  for (let iteration = 0; iteration < dimensions * dimensions * 50; iteration++) {
    let p = 0, q = 0, largest = 0;
    for (let i = 0; i < dimensions; i++) for (let j = i + 1; j < dimensions; j++) {
      if (Math.abs(matrix[i][j]) > largest) {largest = Math.abs(matrix[i][j]); p = i; q = j;}
    }
    if (largest < 1e-12) break;
    const angle = 0.5 * Math.atan2(2 * matrix[p][q], matrix[q][q] - matrix[p][p]);
    const c = Math.cos(angle), s = Math.sin(angle);
    const pp = matrix[p][p], qq = matrix[q][q], pq = matrix[p][q];
    for (let k = 0; k < dimensions; k++) if (k !== p && k !== q) {
      const kp = matrix[k][p], kq = matrix[k][q];
      matrix[k][p] = matrix[p][k] = c * kp - s * kq;
      matrix[k][q] = matrix[q][k] = s * kp + c * kq;
    }
    matrix[p][p] = c * c * pp - 2 * s * c * pq + s * s * qq;
    matrix[q][q] = s * s * pp + 2 * s * c * pq + c * c * qq;
    matrix[p][q] = matrix[q][p] = 0;
    for (let k = 0; k < dimensions; k++) {
      const kp = vectors[k][p], kq = vectors[k][q];
      vectors[k][p] = c * kp - s * kq;
      vectors[k][q] = s * kp + c * kq;
    }
  }
  const axes = Array.from({length: dimensions}, (_, i) => i).sort((a, b) => matrix[b][b] - matrix[a][a] || a - b).slice(0, 2);
  const loadings = axes.map(axis => {
    const values = vectors.map(row => row[axis]);
    const pivot = values.reduce((best, value, i) => Math.abs(value) > Math.abs(values[best]) ? i : best, 0);
    return values.map(value => value * (values[pivot] < 0 ? -1 : 1));
  });
  const points = centered.map(row => [0, 1].map(axis => loadings[axis]?.reduce((sum, value, i) => sum + value * row[i], 0) ?? 0) as [number, number]);
  return {points, explainedVariance: totalVariance > 1e-12 ? Math.min(1, axes.reduce((sum, axis) => sum + Math.max(0, matrix[axis][axis]), 0) / totalVariance) : 0};
}

export function buildOccupationProfiles(snapshot: Snapshot, skills: SkillsData): OccupationMapData {
  const roles = new Map(skills.roles.map(role => [role.code, role.importance]));
  const nodes: MapOccupation[] = [], excludedCodes: string[] = [];
  for (const occupation of [...snapshot.occupations].sort((a, b) => compareCode(a.code, b.code))) {
    const mappedCodes = [...new Set(occupation.roles.map(role => role.code))].sort(compareCode);
    const ratings = mappedCodes.map(code => roles.get(code)).filter((row): row is (number | null)[] => !!row);
    const importance = skills.skills.map((_, i) => {
      const available = ratings.map(row => row[i]).filter((value): value is number => value !== null && value !== undefined);
      return available.length ? available.reduce((sum, value) => sum + value, 0) / available.length : null;
    });
    const knownSkills = importance.filter(value => value !== null).length;
    if (!knownSkills) {excludedCodes.push(occupation.code); continue;}
    nodes.push({occupation, importance, importantSkills: importance.flatMap((value, i) => value !== null && value >= IMPORTANT_SKILL_THRESHOLD ? [i] : []), knownSkills,
      ratedRoles: ratings.filter(row => row.some(value => value !== null)).length, mappedRoles: mappedCodes.length,
      unavailableRatings: mappedCodes.length * skills.skills.length - ratings.reduce((sum, row) => sum + row.filter(value => value !== null).length, 0),
      x: 0, y: 0, displayX: 0, displayY: 0});
  }
  return {nodes, excludedCodes, total: snapshot.occupations.length, fullCounts: countExposure(snapshot.occupations), mappedCounts: countExposure(nodes.map(node => node.occupation)), explainedVariance: 0, offsetNodes: 0};
}

// Retained for reproducible offline comparisons; the interactive map uses UMAP.
export function buildOccupationMap(snapshot: Snapshot, skills: SkillsData): OccupationMapData {
  const model = buildOccupationProfiles(snapshot, skills);
  const {nodes} = model;
  const profiles = nodes.map(node => skills.skills.map((_, i) => node.importantSkills.includes(i) ? 1 : 0));
  const projection = projectSkillProfiles(profiles);
  const maxAbs = Math.max(1e-9, ...projection.points.flat().map(Math.abs));
  const collisions = new Map<string, number[]>();
  nodes.forEach((node, i) => {
    node.x = node.displayX = 0.5 + projection.points[i][0] / maxAbs * 0.4;
    node.y = node.displayY = 0.5 + projection.points[i][1] / maxAbs * 0.4;
    const key = `${node.x.toFixed(10)},${node.y.toFixed(10)}`;
    collisions.set(key, [...(collisions.get(key) ?? []), i]);
  });
  let offsetNodes = 0;
  for (const group of collisions.values()) if (group.length > 1) {
    group.forEach((index, order) => {
      // Displace only coincident projections, independent of exposure.
      const radius = 0.004 * Math.sqrt(order + 0.5), angle = order * Math.PI * (3 - Math.sqrt(5));
      nodes[index].displayX += Math.cos(angle) * radius;
      nodes[index].displayY += Math.sin(angle) * radius;
      offsetNodes++;
    });
  }
  return {...model, explainedVariance: projection.explainedVariance, offsetNodes};
}

export function sharedSkillSimilarity(a: MapOccupation, b: MapOccupation) {
  const other = new Set(b.importantSkills);
  const sharedSkills = a.importantSkills.filter(skill => other.has(skill));
  const union = new Set([...a.importantSkills, ...b.importantSkills]).size;
  return {sharedSkills, union, similarity: union ? sharedSkills.length / union : 0};
}
export function nearestSkillNeighbors(selected: MapOccupation, nodes: MapOccupation[], limit = 5) {
  return nodes.filter(node => node.occupation.code !== selected.occupation.code)
    .map(node => ({node, ...sharedSkillSimilarity(selected, node)}))
    .filter(match => match.sharedSkills.length > 0)
    .sort((a, b) => b.similarity - a.similarity || b.sharedSkills.length - a.sharedSkills.length || compareCode(a.node.occupation.code, b.node.occupation.code))
    .slice(0, Math.max(0, Math.floor(limit)));
}
