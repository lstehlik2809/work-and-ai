import type {Snapshot} from './types';
import type {SkillsData} from '../search/skills';
import type {OccupationMapData} from './occupation-map';
import {spaceOccupationMap} from './occupation-map-spacing';

export type ProjectionMethod = 'pca' | 'umap';
type NeighborhoodScores = {'5': number; '10': number; '20': number};
export interface UmapProjection {
  schemaVersion: 1;
  release: string;
  profileSha256: string;
  defaultProjection: ProjectionMethod;
  method: 'umap';
  parameters: {n_neighbors: number; min_dist: number; n_components: 2; metric: 'precomputed-jaccard'; random_state: 11; n_epochs: 500};
  versions: Record<string, string>;
  evaluation: {pca: NeighborhoodScores; umap: NeighborhoodScores; summary: string};
  nodes: {code: string; x: number; y: number}[];
}

async function sha256(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function occupationProfileFingerprint(snapshot: Snapshot, skills: SkillsData, model: OccupationMapData): Promise<string> {
  const profile = JSON.stringify({
    release: snapshot.release.id,
    skills: skills.skills.map(skill => skill.id),
    occupations: model.nodes.map(node => [node.occupation.code, ...skills.skills.map((_, i) => node.importantSkills.includes(i) ? 1 : 0)]),
  });
  return sha256(new TextEncoder().encode(profile).buffer);
}

function boundedNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function validateCoordinates(value: unknown, model: OccupationMapData): asserts value is UmapProjection['nodes'] {
  if (!Array.isArray(value) || value.length !== model.nodes.length) throw Error('UMAP occupation coverage is invalid.');
  const expected = new Set(model.nodes.map(node => node.occupation.code));
  const seen = new Set<string>();
  for (const node of value) {
    if (!record(node) || typeof node.code !== 'string' || !expected.has(node.code) || seen.has(node.code) || !boundedNumber(node.x) || !boundedNumber(node.y)) throw Error('UMAP occupation coordinates are invalid.');
    seen.add(node.code);
  }
}

export function validateUmapProjection(value: unknown, snapshot: Snapshot, model: OccupationMapData, profileSha256: string): UmapProjection {
  if (!record(value) || value.schemaVersion !== 1 || value.release !== snapshot.release.id || value.method !== 'umap'
    || !['pca', 'umap'].includes(value.defaultProjection as string)
    || typeof value.profileSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.profileSha256) || value.profileSha256 !== profileSha256) throw Error('UMAP projection metadata or skill profile is incompatible.');
  const parameters = value.parameters;
  if (!record(parameters) || !Number.isInteger(parameters.n_neighbors) || (parameters.n_neighbors as number) < 2 || (parameters.n_neighbors as number) >= model.nodes.length
    || !boundedNumber(parameters.min_dist) || parameters.n_components !== 2 || parameters.metric !== 'precomputed-jaccard'
    || parameters.random_state !== 11 || parameters.n_epochs !== 500) throw Error('UMAP projection parameters are invalid.');
  if (!record(value.versions) || !Object.keys(value.versions).length || Object.values(value.versions).some(version => typeof version !== 'string' || !version.trim())) throw Error('UMAP version metadata is invalid.');
  const evaluation = value.evaluation;
  if (!record(evaluation) || typeof evaluation.summary !== 'string' || !evaluation.summary.trim()) throw Error('UMAP evaluation metadata is invalid.');
  for (const method of ['pca', 'umap']) {
    const scores = evaluation[method];
    if (!record(scores) || !['5', '10', '20'].every(k => boundedNumber(scores[k]))) throw Error('UMAP neighborhood metrics are invalid.');
  }
  validateCoordinates(value.nodes, model);
  return value as unknown as UmapProjection;
}

export async function loadUmapProjection(snapshot: Snapshot, skills: SkillsData, model: OccupationMapData, signal: AbortSignal, expectedSha256: string, fetcher: typeof fetch = fetch): Promise<UmapProjection> {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) throw Error('UMAP integrity pin is invalid.');
  const response = await fetcher((import.meta.env?.BASE_URL ?? '/') + 'data/occupation-map-umap.json', {signal});
  if (!response.ok) throw Error('UMAP layout request failed.');
  const bytes = await response.arrayBuffer();
  signal.throwIfAborted();
  const [actualSha256, profileSha256] = await Promise.all([sha256(bytes), occupationProfileFingerprint(snapshot, skills, model)]);
  signal.throwIfAborted();
  if (actualSha256 !== expectedSha256) throw Error('UMAP layout integrity check failed.');
  return validateUmapProjection(JSON.parse(new TextDecoder().decode(bytes)), snapshot, model, profileSha256);
}

export function applyUmapProjection(model: OccupationMapData, projection: UmapProjection): OccupationMapData {
  // Validate the complete join before constructing any output. Source profiles,
  // occupation records and neighbor calculations are never modified.
  validateCoordinates(projection.nodes, model);
  const coordinates = new Map(projection.nodes.map(node => [node.code, node]));
  const display = spaceOccupationMap(projection.nodes);
  return {...model, nodes: model.nodes.map(node => {
    const position = coordinates.get(node.occupation.code)!;
    return {...node, x: position.x, y: position.y, ...display.get(node.occupation.code)!};
  })};
}
