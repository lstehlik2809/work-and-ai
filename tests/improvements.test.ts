import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{buildPatternCounts,projectPatterns,patternSensitivity,sortPatterns,sparsePattern}from'../src/domain/skill-pattern-data';
import{validatePatternArtifact,decodePatternArtifact}from'../src/domain/skill-pattern-loader';
import{buildSkillExposureRow,selectSkillBaseline}from'../src/domain/skill-exposure';
import{buildOccupationProfiles,continuousSkillSimilarity,nearestContinuousNeighbors}from'../src/domain/occupation-map';
import{skillPatternsCsv}from'../src/export/skill-patterns';import{readingBrief}from'../src/export/brief';
import{SearchEngine}from'../src/search/engine';import editorial from'../src/search/editorial-titles.json';
import type{Snapshot}from'../src/domain/types';import type{SkillsData}from'../src/search/skills';
const read=(p:string)=>JSON.parse(readFileSync(p,'utf8'));
const snapshot:Snapshot=read('public/data/occupations.json'),skills:SkillsData=read('public/data/skills.json'),raw=readFileSync('public/data/skill-patterns.json','utf8'),artifact=validatePatternArtifact(JSON.parse(raw),snapshot,skills);
test('literal counts: unique role means, threshold boundaries, unknown and all-missing population',()=>{
 const roles=[{code:'a',importance:[2,3,null]},{code:'b',importance:[4,1,4]},{code:'s2',importance:[2.5,null,2]},{code:'r1',importance:[3.5,4,null]},{code:'r2',importance:[1,2,2]},{code:'u',importance:[5,5,5]}];
 const specs:[string,('Low'|'High'|null),string[]][]=[['11-0001','High',['a','a','b']],['11-0002','High',['s2']],['13-0001','Low',['r1']],['13-0002','Low',['r2']],['15-0001',null,['u']],['15-0002','High',['missing']]];
 const snap={...snapshot,occupations:specs.map(([code,exposure,codes])=>({...snapshot.occupations[0],code,exposure,roles:codes.map(code=>({...snapshot.occupations[0].roles[0],code}))}))};
 const variants=buildPatternCounts(snap,{...skills,skills:skills.skills.slice(0,3),roles}),rows=variants.find(v=>v.id==='mean-3')!.rows.filter(r=>r.category==='High');
 assert.deepEqual(rows.map(r=>r.counts),[[1,1,1,1],[0,1,1,1],[1,1,0,1]]);assert(rows.every(r=>r.selectedEligible===3&&r.otherEligible===2));
 for(const [id,expected]of[['mean-2.5',[2,0,1,1]],['mean-3.5',[0,2,1,1]]]as const)assert.deepEqual(variants.find(v=>v.id===id)!.rows.find(r=>r.category==='High')!.counts,expected);
 assert.deepEqual(variants.find(v=>v.id==='max-3')!.rows.filter(r=>r.category==='High')[1].counts,[1,0,1,1]);
 assert.equal(variants.find(v=>v.id==='omit-11')!.eligible,3);
 const r=buildSkillExposureRow(skills.skills[2],'High',[1,1,0,1]);assert.equal(r.ratio,1.5);assert(Math.abs(r.difference!-100/6)<1e-12);assert.equal(selectSkillBaseline(r,'rest').ratio,Infinity);
});
test('coverage restriction includes28 and excludes27 without converting the remaining nulls',()=>{
 const data={...skills,roles:[{code:'a',importance:Array.from({length:35},(_,i)=>i<27?3:null)},{code:'b',importance:Array.from({length:35},(_,i)=>i<28?3:null)}]};
 const snap={...snapshot,occupations:data.roles.map((r,i)=>({...snapshot.occupations[0],code:`11-000${i}`,exposure:'High' as const,roles:[{...snapshot.occupations[0].roles[0],code:r.code}]}))};
 const v=buildPatternCounts(snap,data).find(v=>v.id==='coverage-28')!;assert.equal(v.eligible,1);assert.deepEqual(v.rows.find(r=>r.category==='High'&&r.skillId===skills.skills[28].id)!.counts,[0,0,0,0]);
});
test('validated source analysis includes831eligible,59unrated and all fixed variants',async()=>{
 assert.equal((await decodePatternArtifact(raw,snapshot,skills)).variants.length,27);assert.equal(artifact.variants[0].eligible,831);assert.equal(artifact.noRatings,59);assert.equal(artifact.variants.find(v=>v.id==='coverage-28')!.eligible,679);
 const rows=projectPatterns(artifact,skills,'Very high','overall',3);assert.equal(rows.length,35);assert(rows.every(r=>r.selectedEligible===206&&r.baselineEligible===831));
});
test('artifact rejects corrupted bytes and structurally stale or inconsistent references',async()=>{
 await assert.rejects(()=>decodePatternArtifact(raw+' ',snapshot,skills));
 const edits:((a:any)=>void)[]=[
  a=>a.release='stale',a=>a.sourceHashes.skills='x',a=>a.sourceHashes.occupations='x',a=>a.generationCodeHash='x',
  a=>a.skillIds.reverse(),a=>a.variants.pop(),a=>a.variants[0].rows.pop(),
  a=>a.variants[0].rows[0].counts[0]=99999,a=>a.variants[0].rows[0].counts[0]=-1,a=>a.variants[0].rows[0].counts[0]=1.5,
  a=>a.variants[3].threshold=2.5,a=>a.variants[0].rows[0].selectedEligible--,
  a=>a.variants[0].rows[1]=structuredClone(a.variants[0].rows[0]),a=>a.variants[0].categoryCounts.High++,
  a=>a.variants[0].eligible++,a=>a.variants[0].omitted++,a=>a.total++,a=>a.unknownExposure++,
  a=>a.variants[0].rows[0].counts[2]++,a=>a.variants[4].minimumCoverage=27,
 ];
 for(const edit of edits){const a=structuredClone(artifact);edit(a);assert.throws(()=>validatePatternArtifact(a,snapshot,skills));}
});
test('absolute difference ordering retains sign, stable ties and unavailable last',()=>{
 const base=buildSkillExposureRow(skills.skills[0],'High',[10,20,10,20]);
 const rows=[{...base,skill:{...base.skill,id:'b'},difference:5},{...base,skill:{...base.skill,id:'a'},difference:-5},{...base,skill:{...base.skill,id:'c'},difference:null}];
 assert.deepEqual(sortPatterns(rows).map(r=>r.skill.id),['a','b','c']);assert.equal(sparsePattern(base),false);assert(sparsePattern({...base,counts:[9,21,10,20]}));assert(sparsePattern({...base,selectedKnown:29}));
});
test('all sensitivity results project literal counts and contain no posterior inference',()=>{
 for(const baseline of ['overall','rest']as const){const d=patternSensitivity(artifact,skills,'Very high',baseline);assert.equal(d.size,35);for(const item of d.values()){assert.equal(item.values.length,27);for(const v of item.values){assert(!Object.hasOwn(v.row,'evidence'));assert(!Object.hasOwn(v.row,'restEvidence'));assert(!Object.hasOwn(v.row,'posterior'));const[a,b,c,e]=v.row.counts;const expected=a+b&&(baseline==='rest'?c+e:a+b+c+e)?100*(a/(a+b)-(baseline==='rest'?c/(c+e):(a+c)/(a+b+c+e))):null;if(expected!==null)assert(Math.abs(v.row.difference!-expected)<1e-10);else assert.equal(v.row.difference,null);}}}
});
test('continuous similarity uses19/20/35joint boundaries, symmetry, extremes and statistics independence',()=>{
 const original=buildOccupationProfiles(snapshot,skills).nodes[0],a={...original,importance:Array(35).fill(1)},b={...original,importance:Array(35).fill(5)};
 assert.equal(continuousSkillSimilarity(a,a).similarity,1);assert.equal(continuousSkillSimilarity(a,b).similarity,0);
 for(const n of[19,20,35]){const c={...b,importance:Array.from({length:35},(_,i)=>i<n?3:null)};const r=continuousSkillSimilarity(a,c);assert.equal(r.jointlyRated,n);assert.equal(r.similarity,n<20?null:.5);assert.equal(r.similarity,continuousSkillSimilarity(c,a).similarity);}
 const nodes=buildOccupationProfiles(snapshot,skills).nodes;const before=nearestContinuousNeighbors(nodes[0],nodes).map(r=>[r.node.occupation.code,r.similarity]);const changed=nodes.map(n=>({...n,occupation:{...n.occupation,exposure:'Low' as const,growth:999}}));assert.deepEqual(nearestContinuousNeighbors(changed[0],changed).map(r=>[r.node.occupation.code,r.similarity]),before);
});
function parseCsv(text:string){const rows:string[][]=[[]];let value='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')){rows.at(-1)!.push(value.replace(/\r$/,''));value='';if(c==='\n')rows.push([]);}else value+=c;}rows.at(-1)!.push(value.replace(/\r$/,''));return rows;}
test('analytical CSV allpubliccontrol combinations agrees with projected counts and excludes private data',()=>{
 for(const category of['Low','Moderate','High','Very high']as const)for(const baseline of['overall','rest']as const)for(const threshold of[2.5,3,3.5]){
  const file=skillPatternsCsv(artifact,skills,category,baseline,threshold),[header,...rows]=parseCsv(file);assert.equal(rows.length,35);const index=(name:string)=>header.indexOf(name);
  for(const r of rows){const match=projectPatterns(artifact,skills,category,baseline,threshold).find(x=>x.skill.id===r[index('Skill ID')])!;assert.equal(Number(r[index('Selected important')]),match.counts[0]);assert.equal(Number(r[index('Baseline rated')]),match.baselineKnown);if(match.difference!==null)assert.equal(Number(r[index('Difference (pp)')]),match.difference);}
  assert(!file.includes('PRIVATE_SENTINEL'));assert(rows.every(r=>r[index('Scope')]==='all-35-skills'));
 }
 const [head,...rows]=parseCsv(skillPatternsCsv(artifact,skills,'High','rest',3,'difference',true));assert.equal(rows.length,35*27);assert.equal(new Set(rows.map(r=>r[head.indexOf('Variant')])).size,27);
 const malicious={...skills,skills:skills.skills.map((s,i)=>i===0?{...s,name:'=SUM(1,2)\n"quoted"'}:s)};assert(skillPatternsCsv(artifact,malicious,'High','rest',3).includes("'=SUM"));
});
test('deferred editorial proposal remains source-valid; live official aliases remain exact',()=>{
 const engine=new SearchEngine(snapshot,read('public/data/lexicon.json'));
 for(const entry of editorial){assert.equal(entry.classification,'editorial');assert.equal(entry.release,snapshot.release.id);for(const code of entry.candidateRoleCodes)assert(snapshot.occupations.some(o=>o.roles.some(r=>r.code===code)));assert(engine.title(entry.term,10).candidates.every(c=>!c.editorial));}
 assert.equal(engine.title('HR Business Partner',10).exact,true);assert.equal(engine.title('PA',10).state,'clarify');
});
test('public reading brief preserves nulls and broader scope without numerical exposure or private fields',()=>{
 const brief=readingBrief([{...snapshot.occupations[0],growth:null,annualOpenings:null,exposure:null}],snapshot.release);assert.match(brief,/Unavailable/);assert.match(brief,/not a job-loss probability/);assert.match(brief,/whole BLS occupation/);assert.match(brief,/FOR HR AND PEOPLE ANALYTICS/);assert(!brief.includes('PRIVATE_SENTINEL'));
});
test('authentic artifact rejects changed same-release source ratings, exposure mappings and names',async()=>{
 const changedSkills=structuredClone(skills);const rated=changedSkills.roles.find(r=>r.importance.some(v=>v!==null))!;const index=rated.importance.findIndex(v=>v!==null);rated.importance[index]=rated.importance[index]===3?4:3;
 await assert.rejects(()=>decodePatternArtifact(raw,snapshot,changedSkills),/sources/);
 const changedSnapshot=structuredClone(snapshot),a=changedSnapshot.occupations.find(o=>o.exposure==='Low')!,b=changedSnapshot.occupations.find(o=>o.exposure==='High')!;[a.exposure,b.exposure]=[b.exposure,a.exposure];await assert.rejects(()=>decodePatternArtifact(raw,changedSnapshot,skills),/sources/);
 const names=structuredClone(skills);names.skills[0].name+=' changed';await assert.rejects(()=>decodePatternArtifact(raw,snapshot,names),/sources/);await decodePatternArtifact(raw,snapshot,skills);
});
test('independent literal sensitivity boundary and unavailable fixtures, including exported flags',()=>{
 const fixture=(counts:number[][][])=>({...artifact,variants:counts.map((rows,i)=>({...artifact.variants[0],id:i?'max-3':'mean-3',rows:rows.map((counts,j)=>({category:'High' as const,skillId:skills.skills[j].id,counts:counts as [number,number,number,number],selectedEligible:100,otherEligible:100}))}))});
 for(const[baseline,counts,direction,magnitude]of[
  ['rest',[[49,51,50,50],[51,49,50,50]],false,false],['overall',[[49,51,51,49],[51,49,49,51]],false,false],['rest',[[48,52,50,50],[52,48,50,50]],true,false],['rest',[[25,75,25,75],[30,70,25,75]],false,true],['overall',[[50,50,50,50],[60,40,50,50]],false,true],['rest',[[25,75,25,75],[29,71,25,75]],false,false]
 ]as const){const s={...skills,skills:skills.skills.slice(0,1)},a=fixture(counts.map(c=>[[...c]])),r=patternSensitivity(a,s,'High',baseline).values().next().value!;assert.equal(r.directionChanges,direction);assert.equal(r.magnitudeSensitive,magnitude);const[h,row]=parseCsv(skillPatternsCsv(a,s,'High',baseline,3));assert.equal(row[h.indexOf('Direction changes')],String(direction));assert.equal(row[h.indexOf('Magnitude sensitive')],String(magnitude));}
 const s={...skills,skills:skills.skills.slice(0,6).map((x,i)=>({...x,id:`s0${i+1}`}))},a=fixture([[60,59,58,57,56,55],[60,59,58,57,56,57]].map(v=>v.map(n=>[n,100-n,50,50])));a.variants.forEach(v=>v.rows.forEach((r,i)=>r.skillId=s.skills[i].id));assert.deepEqual([...patternSensitivity(a,s,'High','rest')].filter(([,v])=>v.topFiveChanges).map(([id])=>id),['s05','s06']);
 const one={...skills,skills:skills.skills.slice(0,1)};const missing=patternSensitivity(fixture([[[0,0,20,80]],[[0,0,20,80]]]),one,'High','rest').values().next().value!;assert.equal(missing.min,null);assert.equal(missing.max,null);assert.equal(missing.unavailable,2);assert(!missing.directionChanges&&!missing.magnitudeSensitive&&!missing.topFiveChanges);
 for(const c of[[10,19,10,20],[10,20,10,19],[9,21,10,20],[10,20,9,21]])assert(sparsePattern(buildSkillExposureRow(skills.skills[0],'High',c as [number,number,number,number])));assert(!sparsePattern(buildSkillExposureRow(skills.skills[0],'High',[10,20,10,20])));
});

