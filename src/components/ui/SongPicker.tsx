import { useMemo, useState } from 'react';
import { useLibrary } from '../../app/LibraryProvider';
import { searchSongs } from '../../domain/search';
import { Dialog } from './Dialog';

/** Searchable picker over the cached library. */
export function SongPicker({ open, onClose, onPick, title = 'Scegli un canto' }: { open: boolean; onClose: () => void; onPick: (songId: string) => void; title?: string }) {
  const { index } = useLibrary();
  const [q, setQ] = useState('');
  const results = useMemo(() => searchSongs(index, q).slice(0, 50), [index, q]);
  return (
    <Dialog open={open} onClose={onClose} title={title} sheet>
      <input className="input" type="search" placeholder="Numero, titolo o parole del testo…" aria-label="Cerca canto" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <ul role="list" className="list">
        {results.map((s) => (
          <li key={s.id}>
            <button type="button" className="list-row" onClick={() => { onPick(s.id); setQ(''); }}>
              <span className="list-row__num">{s.number ?? '—'}</span>
              <span className="list-row__main">
                <span className="list-row__title">{s.title}</span>
                <span className="list-row__meta">{s.first_line}</span>
              </span>
            </button>
          </li>
        ))}
        {!results.length && <li className="muted small" style={{ padding: 'var(--space-4)' }}>Nessun canto trovato.</li>}
      </ul>
    </Dialog>
  );
}
