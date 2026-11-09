import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';
import { readScoreFile } from '../../data/scores';
import { cpdlSearchUrl, type ScoreSource } from '../../data/scoreSearch';

/**
 * Helps find a MusicXML score on CPDL for a song. CPDL sits behind a Cloudflare
 * challenge that blocks every automated request (server or browser), so the
 * search opens on CPDL itself; the downloaded file is then loaded here and
 * shown as a preview with its source filled in. Saving stays a separate step.
 */
export function ScoreFinder({ title, onImported }: { title: string; onImported: (xml: string, from: ScoreSource) => void }) {
  const [query, setQuery] = useState(title);
  const edited = useRef(false);
  useEffect(() => { if (!edited.current) setQuery(title); }, [title]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const load = async (file: File) => {
    setError(null);
    try {
      const xml = await readScoreFile(file);
      setLoaded(file.name);
      onImported(xml, { site: 'CPDL', query: query.trim(), file: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'File non valido.');
    }
  };

  const q = query.trim();
  return (
    <section className="panel panel__body stack-sm score-finder" aria-label="Spartito da CPDL">
      <h3 style={{ margin: 0 }}>Spartito da CPDL</h3>
      <ol className="score-finder__steps small">
        <li>Apri la ricerca su CPDL: trovi gli spartiti gratuiti con questo titolo.</li>
        <li>Nella pagina dello spartito scarica il file <strong>MusicXML</strong> (.mxl o .musicxml).</li>
        <li>Caricalo qui sotto: compare l'anteprima e la fonte viene compilata.</li>
      </ol>
      <div className="score-finder__search">
        <label className="search" style={{ margin: 0 }}>
          <Icon name="search" />
          <span className="visually-hidden">Titolo da cercare su CPDL</span>
          <input className="input" type="search" value={query} placeholder="Titolo del canto" onChange={(e) => { edited.current = true; setQuery(e.target.value); }} />
        </label>
        <a className={`btn btn--primary${q.length < 2 ? ' is-disabled' : ''}`} href={q.length < 2 ? undefined : cpdlSearchUrl(q)} target="_blank" rel="noreferrer noopener" aria-disabled={q.length < 2}>
          <Icon name="search" /> Cerca su CPDL
        </a>
      </div>
      <input ref={fileInput} type="file" hidden accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void load(f); e.target.value = ''; }} />
      <div
        className={`score-finder__drop${dragging ? ' is-dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) void load(f); }}
      >
        <Button icon={loaded ? 'check' : 'upload'} onClick={() => fileInput.current?.click()}>
          {loaded ? 'Carica un altro file' : 'Carica il file scaricato'}
        </Button>
        <span className="small muted">{loaded ? `Caricato: ${loaded}` : 'oppure trascinalo qui'}</span>
      </div>
      {error && <p className="small" role="alert" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p>}
      <p className="small muted" style={{ margin: 0 }}>
        Controlla la licenza indicata sulla pagina CPDL prima di pubblicare lo spartito. Il file non viene salvato finché non lo confermi.
      </p>
    </section>
  );
}
