import {useMemo, useState} from 'react';
import {familyExposureColumns} from '../domain/family-exposure';
import type {FamilyExposure, FamilyExposureRow} from '../domain/family-exposure';
import type {Occupation} from '../domain/types';
import FamilyOccupationPanel from './FamilyOccupationPanel';
import './family-exposure-heatmap.css';

interface Props {
  rows: FamilyExposureRow[];
  excludedCount: number;
  occupations: readonly Occupation[];
  onSelect: (code: string) => void;
  onDrilldown: (row: FamilyExposureRow, exposure: FamilyExposure) => void;
}

export default function FamilyExposureHeatmap({rows, excludedCount, occupations, onSelect, onDrilldown}: Props) {
  const [openFamily, setOpenFamily] = useState<{code: string; trigger: HTMLButtonElement} | null>(null);
  const [sort, setSort] = useState('share');
  const sorted = useMemo(() => sort === 'name' ? [...rows].sort((a, b) => a.name.localeCompare(b.name)) : rows, [rows, sort]);
  const columns = familyExposureColumns(rows);
  const total = rows.reduce((sum, row) => sum + row.total, 0);
  return <div className="family-heatmap">
    <p id="family-heatmap-help">Share of occupations within each job family, not employment shares. All {total} snapshot occupations count once, including {excludedCount} excluded from the skill map. Choose a family name to browse all its occupations, or a populated cell to explore its map-eligible occupations.</p>
    <div className="family-heatmap-controls">
      <label htmlFor="family-heatmap-sort">Order families
        <select id="family-heatmap-sort" value={sort} onChange={event => setSort(event.target.value)}>
          <option value="share">High + Very high share, highest first</option><option value="name">Alphabetical</option>
        </select>
      </label>
      <div className="family-heatmap-legend"><span>Darker blue = larger share within family</span><div><span>0%</span><span className="family-heatmap-ramp" aria-hidden="true"/><span>100%</span></div></div>
    </div>
    <p className="family-heatmap-scroll-hint hint">Swipe or scroll horizontally to compare all exposure categories.</p>
    <div className="family-heatmap-scroll" role="region" aria-label="Job family exposure table, scroll horizontally on small screens" tabIndex={0}>
      <table data-testid="family-exposure-heatmap" aria-describedby="family-heatmap-help family-heatmap-rounding">
        <caption>AI exposure by job family · percentage of family occupations</caption>
        <thead><tr><th scope="col">Job family · n</th>{columns.map(exposure => <th scope="col" key={exposure}>{exposure}</th>)}</tr></thead>
        <tbody>{sorted.map(row => <tr key={row.code} data-family={row.code}>
          <th scope="row"><button type="button" className="family-members-trigger" data-testid="family-members-trigger" data-family={row.code}
            aria-haspopup="dialog" aria-label={`${row.name}: browse all ${row.total} occupations`}
            onClick={event => setOpenFamily({code: row.code, trigger: event.currentTarget})}>{row.name}</button><span className="family-heatmap-total">n = {row.total}</span></th>
          {columns.map(exposure => {
            const count = row.counts[exposure], share = count / row.total * 100;
            // Black and white both exceed 4.5:1 at the 78% transition on this ramp.
            const style = {background: `color-mix(in srgb, #245877 ${share}%, #f4f8fb)`, color: share >= 78 ? '#fff' : '#000'};
            return <td key={exposure} data-exposure={exposure} data-count={count} data-total={row.total}>
              {count ? <button type="button" style={style} data-exposure={exposure} data-count={count} data-total={row.total}
                aria-label={`${row.name}, ${exposure}: ${share.toFixed(1)}%, ${count} of ${row.total} occupations. Show map-eligible occupations.`}
                onClick={() => onDrilldown(row, exposure)}><strong>{share.toFixed(1)}%</strong><small>{count} / {row.total}</small></button>
                : <span className="family-heatmap-zero" style={style} aria-label={`${exposure}: 0.0%, 0 of ${row.total} occupations`}><strong>0.0%</strong><small>0 / {row.total}</small></span>}
            </td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    <p id="family-heatmap-rounding" className="hint">Percentages use every occupation in the family as the denominator and are rounded to one decimal; rows may not sum to exactly 100%. {columns.includes('Unavailable') && 'Unavailable exposure is shown separately and remains in the denominator. '}Families follow the first two digits of the SOC code and O*NET job family names. Default order is High + Very high share, highest first; ties are alphabetical. Exposure categories describe relative exposure, not predicted job losses.</p>
    {openFamily && <FamilyOccupationPanel key={openFamily.code} familyCode={openFamily.code} trigger={openFamily.trigger} occupations={occupations} onSelect={onSelect} onClose={() => setOpenFamily(null)}/>}
  </div>;
}
