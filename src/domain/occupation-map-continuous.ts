import {buildOccupationProfiles, countExposure} from './occupation-map';
import type {OccupationMapData} from './occupation-map';
import type {Snapshot} from './types';
import type {SkillsData} from '../search/skills';

// This policy is part of the projection identity, including missing-data rules.
export const CONTINUOUS_MAP_POLICY = {
  metric: 'mean-absolute-importance-difference', normalization: 4,
  minimumJointRatings: 20, minimumKnownRatings: 20,
  missing: 'pairwise-available-no-imputation', aggregation: 'mean-distinct-mapped-roles',
} as const;

export function buildContinuousMapProfiles(snapshot: Snapshot, skills: SkillsData): OccupationMapData {
  const all = buildOccupationProfiles(snapshot, skills);
  const nodes = all.nodes.filter(node => node.knownSkills >= CONTINUOUS_MAP_POLICY.minimumKnownRatings);
  return {...all, nodes, excludedCodes: [...all.excludedCodes, ...all.nodes.filter(node => node.knownSkills < CONTINUOUS_MAP_POLICY.minimumKnownRatings).map(node => node.occupation.code)].sort(),
    mappedCounts: countExposure(nodes.map(node => node.occupation))};
}

export function continuousProfilePayload(snapshot: Snapshot, skills: SkillsData, model: OccupationMapData) {
  return {release: snapshot.release.id, policy: CONTINUOUS_MAP_POLICY, skills: skills.skills.map(skill => skill.id),
    occupations: [...model.nodes].sort((a, b) => a.occupation.code < b.occupation.code ? -1 : 1).map(node => [node.occupation.code, ...node.importance])};
}
