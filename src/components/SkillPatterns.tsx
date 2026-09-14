import {useEffect, useMemo, useState} from 'react';
import type {Exposure, Snapshot} from '../domain/types';
import type {SkillsData} from '../search/skills';
import {EXPOSURE_LEVELS, IMPORTANT_SKILL_THRESHOLD} from '../domain/occupation-map';
import {projectPatterns,sortPatterns} from '../domain/skill-pattern-data';
import type{PatternArtifact}from'../domain/skill-pattern-data';
import{loadPatternArtifact}from'../domain/skill-pattern-loader';
import{skillPatternsCsv}from'../export/skill-patterns';
import{downloadText}from'../export/brief';
import type {SkillBaseline, SkillExposureRow} from '../domain/skill-exposure';
import './skill-patterns.css';

const percent = (value: number | null) => value === null ? 'Unavailable' : `${(value * 100).toFixed(1)}%`;
const ratioLabel = (value: number | null) => value === null ? 'Undefined' : value === Infinity ? '∞' : `${value.toFixed(2)}×`;
const pp = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)} pp`;
const directionLabel = {more: 'More common', less: 'Less common', equal: 'Equal prevalence', unavailable: 'Insufficient data'};

type SortColumn = 'skill' | 'ratio' | 'selectedPrevalence' | 'baselinePrevalence' | 'difference';
type SortDirection = 'ascending' | 'descending';
const sortValue = (row: SkillExposureRow, column: SortColumn) => column === 'skill' ? row.skill.name
  : column === 'difference' ? row.difference === null ? null : Math.abs(row.difference) : row[column];

function Prevalence({value, count, known, eligible, group}: {value: number | null; count: number; known: number; eligible:number; group: string}) {
  return <div className={`pattern-prevalence ${group}`}><strong>{percent(value)}</strong><span>{count} / {known} important / rated</span><span>{known} / {eligible} rated / eligible</span>
    <div className="pattern-track" aria-hidden="true"><i style={{width: `${(value ?? 0) * 100}%`}}/></div></div>;
}

export default function SkillPatterns({snapshot,skills}:{snapshot:Snapshot;skills:SkillsData}){
 const [artifact,setArtifact]=useState<PatternArtifact|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setArtifact(null);setError('');loadPatternArtifact(snapshot,skills).then(value=>{if(active)setArtifact(value);}).catch(()=>{if(active)setError('The verified skill analysis could not load. Search and comparison remain available.');});return()=>{active=false;};},[snapshot,skills,attempt]);
 if(error)return <div role="alert"><p>{error}</p><button className="secondary" onClick={()=>setAttempt(n=>n+1)}>Retry skill analysis</button></div>;
 if(!artifact)return <p role="status">Loading and checking the skill analysis…</p>;
 return <PatternTable snapshot={snapshot} skills={skills} artifact={artifact}/>;
}
function PatternTable({snapshot,skills,artifact}:{snapshot:Snapshot;skills:SkillsData;artifact:PatternArtifact}){
 const threshold=IMPORTANT_SKILL_THRESHOLD;
 const variant=artifact.variants.find(v=>v.id===`mean-${threshold}`)!;
 const analysis={totalOccupations:artifact.total,eligibleOccupations:variant.eligible,unknownExposure:artifact.unknownExposure,noRatings:artifact.noRatings,categoryCounts:variant.categoryCounts};
  const [category, setCategory] = useState<Exposure>('Very high');
  const [baseline, setBaseline] = useState<SkillBaseline>('overall');
  const baselineLabel = baseline === 'overall' ? 'Overall' : 'Rest';
  const baselineDescription = baseline === 'overall' ? 'all eligible occupations (including selected)' : 'all three other known categories combined';
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{column: SortColumn; direction: SortDirection}>({column: 'difference', direction: 'descending'});
  const ranked=useMemo(()=>sortPatterns(projectPatterns(artifact,skills,category,baseline,threshold)),[artifact,skills,category,baseline,threshold]);
  const rows = useMemo(() => ranked.filter(row => `${row.skill.name} ${row.skill.description} ${row.skill.group}`.toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => {
    const left = sortValue(a, sort.column), right = sortValue(b, sort.column);
    if (left === right) return a.skill.id < b.skill.id ? -1 : a.skill.id > b.skill.id ? 1 : 0;
    if (left === null) return 1;
    if (right === null) return -1;
    const comparison = typeof left === 'string' && typeof right === 'string'
      ? left.localeCompare(right, 'en', {sensitivity: 'base'}) : left < right ? -1 : 1;
    return sort.direction === 'ascending' ? comparison : -comparison;
  }), [ranked, query, sort]);
  const columns: {key: SortColumn; label: string; detail?: string}[] = [
    {key: 'skill', label: 'Skill'},
    {key: 'ratio', label: 'Prevalence ratio'},
    {key: 'selectedPrevalence', label: category, detail: 'Important / rated'},
    {key: 'baselinePrevalence', label: baselineLabel, detail: 'Important / rated'},
    {key: 'difference', label: 'Observed difference', detail: 'Absolute size · percentage points'},
  ];
  const sortLabel = columns.find(column => column.key === sort.column)!.label;
  const orderLabel = sort.column === 'skill' ? (sort.direction === 'ascending' ? 'A–Z' : 'Z–A')
    : sort.direction === 'ascending' ? 'lowest first' : 'highest first';
  const selectedCount = analysis.categoryCounts[category];
  const top = ranked.find(row => row.direction === 'more');
  const least = ranked.find(row => row.direction === 'less');
  return <section className="skill-patterns" aria-labelledby="patterns-heading">
    <div className="patterns-intro"><div><p className="eyebrow">Skills across occupations</p><h1 id="patterns-heading">Occupational skill profiles.</h1>
      <p className="lead">Skill profiles of occupations grouped by estimated AI exposure. Explore which skills are more or less often important in occupations with <strong>{category.toLowerCase()} AI exposure</strong>.</p></div>
      <div className="patterns-category"><label htmlFor="patterns-category">AI exposure category</label><select id="patterns-category" value={category} onChange={event => setCategory(event.target.value as Exposure)}>{EXPOSURE_LEVELS.map(level => <option key={level}>{level}</option>)}</select><label htmlFor="patterns-baseline">Comparison baseline</label><select id="patterns-baseline" value={baseline} onChange={event => setBaseline(event.target.value as SkillBaseline)}><option value="overall">Overall (includes selected)</option><option value="rest">Rest (other categories)</option></select><p>Compared with {baselineDescription}.</p></div></div>
    <p className="hint patterns-caution">These patterns describe skill requirements across AI-exposure groups. Because the exposure measures themselves use related occupational abilities, tasks and work activities, some associations may reflect how exposure was constructed. They do not independently measure the AI exposure of individual skills.</p>
    <p className="patterns-definition"><strong>Important = mean O*NET importance ≥ {threshold} / 5.</strong> Each BLS occupation counts once. Percentages use only occupations with an available rating for that skill, so denominators vary.</p>
    <div className="patterns-highlights" aria-live="polite">
      <div className="pattern-highlight coverage"><span className="eyebrow">Comparison coverage</span><strong>{selectedCount} <span>vs</span> {baseline === 'overall' ? analysis.eligibleOccupations : analysis.eligibleOccupations - selectedCount}</strong><p>{category} vs {baselineDescription}, eligible occupations. {artifact.noRatings} source occupations have no skill ratings.</p></div>
      <div className="pattern-highlight more"><span className="eyebrow">Largest positive difference</span><strong>{top ? pp(top.difference!) : '—'}</strong><p>{top ? <>{top.skill.name}<small>{top.counts[0]} / {top.selectedKnown} vs {top.baselineImportant} / {top.baselineKnown} occupations</small>{top.ratio === Infinity && <small>{baselineLabel} prevalence is zero</small>}</> : 'No skill is more common in this category.'}</p></div>
      <div className="pattern-highlight less"><span className="eyebrow">Largest negative difference</span><strong>{least ? pp(least.difference!) : '—'}</strong><p>{least ? <>{least.skill.name}<small>{least.counts[0]} / {least.selectedKnown} vs {least.baselineImportant} / {least.baselineKnown} occupations</small></> : 'No skill is less common in this category.'}</p></div>
    </div>
    <p className="hint patterns-caution">Large ratios can come from very few occupations. Read the counts and percentage-point difference alongside the ratio. These are patterns in occupational requirements, not the AI exposure of a skill or a person.</p>
    <div className="patterns-toolbar"><div><h2>Important skills, in context</h2><p id="patterns-order">The default ranks absolute percentage-point differences. Select a column header to sort; select it again to reverse the order. Unavailable or undefined values appear last. Prevalence ratio = selected ÷ {baselineLabel.toLowerCase()} prevalence. Above 1× = more common; below 1× = less common.</p></div><div><label htmlFor="patterns-search">Filter skills</label><input id="patterns-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, group or definition"/></div></div>
    <p className="hint" role="status">Showing {rows.length} of {ranked.length} skills · {category} exposure · {baselineLabel} baseline · Sorted by {sortLabel}, {orderLabel}</p>
    <p className="hint">Downloads contain all 35 skills for the selected category and baseline at the fixed importance threshold of 3 / 5, regardless of your private text filter. They use the default absolute-difference ordering.</p>
    <div className="actions"><button className="secondary" onClick={()=>downloadText(skillPatternsCsv(artifact,skills,category,baseline,threshold),'work-and-ai-skill-patterns.csv','text/csv;charset=utf-8')}>Download all 35 skills</button></div>
    <p className="hint patterns-table-context">{category} exposure vs {baselineDescription} · importance ≥ {threshold} / 5. Each row shows important / rated and rated / eligible occupations. Scroll within the table to see more skills and compare columns; column headings and skill names stay visible.</p>
    <div className="patterns-table-scroll" tabIndex={0} role="region" aria-label="Skill patterns table; scroll vertically for more skills and horizontally for more columns">
      <table className="patterns-table" aria-describedby="patterns-order"><caption>Important-skill prevalence: {category} exposure vs {baselineDescription}</caption>
        <thead><tr>{columns.map(column => {
          const active = sort.column === column.key;
          const nextDirection = active && sort.direction === 'descending' ? 'ascending'
            : active ? 'descending' : column.key === 'skill' ? 'ascending' : 'descending';
          const nextOrder = column.key === 'skill' ? (nextDirection === 'ascending' ? 'A to Z' : 'Z to A') : nextDirection;
          return <th key={column.key} scope="col" aria-sort={active ? sort.direction : undefined}>
            <button type="button" className="pattern-sort" aria-label={`${column.label}: sort ${nextOrder}`}
              onClick={() => setSort({column: column.key, direction: nextDirection})}>
              <span>{column.label}{column.detail && <small>{column.detail}</small>}</span>
              <span className="pattern-sort-arrow" aria-hidden="true">{active ? sort.direction === 'ascending' ? '↑' : '↓' : '↕'}</span>
            </button>
          </th>;
        })}</tr></thead>
        <tbody>{rows.map(row => <tr key={row.skill.id} data-skill-id={row.skill.id} data-direction={row.direction}>
          <th scope="row"><span className="pattern-skill-name">{row.skill.name}</span><span className="pattern-group">{row.skill.group}</span><details className="pattern-definition"><summary>Skill definition</summary><p>{row.skill.description}</p></details></th>
          <td><strong className={`pattern-ratio ${row.direction}`}>{ratioLabel(row.ratio)}</strong><span className={`pattern-direction ${row.direction}`}>{directionLabel[row.direction]}</span>{row.ratio === Infinity && <small>{baselineLabel} prevalence is zero</small>}{row.ratio === null && <small>{row.selectedKnown && row.baselineKnown ? 'Zero prevalence in both groups' : 'A group has no ratings'}</small>}</td>
          <td><Prevalence value={row.selectedPrevalence} count={row.counts[0]} known={row.selectedKnown} eligible={row.selectedEligible} group="selected"/></td>
          <td><Prevalence value={row.baselinePrevalence} count={row.baselineImportant} known={row.baselineKnown} eligible={row.baselineEligible} group="other"/></td>
          <td className="pattern-difference">{row.difference === null ? 'Unavailable' : `${row.difference > 0 ? '+' : ''}${row.difference.toFixed(1)} pp`}</td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <p className="patterns-empty">No skills match this filter. Try a broader term or clear the search.</p>}
    </div>
    <details className="patterns-method"><summary>How to read this analysis · method, coverage and limitations</summary><div>
      <h3>Relationship to the exposure measures</h3><p>The <a href="https://www.bls.gov/emp/publications/ai-exposure-categories.htm">BLS exposure categories</a> combine five measures based on O*NET abilities, tasks and work activities, including observed AI interactions mapped to tasks or activities. These inputs differ from the 35 O*NET skill-importance ratings compared here, but describe related aspects of occupational work. The analysis adds a descriptive comparison of skill profiles; it does not independently validate the exposure categories or establish that a skill causes or protects against AI exposure.</p>
      <h3>One observation per BLS occupation</h3><p>We average available importance ratings across each occupation’s unique mapped O*NET roles, then mark means ≥ 3 / 5 as important. An average describes the mapped roles together; individual specialties may differ. Missing, suppressed and not-relevant ratings remain missing, never zero or “not important.” Occupations with observed ratings below 3 / 5 stay in the denominator.</p>
      <p>Of {analysis.totalOccupations} source occupations, {analysis.eligibleOccupations} have known exposure and are eligible. {analysis.noRatings} have no skill ratings; {analysis.unknownExposure} have unknown exposure and are excluded. Each row excludes occupations missing that particular skill. Counts are unweighted by employment and are not counts of workers.</p>
      <h3>Effect size comes first</h3><p>The ratio divides important-skill prevalence in the selected category by the active baseline: overall includes every eligible occupation, including selected; rest includes only the other known categories. Each skill uses its own rated occupations, weighted equally. The difference subtracts the two percentages. A ratio of 2× means twice the prevalence, not twice the AI exposure. Positive selected prevalence divided by zero is ∞; zero in both groups gives an undefined ratio. If selected or the active baseline has no rated occupations, the observed comparison is unavailable. When rest is empty, selected and overall still have equal observed rates. No pseudocounts are added to these observed effects.</p>
      <h3>Additional analysis</h3><p>Robustness checks compare alternative importance thresholds, ways of combining specialties, and occupation coverage. They help show how much the observed patterns depend on these choices; they are available in the sensitivity download.</p>
      <button className="text-button" onClick={()=>downloadText(skillPatternsCsv(artifact,skills,category,baseline,threshold,'difference',true),'work-and-ai-sensitivity.csv','text/csv;charset=utf-8')}>Download sensitivity comparisons</button>
      <h3>Coverage and limitations</h3><p>These are fixed descriptive counts from an occupational census with incomplete coverage. Related occupations, shared role mappings and correlated skills can produce similar patterns. Missing ratings and aggregation choices can affect the comparison. Observed differences do not establish causation, predict future outcomes or measure individual job risk.</p>
      <p>See the <a href="https://github.com/lstehlik2809/work-and-ai/blob/main/METHODOLOGY.md#skill-patterns-by-ai-exposure-category">full methodology</a> for descriptive calculations, coverage and robustness definitions.</p>
      <p>Sources: <a href="https://www.onetcenter.org/dictionary/31.0/excel/essential_skills.html">O*NET essential skills</a> · <a href="https://www.onetcenter.org/dictionary/31.0/excel/transferable_skills.html">O*NET transferable skills</a>.</p>
    </div></details>
  </section>;
}
