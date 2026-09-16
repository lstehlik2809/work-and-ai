import PdfDownload from './PdfDownload';
import type{Ref}from'react';
import type{Occupation,Role,Snapshot}from'../domain/types';
import type{SkillsData}from'../search/skills';
import{rolePage}from'../domain/sources';
import{ExposureContext,AiOutlookContext}from'./AiContext';
import OccupationSkills from'./OccupationSkills';
const exposureNote='This category compares occupations under the published method. It does not estimate your chance of losing a job.';
const pct=(n:number|null)=>n===null?'Unavailable':`${n>0?'+':''}${n.toFixed(1)}%`;
const openings=(n:number|null)=>n===null?'Unavailable':n.toLocaleString('en-US');
interface Props {current:Occupation;role?:Role;data:Snapshot;skillsData:SkillsData|null;resultHeading:Ref<HTMLHeadingElement>;compare:string[];clearResults:()=>void;addComparison:()=>void;download:()=>void;share:()=>void;brief:()=>void}
export default function ConfirmedOccupation({current,role,data,skillsData,resultHeading,compare,clearResults,addComparison,download,share,brief}:Props){return (
<article className="occupation" aria-labelledby="occupation-heading"><div className="section-controls"><p className="eyebrow">02 / Confirmed occupation · BLS {current.code}</p><button className="text-button no-print" onClick={clearResults}>Clear result</button></div><h2 id="occupation-heading" tabIndex={-1} ref={resultHeading}>{current.title}</h2>{role?.broader&&<p className="scope-note">Selected role: <strong>{role.title}</strong>. These figures cover the broader BLS occupation, <strong>{current.title}</strong>, and were not measured separately for the specialty.</p>}
 <div className="metrics"><section><h3>AI exposure</h3><p className="stat">{current.exposure||'Data unavailable'}</p><p className="metric-label">{current.exposure?'Published relative exposure category':'AI exposure data unavailable'}</p><p>{exposureNote}</p><ExposureContext category={current.exposure}/><p className="source-line">BLS exposure categories · {data.release.bls}</p></section><section><h3>Employment outlook</h3><p className="stat">{pct(current.growth)}</p><p className="metric-label">Projected employment change, {current.startYear}–{current.endYear}</p><p>Overall employment projections reflect many factors. This change is not an estimate of AI’s effect.</p>{current.annualOpenings!==null&&<p className="openings"><strong>{openings(current.annualOpenings)}</strong> annual average openings, {current.startYear}–{current.endYear}. Openings include replacement needs as well as growth; they are not all new jobs.</p>}</section></div>
 <div className="actions no-print"><button className="secondary" onClick={addComparison} disabled={compare.includes(current.code)}>{compare.includes(current.code)?'In comparison':'Add to comparison'}</button><button className="text-button" onClick={download}>Download CSV</button><button className="text-button" onClick={brief}>Download reading brief</button><PdfDownload occupations={[current]} release={data.release} role={role}/><button className="text-button" onClick={share}>Share public link</button></div>
 <p className="hint no-print">{compare.length ? `CSV and public link use your comparison (${compare.length} ${compare.length === 1 ? 'occupation' : 'occupations'}). The reading brief and PDF use the occupation shown above.` : 'Downloads and the public link use the occupation shown above.'} Shared links retain BLS occupations, not the selected O*NET specialty.</p>
  <AiOutlookContext snapshot={data} code={current.code}/>
<details className="result-details"><summary>Role description, skills and source evidence</summary>{role&&<><p className="description">{role.description}</p><p className="source-line">Description: <a href={rolePage(role.code)}>O*NET® {role.code} — {role.title}</a>, {data.release.onet}.</p>{role.broader&&<p className="scope-note">The role description is for <strong>{role.title}</strong>. The published figures cover the broader BLS occupation, <strong>{current.title}</strong>. They were not measured separately for this specialist role.</p>}</>}
 <OccupationSkills key={role?.code||current.code} role={role} data={skillsData}/></details>

 </article>
);}
