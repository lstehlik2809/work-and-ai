import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {KeyboardEvent, PointerEvent} from 'react';
import type {Exposure, Snapshot} from '../domain/types';
import type {SkillsData} from '../search/skills';
import {buildOccupationProfiles, EXPOSURE_COLOR, EXPOSURE_LEVELS, EXPOSURE_RADIUS, nearestSkillNeighbors} from '../domain/occupation-map';
import type {MapOccupation, OccupationMapData} from '../domain/occupation-map';
import {applyUmapProjection, loadUmapProjection} from '../domain/occupation-map-projection';
import umapPin from '../domain/occupation-map-umap-pin.json';
import './occupation-map.css';

interface Props {snapshot: Snapshot; skills: SkillsData; onSelect: (code: string) => void}
const WIDTH = 720, HEIGHT = 660;
const EXPOSURE_CHOICES = [...EXPOSURE_LEVELS, 'Unavailable'] as const;
type ExposureChoice = typeof EXPOSURE_CHOICES[number];
const point = (node: MapOccupation) => ({x: 60 + node.displayX * 600, y: 30 + node.displayY * 600});
const exposureOrder = (exposure: Exposure | null) => exposure === null ? -1 : EXPOSURE_LEVELS.indexOf(exposure);
const categoryColor = (exposure: Exposure | null) => exposure === null ? '#62665f' : EXPOSURE_COLOR[exposure];
function clampView(x: number, y: number, zoom: number) {
  return {x: Math.max(0, Math.min(WIDTH - WIDTH / zoom, x)), y: Math.max(0, Math.min(HEIGHT - HEIGHT / zoom, y)), zoom};
}
function frameNodes(nodes: MapOccupation[]) {
  const positions = nodes.map(point);
  const left = Math.min(...positions.map(p => p.x)), right = Math.max(...positions.map(p => p.x));
  const top = Math.min(...positions.map(p => p.y)), bottom = Math.max(...positions.map(p => p.y));
  // Padding leaves nearby occupations visible; a single result uses 2.5×.
  const zoom = Math.max(1, Math.min(2.5, WIDTH / (right - left + 140), HEIGHT / (bottom - top + 140)));
  return clampView((left + right) / 2 - WIDTH / zoom / 2, (top + bottom) / 2 - HEIGHT / zoom / 2, zoom);
}

export default function OccupationMap({snapshot, skills, onSelect}: Props) {
  const reference = useMemo(() => buildOccupationProfiles(snapshot, skills), [snapshot, skills]);
  const [load, setLoad] = useState<{status: 'loading' | 'error'} | {status: 'ready'; model: OccupationMapData; basis: typeof reference}>({status: 'loading'});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoad({status: 'loading'});
    loadUmapProjection(snapshot, skills, reference, controller.signal, umapPin.sha256).then(data => {
      if (!controller.signal.aborted) setLoad({status: 'ready', model: applyUmapProjection(reference, data), basis: reference});
    }).catch(() => {
      if (!controller.signal.aborted) setLoad({status: 'error'});
    });
    return () => controller.abort();
  }, [snapshot, skills, reference, attempt]);
  if (load.status !== 'ready' || load.basis !== reference) return <section className="occupation-map-section">
    <h2>Occupation map</h2>
    {load.status === 'error' ? <p role="status">The UMAP layout could not be loaded or validated. <button type="button" className="text-button" onClick={() => setAttempt(value => value + 1)}>Retry UMAP layout</button></p>
      : <p role="status">Loading UMAP layout…</p>}
  </section>;
  return <OccupationMapView snapshot={snapshot} skills={skills} onSelect={onSelect} model={load.model}/>;
}

