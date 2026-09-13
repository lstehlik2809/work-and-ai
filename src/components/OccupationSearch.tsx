import{useEffect,useRef}from'react';
import type{Candidate,Snapshot}from'../domain/types';
import type{SkillsData}from'../search/skills';
import type{useOccupationSearch}from'../state/useOccupationSearch';
import CandidateList from './CandidateList';
import config from '../semantic/config.json';
export default function OccupationSearch({search,snapshot,skills,limit,onChoose,onClose}:{search:ReturnType<typeof useOccupationSearch>;snapshot:Snapshot;skills:SkillsData|null;limit:number;onChoose:(c:Candidate)=>void;onClose:()=>void}){
 const input=useRef<HTMLTextAreaElement>(null),guidance=useRef<HTMLDivElement>(null);
 useEffect(()=>{input.current?.focus();},[]);
 useEffect(()=>{if(search.rejected)guidance.current?.focus();},[search.rejected]);
 return <div id="describe-panel" className="refine"><div className="refine-heading"><h3>Find by work description</h3><button className="text-button" onClick={onClose} aria-label="Close description panel">Close</button></div>
 <label htmlFor="responsibilities">A few specific responsibilities, in English</label><textarea ref={input} id="responsibilities" rows={3} maxLength={1000} value={search.description} onChange={e=>search.setDescription(e.target.value)} placeholder="What do you make, analyze, maintain, teach, or support?"/>
 <p className="hint">Your text stays in this browser. Describe the work's output, setting and responsibility level. Check each suggestion against its source description, especially if your job combines different kinds of work.</p>
 <div className="actions"><button className="secondary" disabled={search.busy||!search.description.trim()} onClick={()=>void search.searchMeaning()}>{search.busy?'Matching…':search.error?'Retry matching':'Find matches'}</button><button className="text-button" disabled={!search.description.trim()} onClick={search.searchResponsibilities}>Search wording only</button>{search.busy&&<button className="text-button" onClick={search.cancel}>Cancel matching</button>}</div>
 <details><summary>About description search</summary><p className="hint">Meaning search runs on your device. The model, runtime and index assets total about 140 MB. Downloads may repeat when browser caching is unavailable. Wording results are available while it loads. Keep the description below {config.maxTokens} model tokens (word pieces); the text box allows 1,000 characters. Suggestions need your confirmation and do not assess your personal fit.</p></details>
 <p role="status" className="hint">{search.status}</p>{search.error&&<p role="alert">{search.error} Wording results and your comparison remain available.</p>}
 {search.meaningSearched&&<section className="suggestions" data-method="meaning" aria-label="Meaning suggestions"><h3>Meaning suggestions</h3><p role="status">{search.meaningOutcome.candidates.length?`${Math.min(limit,search.meaningOutcome.candidates.length)} suggestions · up to ${limit}. ${search.meaningOutcome.message}`:'No close match. Describe a more specific output, work setting or responsibility level.'}</p><CandidateList candidates={search.meaningOutcome.candidates.slice(0,limit)} snapshot={snapshot} skills={skills} onChoose={onChoose}/></section>}
 {search.searched&&<details open={!search.meaningSearched||search.busy} className="wording-fallback"><summary>Wording-only suggestions</summary><section className="suggestions" data-method="wording" aria-label="Wording-only suggestions"><p role="status">{search.primary.candidates.length?`${Math.min(limit,search.primary.candidates.length)} suggestions · up to ${limit}. These match shared wording; review their source descriptions.`:'No close wording match. Add a more specific output, work setting or responsibility level.'}</p><CandidateList candidates={search.primary.candidates.slice(0,limit)} snapshot={snapshot} skills={skills} onChoose={onChoose}/></section></details>}
 {(search.searched||search.meaningSearched)&&<button className="secondary" onClick={search.reject}>None of these matches</button>}
 {search.rejected&&<div ref={guidance} tabIndex={-1} className="notice" role="status"><strong>Refine the description</strong><p>What do you produce or deliver? In what work setting? Do you lead the work, carry it out independently, or assist someone? Add those details above and search again.</p></div>}
 </div>;
}