test('schema 2 rejects every legacy inference field even in otherwise valid directly validated artifacts',()=>{
 assert.equal(artifact.schemaVersion,2);assert.equal(artifact.method,'occupational-skill-patterns-descriptive-v2');
 assert(!Object.hasOwn(artifact,'model'));assert(!Object.hasOwn(artifact.parameters,'prior'));assert(!Object.hasOwn(artifact.parameters,'draws'));
 assert(artifact.variants.every(v=>v.rows.every(r=>!Object.hasOwn(r,'posterior'))));
 const edits:((a:any)=>void)[]=[a=>a.schemaVersion=1,a=>a.method='occupational-skill-patterns-v1',
  a=>a.model='independent-beta-binomial-v1',a=>a.model=null,a=>a.model=undefined,a=>a.parameters.prior=[1,1],a=>a.parameters.prior=null,
  a=>a.parameters.prior=undefined,a=>a.parameters.draws=20000,a=>a.parameters.draws=null,a=>a.parameters.draws=undefined,
  a=>a.variants[0].rows[0].posterior=null,a=>a.variants[0].rows[0].posterior={},a=>a.variants[0].rows[0].posterior=undefined,
  a=>a.variants[3].rows[0].posterior=null,a=>a.variants[4].rows[0].posterior={},
 ];
 // Direct validation deliberately bypasses the byte pin: semantic schema checks must still reject a repinned legacy payload.
 for(const edit of edits){const a=structuredClone(artifact);edit(a);assert.throws(()=>validatePatternArtifact(a,snapshot,skills));}
 const [header]=parseCsv(skillPatternsCsv(artifact,skills,'High','rest',3));assert(!header.includes('Model'));assert(header.includes('Method'));
});
