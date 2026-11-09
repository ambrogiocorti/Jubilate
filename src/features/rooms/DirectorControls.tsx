import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from './RoomProvider';
import { useToast } from '../../app/ToastProvider';
import { useLibrary } from '../../app/LibraryProvider';
import { closeRoom, roomParticipants, setRoomSong, stepRoom } from '../../data/rooms';
import { fetchCelebrationSongs, type CelebrationSong } from '../../data/celebrations';
import type { RoomSnapshot } from '../../domain/room';
import { searchSongs } from '../../domain/search';
import { friendlyError, errorCode } from '../../lib/errors';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { Icon } from '../../components/ui/Icon';

export function DirectorControls({ snapshot }: { snapshot: RoomSnapshot }) {
  const room = useRoom();
  const toast = useToast();
  const navigate = useNavigate();
  const { index, byId } = useLibrary();
  const [setlist, setSetlist] = useState<CelebrationSong[]>([]);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [participants, setParticipants] = useState<number | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (snapshot.celebration_id) fetchCelebrationSongs(snapshot.celebration_id).then(setSetlist).catch(() => setSetlist([]));
  }, [snapshot.celebration_id]);

  useEffect(() => {
    const load = () => roomParticipants(snapshot.id).then((p) => setParticipants(p.filter((x) => !x.revoked).length)).catch(() => undefined);
    void load();
    const t = window.setInterval(load, 30_000);
    return () => window.clearInterval(t);
  }, [snapshot.id]);

  const run = async (fn: () => Promise<RoomSnapshot | void>) => {
    setBusy(true);
    try {
      const s = await fn();
      if (s) room.applySnapshot(s);
    } catch (err) {
      if (errorCode(err).includes('stale_state')) await room.resync();
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const results = useMemo(() => searchSongs(index, q).slice(0, 30), [index, q]);
  const idx = snapshot.current_item_index;

  return (
    <section className="no-print" aria-label="Comandi del direttore" style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-subtle)', padding: 'var(--space-3) var(--space-4)' }}>
      <div className="row row--between">
        <div className="row">
          <Button icon="chevronLeft" disabled={busy || !setlist.length || (idx ?? 0) <= 0} onClick={() => run(() => stepRoom(snapshot.id, -1))}>
            Precedente
          </Button>
          <Button variant="primary" iconRight="chevronRight" disabled={busy || !setlist.length || (idx ?? -1) >= setlist.length - 1} onClick={() => run(() => stepRoom(snapshot.id, 1))}>
            Successivo
          </Button>
          <Button icon="search" disabled={busy} onClick={() => setPickerOpen(true)}>Scegli canto</Button>
        </div>
        <div className="row small muted">
          <span><Icon name="users" size={16} style={{ display: 'inline', verticalAlign: '-3px' }} /> {participants ?? '–'} partecipanti</span>
          <span>Codice <strong style={{ fontSize: 'var(--text-lg)', letterSpacing: '0.12em', color: 'var(--text)' }}>{snapshot.code}</strong></span>
          <Button variant="danger-soft" size="sm" onClick={() => setConfirmClose(true)}>Termina stanza</Button>
        </div>
      </div>
      {setlist.length > 0 && (
        <ol className="chips" style={{ marginTop: 'var(--space-3)', listStyle: 'none', padding: 0 }} aria-label="Scaletta">
          {setlist.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                className="chip"
                aria-pressed={idx === i}
                disabled={busy}
                onClick={() => run(() => setRoomSong(snapshot.id, item.song_id, i, snapshot.state_version))}
              >
                {i + 1}. {item.moment_label ? `${item.moment_label}: ` : ''}{byId.get(item.song_id)?.title ?? 'Canto'}
              </button>
            </li>
          ))}
        </ol>
      )}

      <Dialog open={pickerOpen} onClose={() => setPickerOpen(false)} title="Scegli un canto fuori scaletta" sheet>
        <input className="input" type="search" placeholder="Numero o titolo…" aria-label="Cerca canto" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        <ul role="list" className="list">
          {results.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="list-row"
                onClick={async () => {
                  setPickerOpen(false);
                  await run(() => setRoomSong(snapshot.id, s.id, null, snapshot.state_version));
                }}
              >
                <span className="list-row__num">{s.number ?? '—'}</span>
                <span className="list-row__main"><span className="list-row__title">{s.title}</span></span>
              </button>
            </li>
          ))}
        </ul>
      </Dialog>

      <ConfirmDialog
        open={confirmClose}
        title="Terminare la stanza?"
        message="I partecipanti vedranno che la stanza è terminata e non potranno più seguirla. L’operazione non si può annullare."
        confirmLabel="Termina stanza"
        destructive
        busy={busy}
        onCancel={() => setConfirmClose(false)}
        onConfirm={async () => {
          await run(() => closeRoom(snapshot.id));
          setConfirmClose(false);
          await room.leave();
          navigate('/stanze');
        }}
      />
    </section>
  );
}
