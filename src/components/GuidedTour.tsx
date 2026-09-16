import {useEffect, useLayoutEffect, useRef, useState} from 'react';
import './guided-tour.css';

export const TOUR_STORAGE_KEY = 'work-and-ai:guided-tour:v1';
export type TourView = 'search' | 'map' | 'family' | 'patterns';
const steps: {title: string; body: string; target: string; preferred?: string; view: TourView}[] = [
  {title: 'Find an occupation', target: '[data-tour="title-search"]', view: 'search',
    body: 'Start with an English job title. Suggestions update as you type. Confirm a source description to see AI exposure, skills and employment outlook, then compare up to three occupations.'},
  {title: 'Find by skills', target: '[data-tour="skills-search"]', view: 'search',
    body: 'Choose skills you use to find occupations with similar published requirements. Suggestions reflect occupational skill importance; they do not assess your proficiency or personal fit.'},
  {title: 'Describe your work', target: '[data-tour="description-search"]', view: 'search',
    body: 'Describe your responsibilities in English. Find matches runs an optional meaning model on your device; Search wording only needs no model download. Review and confirm each suggestion.'},
  {title: 'Explore the occupation map', target: '#map-view', preferred: '#map-view .map-canvas', view: 'map',
    body: 'Explore occupations by skill similarity. Color and circle size show relative AI exposure. Search or filter by job family and exposure, then select a circle to see its closest skill matches. The map may take a moment to load.'},
  {title: 'Compare job families', target: '#map-view', preferred: '#map-view .family-heatmap-scroll', view: 'family',
    body: 'Switch to By job family to compare the exposure mix. Each row is a family; cells show its percentage and count of occupations in each category. Darker blue means a larger share. These are occupation shares, not employment shares. After the tour, choose a family name to browse all its occupations, or a populated cell to open the filtered map; only occupations with enough skill ratings appear there.'},
  {title: 'Compare skill patterns', target: '#patterns-view', preferred: '#patterns-view .patterns-table-scroll', view: 'patterns',
    body: 'Choose an exposure category and comparison baseline, then sort the table to compare skill prevalence. Read counts and coverage alongside ratios. These describe occupations, not the AI exposure of individual skills. The table appears when its reference is ready.'},
  {title: 'Read the sources', target: '[data-tour="sources"]', view: 'search',
    body: 'Open Sources and interpretation for definitions, evidence dates, privacy and original records. Exposure categories are not probabilities of job replacement, and U.S. occupational estimates are not personal forecasts.'},
  {title: 'Come back anytime', target: '#tour-replay', view: 'search',
    body: 'Use Take a tour whenever you want a reminder. Finish or skip to return to where you started, with your searches, selections and comparisons preserved.'},
];

function hasSeenTour() {
  try {return localStorage.getItem(TOUR_STORAGE_KEY) === 'seen';} catch {return false;}
}

