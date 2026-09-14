import type{Exposure,Snapshot}from'./types';
import type{SkillsData}from'../search/skills';
import type{Contingency}from'./skill-exposure';
import{buildSkillExposureRow,selectSkillBaseline}from'./skill-exposure';
import type{SkillBaseline,SkillExposureRow}from'./skill-exposure';
import{EXPOSURE_LEVELS,buildOccupationProfiles}from'./occupation-map';
export const PATTERN_METHOD='occupational-skill-patterns-descriptive-v2';
export const PATTERN_PARAMETERS={thresholds:[2.5,3,3.5],primaryAggregation:'mean',alternativeAggregation:'max',minimumCoverage:28,skillCount:35,sparseRatedBelow:30,sparseImportantBelow:10,directionBoundaryPp:1,magnitudeRangePp:5,topCount:5};
export interface PatternRow{category:Exposure;skillId:string;counts:Contingency;selectedEligible:number;otherEligible:number}
export interface PatternVariant{id:string;threshold:number;aggregation:'mean'|'max';minimumCoverage:number;omittedFamily:string|null;eligible:number;omitted:number;categoryCounts:Record<Exposure,number>;rows:PatternRow[]}
export interface PatternArtifact{schemaVersion:2;release:string;method:string;sourceHashes:{occupations:string;skills:string};generationCodeHash:string;parameters:typeof PATTERN_PARAMETERS;skillIds:string[];total:number;unknownExposure:number;noRatings:number;variants:PatternVariant[]}
export function buildPatternCounts(snapshot:Snapshot,skills:SkillsData):PatternVariant[]{
 const mean=new Map(buildOccupationProfiles(snapshot,skills).nodes.map(n=>[n.occupation.code,n.importance]));
 const roleRatings=new Map(skills.roles.map(r=>[r.code,r.importance]));
 const population=snapshot.occupations.filter(o=>o.exposure!==null);
 const families=[...new Set(population.map(o=>o.code.slice(0,2)))].sort();
 const options=[...PATTERN_PARAMETERS.thresholds.map(threshold=>({id:`mean-${threshold}`,threshold,aggregation:'mean' as const,minimumCoverage:0,omittedFamily:null as string|null})),{id:'max-3',threshold:3,aggregation:'max' as const,minimumCoverage:0,omittedFamily:null},{id:'coverage-28',threshold:3,aggregation:'mean' as const,minimumCoverage:28,omittedFamily:null},...families.map(family=>({id:`omit-${family}`,threshold:3,aggregation:'mean' as const,minimumCoverage:0,omittedFamily:family}))];
 return options.map(option=>{
  const eligible=population.filter(o=>o.code.slice(0,2)!==option.omittedFamily&&(mean.get(o.code)?.filter(v=>v!==null).length??0)>=option.minimumCoverage);
  const categoryCounts=Object.fromEntries(EXPOSURE_LEVELS.map(c=>[c,eligible.filter(o=>o.exposure===c).length]))as Record<Exposure,number>;
  const ratings=eligible.map(o=>({category:o.exposure!,values:option.aggregation==='mean'?mean.get(o.code)??skills.skills.map(()=>null):skills.skills.map((_,i)=>{const values=[...new Set(o.roles.map(r=>r.code))].map(c=>roleRatings.get(c)?.[i]).filter((v):v is number=>v!=null);return values.length?Math.max(...values):null;})}));
  const rows=EXPOSURE_LEVELS.flatMap(category=>skills.skills.map((skill,i)=>{const counts:Contingency=[0,0,0,0];for(const r of ratings){const value=r.values[i];if(value!==null)counts[(r.category===category?0:2)+(value>=option.threshold?0:1)]++;}return{category,skillId:skill.id,counts,selectedEligible:categoryCounts[category],otherEligible:eligible.length-categoryCounts[category]};}));
  return{...option,eligible:eligible.length,omitted:population.length-eligible.length,categoryCounts,rows};
 });
}
export type PatternSort='difference'|'ratio'|'skill';
export function sortPatterns<T extends SkillExposureRow>(rows:T[],sort:PatternSort='difference'):T[]{
 return [...rows].sort((a,b)=>{const x=sort==='skill'?a.skill.name:sort==='ratio'?a.ratio:a.difference===null?null:Math.abs(a.difference),y=sort==='skill'?b.skill.name:sort==='ratio'?b.ratio:b.difference===null?null:Math.abs(b.difference);if(x===y)return a.skill.id.localeCompare(b.skill.id);if(x===null)return 1;if(y===null)return -1;return typeof x==='string'&&typeof y==='string'?x.localeCompare(y):x>y?-1:1;});
}
export function projectPatterns(artifact:PatternArtifact,skills:SkillsData,category:Exposure,baseline:SkillBaseline,threshold:number){
 const variant=artifact.variants.find(v=>v.id===`mean-${threshold}`)!;
 return variant.rows.filter(r=>r.category===category).map(r=>({...selectSkillBaseline(buildSkillExposureRow(skills.skills.find(s=>s.id===r.skillId)!,category,r.counts),baseline),selectedEligible:r.selectedEligible,baselineEligible:baseline==='overall'?r.selectedEligible+r.otherEligible:r.otherEligible}));
}
export function patternSensitivity(artifact:PatternArtifact,skills:SkillsData,category:Exposure,baseline:SkillBaseline){
 const variants=artifact.variants.map(v=>{const rows=v.rows.filter(r=>r.category===category).map(r=>selectSkillBaseline(buildSkillExposureRow(skills.skills.find(s=>s.id===r.skillId)!,category,r.counts),baseline));return{variant:v,rows,top:new Set(sortPatterns(rows).filter(r=>r.difference!==null).slice(0,5).map(r=>r.skill.id))};});
 return new Map(skills.skills.map(skill=>{const values=variants.map(v=>({variant:v.variant,row:v.rows.find(r=>r.skill.id===skill.id)!,topFive:v.top.has(skill.id)}));const valid=values.flatMap(v=>v.row.difference===null?[]:[v.row.difference]);const min=valid.length?Math.min(...valid):null,max=valid.length?Math.max(...valid):null;const exact=values.flatMap(v=>{if(v.row.difference===null)return[];const[a,b,c,d]=v.row.counts.map(BigInt),s=a+b,r=c+d;return[{n:100n*(a*r-c*s),d:s*(baseline==='overall'?s+r:r)}];}).sort((a,b)=>a.n*b.d<b.n*a.d?-1:a.n*b.d>b.n*a.d?1:0);const low=exact[0],high=exact.at(-1);return[skill.id,{values,min,max,unavailable:values.length-valid.length,directionChanges:Boolean(low&&high&&low.n< -low.d&&high.n>high.d),magnitudeSensitive:Boolean(low&&high&&high.n*low.d-low.n*high.d>=5n*high.d*low.d),topFiveChanges:new Set(values.filter(v=>v.row.difference!==null).map(v=>v.topFive)).size>1}];}));
}
export const sparsePattern=(row:SkillExposureRow)=>row.selectedKnown<30||row.otherKnown<30||row.counts[0]<10||row.counts[2]<10;
