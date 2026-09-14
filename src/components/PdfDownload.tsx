import {useState} from 'react';
import type {Occupation, Release, Role} from '../domain/types';

export default function PdfDownload({occupations, release, role}: {occupations: Occupation[]; release: Release; role?: Role}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function download() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const {occupationPdf} = await import('../export/pdf');
      const bytes = await occupationPdf(occupations, release, role);
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], {type: 'application/pdf'}));
      const link = document.createElement('a');
      link.href = url;
      link.download = occupations.length > 1 ? 'work-and-ai-comparison.pdf' : `work-and-ai-${occupations[0].code}.pdf`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      setError('The PDF could not be prepared. Please reload this page and try again.');
    } finally { setBusy(false); }
  }
  return <><button className="text-button" onClick={() => void download()} disabled={busy}>{busy ? 'Preparing PDF…' : 'Download PDF'}</button>{error && <span role="alert">{error}</span>}</>;
}
