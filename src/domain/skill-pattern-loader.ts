import pin from './skill-pattern-pin.json';
import{PATTERN_METHOD,PATTERN_PARAMETERS}from'./skill-pattern-data';
import type{PatternArtifact}from'./skill-pattern-data';
import type{Snapshot}from'./types';
import type{SkillsData}from'../search/skills';
import{EXPOSURE_LEVELS}from'./occupation-map';
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const integer=(x:unknown)=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0;
export function validatePatternArtifact(value:unknown,snapshot:Snapshot,skills:SkillsData):PatternArtifact{
 const a=value as PatternArtifact;
 const bad=()=>{throw Error('The skill analysis does not match its verified reference.');};
 if(!a||a.schemaVersion!==2||a.release!==snapshot.release.id||a.release!==pin.release||a.method!==PATTERN_METHOD||Object.hasOwn(a,'model')||!a.parameters||Object.hasOwn(a.parameters,'prior')||Object.hasOwn(a.parameters,'draws')||!same(a.parameters,PATTERN_PARAMETERS)||!same(a.sourceHashes,pin.sourceHashes)||a.generationCodeHash!==pin.generationCodeHash||!same(a.skillIds,skills.skills.map(s=>s.id))||a.total!==snapshot.occupations.length||a.unknownExposure!==snapshot.occupations.filter(o=>o.exposure===null).length||!integer(a.noRatings)||a.noRatings>a.total||!Array.isArray(a.variants)||!same(a.variants.map(v=>v.id),pin.variantIds))bad();
 for(const v of a.variants){
  const expected=v.id.startsWith('mean-')?{threshold:Number(v.id.slice(5)),aggregation:'mean',minimumCoverage:0,omittedFamily:null}:v.id==='max-3'?{threshold:3,aggregation:'max',minimumCoverage:0,omittedFamily:null}:v.id==='coverage-28'?{threshold:3,aggregation:'mean',minimumCoverage:28,omittedFamily:null}:{threshold:3,aggregation:'mean',minimumCoverage:0,omittedFamily:v.id.slice(5)};
  if(Object.entries(expected).some(([k,x])=>v[k as keyof typeof v]!==x)||!integer(v.eligible)||!integer(v.omitted)||v.eligible+v.omitted!==a.total-a.unknownExposure||!v.categoryCounts||EXPOSURE_LEVELS.some(c=>!integer(v.categoryCounts[c]))||EXPOSURE_LEVELS.reduce((n,c)=>n+v.categoryCounts[c],0)!==v.eligible||!Array.isArray(v.rows)||v.rows.length!==4*a.skillIds.length)bad();
  const ids=new Set<string>();
  for(const r of v.rows){
   const key=`${r.category}/${r.skillId}`;
   if(ids.has(key)||!EXPOSURE_LEVELS.includes(r.category)||!a.skillIds.includes(r.skillId)||!Array.isArray(r.counts)||r.counts.length!==4||r.counts.some(x=>!integer(x))||r.selectedEligible!==v.categoryCounts[r.category]||r.otherEligible!==v.eligible-r.selectedEligible||r.counts[0]+r.counts[1]>r.selectedEligible||r.counts[2]+r.counts[3]>r.otherEligible)bad();ids.add(key);
   if(Object.hasOwn(r,'posterior'))bad();
  }
  for(const id of a.skillIds){const rows=v.rows.filter(r=>r.skillId===id),yes=rows.reduce((n,r)=>n+r.counts[0],0),no=rows.reduce((n,r)=>n+r.counts[1],0);if(rows.some(r=>r.counts[0]+r.counts[2]!==yes||r.counts[1]+r.counts[3]!==no))bad();}
 }
 return a;
}
export async function decodePatternArtifact(text:string,snapshot:Snapshot,skills:SkillsData){
 const sha=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');
 const [hash,occupationsHash,skillsHash]=await Promise.all([sha(text),sha(JSON.stringify(snapshot)),sha(JSON.stringify(skills))]);
 if(hash!==pin.sha256)throw Error('The skill analysis failed its integrity check.');
 if(occupationsHash!==pin.sourceObjectHashes.occupations||skillsHash!==pin.sourceObjectHashes.skills)throw Error('The skill analysis sources do not match the verified reference.');
 return validatePatternArtifact(JSON.parse(text),snapshot,skills);
}
export async function loadPatternArtifact(snapshot:Snapshot,skills:SkillsData){
 const response=await fetch(import.meta.env.BASE_URL+'data/skill-patterns.json',{cache:'no-cache'});
 if(!response.ok)throw Error('The skill analysis could not load.');
 return decodePatternArtifact(await response.text(),snapshot,skills);
}
