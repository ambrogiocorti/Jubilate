import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useLibrary } from '../../app/LibraryProvider';
import { useToast } from '../../app/ToastProvider';
import { fetchAllScores, updateScoreMeta, deleteScore, INSTRUMENT_LABEL, type MusicScore } from '../../data/scores';
import {
  audioDuration, createMediaAsset, deleteMediaAsset, fetchAllMedia, signedUrl, updateMediaAsset, uploadMediaFile, validateUpload, youtubeId,
  type MediaAsset, type MediaStatus,
} from '../../data/media';
import type { RightsStatus } from '../../data/types';
import { friendlyError } from '../../lib/errors';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Alert, EmptyState, ListSkeleton } from '../../components/ui/Feedback';
import { SongPicker } from '../../components/ui/SongPicker';
import { AudioPlayer } from '../media/AudioPlayer';
import { RIGHTS_LABEL } from './AdminSongs';

export function AdminScores() {
  const { byId } = useLibrary();
  const toast = useToast();
  const [scores, setScores] = useState<MusicScore[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPersonal, setShowPersonal] = useState(false);
  const [toDelete, setToDelete] = useState<MusicScore | null>(null);
  const load = () => fetchAllScores().then(setScores).catch((e) => setError(friendlyError(e)));
  useEffect(() => { void load(); }, []);
  const shown = scores?.filter((s) => showPersonal || s.owner_id === null) ?? [];
  return (
    <div className="stack">
      <div className="row row--between">
        <h2>Spartiti</h2>
        <ButtonLink to="/spartiti/nuovo" variant="primary" icon="plus">Nuovo spartito ufficiale</ButtonLink>
      </div>
      <label className="row small"><input type="checkbox" checked={showPersonal} onChange={(e) => setShowPersonal(e.target.checked)} /> Mostra anche gli spartiti personali degli utenti</label>
      {error && <Alert tone="danger">{error}</Alert>}
      {!scores ? <ListSkeleton /> : shown.length === 0 ? <EmptyState icon="music" title="Nessuno spartito">Crea uno spartito o importa un file MusicXML.</EmptyState> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Titolo</th><th>Canto</th><th>Strumento</th><th>Tipo</th><th>Stato</th><th><span className="visually-hidden">Azioni</span></th></tr></thead>
            <tbody>
              {shown.map((s) => {
                const song = s.song_id ? byId.get(s.song_id) : undefined;
                return (
                  <tr key={s.id}>
                    <td><Link to={`/spartiti/${s.id}`}>{s.title}</Link></td>
                    <td className="small">{song ? `${song.number ? song.number + '. ' : ''}${song.title}` : '—'}</td>
                    <td className="small">{INSTRUMENT_LABEL[s.instrument]}</td>
                    <td className="small">{s.owner_id ? 'Personale' : 'Ufficiale'}</td>
                    <td className="small">{s.status === 'published' ? 'Pubblicato' : s.status === 'draft' ? 'Bozza' : 'Archiviato'}{!s.current_version_id && ' · vuoto'}</td>
                    <td>
                      {!s.owner_id && (
                        <div className="row row--end" style={{ gap: 'var(--space-1)' }}>
                          <Button size="sm" onClick={async () => {
                            try { await updateScoreMeta(s.id, { status: s.status === 'published' ? 'archived' : 'published' }); void load(); }
                            catch (e) { toast.error(friendlyError(e)); }
                          }}>{s.status === 'published' ? 'Archivia' : 'Pubblica'}</Button>
                          <Button size="sm" variant="ghost" icon="trash" iconOnly onClick={() => setToDelete(s)}>Elimina {s.title}</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog open={!!toDelete} title="Eliminare lo spartito?" message="Lo spartito e la sua cronologia saranno eliminati definitivamente." confirmLabel="Elimina" destructive
        onCancel={() => setToDelete(null)}
        onConfirm={async () => { if (!toDelete) return; try { await deleteScore(toDelete.id); setToDelete(null); void load(); } catch (e) { toast.error(friendlyError(e)); } }} />
    </div>
  );
}

const MEDIA_STATUS: Record<MediaStatus, [string, string]> = {
  pending: ['In attesa', 'badge--warning'], published: ['Pubblicata', 'badge--success'], rejected: ['Rifiutata', 'badge--danger'], archived: ['Archiviata', ''],
};

export function AdminRecordings() {
  const { byId } = useLibrary();
  const { user } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState<MediaStatus | 'all'>('pending');
  const [items, setItems] = useState<MediaAsset[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [toDelete, setToDelete] = useState<MediaAsset | null>(null);
  const load = () => { setItems(null); fetchAllMedia(filter === 'all' ? undefined : filter).then(setItems).catch((e) => setError(friendlyError(e))); };
  useEffect(load, [filter]);
  const setStatus = async (m: MediaAsset, status: MediaStatus) => {
    try { await updateMediaAsset(m.id, { status }); load(); } catch (e) { toast.error(friendlyError(e)); }
  };
  return (
    <div className="stack">
      <div className="row row--between">
        <h2>Registrazioni e allegati</h2>
        <div className="row">
          <select className="select" style={{ width: 'auto' }} aria-label="Filtro" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="pending">In attesa</option><option value="published">Pubblicate</option><option value="rejected">Rifiutate</option><option value="archived">Archiviate</option><option value="all">Tutte</option>
          </select>
          <Button variant="primary" icon="plus" onClick={() => setAddOpen(true)}>Aggiungi</Button>
        </div>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {!items ? <ListSkeleton /> : items.length === 0 ? <EmptyState icon="mic" title="Nessun elemento">Nessuna registrazione in questo stato.</EmptyState> : (
        <ul role="list" className="list">
          {items.map((m) => {
            const song = m.song_id ? byId.get(m.song_id) : undefined;
            return (
              <li key={m.id} className="list-row stack-sm">
                <div className="row row--between">
                  <div>
                    <strong>{m.title}</strong> <span className={`badge ${MEDIA_STATUS[m.status][1]}`}>{MEDIA_STATUS[m.status][0]}</span>
                    <p className="small muted">{m.kind === 'youtube' ? 'YouTube' : m.kind.toUpperCase()}{song ? ` · ${song.title}` : ''}{m.performer ? ` · ${m.performer}` : ''} · diritti: {RIGHTS_LABEL[m.rights]}</p>
                  </div>
                  <div className="row" style={{ gap: 'var(--space-1)' }}>
                    {m.status !== 'published' && <Button size="sm" onClick={() => void setStatus(m, 'published')}>Pubblica</Button>}
                    {m.status === 'pending' && <Button size="sm" variant="danger-soft" onClick={() => void setStatus(m, 'rejected')}>Rifiuta</Button>}
                    {m.status === 'published' && <Button size="sm" onClick={() => void setStatus(m, 'archived')}>Archivia</Button>}
                    <Button size="sm" variant="ghost" icon="trash" iconOnly onClick={() => setToDelete(m)}>Elimina {m.title}</Button>
                  </div>
                </div>
                {m.kind === 'audio' && m.storage_path && <AudioPlayer title={m.title} resolveSrc={() => signedUrl(m.storage_path!)} />}
                {m.kind === 'youtube' && m.external_url && <a className="small" href={m.external_url} target="_blank" rel="noopener noreferrer">Apri su YouTube</a>}
              </li>
            );
          })}
        </ul>
      )}
      {user && <AddMediaDialog open={addOpen} onClose={() => setAddOpen(false)} userId={user.id} onAdded={() => { setAddOpen(false); setFilter('published'); load(); }} />}
      <ConfirmDialog open={!!toDelete} title="Eliminare l'elemento?" message="Il file e i suoi dati saranno eliminati definitivamente." confirmLabel="Elimina" destructive
        onCancel={() => setToDelete(null)}
        onConfirm={async () => { if (!toDelete) return; try { await deleteMediaAsset(toDelete); setToDelete(null); load(); } catch (e) { toast.error(friendlyError(e)); } }} />
    </div>
  );
}

function AddMediaDialog({ open, onClose, userId, onAdded }: { open: boolean; onClose: () => void; userId: string; onAdded: () => void }) {
  const toast = useToast();
  const { byId } = useLibrary();
  const [kind, setKind] = useState<'audio' | 'youtube' | 'pdf'>('audio');
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [performer, setPerformer] = useState('');
  const [rights, setRights] = useState<RightsStatus>('own_work');
  const [songId, setSongId] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const song = songId ? byId.get(songId) : undefined;
  const submit = async () => {
    if (!title.trim()) return toast.error('Inserisci un titolo.');
    setBusy(true);
    try {
      if (kind === 'youtube') {
        if (!youtubeId(url)) throw new Error('Link YouTube non valido.');
        await createMediaAsset({ kind, title: title.trim(), song_id: songId, external_url: url.trim(), performer: performer || null, rights, status: 'published' });
      } else {
        if (!file) throw new Error('Scegli un file.');
        const bad = validateUpload(file, kind);
        if (bad) throw new Error(bad);
        const path = await uploadMediaFile(file, userId);
        await createMediaAsset({
          kind, title: title.trim(), song_id: songId, storage_path: path, mime_type: file.type, size_bytes: file.size,
          duration_seconds: kind === 'audio' ? await audioDuration(file) : null, performer: performer || null, rights, status: 'published',
        });
      }
      toast.success('Elemento aggiunto.');
      onAdded();
    } catch (e) {
      toast.error(e instanceof Error && !('code' in e) ? e.message : friendlyError(e));
    } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Aggiungi registrazione o allegato"
      footer={<><Button onClick={onClose}>Annulla</Button><Button variant="primary" loading={busy} onClick={submit}>Aggiungi</Button></>}>
      <div className="stack">
        <Field label="Tipo">
          <select className="select" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="audio">File audio</option><option value="youtube">Video YouTube (incorporato)</option><option value="pdf">PDF</option>
          </select>
        </Field>
        {kind === 'youtube'
          ? <Field label="Link YouTube"><input className="input" type="url" value={url} onChange={(e) => setUrl(e.target.value)} /></Field>
          : <Field label="File" hint="Al massimo 50 MB."><input className="input" type="file" accept={kind === 'audio' ? 'audio/*' : 'application/pdf'} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>}
        <Field label="Titolo"><input className="input" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} /></Field>
        <Field label="Esecutori (facoltativo)"><input className="input" maxLength={200} value={performer} onChange={(e) => setPerformer(e.target.value)} /></Field>
        <Field label="Diritti">
          <select className="select" value={rights} onChange={(e) => setRights(e.target.value as RightsStatus)}>
            {(Object.keys(RIGHTS_LABEL) as RightsStatus[]).map((r) => <option key={r} value={r}>{RIGHTS_LABEL[r]}</option>)}
          </select>
        </Field>
        <div className="row"><span className="small">Canto: {song ? song.title : 'nessuno'}</span><Button size="sm" onClick={() => setPicker(true)}>Scegli</Button></div>
      </div>
      <SongPicker open={picker} onClose={() => setPicker(false)} onPick={(id) => { setSongId(id); setPicker(false); }} />
    </Dialog>
  );
}
