import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { readScoreFile } from '../../data/scores';
import { cpdlSearchUrl, fetchCatalogScore, loadCatalog, searchCatalog, type CatalogItem, type ScoreSource } from '../../data/scoreSearch';

/**
 * Finds a free score for a song.
 *
 * 1. Jubilate's catalogue (free sacred scores from PDMX, served with the app)
 *    is searched automatically with the song title; with `autoImport` the best
 *    match is loaded straight away and the others can be picked with one tap.
 * 2. CPDL blocks every automated request (Cloudflare challenge), so as a
 *    fallback the search opens on CPDL and the downloaded file is loaded here.
 *
 * Imported scores are only a preview: saving stays a separate step.
 */
export function ScoreFinder({ title, autoImport = false, onImported }: {
  title: string;
  autoImport?: boolean;
  onImported: (xml: string, from: ScoreSource) => void;
}) {
  const [query, setQuery] = useState(title);
  const edited = useRef(false);
  useEffect(() => { if (!edited.current) setQuery(title); }, [title]);
  const q = query.trim();

  const [catalog, setCatalog] = useState<CatalogItem[] | null>(null);
  useEffect(() => { let live = true; void loadCatalog().then((c) => { if (live) setCatalog(c); }); return () => { live = false; }; }, []);
  const [results, setResults] = useState<CatalogItem[]>([]);
  useEffect(() => {
    if (!catalog) return;
    const t = setTimeout(() => setResults(searchCatalog(catalog, q)), 200);
    return () => clearTimeout(t);
  }, [catalog, q]);

  const [current, setCurrent] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickItem = async (item: CatalogItem) => {
    setError(null);
    setBusy(item.i);
    try {
      const xml = await fetchCatalogScore(item);
      setCurrent(`catalogo:${item.i}`);
      onImported(xml, { site: 'Catalogo', id: item.i, title: item.t, composer: item.c, license: item.l });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Spartito non disponibile.');
    } finally {
      setBusy(null);
    }
  };

  // Load the best match once, as soon as the first results for the song arrive.
  const autoDone = useRef(false);
  useEffect(() => {
    if (!autoImport || autoDone.current || !catalog || edited.current) return;
    const best = searchCatalog(catalog, title, 1)[0];
    autoDone.current = true;
    if (best) void pickItem(best);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoImport, catalog, title]);

  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const loadFile = async (file: File) => {
    setError(null);
    try {
      const xml = await readScoreFile(file);
      setCurrent(`file:${file.name}`);
      onImported(xml, { site: 'CPDL', query: q, file: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'File non valido.');
    }
  };
  const loadedFile = current?.startsWith('file:') ? current.slice(5) : null;

  return (
    <section className="panel panel__body stack-sm score-finder" aria-label="Spartiti liberi">
      <h3 style={{ margin: 0 }}>Spartiti liberi</h3>
      <label className="search" style={{ margin: 0 }}>
        <Icon name="search" />
        <span className="visually-hidden">Titolo del canto da cercare</span>
        <input className="input" type="search" value={query} placeholder="Titolo del canto" onChange={(e) => { edited.current = true; setQuery(e.target.value); }} />
      </label>

      <div className="stack-sm" aria-live="polite">
        {catalog === null && <p className="small muted" style={{ margin: 0 }}>Cerco nel catalogo…</p>}
        {catalog !== null && q.length >= 2 && results.length === 0 && (
          <p className="small muted" style={{ margin: 0 }}>Nel catalogo non c'è uno spartito per «{q}». Prova un altro titolo o cerca su CPDL qui sotto.</p>
        )}
        {results.length > 0 && (
          <ul className="score-finder__results" aria-label="Spartiti trovati">
            {results.map((r) => {
              const inUse = current === `catalogo:${r.i}`;
              return (
                <li key={r.i}>
                  <div className="score-finder__result-text">
                    <strong>{r.t}</strong>
                    <span className="small muted">
                      {[r.c, r.y ? 'con testo' : 'senza testo', r.n === 1 ? '1 parte' : `${r.n} parti`, r.l === 'cc0' ? 'CC0' : 'pubblico dominio'].filter(Boolean).join(' · ')}
                    </span>
                  </div>
                  <Button icon={inUse ? 'check' : 'download'} variant={inUse ? 'primary' : undefined} disabled={busy !== null} onClick={() => void pickItem(r)} aria-label={`${inUse ? 'In uso' : 'Usa'}: ${r.t}`}>
                    {busy === r.i ? 'Carico…' : inUse ? 'In uso' : 'Usa'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="score-finder__cpdl stack-sm">
        <p className="small" style={{ margin: 0 }}>
          <strong>Non c'è quello giusto?</strong> Cercalo su CPDL, scarica il file MusicXML (.mxl o .musicxml) e caricalo qui.
        </p>
        <div className="score-finder__search">
          <a className={`btn${q.length < 2 ? ' is-disabled' : ''}`} href={q.length < 2 ? undefined : cpdlSearchUrl(q)} target="_blank" rel="noreferrer noopener" aria-disabled={q.length < 2}>
            <Icon name="search" /> Cerca su CPDL
          </a>
          <input ref={fileInput} type="file" hidden accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadFile(f); e.target.value = ''; }} />
          <div
            className={`score-finder__drop${dragging ? ' is-dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) void loadFile(f); }}
          >
            <Button icon={loadedFile ? 'check' : 'upload'} onClick={() => fileInput.current?.click()}>
              {loadedFile ? 'Carica un altro file' : 'Carica il file scaricato'}
            </Button>
            <span className="small muted">{loadedFile ? `Caricato: ${loadedFile}` : 'oppure trascinalo qui'}</span>
          </div>
        </div>
      </div>

      {error && <p className="small" role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
      <p className="small muted" style={{ margin: 0 }}>
        Gli spartiti del catalogo vengono da MuseScore, dove gli autori li hanno resi liberi (pubblico dominio o CC0), tramite la raccolta PDMX. Controlla sempre lo spartito: niente viene salvato finché non premi Salva.
      </p>
    </section>
  );
}
