import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { useLibrary } from '../../app/LibraryProvider';
import { useRoom } from '../rooms/RoomProvider';
import {
  addCelebrationSong, addNote, deleteCelebration, deleteNote, duplicateCelebration, fetchCelebration, fetchCelebrationSongs, fetchNotes,
  KIND_LABEL, removeCelebrationSong, reorderCelebrationSongs, STATUS_LABEL, updateCelebration, updateCelebrationSong,
  type Celebration, type CelebrationSong, type CelebrationStatus, type RehearsalNote,
} from '../../data/celebrations';
import { createRoom } from '../../data/rooms';
import { friendlyError } from '../../lib/errors';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Alert, EmptyState, Spinner } from '../../components/ui/Feedback';
import { SongPicker } from '../../components/ui/SongPicker';
import { formatDateTime } from './CelebrationsPage';
import { Metronome } from '../tools/Metronome';

const MOMENTS = ['Ingresso', 'Atto penitenziale', 'Gloria', 'Salmo', 'Alleluia', 'Offertorio', 'Santo', 'Mistero della fede', 'Agnello di Dio', 'Comunione', 'Ringraziamento', 'Finale', 'Canto mariano', 'Adorazione', 'Altro'];

export default function CelebrationPage() {
  const { celebrationId } = useParams();
  const location = useLocation();
  const base = location.pathname.startsWith('/prove') ? '/prove' : '/celebrazioni';
  const { user, isAdmin, isDirector } = useAuth();
  const { byId } = useLibrary();
  const toast = useToast();
  const room = useRoom();
  const navigate = useNavigate();
  const [c, setC] = useState<Celebration | null>(null);
  const [songs, setSongs] = useState<CelebrationSong[]>([]);
  const [notes, setNotes] = useState<RehearsalNote[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteShared, setNoteShared] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!celebrationId) return;
    try {
      const [cel, s, n] = await Promise.all([fetchCelebration(celebrationId), fetchCelebrationSongs(celebrationId), fetchNotes(celebrationId)]);
      setC(cel);
      setSongs(s);
      setNotes(n);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, [celebrationId]);
  useEffect(() => void load(), [load]);

  if (error) return <EmptyState icon="calendar" title="Celebrazione non disponibile" action={<ButtonLink to={base}>Torna all’elenco</ButtonLink>}>{error}</EmptyState>;
  if (!c) return <Spinner />;

  const canManage = Boolean(user && isDirector && (c.director_id === user.id || c.created_by === user.id || isAdmin));
  const isRehearsal = c.kind === 'rehearsal';

  const act = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast.success(ok);
      await load();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= songs.length) return;
    const next = [...songs];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setSongs(next);
    void act(() => reorderCelebrationSongs(next));
  };

  return (
    <div className="container stack-lg">
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header__text">
          <Link to={base} className="small">← {isRehearsal ? 'Prove del coro' : 'Celebrazioni'}</Link>
          <h1>{c.title}</h1>
          <p>{formatDateTime(c.starts_at)} · {KIND_LABEL[c.kind]} · <span className="badge">{STATUS_LABEL[c.status]}</span></p>
        </div>
        <div className="row">
          <ButtonLink to={`/stampa/celebrazione/${c.id}`} icon="printer" target="_blank">Stampa</ButtonLink>
          {isDirector && (
            <Button icon="copy" loading={busy} onClick={() => act(async () => {
              const id = await duplicateCelebration(c.id);
              navigate(`${base}/${id}`);
            }, 'Scaletta duplicata.')}>Duplica</Button>
          )}
          {canManage && !isRehearsal && (
            <Button variant="primary" icon="radio" loading={busy} onClick={() => act(async () => {
              const r = await createRoom(c.title, c.id);
              room.attach(r.id);
              navigate(`/stanze/${r.id}`);
            })}>Avvia stanza</Button>
          )}
        </div>
      </header>

      {canManage && (
        <section className="panel">
          <div className="panel__body">
            <div className="form-row">
              <Field label="Titolo">
                <input className="input" defaultValue={c.title} maxLength={160} onBlur={(e) => e.target.value.trim() !== c.title && act(() => updateCelebration(c.id, { title: e.target.value.trim() }), 'Salvato.')} />
              </Field>
              <Field label="Data e ora">
                <input className="input" type="datetime-local" defaultValue={c.starts_at ? toLocalInput(c.starts_at) : ''} onBlur={(e) => act(() => updateCelebration(c.id, { starts_at: e.target.value ? new Date(e.target.value).toISOString() : null }), 'Salvato.')} />
              </Field>
              <Field label="Stato" hint="Le bozze sono visibili solo a te.">
                <select className="select" value={c.status} onChange={(e) => act(() => updateCelebration(c.id, { status: e.target.value as CelebrationStatus }), 'Stato aggiornato.')}>
                  {(Object.keys(STATUS_LABEL) as CelebrationStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </Field>
            </div>
            <Field label={isRehearsal ? 'Indicazioni del direttore' : 'Note'}>
              <textarea className="textarea" defaultValue={c.notes ?? ''} maxLength={4000} onBlur={(e) => (e.target.value || null) !== c.notes && act(() => updateCelebration(c.id, { notes: e.target.value || null }), 'Note salvate.')} />
            </Field>
          </div>
        </section>
      )}
      {!canManage && c.notes && <Alert tone="info" title={isRehearsal ? 'Indicazioni del direttore' : 'Note'}>{c.notes}</Alert>}

      <section className="stack">
        <div className="row row--between">
          <h2>Scaletta</h2>
          {canManage && <Button icon="plus" onClick={() => setPicker(true)}>Aggiungi canto</Button>}
        </div>
        {songs.length === 0 ? (
          <EmptyState icon="music" title="Nessun canto in scaletta">{canManage ? 'Aggiungi i canti dalla biblioteca.' : 'Il direttore non ha ancora preparato la scaletta.'}</EmptyState>
        ) : (
          <ol className="list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {songs.map((s, i) => {
              const song = byId.get(s.song_id);
              return (
                <li key={s.id} className="list-row" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <span className="list-row__num">{i + 1}</span>
                  <div className="list-row__main" style={{ gap: 'var(--space-2)' }}>
                    {canManage ? (
                      <select className="select" style={{ minHeight: 36, maxWidth: 260 }} aria-label="Momento della celebrazione" value={s.moment_label ?? ''} onChange={(e) => act(() => updateCelebrationSong(s.id, { moment_label: e.target.value || null }))}>
                        <option value="">Momento…</option>
                        {MOMENTS.map((m) => <option key={m}>{m}</option>)}
                      </select>
                    ) : s.moment_label ? <span className="section-title">{s.moment_label}</span> : null}
                    <Link to={`/canti/${s.song_id}`} className="list-row__title">{song ? `${song.number ? song.number + ' · ' : ''}${song.title}` : 'Canto non disponibile'}</Link>
                    {canManage ? (
                      <div className="row">
                        <input className="input" style={{ minHeight: 36, maxWidth: 140 }} aria-label="Tonalità suggerita" placeholder="Tonalità (es. G)" defaultValue={s.suggested_key ?? ''} onBlur={(e) => {
                          const v = e.target.value.trim() || null;
                          if (v !== s.suggested_key) void act(() => updateCelebrationSong(s.id, { suggested_key: v }));
                        }} />
                        <input className="input grow" style={{ minHeight: 36 }} aria-label="Note sul canto" placeholder="Note (strofe da cantare, attacco…)" defaultValue={s.notes ?? ''} onBlur={(e) => {
                          const v = e.target.value.trim() || null;
                          if (v !== s.notes) void act(() => updateCelebrationSong(s.id, { notes: v }));
                        }} />
                      </div>
                    ) : (
                      (s.suggested_key || s.notes) && <span className="list-row__meta">{[s.suggested_key && `Tonalità ${s.suggested_key}`, s.notes].filter(Boolean).join(' · ')}</span>
                    )}
                  </div>
                  {canManage && (
                    <div className="list-row__end">
                      <Button size="sm" variant="ghost" iconOnly icon="chevronUp" disabled={i === 0} onClick={() => move(i, -1)}>Sposta su</Button>
                      <Button size="sm" variant="ghost" iconOnly icon="chevronDown" disabled={i === songs.length - 1} onClick={() => move(i, 1)}>Sposta giù</Button>
                      <Button size="sm" variant="ghost" iconOnly icon="trash" onClick={() => act(() => removeCelebrationSong(s.id), 'Canto rimosso.')}>Rimuovi</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {isRehearsal && (
        <section className="stack">
          <h2>Note della prova</h2>
          {notes.length === 0 && <p className="muted small">Nessuna nota. Le note personali sono visibili solo a te; quelle del direttore a tutti.</p>}
          <ul role="list" className="stack-sm">
            {notes.map((n) => (
              <li key={n.id} className="panel" style={{ padding: 'var(--space-3) var(--space-4)' }}>
                <div className="row row--between">
                  <span className={`badge ${n.is_shared ? 'badge--accent' : ''}`}>{n.is_shared ? 'Indicazione del direttore' : 'Nota personale'}</span>
                  {(n.author_id === user?.id || canManage) && <Button size="sm" variant="ghost" iconOnly icon="trash" onClick={() => act(() => deleteNote(n.id))}>Elimina nota</Button>}
                </div>
                <p style={{ whiteSpace: 'pre-wrap', marginTop: 'var(--space-2)' }}>{n.body}</p>
              </li>
            ))}
          </ul>
          <form className="stack-sm" onSubmit={(e) => { e.preventDefault(); void act(async () => { await addNote(c.id, noteText, noteShared && canManage); setNoteText(''); }, 'Nota aggiunta.'); }}>
            <Field label="Nuova nota">
              <textarea className="textarea" maxLength={4000} value={noteText} onChange={(e) => setNoteText(e.target.value)} style={{ minHeight: 80 }} />
            </Field>
            <div className="row row--between">
              {canManage ? (
                <label className="checkbox"><input type="checkbox" checked={noteShared} onChange={(e) => setNoteShared(e.target.checked)} /> Condividi con il coro</label>
              ) : <span />}
              <Button type="submit" variant="primary" disabled={!noteText.trim()} loading={busy}>Aggiungi nota</Button>
            </div>
          </form>
          <div className="panel"><div className="panel__body"><Metronome /></div></div>
        </section>
      )}

      {canManage && (
        <section className="row row--end">
          <Button variant="danger-soft" icon="trash" onClick={() => setConfirmDelete(true)}>Elimina</Button>
        </section>
      )}

      <SongPicker open={picker} onClose={() => setPicker(false)} onPick={(id) => {
        setPicker(false);
        void act(() => addCelebrationSong(c.id, id, songs.length), 'Canto aggiunto.');
      }} />
      <ConfirmDialog open={confirmDelete} title="Eliminare la scaletta?" message="La scaletta e le relative note verranno eliminate definitivamente." confirmLabel="Elimina" destructive busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => act(async () => { await deleteCelebration(c.id); navigate(base); }, 'Eliminata.')} />
    </div>
  );
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