function OccupationMapView({snapshot, skills, onSelect, model}: Props & {model: OccupationMapData}) {
  const [query, setQuery] = useState('');
  // An empty subset represents All; custom selections are kept in legend order.
  const [exposures, setExposures] = useState<ExposureChoice[]>([]);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [view, setView] = useState({x: 0, y: 0, zoom: 1});
  const nodeRefs = useRef(new Map<string, SVGCircleElement>());
  const svgRef = useRef<SVGSVGElement>(null);
  const selectionRef = useRef<HTMLDivElement>(null);
  const searchFocusTimer = useRef<number | null>(null);
  const gestureBeganOnNode = useRef(false);
  const lastNodeClick = useRef<{time: number; x: number; y: number} | null>(null);
  const drag = useRef<{x: number; y: number; originX: number; originY: number} | null>(null);
  const cancelSearchFocus = useCallback(() => {
    if (searchFocusTimer.current !== null) window.clearTimeout(searchFocusTimer.current);
    searchFocusTimer.current = null;
  }, []);
  const term = query.trim().toLowerCase();
  const exposureScope = exposures.length ? ` within ${exposures.join(' + ')} exposure` : '';
  const visible = useMemo(() => model.nodes.filter(node => !exposures.length || exposures.includes(node.occupation.exposure ?? 'Unavailable')), [model, exposures]);
  const visibleCodes = useMemo(() => new Set(visible.map(node => node.occupation.code)), [visible]);
  const matches = useMemo(() => term ? visible.filter(node => `${node.occupation.title} ${node.occupation.code}`.toLowerCase().includes(term)) : [], [visible, term]);
  const matchCodes = useMemo(() => new Set(matches.map(node => node.occupation.code)), [matches]);
  const listed = useMemo(() => [...(term ? matches : visible)].sort((a, b) => exposureOrder(b.occupation.exposure) - exposureOrder(a.occupation.exposure)
    || a.occupation.title.localeCompare(b.occupation.title) || a.occupation.code.localeCompare(b.occupation.code)), [visible, matches, term]);
  const drawn = useMemo(() => [...visible].sort((a, b) => Number(matchCodes.has(a.occupation.code)) - Number(matchCodes.has(b.occupation.code))), [visible, matchCodes]);
  const selected = model.nodes.find(node => node.occupation.code === selectedCode) ?? null;
  const neighbors = useMemo(() => selected ? nearestSkillNeighbors(selected, model.nodes) : [], [selected, model]);
  const neighborCodes = new Set(neighbors.map(match => match.node.occupation.code));
  const selectedVisible = !!selected && visibleCodes.has(selected.occupation.code);
  const anchorCode = selectedVisible ? selectedCode : visible[0]?.occupation.code;
  useEffect(() => {
    cancelSearchFocus();
    if (matches.length) searchFocusTimer.current = window.setTimeout(() => {
      searchFocusTimer.current = null;
      setView(frameNodes(matches));
    }, 200);
    return cancelSearchFocus;
    // Selection events frame themselves; search and filters schedule framing.
  }, [matches, model, cancelSearchFocus]);
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    function wheel(event: WheelEvent) {
      // Ctrl+wheel belongs to browser zoom. A native nonpassive listener is
      // necessary to prevent document scrolling during ordinary map zoom.
      if (event.ctrlKey) return;
      event.preventDefault();
      cancelSearchFocus();
      const transform = svg!.getScreenCTM();
      if (!transform || !event.deltaY) return;
      const cursor = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
      const bounds = svg!.viewBox.baseVal;
      const fractionX = (cursor.x - bounds.x) / bounds.width, fractionY = (cursor.y - bounds.y) / bounds.height;
      const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? svg!.clientHeight : 1);
      const factor = Math.exp(-Math.max(-1000, Math.min(1000, pixels)) * 0.0015);
      setView(previous => {
        const zoom = Math.max(1, Math.min(4, previous.zoom * factor));
        const anchorX = previous.x + fractionX * WIDTH / previous.zoom, anchorY = previous.y + fractionY * HEIGHT / previous.zoom;
        return clampView(anchorX - fractionX * WIDTH / zoom, anchorY - fractionY * HEIGHT / zoom, zoom);
      });
    }
    svg.addEventListener('wheel', wheel, {passive: false});
    return () => svg.removeEventListener('wheel', wheel);
  }, [cancelSearchFocus]);
  function clearSelection() {
    cancelSearchFocus();
    setSelectedCode(null);
    svgRef.current?.focus({preventScroll: true});
  }
  function choose(node: MapOccupation, reveal = false) {
    cancelSearchFocus();
    setSelectedCode(node.occupation.code);
    if (reveal && !visibleCodes.has(node.occupation.code)) {setQuery(''); setExposures([]);}
    setView(frameNodes([node]));
  }
  function toggleExposure(category: ExposureChoice) {
    setExposures(previous => {
      const next = previous.includes(category) ? previous.filter(value => value !== category) : [...previous, category];
      return next.length === EXPOSURE_CHOICES.length ? [] : EXPOSURE_CHOICES.filter(value => next.includes(value));
    });
  }
  function zoomBy(factor: number) {
    cancelSearchFocus();
    setView(previous => {
      const zoom = Math.max(1, Math.min(4, previous.zoom * factor));
      const center = {x: previous.x + WIDTH / previous.zoom / 2, y: previous.y + HEIGHT / previous.zoom / 2};
      return clampView(center.x - WIDTH / zoom / 2, center.y - HEIGHT / zoom / 2, zoom);
    });
  }
  function panBy(dx: number, dy: number) {
    cancelSearchFocus();
    setView(previous => clampView(previous.x + dx / previous.zoom, previous.y + dy / previous.zoom, previous.zoom));
  }
  function resetView() {
    cancelSearchFocus();
    setView({x: 0, y: 0, zoom: 1});
  }
  function keyboardMap(event: KeyboardEvent<SVGSVGElement>) {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape') {event.preventDefault(); clearSelection();}
    else if (event.key === '+' || event.key === '=') {event.preventDefault(); zoomBy(1.5);}
    else if (event.key === '-' || event.key === '−') {event.preventDefault(); zoomBy(1 / 1.5);}
  }
  function keyboardNode(event: KeyboardEvent<SVGCircleElement>, node: MapOccupation) {
    if (event.key === 'Enter' || event.key === ' ') {event.preventDefault(); choose(node); return;}
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = visible.indexOf(node);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1
      : (index + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + visible.length) % visible.length;
    const next = visible[nextIndex];
    choose(next);
    nodeRefs.current.get(next.occupation.code)?.focus();
  }
  function startDrag(event: PointerEvent<SVGSVGElement>) {
    if ((event.target as Element).closest('[data-testid="map-node"]') || view.zoom === 1) return;
    cancelSearchFocus();
    drag.current = {x: event.clientX, y: event.clientY, originX: view.x, originY: view.y};
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveDrag(event: PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    const scale = Math.min(event.currentTarget.clientWidth / WIDTH, event.currentTarget.clientHeight / HEIGHT) * view.zoom;
    setView(clampView(drag.current.originX - (event.clientX - drag.current.x) / scale, drag.current.originY - (event.clientY - drag.current.y) / scale, view.zoom));
  }
  return <section className="occupation-map-section" aria-labelledby="occupation-map-heading">
    <div className="map-heading">
      <p className="eyebrow">The wider picture</p>
      <h2 id="occupation-map-heading">Where does AI exposure concentrate?</h2>
      <p>Explore occupations by the important skills they share. Larger circles mark higher <strong>relative AI exposure</strong>, not predicted job losses.</p>
    </div>
    <div className="map-summary">
      <div><strong>{model.fullCounts['Very high']} <span>/ {model.total}</span></strong><span>occupations in the highest exposure category</span></div>
      <div><strong>{model.nodes.length} <span>/ {model.total}</span></strong><span>occupations with skill evidence on this map</span></div>
    </div>
    <div className="map-legend" aria-label="AI exposure size legend">
      {[...EXPOSURE_LEVELS, 'Unavailable' as const].map(level => <span key={level}>
        <svg width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r={level === 'Unavailable' ? 4.5 : EXPOSURE_RADIUS[level]} fill={level === 'Unavailable' ? 'none' : EXPOSURE_COLOR[level]} stroke={level === 'Unavailable' ? '#62665f' : EXPOSURE_COLOR[level]} strokeDasharray={level === 'Unavailable' ? '2 2' : undefined}/></svg>{level}
      </span>)}
    </div>
    <p className="map-caution">Sizes are four ordered categories, not a numeric scale. Each occupation counts once; this is not weighted by employment. Nearby points have approximately similar skill profiles; directions have no standalone meaning.</p>
    <div className="map-filters">
      <div><label htmlFor="map-search">Find on map</label><input id="map-search" type="search" value={query} placeholder="Occupation title or code" onChange={event => setQuery(event.target.value)}/></div>
      <fieldset className="map-exposure-options"><legend>AI exposure</legend><div>
        <button type="button" className="map-exposure-toggle" aria-pressed={!exposures.length} onClick={() => setExposures(previous => previous.length ? [] : previous)}>All</button>
        {EXPOSURE_CHOICES.map(category => <button key={category} type="button" className="map-exposure-toggle" aria-pressed={exposures.includes(category)} onClick={() => toggleExposure(category)}>{category}</button>)}
        <span className="map-exposure-hint">Select any combination.</span>
      </div></fieldset>
    </div>
    <p className="map-visible-count" role="status">Showing {visible.length} of {model.nodes.length} mapped occupations. {term && <><strong>{matches.length} highlighted {matches.length === 1 ? 'match' : 'matches'}{exposureScope}.</strong> Other occupations remain on the map. </>}{model.excludedCodes.length} of {model.total} have no skill evidence and are excluded.</p>
    <div className="map-layout">
      <div className="map-chart-column">
        <div className="map-toolbar" aria-label="Map view controls">
          <button type="button" className="secondary" onClick={resetView}>Reset view</button>
          <button type="button" className="secondary" disabled={!selected} onClick={clearSelection}>Clear selection</button>
          <span>{Math.round(view.zoom * 100)}%</span>
          {view.zoom > 1 && <div className="map-pan-controls">
            <button type="button" className="secondary" aria-label="Pan left" onClick={() => panBy(-100, 0)}>←</button>
            <button type="button" className="secondary" aria-label="Pan right" onClick={() => panBy(100, 0)}>→</button>
            <button type="button" className="secondary" aria-label="Pan up" onClick={() => panBy(0, -100)}>↑</button>
            <button type="button" className="secondary" aria-label="Pan down" onClick={() => panBy(0, 100)}>↓</button>
          </div>}
        </div>

        <p className="map-selection-caption" data-testid="map-selection-caption" aria-live="polite">{selected ? <><strong>{selected.occupation.title}</strong><span>{selected.occupation.exposure ?? 'Unavailable'} AI exposure · {selected.occupation.code}{selectedVisible ? '' : ' · outside current filters'}</span><button type="button" className="text-button" onClick={() => {selectionRef.current?.focus({preventScroll: true}); selectionRef.current?.scrollIntoView({block: 'start'});}}>Jump to skill details</button></> : 'Select a circle to identify an occupation and see its skill matches below.'}</p>
        <div className="map-canvas-wrap">
          <svg ref={svgRef} data-testid="occupation-map" data-projection="umap" className="map-canvas" style={{touchAction: view.zoom > 1 ? 'none' : 'pan-y'}} viewBox={`${view.x} ${view.y} ${WIDTH / view.zoom} ${HEIGHT / view.zoom}`} role="group" tabIndex={0} aria-label="Occupations positioned by shared important skills" aria-describedby="map-instructions map-edge-explanation" onKeyDown={keyboardMap}
            onClickCapture={event => {
              const recent = lastNodeClick.current;
              const continuesNodeGesture = event.detail > 1 && recent && event.timeStamp - recent.time < 600 && Math.hypot(event.clientX - recent.x, event.clientY - recent.y) < 6;
              // Auto-framing can put another node under the second click.
              // Keep the first selection before any new node handler runs.
              if (continuesNodeGesture) {event.stopPropagation(); event.preventDefault(); return;}
              const onNode = !!(event.target as Element).closest('[data-testid="map-node"]');
              if (event.detail === 1) gestureBeganOnNode.current = onNode;
              if (onNode) lastNodeClick.current = {time: event.timeStamp, x: event.clientX, y: event.clientY};
            }}
            onDoubleClick={event => {
              const recent = lastNodeClick.current;
              const movedFromNode = recent && event.timeStamp - recent.time < 600 && Math.hypot(event.clientX - recent.x, event.clientY - recent.y) < 6;
              // The first click may recenter a node before the second arrives.
              if (!(event.target as Element).closest('[data-testid="map-node"]') && !gestureBeganOnNode.current && !movedFromNode) clearSelection();
              gestureBeganOnNode.current = false;
            }} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => {drag.current = null;}} onPointerCancel={() => {drag.current = null;}}>
            <title>Occupation skill map</title>
            <desc>One circle per occupation with skill evidence. Circle size and color show relative AI exposure. Use the searchable list as an alternative to the map.</desc>
            {selectedVisible && selected && neighbors.filter(match => visibleCodes.has(match.node.occupation.code)).map(match => <line key={match.node.occupation.code} className="map-connection" x1={point(selected).x} y1={point(selected).y} x2={point(match.node).x} y2={point(match.node).y} strokeWidth={1.5 / view.zoom} aria-hidden="true"/>)}
            {drawn.map(node => {
              const occupation = node.occupation, p = point(node), active = selectedCode === occupation.code;
              return <circle key={occupation.code} ref={element => {if (element) nodeRefs.current.set(occupation.code, element); else nodeRefs.current.delete(occupation.code);}}
                data-testid="map-node" data-code={occupation.code} data-x={p.x} data-y={p.y} data-exposure={occupation.exposure ?? 'Unavailable'} data-search-match={matchCodes.has(occupation.code)}
                cx={p.x} cy={p.y} r={(occupation.exposure === null ? 4.5 : EXPOSURE_RADIUS[occupation.exposure]) / Math.sqrt(view.zoom)}
                fill={occupation.exposure === null ? '#fffefa' : categoryColor(occupation.exposure)} stroke={active ? '#172f40' : categoryColor(occupation.exposure)}
                strokeWidth={(active ? 3 : neighborCodes.has(occupation.code) ? 1.8 : 0.7) / Math.sqrt(view.zoom)} strokeDasharray={occupation.exposure === null ? '2 2' : undefined}
                className={`map-node${active ? ' is-selected' : ''}${term && !matchCodes.has(occupation.code) ? ' is-search-context' : ''}`} role="button" tabIndex={anchorCode === occupation.code ? 0 : -1}
                aria-label={`${occupation.title}, ${occupation.code}, ${occupation.exposure ?? 'unavailable'} AI exposure, ${node.importantSkills.length} important skills`}
                aria-pressed={active} onClick={() => choose(node)} onKeyDown={event => keyboardNode(event, node)}>
                <title>{occupation.title} · {occupation.exposure ?? 'Unavailable'} exposure · {node.importantSkills.length} important skills</title>
              </circle>;
            })}
            {matches.map(node => <circle key={node.occupation.code} data-testid="map-highlight" data-code={node.occupation.code} className="map-highlight" cx={point(node).x} cy={point(node).y} r={((node.occupation.exposure === null ? 4.5 : EXPOSURE_RADIUS[node.occupation.exposure]) + 3) / Math.sqrt(view.zoom)} fill="none" stroke="#172f40" strokeWidth={1.8 / Math.sqrt(view.zoom)} pointerEvents="none" aria-hidden="true"/>)}
            {selectedVisible && selected && <g pointerEvents="none" aria-hidden="true"><circle cx={point(selected).x} cy={point(selected).y} r={(EXPOSURE_RADIUS[selected.occupation.exposure ?? 'Moderate'] + 5) / Math.sqrt(view.zoom)} fill="none" stroke="#172f40" strokeWidth={1.5 / view.zoom}/></g>}
          </svg>
          {!visible.length && <p className="map-empty">No mapped occupations have the selected exposure {exposures.length === 1 ? 'category' : 'categories'}. Choose another category or All.</p>}
        </div>
        <p id="map-edge-explanation" className="map-edge-explanation"><strong>Lines connect</strong> the selected occupation to up to five closest skill matches, ranked by shared important skills ÷ their combined set (Jaccard similarity). They do not indicate equal AI exposure or causality. Only visible endpoints connect; exact counts and skill names are below.</p>
        <p id="map-instructions" className="hint">Selecting a circle zooms into its surroundings; search highlights and frames matching occupations. Scroll over the map to zoom, then drag or use the pan buttons. Keyboard: focus the map and press +/− to zoom; on a circle, arrow keys browse and Enter selects. Double-click the background, press Escape, or use Clear selection to deselect.</p>
        <p className="hint">Positions stay fixed as you filter. Nearby circles are gently spread apart for readability. UMAP emphasizes local skill neighborhoods; distances and cluster gaps are approximate. Use the list to reach overlapping circles.</p>
      </div>
      <aside className="map-occupation-list" aria-labelledby="map-list-heading">
        <h3 id="map-list-heading">Highest exposure first</h3>
        <p className="hint">{listed.length} {term ? 'matching' : 'visible'} {listed.length === 1 ? 'occupation' : 'occupations'}. Equal categories are listed alphabetically, with no ranking within a category.</p>
        {term && !listed.length && <p className="map-list-empty">No matching occupations{exposureScope}. Try another title, code or exposure category. The map retains the surrounding occupations.</p>}
        <ul>{listed.map(node => <li key={node.occupation.code}><button type="button" data-testid="map-list-occupation" data-code={node.occupation.code} aria-pressed={selectedCode === node.occupation.code} onClick={() => choose(node)}>
          <span>{node.occupation.title}</span><small><span className="map-category-dot" style={{background: node.occupation.exposure === null ? 'transparent' : categoryColor(node.occupation.exposure)}}/>{node.occupation.exposure ?? 'Unavailable'} · {node.occupation.code}</small>
        </button></li>)}</ul>
      </aside>
    </div>
    <div className="map-selection" data-testid="map-selection" aria-live="polite" ref={selectionRef} tabIndex={-1} role="region" aria-label="Selected occupation skill details">
      {selected ? <>
        <div className="map-selection-heading"><div><p className="eyebrow">Selected occupation · {selected.occupation.code}</p><h3>{selected.occupation.title}</h3></div><button type="button" className="primary" onClick={() => onSelect(selected.occupation.code)}>View occupation details</button></div>
        <p><strong>{selected.occupation.exposure ?? 'Unavailable'} AI exposure.</strong> {selected.importantSkills.length} important skills from {selected.knownSkills} of {skills.skills.length} skills with ratings; {selected.ratedRoles} of {selected.mappedRoles} mapped O*NET roles have ratings.</p>
        {selected.unavailableRatings > 0 && <p className="hint">{selected.unavailableRatings} role–skill ratings are unavailable. Missing evidence is not a low rating; similarities use only observed important skills.</p>}
        {!selectedVisible && <p className="hint">This selected occupation is outside the current filters. <button type="button" className="text-button" onClick={() => {setQuery(''); setExposures([]);}}>Show on map</button></p>}
        <details className="map-skill-details"><summary>Important skills for this occupation</summary><p>{selected.importantSkills.map(i => skills.skills[i].name).join(' · ') || 'No observed skill meets the importance threshold of 3.'}</p></details>
        <div data-testid="map-neighbors" className="map-neighbors"><h4>Closest skill matches across all mapped occupations</h4><p className="hint">Up to five matches by shared important skills ÷ their combined set (Jaccard similarity). Lines appear for matches visible on the map.</p>
          {neighbors.length ? <ol>{neighbors.map(match => <li key={match.node.occupation.code}>
            <button type="button" className="text-button" onClick={() => choose(match.node, true)}>{match.node.occupation.title}</button>
            <strong>{match.sharedSkills.length} shared / {match.union} combined · {Math.round(match.similarity * 100)}% similarity</strong>
            <p>{match.sharedSkills.map(i => skills.skills[i].name).join(' · ')}</p>
          </li>)}</ol> : <p>No other mapped occupation shares an observed important skill.</p>}
        </div>
      </> : <p>Select an occupation to see its important skills and the closest skill matches.</p>}
    </div>
    <details className="map-method"><summary>Map method and coverage</summary>
      <p>Each BLS occupation appears once. For each skill we average available O*NET importance ratings across its distinct mapped roles. A mean of 3 or above on the 1–5 scale counts as important. Null ratings are excluded from the mean; occupations without any skill evidence are omitted.</p>
      <p>The layout uses a precomputed UMAP projection of Jaccard distances between important-skill sets. A small, deterministic spacing adjustment moves crowded circles apart while keeping them close to their original positions. Every circle uses the same spacing rule, regardless of AI exposure, and positions remain fixed while searching, filtering or zooming. Connections and skill-match rankings use the original skill sets.</p>
      <p>UMAP emphasizes local neighborhoods. Distances, gaps and apparent density are approximate; identical profiles may appear apart. Unobserved skills provide no positive evidence and do not establish that a skill is unimportant. Exposure never affects the layout or similarity.</p>
      <div className="map-distribution"><table><caption>Occupation counts, not employment shares. Full snapshot: {model.total}; skill-mapped subset: {model.nodes.length}.</caption><thead><tr><th scope="col">AI exposure</th><th scope="col">Full snapshot</th><th scope="col">On map</th></tr></thead><tbody>
        {[...EXPOSURE_LEVELS, 'Unavailable' as const].map(level => <tr key={level}><th scope="row">{level}</th><td>{model.fullCounts[level]}</td><td>{model.mappedCounts[level]}</td></tr>)}
      </tbody></table></div>
      <p className="source-line">Sources: BLS {snapshot.release.startYear}–{snapshot.release.endYear} occupational projections and relative AI exposure; O*NET {skills.onet} skills. These are descriptive source categories, not estimates of job losses or an AI effect on projected employment.</p>
    </details>
  </section>;
}
