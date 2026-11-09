import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { importCandidate, searchScoresByTitle, type ScoreCandidate } from '../../data/scoreSearch';

/**
 * Looks for MusicXML scores on CPDL as soon as a song title is known and lets
 * the user import one with a single tap. The imported score is only shown as a
 * preview: saving it stays a separate, explicit step.
 */
export function ScoreFinder({ title, onImported }: { title: string; onImported: (xml: string, from: ScoreCandidate) => void }) {
  const [query, setQuery] = useState(title);
  const [results, setResults] = useState<ScoreCandidate[] | null>(null);
  const [state, setState] = useState<'idle' | 'searching' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<string | null>(null);
  const seq = useRef(0);

  // Follow the song title until the user edits the search text.
  const edited = useRef(false);
  useEffect(() => { if (!edited.current) setQuery(title); }, [title]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) { setResults(null); setState('idle'); return; }
    const id = ++seq.current;
    setState('searching');
    const t = window.setTimeout(async () => {
      try {
        const r = await searchScoresByTitle(q);
        if (id !== seq.current) return;
        setResults(r);
        setState('idle');
      } catch (e) {
        if (id !== seq.current) return;
        setError(e instanceof Error ? e.message : 'Ricerca non disponibile.');
        setState('error');
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [query]);

  const pick = async (c: ScoreCandidate) => {
    setImporting(c.url);
    setError(null);
    try {
      const xml = await importCandidate(c);
      setImported(c.url);
      onImported(xml, c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Importazione non riuscita.');
    } finally {
      setImporting(null);
    }
  };

  return (
    <section className="panel panel__body stack-sm score-finder" aria-label="Spartiti trovati su CPDL">
      <div className="row row--between">
        <h3 style={{ margin: 0 }}>Spartiti trovati su CPDL</h3>
        {state === 'searching' && <span className="small muted row"><span className="spinner" aria-hidden /> Ricerca in corso…</span>}
      </div>
      <label className="search" style={{ margin: 0 }}>
        <Icon name="search" />
        <span className="visually-hidden">Titolo da cercare su CPDL</span>
        <input className="input" type="search" value={query} placeholder="Titolo del canto" onChange={(e) => { edited.current = true; setQuery(e.target.value); }} />
      </label>
      {error && <p className="small" role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
      {state !== 'searching' && results && results.length === 0 && (
        <p className="small muted" style={{ margin: 0 }}>Nessun file MusicXML trovato per «{query.trim()}». Prova con il titolo latino o originale, oppure carica un file.</p>
      )}
      {results && results.length > 0 && (
        <ul className="score-finder__list" aria-live="polite">
          {results.map((c) => (
            <li key={c.url} className="score-finder__item">
              <div className="grow">
                <div className="score-finder__page">{c.page}</div>
                <div className="small muted">{c.file}{c.size ? ` · ${Math.max(1, Math.round(c.size / 1024))} KB` : ''} · <a href={c.pageUrl} target="_blank" rel="noreferrer noopener">licenza e dettagli</a></div>
              </div>
              <Button size="sm" variant={imported === c.url ? 'ghost' : 'primary'} icon={imported === c.url ? 'check' : 'download'} loading={importing === c.url} disabled={importing !== null} onClick={() => void pick(c)}>
                {imported === c.url ? 'Importato' : 'Importa'}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        Gli spartiti di CPDL sono gratuiti; controlla la licenza sulla pagina prima di pubblicarli. Il file importato compare in anteprima e non viene salvato finché non lo confermi.
      </p>
    </section>
  );
}
