import {useMemo, useState} from 'react';
import type {Exposure, Snapshot} from '../domain/types';
import type {SkillsData} from '../search/skills';
import {EXPOSURE_LEVELS} from '../domain/occupation-map';
import {buildSkillExposureAnalysis, rankSkillPatterns} from '../domain/skill-exposure';
import type {SkillExposureRow} from '../domain/skill-exposure';
import './skill-patterns.css';

const percent = (value: number | null) => value === null ? 'Unavailable' : `${(value * 100).toFixed(1)}%`;
const ratioLabel = (value: number | null) => value === null ? 'Undefined' : value === Infinity ? '∞' : `${value.toFixed(2)}×`;
const pLabel = (value: number | null) => value === null ? 'Unavailable' : value === 0 ? '< 1e−300' : value < 0.001 ? value.toExponential(2) : value.toFixed(3);
const directionLabel = {more: 'More common', less: 'Less common', equal: 'Equal prevalence', unavailable: 'Insufficient data'};

function Prevalence({value, count, known, group}: {value: number | null; count: number; known: number; group: string}) {
  return <div className={`pattern-prevalence ${group}`}><strong>{percent(value)}</strong><span>{count} / {known} occupations</span>
    <div className="pattern-track" aria-hidden="true"><i style={{width: `${(value ?? 0) * 100}%`}}/></div></div>;
}

function TestDetails({row}: {row: SkillExposureRow}) {
  return <details className="pattern-evidence"><summary aria-label={`Statistical details for ${row.skill.name}`}>adj. p {pLabel(row.adjustedP)}</summary>
    <p>{row.test.method}{row.test.method === 'Pearson chi-square' ? ' · 1 df · no Yates correction' : row.test.method === 'Fisher exact' ? ' · two-sided' : ''}.</p>
    <p>Raw p: {pLabel(row.test.p)}{row.test.statistic !== null && <> · χ²: {row.test.statistic.toFixed(3)}</>}.</p>
    <p>Observed counts [important, below 3]: selected [{row.counts[0]}, {row.counts[1]}]; other [{row.counts[2]}, {row.counts[3]}].</p>
    {row.test.expected && <p>Expected counts in the same order: {row.test.expected.map(value => value.toFixed(2)).join(', ')}.</p>}
    {row.test.method === 'No variation' && <p>Every rated occupation has the same important/below-threshold status; p = 1 is a neutral convention.</p>}
    <p>Exploratory reference diagnostic; see method and limitations below.</p>
  </details>;
}

