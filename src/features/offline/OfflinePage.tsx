import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { formatBytes, listStoredSongs, outboxItems, removeStoredSong, setPinned, storageEstimate, type OutboxItem, type StoredSong } from '../../lib/localdb';
import { flushOutbox } from '../../data/outbox';
import { loadSong } from '../../data/library';
import { useOnline } from '../../lib/useOnline';
import { Button } from '../../components/ui/Button';
import { Alert, EmptyState, Spinner } from '../../components/ui/Feedback';
import { SongPicker } from '../../components/ui/SongPicker';

const OUTBOX_LABEL: Record<string, string> = { 'arrangement.save': 'Salvataggio di una versione personale', 'favorite.add': 'Aggiunta ai preferiti', 'favorite.remove': 'Rimozione dai preferiti' };

export default function OfflinePage() {
  const { entries, syncedAt, refresh, loading } = useLibrary();
  const { isRegistered } = useAuth();
  const online = useOnline();
  const toast = useToast();
  const [songs, setSongs] = useState<StoredSong[] | null>(null);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [estimate, setEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [s, o, e] = await Promise.all([listStoredSongs(), outboxItems(), storageEstimate()]);
    setSongs(s.sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.song.number ?? 1e9) - (b.song.number ?? 1e9)));
    setOutbox(o);
    setEstimate(e);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const total = songs?.reduce((n, s) => n + s.bytes, 0) ?? 0;

  const pinSong = async (id: string) => {
    if (!online) return toast.error('Serve la connessione per scaricare un canto.');
    try {
      await loadSong(id, { cacheChords: isRegistered });
      await setPinned(id, true);
      await load();
      toast.success('Canto disponibile anche senza connessione.');
    } catch {
      toast.error('Download non riuscito.');
    }
  };

  const downloadAll = async () => {
    if (!online) return;
    setBusy(true);
    let done = 0;
    for (const e of entries) {
      try {
        await loadSong(e.id, { cacheChords: isRegistered });
        await setPinned(e.id, true);
        done++;
      } catch { /* continue */ }
    }
    setBusy(false);
    await load();
    toast.success(`${done} canti salvati sul dispositivo.`);
  };

  if (!songs) return <Spinner />;
  return (
    <div className="container stack-lg">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header__text">
          <h1>Uso senza connessione</h1>
          <p>
            {online ? 'Sei online.' : 'Sei offline: puoi consultare i canti salvati su questo dispositivo.'}
            {syncedAt && ` Elenco dei canti aggiornato il ${new Date(syncedAt).toLocaleString('it-IT')}.`}
          </p>
        </div>
        <div className="row">
          <Button icon="download" onClick={() => setPicker(true)} disabled={!online}>Salva un canto</Button>
          <Button onClick={downloadAll} loading={busy} disabled={!online || entries.length === 0}>Salva tutti ({entries.length})</Button>
          <Button variant="ghost" onClick={() => void refresh()} loading={loading} disabled={!online}>Aggiorna elenco</Button>
        </div>
      </div>

      <div className="admin-grid">
        <div className="panel panel__body stat"><span className="small muted">Canti salvati</span><strong style={{ fontSize: 'var(--text-xl)' }}>{songs.length}</strong></div>
        <div className="panel panel__body stat"><span className="small muted">Spazio dei canti</span><strong style={{ fontSize: 'var(--text-xl)' }}>{formatBytes(total)}</strong></div>
        {estimate && (
          <div className="panel panel__body stat"><span className="small muted">Spazio usato dall'app</span><strong style={{ fontSize: 'var(--text-xl)' }}>{formatBytes(estimate.usage)}</strong><span className="small muted">su {formatBytes(estimate.quota)} disponibili</span></div>
        )}
      </div>

      {outbox.length > 0 && (
        <Alert tone="warning" title="Modifiche in attesa di sincronizzazione">
          <ul style={{ margin: '0 0 var(--space-3)', paddingLeft: '1.2em' }}>
            {outbox.map((o) => <li key={o.id}>{OUTBOX_LABEL[o.kind] ?? o.kind} · {new Date(o.createdAt).toLocaleString('it-IT')}{o.lastError ? ` · ultimo errore: ${o.lastError}` : ''}</li>)}
          </ul>
          <Button size="sm" disabled={!online} onClick={async () => {
            const r = await flushOutbox();
            await load();
            toast.success(`Sincronizzate ${r.synced} modifiche${r.conflicts ? `; ${r.conflicts} in conflitto salvate come copia` : ''}.`);
          }}>Sincronizza ora</Button>
        </Alert>
      )}

      {songs.length === 0 ? (
        <EmptyState icon="download" title="Nessun canto salvato">I canti che apri vengono salvati automaticamente. Puoi anche salvarne altri in anticipo, ad esempio prima di una celebrazione.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Canto</th><th>Salvato</th><th>Spazio</th><th><span className="visually-hidden">Azioni</span></th></tr></thead>
            <tbody>
              {songs.map((s) => (
                <tr key={s.id}>
                  <td><Link to={`/canti/${s.id}`}>{s.song.number ? `${s.song.number}. ` : ''}{s.song.title}</Link>{s.pinned && <span className="badge" style={{ marginLeft: 8 }}>fissato</span>}</td>
                  <td className="small muted">{new Date(s.fetchedAt).toLocaleDateString('it-IT')}</td>
                  <td className="small">{formatBytes(s.bytes)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div className="row row--end" style={{ gap: 'var(--space-1)' }}>
                      <Button size="sm" variant="ghost" onClick={async () => { await setPinned(s.id, !s.pinned); await load(); }}>{s.pinned ? 'Non fissare' : 'Fissa'}</Button>
                      <Button size="sm" variant="ghost" icon="trash" iconOnly onClick={async () => { await removeStoredSong(s.id); await load(); }}>Rimuovi {s.song.title}</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="small muted">I canti fissati non vengono rimossi automaticamente quando lo spazio si riduce. Le modifiche fatte offline vengono inviate al ritorno della connessione; se nel frattempo la stessa versione è stata modificata altrove, la tua viene salvata come copia e nulla viene sovrascritto.</p>
      <SongPicker open={picker} onClose={() => setPicker(false)} onPick={(id) => { setPicker(false); void pinSong(id); }} title="Salva un canto sul dispositivo" />
    </div>
  );
}
