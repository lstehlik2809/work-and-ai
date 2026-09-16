import {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {familyOccupationMembers, occupationFamilyName} from '../domain/occupation-families';
import {EXPOSURE_COLOR} from '../domain/occupation-map';
import type {Occupation} from '../domain/types';
import './family-occupation-panel.css';

interface Props {
  familyCode: string;
  occupations: readonly Occupation[];
  trigger: HTMLButtonElement;
  onClose: () => void;
  onSelect: (code: string) => void;
}

export default function FamilyOccupationPanel({familyCode, occupations, trigger, onClose, onSelect}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const members = useMemo(() => familyOccupationMembers(occupations, familyCode), [occupations, familyCode]);
  const term = query.trim().toLocaleLowerCase();
  const results = members.filter(occupation => occupation.title.toLocaleLowerCase().includes(term) || occupation.code.includes(term));
  const returnPosition = useRef({x: window.scrollX, y: window.scrollY, table: trigger.closest('.family-heatmap-scroll'), left: 0, top: 0});

  useLayoutEffect(() => {
    const dialog = dialogRef.current!;
    const position = returnPosition.current;
    position.left = position.table?.scrollLeft ?? 0;
    position.top = position.table?.scrollTop ?? 0;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    searchRef.current?.focus({preventScroll: true});
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
    };
  }, []);

  function dismiss() {
    dialogRef.current?.close();
    trigger.focus({preventScroll: true});
    const position = returnPosition.current;
    position.table?.scrollTo({left: position.left, top: position.top, behavior: 'instant'});
    window.scrollTo({left: position.x, top: position.y, behavior: 'instant'});
    onClose();
  }

  function choose(code: string) {
    // Close before navigation; the existing destination owns focus after this point.
    dialogRef.current?.close();
    onClose();
    onSelect(code);
  }

  return <dialog ref={dialogRef} className="family-occupation-panel" data-testid="family-members-panel"
    aria-labelledby="family-members-heading" aria-describedby="family-members-description"
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex="0"]')];
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {event.preventDefault(); last?.focus();}
      else if (!event.shiftKey && document.activeElement === last) {event.preventDefault(); first?.focus();}
    }}
    onCancel={event => {event.preventDefault(); dismiss();}}>
    <div className="family-members-header">
      <div className="family-members-heading-row"><p className="eyebrow">Job family · SOC {familyCode}</p>
        <button type="button" className="text-button" aria-label="Close family occupations" onClick={dismiss}>Close <span aria-hidden="true">×</span></button></div>
      <h2 id="family-members-heading">{occupationFamilyName(familyCode)}</h2>
      <p id="family-members-description">{members.length} BLS occupations in the full snapshot, including occupations without skill ratings. Choose an occupation to view its details.</p>
      <label htmlFor="family-members-search">Search family occupations</label>
      <div className="family-members-search"><input ref={searchRef} id="family-members-search" type="search" value={query}
        placeholder="Occupation title or SOC code" onChange={event => setQuery(event.target.value)}/>
        {query && <button type="button" className="text-button" onClick={() => {setQuery(''); searchRef.current?.focus();}}>Clear search</button>}</div>
      <p className="family-members-count" role="status">{results.length} of {members.length} occupations{term ? ' match your search' : ''}</p>
    </div>
    <div className="family-members-results">
      {results.length ? <ul>{results.map(occupation => <li key={occupation.code}>
        <button type="button" data-testid="family-member" data-code={occupation.code} onClick={() => choose(occupation.code)}>
          <strong>{occupation.title}</strong><span className="family-member-code">BLS {occupation.code}</span>
          <span className="family-member-exposure"><span aria-hidden="true" style={{background: occupation.exposure ? EXPOSURE_COLOR[occupation.exposure] : 'transparent'}}/>{occupation.exposure ?? 'Unavailable'} AI exposure</span>
        </button>
      </li>)}</ul> : <p className="family-members-empty">No occupations match your search. Try another title or code, or clear the search to see every occupation in this family.</p>}
    </div>
  </dialog>;
}
