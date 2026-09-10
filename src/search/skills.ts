import type {SearchOutcome,Snapshot} from '../domain/types';
export interface Skill {id:string;name:string;description:string;group:string}
export interface SkillsData {schemaVersion:number;release:string;onet:string;skills:Skill[];roles:{code:string;importance:(number|null)[]}[];coverage:{ratedRoles:number;mappedRoles:number;missingRoles:string[];unavailableRatings:number}}
export function validateSkills(value:unknown,release:string):SkillsData{
 const d=value as SkillsData;
 if(!d||d.schemaVersion!==1||d.release!==release||!Array.isArray(d.skills)||d.skills.length!==35||!Array.isArray(d.roles)||!d.roles.length||!d.coverage||!Number.isInteger(d.coverage.ratedRoles)||!Number.isInteger(d.coverage.mappedRoles)||!Array.isArray(d.coverage.missingRoles))throw Error('Invalid skills reference');
 if(d.skills.some(s=>!s||typeof s.id!=='string'||typeof s.name!=='string'||typeof s.description!=='string'||typeof s.group!=='string')||new Set(d.skills.map(s=>s.id)).size!==35||new Set(d.roles.map(r=>r.code)).size!==d.roles.length||d.roles.some(r=>typeof r.code!=='string'||!Array.isArray(r.importance)||r.importance.length!==35||r.importance.some(v=>v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<1||v>5))))throw Error('Invalid skills ratings');
 return d;
}
export class SkillsEngine {
 private weights:number[];
 constructor(private data:SkillsData,private snapshot:Snapshot){
  // Importance >=3 means Important on O*NET's 1–5 scale. Common skills
  // receive less differentiating weight, without becoming irrelevant.
  this.weights=data.skills.map((_,i)=>{const known=data.roles.map(r=>r.importance[i]).filter((v):v is number=>v!==null);return 1+Math.log((known.length+1)/(known.filter(v=>v>=3).length+1));});
 }
 search(selected:string[],limit=5):SearchOutcome{
  const indices=[...new Set(selected)].map(id=>this.data.skills.findIndex(s=>s.id===id)).filter(i=>i>=0).sort((a,b)=>a-b);
  const empty:SearchOutcome={state:'none',candidates:[],message:'Select one or more skills to explore occupations.',exact:false};if(!indices.length)return empty;
  const denominator=indices.reduce((sum,i)=>sum+this.weights[i],0);
  const ranked=this.data.roles.map(role=>{const evidence=indices.filter(i=>role.importance[i]!==null&&role.importance[i]!>=3);const score=indices.reduce((sum,i)=>sum+(role.importance[i]===null?0:(role.importance[i]!-1)/4*this.weights[i]),0)/denominator;return {role,evidence,score};}).filter(r=>r.evidence.length>0).sort((a,b)=>b.score-a.score||a.role.code.localeCompare(b.role.code));
  const candidates:SearchOutcome['candidates']=[],seen=new Set<string>();
  for(const item of ranked){for(const occupation of this.snapshot.occupations){const role=occupation.roles.find(r=>r.code===item.role.code);if(!role||seen.has(occupation.code))continue;seen.add(occupation.code);const labels=item.evidence.sort((a,b)=>this.weights[b]*(item.role.importance[b]!-1)-this.weights[a]*(item.role.importance[a]!-1)||a-b).map(i=>`${this.data.skills[i].name} (${item.role.importance[i]!.toFixed(2)}/5)`);const unknown=indices.filter(i=>item.role.importance[i]===null).length;candidates.push({code:occupation.code,roleCode:role.code,excerpt:role.description,excerptKind:'description',source:role.source,reason:`O*NET importance: ${labels.join('; ')}.${unknown?` ${unknown} selected skill rating${unknown===1?' is':'s are'} unavailable.`:''}`});}}
  const cap=Number.isFinite(limit)?Math.max(1,Math.min(10,Math.floor(limit))):5;
  return {state:candidates.length?'candidates':'none',candidates:candidates.slice(0,cap),message:candidates.length?'Ranked by published skill importance and how much the selected skills distinguish occupations. These are suggestions, not a measure of your ability or a probability of fit.':'No rated occupations have a selected skill at importance 3 or above. Try another combination.',exact:false};
 }
}
