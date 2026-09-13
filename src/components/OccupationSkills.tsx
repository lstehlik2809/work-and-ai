import type {Role} from '../domain/types';
import type {SkillsData} from '../search/skills';
import './occupation-skills.css';
import {rolePage} from '../domain/sources';

interface Props {role?: Role; data: SkillsData | null; compact?: boolean}

export default function OccupationSkills({role, data, compact = false}: Props) {
  if (!data) return null;
  const ratings = data.roles.find(item => item.code === role?.code)?.importance;
  const known = ratings?.filter(value => value !== null).length ?? 0;
  const important = data.skills.flatMap((skill, index) => {
    const importance = ratings?.[index];
    return importance != null && importance >= 3 ? [{...skill, importance}] : [];
  }).sort((a, b) => b.importance - a.importance || a.name.localeCompare(b.name));
  const limit = compact ? 3 : 6;
  const visible = important.slice(0, limit);
  const remaining = important.slice(limit);
  const absence = known ? 'No skills meet the importance threshold of 3/5.' : 'Skill ratings unavailable for this role.';

  if (compact) return <span className="occupation-skill-preview">
    {important.length ? <><strong>Top skills:</strong> {visible.map(skill => skill.name).join(' · ')}{remaining.length > 0 && <span className="occupation-skill-more"> · +{remaining.length} more</span>}</> : absence}
  </span>;

  const list = (items: typeof important) => <ul className="occupation-skill-list">{items.map(skill => <li key={skill.id}>
    <div><strong>{skill.name}</strong><span className="occupation-skill-rating" aria-label={`Importance ${skill.importance.toFixed(2)} out of 5`}>{skill.importance.toFixed(2)}<span> / 5</span></span></div>
    <p>{skill.description}</p>
  </li>)}</ul>;

  return <section className="occupation-skills" aria-label="Occupation skills">
    <h3>Important skills{important.length > 0 && <span> · {important.length}</span>}</h3>
    {known > 0 ? <>
      <p className="hint">For {role?.title}. Ranked by O*NET importance (3–5 on a 1–5 scale), not your proficiency or a skill’s AI exposure.</p>
      {important.length ? list(visible) : <p className="hint">{absence}</p>}
      {remaining.length > 0 && <details className="occupation-skills-details"><summary>Show {remaining.length} more important skills</summary>{list(remaining)}</details>}
      <p className="source-line">{known} of {data.skills.length} skills have ratings. Missing ratings do not mean a skill is unimportant. {role&&<><a href={rolePage(role.code)}>Read the O*NET role</a> (live page may be newer) · <a href={role.source}>Pinned {data.onet} · {role.code}</a></>}.</p>
    </> : <p className="hint">{absence}</p>}
  </section>;
}
