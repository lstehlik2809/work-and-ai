import Fuse from 'fuse.js';
import type { Alias, Candidate, Lexicon, SearchOutcome, SemanticEvidence, Snapshot } from '../domain/types';
export const normalize=(text:string)=>text.toLowerCase().normalize('NFKC').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const inflect=(text:string)=>normalize(text).split(' ').map(t=>t.length>4&&t.endsWith('s')?t.slice(0,-1):t).join(' ');
const stop=new Set('a an the and or to of in on at for from with by as i my we our you your it is are be am have do work working duties tasks job use using handle help people problems solve projects emails meetings'.split(' '));
export const terms=(text:string)=>normalize(text).split(' ').filter(t=>t.length>2&&!stop.has(t)).map(t=>t.length>4&&t.endsWith('s')?t.slice(0,-1):t);
const broad=new Set(['engineer','specialist','manager','analyst','assistant','technician','consultant','associate','employee','worker','professional','pa']);
const none=():SearchOutcome=>({state:'none',candidates:[],message:'No close match found. Try a more specific title or a different term.',exact:false});
const clarify=(exact=false):SearchOutcome=>({state:'clarify',candidates:[],message:'Please add a field, specialty, or a few specific responsibilities. This term can describe different occupations.',exact});
const outcome=(candidates:Candidate[],exact=false):SearchOutcome=>candidates.length?{state:'candidates',candidates,message:candidates.length>1?'These occupations may fit. Confirm the one that describes your work.':'Confirm whether this occupation describes your work.',exact}:none();
interface TextRow { code:string; text:string; source:string; roleCode:string; counts:Map<string,number>; size:number }
export class SearchEngine {
 readonly exact=new Map<string,Alias[]>(); private inflections=new Map<string,Alias[]>(); readonly rows:TextRow[]=[]; readonly idf=new Map<string,number>();
 private fuse:Fuse<{title:string;aliases:Alias[]}>; private avg=0;
 constructor(readonly snapshot:Snapshot,readonly lexicon:Lexicon){
  for(const a of lexicon.aliases){const key=normalize(a.title);const list=this.exact.get(key)||[];list.push(a);this.exact.set(key,list);}
  for(const a of lexicon.aliases){const key=inflect(a.title);const list=this.inflections.get(key)||[];list.push(a);this.inflections.set(key,list);}
  this.fuse=new Fuse([...this.exact].map(([title,aliases])=>({title,aliases})),{keys:['title'],includeScore:true,threshold:.28,ignoreLocation:true,minMatchCharLength:3});
  for(const o of snapshot.occupations){const roles=[...new Map(o.roles.map(r=>[r.code,r])).values()].sort((a,b)=>a.code.localeCompare(b.code));const role=roles[0];const text=[o.title,...new Set(roles.map(r=>[r.title,r.description,...[...new Set(r.tasks.map(t=>t.text))].sort()].join(' ')))].join(' ');const ts=terms(text),counts=new Map<string,number>();for(const t of ts)counts.set(t,(counts.get(t)||0)+1);this.rows.push({code:o.code,text,source:role?.source||o.source,roleCode:role?.code||'',counts,size:ts.length});}
  this.avg=this.rows.reduce((n,r)=>n+r.size,0)/this.rows.length;
  const df=new Map<string,number>();for(const row of this.rows)for(const key of row.counts.keys())df.set(key,(df.get(key)||0)+1);
  for(const [key,n]of df)this.idf.set(key,Math.log(1+(this.rows.length-n+.5)/(n+.5)));
 }
 private candidate(a:Alias):Candidate {const o=this.snapshot.occupations.find(o=>o.code===a.code)!;const r=o.roles.find(r=>r.code===a.onetCode)||o.roles[0];return{code:o.code,roleCode:r?.code,excerpt:r?.description,excerptKind:r?'description':undefined,source:r?.source||o.source,reason:a.title};}
 title(query:string):SearchOutcome{
  const key=normalize(query);if(!key)return none();
  const aliases=this.exact.get(key);if(aliases){const unique=[...new Map(aliases.map(a=>[a.code,a])).values()];if(unique.length>3)return clarify(true);return outcome(unique.map(a=>this.candidate(a)),true);}
  if(key.length<3||broad.has(key))return clarify();
  const inflected=this.inflections.get(inflect(key));if(inflected){const unique=[...new Map(inflected.map(a=>[a.code,a])).values()];return unique.length>3?clarify():outcome(unique.map(a=>this.candidate(a)));}
  if(terms(key).length===0)return clarify();
  if(key.split(' ').length>7)return this.lexical(query);
  const found=this.fuse.search(key,{limit:12});if(!found.length)return none();
  const best=found[0].score??1;if(best>.24)return none();
  const candidates=new Map<string,Candidate>();
  for(const hit of found){if((hit.score??1)>Math.min(.24,best+.055))continue;
   // A fuzzy spelling correction must not add or remove a defining role level.
   const distinctions=['assistant','technician','manager','nurse','engineer'];
   if(distinctions.some(t=>terms(key).includes(t)!==terms(hit.item.title).includes(t)))continue;
   for(const a of hit.item.aliases)candidates.set(a.code,this.candidate(a));
  }
  if(candidates.size>3)return clarify();return outcome([...candidates.values()]);
 }
 bm25(query:string){const q=[...new Set(terms(query))];return this.rows.map(row=>{let score=0,support=0;for(const term of q){const tf=row.counts.get(term)||0,idf=this.idf.get(term)||0;if(tf){score+=idf*(tf*2.4)/(tf+1.4*(.25+.75*row.size/this.avg));if(idf>1.4)support++;}}return{code:row.code,score,support,coverage:support/Math.max(1,q.length),row};}).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code));}
 lexical(query:string):SearchOutcome{
  if(terms(query).length<2)return clarify();
  const ranked=this.bm25(query),qualified=ranked.filter(r=>r.support>=2&&r.coverage>=.4);
  if(!qualified.length)return none();const best=qualified[0].score;
  return outcome(qualified.filter(r=>r.score>=best*.82).slice(0,3).map(r=>this.evidenceCandidate(r.code,query)));
 }
 private evidenceCandidate(code:string,query:string):Candidate{const o=this.snapshot.occupations.find(o=>o.code===code)!;const q=terms(query);const options=o.roles.flatMap(r=>[{code:r.code,text:r.description,source:r.source,kind:'description' as const,taskId:undefined as string|undefined},...r.tasks.map(t=>({code:r.code,text:t.text,source:t.source,kind:'task' as const,taskId:t.id}))]);options.sort((a,b)=>q.filter(t=>terms(b.text).includes(t)).length-q.filter(t=>terms(a.text).includes(t)).length);const r=options[0];return{code,roleCode:r?.code,excerpt:r?.text,excerptKind:r?.kind,taskId:r?.taskId,source:r?.source||o.source};}
 hybrid(title:string,description:string,evidence:SemanticEvidence[]):SearchOutcome{
  const exact=this.title(title);if(exact.exact)return exact;
  // Keep a supported title spelling/inflection match when re-running that title.
  // A distinct responsibilities query remains free to propose another candidate.
  if(normalize(title)===normalize(description)&&exact.state==='candidates')return exact;
  const q=description||title;if(terms(q).length<2)return clarify();
  evidence=[...new Map([...evidence].sort((a,b)=>a.score-b.score||a.code.localeCompare(b.code)).map(r=>[r.code,r])).values()].sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code));
  const lexical=this.bm25(q),lexmap=new Map(lexical.map(r=>[r.code,r]));
  const fused=new Map<string,number>();for(const list of [lexical,evidence])list.slice(0,50).forEach((r,i)=>fused.set(r.code,(fused.get(r.code)||0)+1/(60+i+1)));
  // Development-set policy; cosine is evidence, not a match probability.
  const qualified=evidence.filter(r=>{const l=lexmap.get(r.code);return r.score>=.38&&l&&l.support>=2&&l.coverage>=.35;});
  qualified.sort((a,b)=>(fused.get(b.code)||0)-(fused.get(a.code)||0)||b.score-a.score);
  if(!qualified.length)return none();const lead=qualified[0];
  return outcome(qualified.filter(r=>r.score>=lead.score-.055&&lexmap.get(r.code)!.score>=lexmap.get(lead.code)!.score*.82).slice(0,3).map(r=>this.evidenceCandidate(r.code,q)));
 }
}