export default function GuidedTour({ready, request, onViewChange}: {
  ready: boolean; request: number; onViewChange: (view: TourView | null) => void;
}) {
  const [index, setIndex] = useState<number | null>(null);
  const [spotlight, setSpotlight] = useState<{left: number; top: number; width: number; height: number; target: string} | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), card = useRef<HTMLDivElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const attempted = useRef(false), handledRequest = useRef(0), origin = useRef({x: 0, y: 0});
  const restoreFrame = useRef(0);
  const viewCallback = useRef(onViewChange);
  useLayoutEffect(() => {viewCallback.current = onViewChange;});

  useEffect(() => {
    if (!ready) return;
    const replay = request !== handledRequest.current;
    handledRequest.current = request;
    const auto = !attempted.current && !hasSeenTour();
    attempted.current = true;
    if (!replay && !auto) return;
    cancelAnimationFrame(restoreFrame.current);
    origin.current = {x: window.scrollX, y: window.scrollY};
    try {localStorage.setItem(TOUR_STORAGE_KEY, 'seen');} catch {/* Persistence is best effort. */}
    viewCallback.current('search');
    setIndex(0);
  }, [ready, request]);

  useEffect(() => () => cancelAnimationFrame(restoreFrame.current), []);

  const active = index !== null;
  useLayoutEffect(() => {
    if (!active) return;
    const modal = dialog.current!;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    modal.showModal();
    return () => {
      modal.close();
      document.documentElement.style.overflow = previousOverflow;
    };
  }, [active]);

  useLayoutEffect(() => {
    if (index === null) return;
    const step = steps[index];
    let frame = 0, scrolledTarget: Element | null = null;
    const update = () => {
      const preferred = step.preferred ? document.querySelector<HTMLElement>(step.preferred) : null;
      const target = preferred ?? document.querySelector<HTMLElement>(step.target);
      if (!target || !card.current) {setSpotlight(null); return;}
      if (scrolledTarget !== target) {
        target.scrollIntoView({block: 'start', inline: 'nearest', behavior: 'instant'});
        // Leave breathing room above the real target, even with reduced motion enabled.
        window.scrollBy({top: -24, behavior: 'instant'});
        scrolledTarget = target;
      }
      const rect = target.getBoundingClientRect(), cardRect = card.current.getBoundingClientRect();
      const left = Math.max(8, rect.left - 6), top = Math.max(8, rect.top - 6);
      const right = Math.min(window.innerWidth - 8, rect.right + 6);
      // A large map/table may extend below the screen: outline its visible portion above the card.
      const bottom = Math.min(cardRect.top - 16, rect.bottom + 6);
      // Bounding rectangles use viewport coordinates; positioned CSS lengths use
      // the dialog's local units. Root CSS zoom can make those units differ.
      const modal = dialog.current!, modalRect = modal.getBoundingClientRect();
      const scaleX = modalRect.width / modal.offsetWidth || 1;
      const scaleY = modalRect.height / modal.offsetHeight || 1;
      const next = {left: left / scaleX, top: top / scaleY, width: Math.max(0, right - left) / scaleX, height: Math.max(0, bottom - top) / scaleY, target: preferred ? step.preferred! : step.target};
      setSpotlight(previous => previous && Object.keys(next).every(key => previous[key as keyof typeof next] === next[key as keyof typeof next]) ? previous : next);
    };
    const schedule = () => {cancelAnimationFrame(frame); frame = requestAnimationFrame(update);};
    const resize = new ResizeObserver(schedule);
    resize.observe(document.body);
    resize.observe(card.current!);
    const target = document.querySelector(step.target);
    if (target) resize.observe(target);
    const mutations = new MutationObserver(schedule);
    if (target) mutations.observe(target, {childList: true, subtree: true});
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    window.visualViewport?.addEventListener('resize', schedule);
    heading.current?.focus({preventScroll: true});
    update();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect(); mutations.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [index]);

  function close() {
    setIndex(null); setSpotlight(null);
    viewCallback.current(null);
    restoreFrame.current = requestAnimationFrame(() => {
      document.getElementById('tour-replay')?.focus({preventScroll: true});
      window.scrollTo({left: origin.current.x, top: origin.current.y, behavior: 'instant'});
    });
  }
  function go(next: number) {
    setSpotlight(null);
    viewCallback.current(steps[next].view);
    setIndex(next);
  }
  if (index === null) return null;
  const step = steps[index];
  // Let even the last page control scroll above the card. This disappears before
  // the close callback restores the user's original scroll position.
  return <><div className="tour-scroll-space no-print" aria-hidden="true"/>
  <dialog ref={dialog} id="guided-tour" className="guided-tour no-print" aria-labelledby="tour-title" aria-describedby="tour-body tour-progress"
    onCancel={event => {event.preventDefault(); close();}}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = Array.from(card.current!.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]'));
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) {event.preventDefault(); last.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first.focus();}
    }}>
    {spotlight && spotlight.height > 0 && <div className="tour-spotlight" aria-hidden="true" data-target={spotlight.target} style={{left: spotlight.left, top: spotlight.top, width: spotlight.width, height: spotlight.height}}/>}
    <div className="tour-card" ref={card}>
      <p id="tour-progress" className="tour-progress">Quick tour · Step {index + 1} of {steps.length}</p>
      <h2 id="tour-title" tabIndex={-1} ref={heading}>{step.title}</h2>
      <p id="tour-body" tabIndex={0}>{step.body}</p>
      <div className="tour-actions">
        <button className="text-button" onClick={close}>Skip tour</button>
        <div><button className="secondary" disabled={index === 0} onClick={() => go(index - 1)}>Back</button>
        <button className="primary" onClick={() => index === steps.length - 1 ? close() : go(index + 1)}>{index === steps.length - 1 ? 'Finish' : 'Next'}</button></div>
      </div>
    </div>
  </dialog></>;
}