export default function SkillPatterns({snapshot, skills}: {snapshot: Snapshot; skills: SkillsData}) {
  const analysis = useMemo(() => buildSkillExposureAnalysis(snapshot, skills), [snapshot, skills]);
  const [category, setCategory] = useState<Exposure>('Very high');
  const [query, setQuery] = useState('');
  const ranked = useMemo(() => rankSkillPatterns(analysis.rows.filter(row => row.category === category)), [analysis, category]);
  const rows = ranked.filter(row => `${row.skill.name} ${row.skill.description} ${row.skill.group}`.toLowerCase().includes(query.trim().toLowerCase()));
  const selectedCount = analysis.categoryCounts[category];
  const top = ranked.find(row => row.direction === 'more');
  const least = [...ranked].reverse().find(row => row.direction === 'less');
  return <section className="skill-patterns" aria-labelledby="patterns-heading">
    <div className="patterns-intro"><div><p className="eyebrow">Skills across occupations</p><h1 id="patterns-heading">Where skills stand out.</h1>
      <p className="lead">Which skills are more or less often important in occupations with <strong>{category.toLowerCase()} AI exposure</strong>?</p></div>
      <div className="patterns-category"><label htmlFor="patterns-category">AI exposure category</label><select id="patterns-category" value={category} onChange={event => setCategory(event.target.value as Exposure)}>{EXPOSURE_LEVELS.map(level => <option key={level}>{level}</option>)}</select><p>Compared with all three other known categories combined.</p></div></div>
    <p className="patterns-definition"><strong>Important = mean O*NET importance ≥ 3 / 5.</strong> Each BLS occupation counts once. Percentages use only occupations with an available rating for that skill, so denominators vary.</p>
    <div className="patterns-highlights" aria-live="polite">
      <div className="pattern-highlight coverage"><span className="eyebrow">Comparison coverage</span><strong>{selectedCount} <span>vs</span> {analysis.eligibleOccupations - selectedCount}</strong><p>{category} vs other occupations with at least one skill rating.</p></div>
      <div className="pattern-highlight more"><span className="eyebrow">Highest prevalence ratio</span><strong>{top ? ratioLabel(top.ratio) : '—'}</strong><p>{top ? <>{top.skill.name}<small>{top.counts[0]} / {top.selectedKnown} vs {top.counts[2]} / {top.otherKnown} occupations</small>{top.ratio === Infinity && <small>Other prevalence is zero</small>}</> : 'No skill is more common in this category.'}</p></div>
      <div className="pattern-highlight less"><span className="eyebrow">Lowest prevalence ratio</span><strong>{least ? ratioLabel(least.ratio) : '—'}</strong><p>{least ? <>{least.skill.name}<small>{least.counts[0]} / {least.selectedKnown} vs {least.counts[2]} / {least.otherKnown} occupations</small></> : 'No skill is less common in this category.'}</p></div>
    </div>
    <p className="hint patterns-caution">Large ratios can come from very few occupations. Read the counts and percentage-point difference alongside the ratio. These are patterns in occupational requirements, not the AI exposure of a skill or a person.</p>
    <div className="patterns-toolbar"><div><h2>Important skills, in context</h2><p id="patterns-order">Ranked by selected ÷ other prevalence, highest first. Above 1× = more common; below 1× = less common.</p></div><div><label htmlFor="patterns-search">Filter skills</label><input id="patterns-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, group or definition"/></div></div>
    <p className="hint" role="status">Showing {rows.length} of {ranked.length} skills · {category} exposure</p>
    <div className="patterns-table-scroll" tabIndex={0} role="region" aria-label="Skill patterns table; scroll horizontally on small screens">
      <table className="patterns-table" aria-describedby="patterns-order"><caption>Important-skill prevalence: {category} exposure vs all other known categories</caption>
        <thead><tr><th scope="col">Skill</th><th scope="col" aria-sort="descending">Prevalence ratio</th><th scope="col">{category}<small>Important / rated</small></th><th scope="col">Other categories<small>Important / rated</small></th><th scope="col">Difference<small>Percentage points</small></th><th scope="col">Exploratory evidence<small>BH-adjusted p</small></th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.skill.id} data-skill-id={row.skill.id} data-direction={row.direction}>
          <th scope="row"><span className="pattern-skill-name">{row.skill.name}</span><span className="pattern-group">{row.skill.group}</span><details className="pattern-definition"><summary>Skill definition</summary><p>{row.skill.description}</p></details></th>
          <td><strong className={`pattern-ratio ${row.direction}`}>{ratioLabel(row.ratio)}</strong><span className={`pattern-direction ${row.direction}`}>{directionLabel[row.direction]}</span>{row.ratio === Infinity && <small>Other prevalence is zero</small>}{row.ratio === null && <small>{row.selectedKnown && row.otherKnown ? 'Zero prevalence in both groups' : 'A group has no ratings'}</small>}</td>
          <td><Prevalence value={row.selectedPrevalence} count={row.counts[0]} known={row.selectedKnown} group="selected"/></td>
          <td><Prevalence value={row.otherPrevalence} count={row.counts[2]} known={row.otherKnown} group="other"/></td>
          <td className="pattern-difference">{row.difference === null ? 'Unavailable' : `${row.difference > 0 ? '+' : ''}${row.difference.toFixed(1)} pp`}</td>
          <td><TestDetails row={row}/></td>
        </tr>)}</tbody>
      </table>
      {!rows.length && <p className="patterns-empty">No skills match this filter. Try a broader term or clear the search.</p>}
    </div>
    <details className="patterns-method"><summary>How to read this analysis · method, coverage and limitations</summary><div>
      <h3>One observation per BLS occupation</h3><p>We average available importance ratings across each occupation’s unique mapped O*NET roles, then mark means ≥ 3 as important. An average describes the mapped roles together; individual specialties may differ. Missing, suppressed and not-relevant ratings remain missing, never zero or “not important.” Occupations with observed ratings below 3 stay in the denominator.</p>
      <p>Of {analysis.totalOccupations} source occupations, {analysis.eligibleOccupations} have known exposure and at least one skill rating. Excluded: {analysis.unknownExposure} with unknown exposure, plus {analysis.noRatings} with known exposure but no ratings. Each row further excludes occupations missing that particular skill. Counts are unweighted by employment and are not counts of workers.</p>
      <h3>Effect size comes first</h3><p>The ratio divides important-skill prevalence in the selected category by prevalence in all other known categories combined. The difference subtracts the two percentages. A ratio of 2× means twice the prevalence, not twice the AI exposure. Positive selected prevalence divided by zero is ∞; zero in both groups gives an undefined ratio. With no rated occupations in either group, that comparison is unavailable. No pseudocounts are added.</p>
      <h3>Exploratory statistical reference</h3><p>Each 2×2 table crosses selected/other category with important/below 3. We use a two-sided association test: Pearson chi-square (1 degree of freedom, no Yates correction) when all expected counts are at least 5; otherwise two-sided Fisher exact, summing fixed-margin tables no more probable than the observed table. Constant important-skill status receives neutral p = 1. Empty groups have no test.</p>
      <p>Benjamini–Hochberg adjustment covers all {skills.skills.length} skills × 4 categories = {analysis.comparisons} comparisons, including unavailable tests as p = 1 internally. Selecting a category or filtering skills never changes this family. Small adjusted p-values indicate departures from the independence reference model, not practical importance.</p>
      <p>This snapshot is an occupational census with incomplete skill coverage, not a random independent sample. Related occupations, shared O*NET mappings, correlated skills and overlapping category comparisons violate or complicate sampling and independence assumptions. The p-values and BH adjustment are exploratory diagnostics; they do not establish population significance, guaranteed false-discovery control, causation or individual job risk. Coverage bias and the importance threshold can change the patterns.</p>
      <p>Sources: <a href="https://www.onetcenter.org/dictionary/31.0/excel/essential_skills.html">O*NET essential skills</a> · <a href="https://www.onetcenter.org/dictionary/31.0/excel/transferable_skills.html">O*NET transferable skills</a>. Statistical definitions: <a href="https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.chi2_contingency.html">Pearson chi-square</a> · <a href="https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.fisher_exact.html">Fisher exact</a> · <a href="https://www.statsmodels.org/stable/generated/statsmodels.stats.multitest.multipletests.html">Benjamini–Hochberg adjustment</a>.</p>
    </div></details>
  </section>;
}
