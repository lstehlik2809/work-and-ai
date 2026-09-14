import type{Exposure}from'../domain/types';
import type{SkillsData}from'../search/skills';
import type{SkillBaseline}from'../domain/skill-exposure';
import{patternSensitivity,projectPatterns,sortPatterns,sparsePattern}from'../domain/skill-pattern-data';
import type{PatternArtifact,PatternSort}from'../domain/skill-pattern-data';
import{csvCell}from'./csv';
export function skillPatternsCsv(a:PatternArtifact,skills:SkillsData,category:Exposure,baseline:SkillBaseline,threshold:number,sort:PatternSort='difference',sensitivity=false){
 const meta=[a.release,a.method,a.generationCodeHash,a.sourceHashes.occupations,a.sourceHashes.skills,category,baseline,threshold,sort,'all-35-skills'];
 const headers=['Release','Method','Generation code SHA256','Occupation source SHA256','Skill source SHA256','Category','Baseline','Primary threshold','Sort','Scope','Variant','Variant threshold','Aggregation','Minimum rated skills','Omitted family','Eligible population','Omitted population','Skill ID','Skill','Selected important','Selected below','Rest important','Rest below','Selected rated','Selected eligible','Baseline important','Baseline rated','Baseline eligible','Selected prevalence','Baseline prevalence','Difference (pp)','Prevalence ratio','Sparse','Direction changes','Magnitude sensitive','Top five membership changes','Sensitivity minimum (pp)','Sensitivity maximum (pp)','Unavailable variants'];
 const diagnostics=patternSensitivity(a,skills,category,baseline),primary=a.variants.find(v=>v.id===`mean-${threshold}`)!;
 const rows=sortPatterns(projectPatterns(a,skills,category,baseline,threshold),sort).flatMap(row=>{
  const d=diagnostics.get(row.skill.id)!;
  return(sensitivity?d.values:[{variant:primary,row,topFive:false}]).map(({variant:v,row:r})=>{
   const counts=v.rows.find(x=>x.category===category&&x.skillId===r.skill.id)!;
   return [...meta,v.id,v.threshold,v.aggregation,v.minimumCoverage,v.omittedFamily,v.eligible,v.omitted,r.skill.id,r.skill.name,...r.counts,r.selectedKnown,counts.selectedEligible,r.baselineImportant,r.baselineKnown,baseline==='overall'?v.eligible:counts.otherEligible,r.selectedPrevalence,r.baselinePrevalence,r.difference,r.ratio===Infinity?'Infinity':r.ratio,String(sparsePattern(r)),String(d.directionChanges),String(d.magnitudeSensitive),String(d.topFiveChanges),d.min,d.max,d.unavailable];
  });
 });
 return[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
