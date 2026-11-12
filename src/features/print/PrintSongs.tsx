import { useEffect, useState } from 'react';
import { useAuth } from '../../app/AuthProvider';
import { usePrefs } from '../../app/PrefsProvider';
import { loadSong } from '../../data/library';
import { fetchArrangement } from '../../data/personal';
import type { SongDetail } from '../../data/types';
import type { SongContent } from '../../domain/song';
import { Button } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Field';
import { Spinner } from '../../components/ui/Feedback';
import { SongView } from '../song/SongView';

export interface PrintItem {
  songId: string;
  arrangementId?: string | null;
  heading?: string | null;
  note?: string | null;
}

interface Loaded { item: PrintItem; detail: SongDetail; content: SongContent; baseKey: string | null }

/**
 * Print layout (real text, not screenshots): one song per page or continuous,
 * with or without chords. Uses the browser's print / "Save as PDF".
 */
export function PrintSongs({ title, subtitle, items }: { title: string; subtitle?: string; items: PrintItem[] }) {
  const { isRegistered } = useAuth();
  const { prefs } = usePrefs();
  const [loaded, setLoaded] = useState<Loaded[] | null>(null);
  const [withChords, setWithChords] = useState<'text' | 'chords'>('text');
  const [layout, setLayout] = useState<'pages' | 'continuous'>('pages');

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      items.map(async (item) => {
        const r = await loadSong(item.songId, { cacheChords: isRegistered });
        let content = r.detail.content;
        let baseKey = r.detail.content.key ?? r.detail.song.original_key;
        if (item.arrangementId) {
          try {
            const a = await fetchArrangement(item.arrangementId);
            content = a.content;
            baseKey = a.content.key ?? a.display_key;
          } catch {
            /* fall back to the official version */
          }
        }
        return { item, detail: r.detail, content, baseKey: baseKey ?? null };
      }),
    )
      .then((l) => !cancelled && setLoaded(l))
      .catch(() => !cancelled && setLoaded([]));
    return () => {
      cancelled = true;
    };
  }, [items, isRegistered]);

  if (!loaded) return <Spinner label="Preparazione della stampa…" />;

  return (
    <div style={{ padding: 'var(--space-6) var(--space-4)', maxWidth: 900, margin: '0 auto' }}>
      <div className="row row--between no-print" style={{ marginBottom: 'var(--space-6)' }}>
        <div className="row">
          {isRegistered && (
            <Segmented label="Contenuto" value={withChords} onChange={setWithChords} options={[{ value: 'text', label: 'Solo testo' }, { value: 'chords', label: 'Con accordi' }]} />
          )}
          <Segmented label="Impaginazione" value={layout} onChange={setLayout} options={[{ value: 'pages', label: 'Un canto per pagina' }, { value: 'continuous', label: 'Continua' }]} />
        </div>
        <Button variant="primary" icon="printer" onClick={() => window.print()}>Stampa o salva PDF</Button>
      </div>
      <header style={{ marginBottom: 'var(--space-8)', fontFamily: 'var(--font-ui)' }}>
        <h1 style={{ fontFamily: 'var(--font-reading)' }}>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
        <ol style={{ marginTop: 'var(--space-4)' }}>
          {loaded.map((l, i) => (
            <li key={i}>{l.item.heading ? `${l.item.heading}: ` : ''}{l.detail.song.number ? `${l.detail.song.number} · ` : ''}{l.detail.song.title}</li>
          ))}
        </ol>
      </header>
      {loaded.map((l, i) => (
        <article key={i} className={`song ${layout === 'pages' ? 'print-song' : ''}`} style={{ ['--song-scale' as string]: 0.9, marginBottom: 'var(--space-10)' }}>
          <header className="song__header">
            {l.item.heading && <span className="section-title">{l.item.heading}</span>}
            {l.detail.song.number != null && <span className="song__number">N. {l.detail.song.number}</span>}
            <h2 className="song__title" style={{ fontSize: '1.6rem' }}>{l.detail.song.title}</h2>
            {l.item.note && <p className="small muted">{l.item.note}</p>}
          </header>
          <SongView content={l.content} baseKey={l.baseKey} showChords={withChords === 'chords'} chordOptions={{ transpose: 0, capo: 0, notation: prefs.notation, showShapes: false }} />
        </article>
      ))}
    </div>
  );
}
