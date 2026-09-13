import Fuse from 'fuse.js';
import type { Alias, Candidate, Lexicon, SearchOutcome, SemanticEvidence, Snapshot } from '../domain/types';
export const normalize=(text:string)=>text.toLowerCase().normalize('NFKC').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const inflect=(text:string)=>normalize(text).split(' ').map(t=>t.length>4&&t.endsWith('s')?t.slice(0,-1):t).join(' ');
const stop=new Set('a an the and or to of in on at for from with by as i my we our you your it is are be am have do work working duties tasks job use using handle help people problems solve projects emails meetings attend answer'.split(' '));
export const terms=(text:string)=>normalize(text).split(' ').filter(t=>t.length>2&&!stop.has(t)).map(t=>t.length>4&&t.endsWith('s')?t.slice(0,-1):t);
const broad=new Set(['engineer','specialist','manager','analyst','assistant','technician','consultant','associate','employee','worker','professional','pa']);
const resultLimit=(value:number)=>Math.max(1,Math.min(10,Math.trunc(Number.isFinite(value)?value:5)));
const none=():SearchOutcome=>({state:'none',candidates:[],message:'No close match found. Try a more specific title or a different term.',exact:false});
const clarify=(exact=false):SearchOutcome=>({state:'clarify',candidates:[],message:'Please add a field, specialty, or a few specific responsibilities. This term can describe different occupations.',exact});
const outcome=(candidates:Candidate[],exact=false):SearchOutcome=>candidates.length?{state:'candidates',candidates,message:candidates.length>1?'These occupations may fit. Confirm the one that describes your work.':'Confirm whether this occupation describes your work.',exact}:none();
interface TextRow { code:string; text:string; source:string; roleCode:string; counts:Map<string,number>; size:number }
export class SearchEngine {
 readonly exact=new Map<string,Alias[]>(); private inflections=new Map<string,Alias[]>(); readonly rows:TextRow[]=[]; readonly idf=new Map<string,number>();
 private fuse:Fuse<{title:string;aliases:Alias[]}>; private avg=0;
 private canonicalTitles:{alias:Alias;tokens:string[]}[]; private aliasTitles:{alias:Alias;tokens:string[]}[];
 constructor(readonly snapshot:Snapshot,readonly lexicon:Lexicon){
  this.canonicalTitles=snapshot.occupations.flatMap(o=>[{title:o.title,code:o.code,onetCode:null},...o.roles.map(r=>({title:r.title,code:o.code,onetCode:r.code}))].map(alias=>({alias,tokens:inflect(alias.title).split(' ')})));
  this.aliasTitles=lexicon.aliases.map(alias=>({alias,tokens:inflect(alias.title).split(' ')}));
  for(const a of lexicon.aliases){const key=normalize(a.title);const list=this.exact.get(key)||[];list.push(a);this.exact.set(key,list);}
  for(const a of lexicon.aliases){const key=inflect(a.title);const list=this.inflections.get(key)||[];list.push(a);this.inflections.set(key,list);}
  this.fuse=new Fuse([...this.exact].map(([title,aliases])=>({title,aliases})),{keys:['title'],includeScore:true,threshold:.28,ignoreLocation:true,minMatchCharLength:3});
  for(const o of snapshot.occupations){const roles=[...new Map(o.roles.map(r=>[r.code,r])).values()].sort((a,b)=>a.code.localeCompare(b.code));const role=roles[0];const text=[o.title,...new Set(roles.map(r=>[r.title,r.description,...[...new Set(r.tasks.map(t=>t.text))].sort()].join(' ')))].join(' ');const ts=terms(text),counts=new Map<string,number>();for(const t of ts)counts.set(t,(counts.get(t)||0)+1);this.rows.push({code:o.code,text,source:role?.source||o.source,roleCode:role?.code||'',counts,size:ts.length});}
  this.avg=this.rows.reduce((n,r)=>n+r.size,0)/this.rows.length;
  const df=new Map<string,number>();for(const row of this.rows)for(const key of row.counts.keys())df.set(key,(df.get(key)||0)+1);
  for(const [key,n]of df)this.idf.set(key,Math.log(1+(this.rows.length-n+.5)/(n+.5)));
 }
 private candidate(a:Alias):Candidate {const o=this.snapshot.occupations.find(o=>o.code===a.code)!;const r=o.roles.find(r=>r.code===a.onetCode)||o.roles[0];return{code:o.code,roleCode:r?.code,excerpt:r?.description,excerptKind:r?'description':undefined,source:r?.source||o.source,reason:a.title};}
 title(query:string,maxResults?:number):SearchOutcome{
  const limit=maxResults===undefined?3:resultLimit(maxResults),ambiguityLimit=maxResults===undefined?3:10;
  const key=normalize(query);if(!key)return none();
  if(maxResults!==undefined&&broad.has(key))return clarify(this.exact.has(key));
  const aliases=this.exact.get(key);if(aliases){const unique=[...new Map(aliases.map(a=>[a.code,a])).values()];if(unique.length>ambiguityLimit)return clarify(true);return outcome(unique.slice(0,limit).map(a=>this.candidate(a)),true);}
  if(key.length<3||broad.has(key))return clarify();
  const inflected=this.inflections.get(inflect(key));if(inflected){const unique=[...new Map(inflected.map(a=>[a.code,a])).values()];return unique.length>ambiguityLimit?clarify():outcome(unique.slice(0,limit).map(a=>this.candidate(a)));}
  if(terms(key).length===0)return clarify();
  if(key.split(' ').length>7)return this.lexical(query,maxResults);
  // Literal title tokens are completion, not spelling correction. Prefer published
  // occupation titles before the wider alternate-title vocabulary.
  const queryTokens=inflect(key).split(' ');
  for(const titles of [this.canonicalTitles,this.aliasTitles]){
   const matched=titles.filter(({tokens})=>queryTokens.every((token,i)=>tokens.includes(token)||(queryTokens.length>1&&i===queryTokens.length-1&&token.length>=3&&tokens.some(t=>t.startsWith(token)))));
   const unique=[...new Map(matched.map(({alias})=>[alias.code,alias])).values()];
   if(unique.length)return unique.length>ambiguityLimit?clarify():outcome(unique.slice(0,limit).map(a=>this.candidate(a)));
  }
  const found=this.fuse.search(key,{limit:12});if(!found.length)return none();
  const best=found[0].score??1;if(best>.24)return none();
  const candidates=new Map<string,Candidate>();
  for(const hit of found){if((hit.score??1)>Math.min(.24,best+.055))continue;
   // A fuzzy spelling correction must not add or remove a defining role level.
   const distinctions=['assistant','technician','manager','nurse','engineer'];
   if(distinctions.some(t=>terms(key).includes(t)!==terms(hit.item.title).includes(t)))continue;
   for(const a of hit.item.aliases)candidates.set(a.code,this.candidate(a));
  }
  if(candidates.size>ambiguityLimit)return clarify();return outcome([...candidates.values()].slice(0,limit));
 }
 bm25(query:string){const q=[...new Set(terms(query))];return this.rows.map(row=>{let score=0,support=0;for(const term of q){const tf=row.counts.get(term)||0,idf=this.idf.get(term)||0;if(tf){score+=idf*(tf*2.4)/(tf+1.4*(.25+.75*row.size/this.avg));if(idf>1.4)support++;}}return{code:row.code,score,support,coverage:support/Math.max(1,q.length),row};}).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code));}
 lexical(query:string,maxResults?:number):SearchOutcome{
  if(terms(query).length<2)return clarify();
  const ranked=this.bm25(query),qualified=ranked.filter(r=>r.support>=2&&r.coverage>=.4);
  if(!qualified.length)return none();const best=qualified[0].score;
  return outcome(qualified.filter(r=>r.score>=best*.82).slice(0,maxResults===undefined?3:resultLimit(maxResults)).map(r=>this.evidenceCandidate(r.code,query)));
 }
 private evidenceCandidate(code:string,query:string,weighted=false):Candidate{
  const o=this.snapshot.occupations.find(o=>o.code===code)!;
  const q=weighted?[...new Set(terms(query))]:terms(query);
  const options=o.roles.flatMap(r=>[{code:r.code,text:r.description,source:r.source,kind:'description' as const,taskId:undefined as string|undefined},...r.tasks.map(t=>({code:r.code,text:t.text,source:t.source,kind:'task' as const,taskId:t.id}))]);
  const overlap=(text:string)=>{const ts=new Set(terms(text));return q.reduce((score,t)=>score+(ts.has(t)?weighted?this.idf.get(t)||0:1:0),0);};
  // Select the specialty using its full source profile and title before choosing
  // an excerpt. A single task shared with another specialty must not rename it.
  const roleScores=new Map(o.roles.map(r=>[r.code,weighted?overlap(r.title)+overlap([r.description,...r.tasks.map(t=>t.text)].join(' ')):0]));
  options.sort((a,b)=>(roleScores.get(b.code)||0)-(roleScores.get(a.code)||0)||overlap(b.text)-overlap(a.text)||a.code.localeCompare(b.code)||a.kind.localeCompare(b.kind)||a.text.localeCompare(b.text)||a.source.localeCompare(b.source)||(a.taskId||'').localeCompare(b.taskId||''));
  const r=options[0];return{code,roleCode:r?.code,excerpt:r?.text,excerptKind:r?.kind,taskId:r?.taskId,source:r?.source||o.source};
 }
 private hasSupportedRoleLevel(candidate:Candidate,lead:Candidate,query:string):boolean{
  const supportingTitle=(c:Candidate)=>this.snapshot.occupations.find(o=>o.code===c.code)!.roles.find(r=>r.code===c.roleCode)?.title||'';
  const supported=new Set(inflect(`${query} ${supportingTitle(lead)}`).split(' '));
  const titleTokens=new Set(inflect(supportingTitle(candidate)).split(' '));
  return !['assistant','technician','manager','supervisor','director','chief','head'].some(t=>titleTokens.has(t)&&!supported.has(t));
 }
 hybrid(title:string,description:string,evidence:SemanticEvidence[],maxResults?:number):SearchOutcome{
  const limit=maxResults===undefined?3:resultLimit(maxResults);
  const exact=this.title(title,maxResults);if(exact.exact)return exact;
  // Keep a supported title spelling/inflection match when re-running that title.
  // A distinct responsibilities query remains free to propose another candidate.
  if(normalize(title)===normalize(description)&&exact.state==='candidates')return exact;
  const q=description||title;if(terms(q).length<2)return clarify();
  evidence=[...new Map([...evidence].sort((a,b)=>a.score-b.score||a.code.localeCompare(b.code)).map(r=>[r.code,r])).values()].sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code));
  const lexical=this.bm25(q),lexmap=new Map(lexical.map(r=>[r.code,r]));
  // Start with the original grounded shortlist for every query. A longer input
  // alone is not evidence that the strongest semantic neighbor is a better job.
  const fused=new Map<string,number>();for(const list of [lexical,evidence])list.slice(0,50).forEach((r,i)=>fused.set(r.code,(fused.get(r.code)||0)+1/(60+i+1)));
  const strict=evidence.filter(r=>{const l=lexmap.get(r.code);return r.score>=.38&&l&&l.support>=2&&l.coverage>=.35;});
  strict.sort((a,b)=>(fused.get(b.code)||0)-(fused.get(a.code)||0)||b.score-a.score||a.code.localeCompare(b.code));
  const originalLead=strict[0];
  const original=originalLead?strict.filter(r=>r.score>=originalLead.score-.055&&lexmap.get(r.code)!.score>=lexmap.get(originalLead.code)!.score*.82).slice(0,limit):[];
  const requiredSupport=Math.max(2,Math.ceil(new Set(terms(q)).size*.35));
  if(requiredSupport>4){
   const qualified=evidence.filter(r=>r.score>=.38&&(lexmap.get(r.code)?.support||0)>=4);
   const semanticLead=qualified[0];
   // With no strict result and weak semantic evidence throughout, a top lexical
   // result can recover a facet diluted in the whole-description embedding.
   // Require top-five semantic corroboration and retain the role-level guard.
   let corroboratedFallback:SemanticEvidence|undefined;
   if(!originalLead&&semanticLead&&semanticLead.score<.55&&evidence[0].score<.55){
    const lexicalLead=lexical[0],lexicalEvidence=lexicalLead&&evidence.slice(0,5).find(r=>r.code===lexicalLead.code);
    if(lexicalLead&&lexicalLead.support>=4&&lexicalEvidence&&lexicalEvidence.score>=.35&&
     this.hasSupportedRoleLevel(this.evidenceCandidate(lexicalLead.code,q,true),this.evidenceCandidate(semanticLead.code,q,true),q))corroboratedFallback=lexicalEvidence;
   }
   const override=originalLead&&semanticLead&&semanticLead.code!==originalLead.code&&semanticLead.score>=.55&&semanticLead.score-originalLead.score>=.10&&lexmap.get(originalLead.code)!.coverage<.50;
   const lead=override?semanticLead:originalLead||corroboratedFallback||semanticLead;
   if(!lead)return none();
   const separated=semanticLead?.code===lead.code&&semanticLead.score-(qualified[1]?.score??0)>=.10;
   if(originalLead&&!override&&!separated)return outcome(original.map(r=>this.evidenceCandidate(r.code,q,true)));
   const lexicalTop=new Set(lexical.slice(0,10).map(r=>r.code)),semanticTop=new Set(evidence.slice(0,10).map(r=>r.code));
   // A secondary occupation needs independent lexical and semantic support;
   // it need not sit in a narrow absolute cosine window around the leader.
   // A secondary facet can have fewer literal anchors than the primary job.
   // Three overlaps require *stronger* semantic evidence than the grounded lead,
   // as well as agreement between both top-ten retrieval lists.
   const leadCandidate=this.evidenceCandidate(lead.code,q,true);
   const candidates=new Map<string,Candidate>();
   const alternatives=evidence.filter(r=>{
    const support=lexmap.get(r.code)?.support||0;
    if(!(r.code!==lead.code&&r.score>=.38&&lexicalTop.has(r.code)&&semanticTop.has(r.code)&&
     (support>=4&&r.score>=lead.score*.75||support>=3&&r.score>=lead.score)))return false;
    const candidate=this.evidenceCandidate(r.code,q,true);
    // Expansion must not invent a role level, even when its tasks overlap.
    if(!this.hasSupportedRoleLevel(candidate,leadCandidate,q))return false;
    candidates.set(r.code,candidate);return true;
   });
   // Prefer an alternative whose defining description supports the query,
   // rather than incidental tasks accumulated in a large canonical document.
   // Normalize for profile length before applying the requested result limit.
   const queryTerms=new Set(terms(q));
   const coreSupport=(code:string)=>Math.max(0,...this.snapshot.occupations.find(o=>o.code===code)!.roles.map(role=>{
    const ts=[...new Set(terms(`${role.title} ${role.description}`))];
    const overlap=ts.reduce((n,t)=>n+(queryTerms.has(t)?this.idf.get(t)||0:0),0);
    const norm=Math.hypot(...ts.map(t=>this.idf.get(t)||0));
    return norm?overlap/norm:0;
   }));
   const coreScores=new Map(alternatives.map(r=>[r.code,coreSupport(r.code)]));
   alternatives.sort((a,b)=>Number(b.score>=lead.score)-Number(a.score>=lead.score)||coreScores.get(b.code)!-coreScores.get(a.code)!||b.score-a.score||a.code.localeCompare(b.code));
   return outcome([leadCandidate,...alternatives.slice(0,maxResults===undefined?1:limit-1).map(r=>candidates.get(r.code)!)]);
  }
  return outcome(original.map(r=>this.evidenceCandidate(r.code,q)));
 }
}
