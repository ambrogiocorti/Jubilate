import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { useToast } from '../../app/ToastProvider';
import { listAllSongs, restoreRevision, saveSong, setSongDeleted, type SongMetaInput } from '../../data/admin';
import { fetchRevisionContent, fetchRevisions, fetchSongRemote } from '../../data/library';
import type { RevisionRow, RightsStatus, SongRow } from '../../data/types';
import { diffContent } from '../../domain/diff';
import { emptyContent, isValidContent, plainText, type SongContent } from '../../domain/song';
import { findDuplicates, importPlainText } from '../../domain/textImport';
import { normalizeQuery as normalizeSearch } from '../../domain/search';
import { friendlyError } from '../../lib/errors';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Alert, EmptyState, ListSkeleton, Spinner } from '../../components/ui/Feedback';
import { DiffView } from '../../components/ui/DiffView';
import { ContentEditor } from '../editor/ContentEditor';
import { useEditor } from '../editor/useEditor';
import { MetadataForm, metaFromSong, type SongMeta } from '../contributions/MetadataForm';
import { extractText, type ExtractProgress } from './ocr';

const STATUS_LABEL: Record<string, [string, string]> = {
  draft: ['Bozza', 'badge--warning'],
  published: ['Pubblicato', 'badge--success'],
  archived: ['Archiviato', ''],
};
export const RIGHTS_LABEL: Record<RightsStatus, string> = {
  unknown: 'Da verificare',
  public_domain: 'Pubblico dominio',
  own_work: 'Opera propria',
  permission_granted: 'Autorizzazione ottenuta',
  licensed: 'Licenza',
};

export function AdminSongList() {
  const [songs, setSongs] = useState<SongRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'draft' | 'published' | 'archived' | 'deleted'>('all');
  useEffect(() => { listAllSongs().then(setSongs).catch((e) => setError(friendlyError(e))); }, []);
  const shown = useMemo(() => {
    if (!songs) return [];
    const nq = normalizeSearch(q);
    return songs.filter((s) => {
      if (filter === 'deleted' ? !s.deleted_at : s.deleted_at) return false;
      if (filter !== 'all' && filter !== 'deleted' && s.status !== filter) return false;
      if (!nq) return true;
      return String(s.number ?? '') === nq || normalizeSearch(`${s.title} ${s.alt_titles.join(' ')} ${s.author ?? ''} ${s.first_line}`).includes(nq);
    });
  }, [songs, q, filter]);
  const missingNumbers = useMemo(() => {
    if (!songs) return [];
    const nums = new Set(songs.filter((s) => !s.deleted_at && s.number).map((s) => s.number!));
    const max = Math.max(0, ...nums);
    const out: number[] = [];
    for (let i = 1; i <= Math.min(max, 400); i++) if (!nums.has(i)) out.push(i);
    return out;
  }, [songs]);

  return (
    <div className="stack">
      <div className="row row--between">
        <h2>Canti</h2>
        <div className="row">
          <ButtonLink to="/admin/canti/nuovo?importa=1" icon="upload">Importa da testo, PDF o immagine</ButtonLink>
          <ButtonLink to="/admin/canti/nuovo" variant="primary" icon="plus">Nuovo canto</ButtonLink>
        </div>
      </div>
      <div className="row">
        <input className="input grow" type="search" placeholder="Numero, titolo, autore, prima riga…" aria-label="Cerca canti" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="select" aria-label="Filtro" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} style={{ width: 'auto' }}>
          <option value="all">Tutti</option>
          <option value="published">Pubblicati</option>
          <option value="draft">Bozze</option>
          <option value="archived">Archiviati</option>
          <option value="deleted">Eliminati</option>
        </select>
      </div>
      {missingNumbers.length > 0 && missingNumbers.length < 300 && (
        <p className="small muted">Numeri del libretto ancora da digitalizzare: {missingNumbers.slice(0, 40).join(', ')}{missingNumbers.length > 40 ? ` e altri ${missingNumbers.length - 40}` : ''}.</p>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      {!songs ? <ListSkeleton /> : shown.length === 0 ? <EmptyState icon="music" title="Nessun canto">Nessun canto corrisponde ai filtri.</EmptyState> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>N.</th><th>Titolo</th><th>Stato</th><th>Diritti testo</th><th>Aggiornato</th></tr></thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontVariantNumeric: 'tabular-nums' }}>{s.number ?? '—'}</td>
                  <td><Link to={`/admin/canti/${s.id}`}>{s.title}</Link>{!s.current_revision_id && <span className="small muted"> · senza testo</span>}</td>
                  <td>{s.deleted_at ? <span className="badge badge--danger">Eliminato</span> : <span className={`badge ${STATUS_LABEL[s.status]?.[1] ?? ''}`}>{STATUS_LABEL[s.status]?.[0]}</span>}</td>
                  <td className="small">{RIGHTS_LABEL[s.text_rights]}</td>
                  <td className="small muted">{new Date(s.updated_at).toLocaleDateString('it-IT')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface FullMeta extends SongMeta {
  status: 'draft' | 'published' | 'archived';
  text_source: string | null;
  text_rights: RightsStatus;
  text_rights_note: string | null;
}

export function AdminSongEditor() {
  const { songId } = useParams();
  const isNew = !songId || songId === 'nuovo';
  const [state, setState] = useState<{ song: SongRow | null; content: SongContent; categories: string[] } | null>(isNew ? { song: null, content: emptyContent(), categories: [] } : null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (isNew) return;
    fetchSongRemote(songId!)
      .then((d) => setState({ song: d.song, content: d.content.sections.length ? d.content : emptyContent(), categories: d.categories }))
      .catch((e) => setError(friendlyError(e)));
  }, [songId, isNew]);
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!state) return <Spinner />;
  return <SongEditor key={state.song?.id ?? 'new'} song={state.song} initialContent={state.content} initialCategories={state.categories} />;
}

function SongEditor({ song, initialContent, initialCategories }: { song: SongRow | null; initialContent: SongContent; initialCategories: string[] }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { categories, entries, refresh } = useLibrary();
  const editor = useEditor(initialContent, `jubilate.draft.admin-song.${song?.id ?? 'new'}`);
  const [meta, setMeta] = useState<FullMeta>(() => ({
    ...(song ? metaFromSong(song as unknown as Record<string, unknown>) : { title: '' }),
    status: song?.status ?? 'draft',
    text_source: song?.text_source ?? null,
    text_rights: song?.text_rights ?? 'unknown',
    text_rights_note: song?.text_rights_note ?? null,
  }));
  const [categoryIds, setCategoryIds] = useState<string[]>(initialCategories);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(() => !song && new URLSearchParams(location.search).has('importa'));
  const [revisions, setRevisions] = useState<RevisionRow[] | null>(null);
  const [compare, setCompare] = useState<{ rev: RevisionRow; content: SongContent } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [allSongs, setAllSongs] = useState<SongRow[]>([]);

  useEffect(() => {
    if (song) fetchRevisions(song.id).then(setRevisions).catch(() => setRevisions([]));
    listAllSongs().then(setAllSongs).catch(() => setAllSongs(entries));
  }, [song, entries]);

  const duplicates = useMemo(() => {
    if (!meta.title?.trim()) return [];
    const others = allSongs.filter((s) => s.id !== song?.id && !s.deleted_at);
    const firstLine = editor.content.sections[0]?.lines.find((l) => l.trim()) ?? '';
    return findDuplicates({ number: meta.number ?? null, title: meta.title, firstLine }, others).slice(0, 5);
  }, [meta.number, meta.title, editor.content, allSongs, song]);

  const save = async () => {
    if (!meta.title?.trim()) return toast.error('Il titolo è obbligatorio.');
    const hasText = plainText(editor.content).trim().length > 0;
    if (hasText && !isValidContent(editor.content)) return toast.error('Correggi gli errori nel testo prima di salvare.');
    if (meta.status === 'published' && !hasText) return toast.error('Non è possibile pubblicare un canto senza testo.');
    if (meta.status === 'published' && meta.text_rights === 'unknown') return toast.error('Prima di pubblicare indica i diritti del testo (fonte e autorizzazione).');
    setBusy(true);
    try {
      const contentChanged = JSON.stringify(editor.content) !== JSON.stringify(initialContent);
      const payload: SongMetaInput = {
        number: meta.number ?? null, title: meta.title.trim(), alt_titles: meta.alt_titles ?? [], author: meta.author ?? null, composer: meta.composer ?? null,
        original_key: meta.original_key ?? null, time_signature: meta.time_signature ?? null, tempo_bpm: meta.tempo_bpm ?? null, status: meta.status,
        text_source: meta.text_source, text_rights: meta.text_rights, text_rights_note: meta.text_rights_note,
      };
      const id = await saveSong(song?.id ?? null, payload, hasText && (contentChanged || !song) ? editor.content : null, note.trim() || null, categoryIds);
      editor.markSaved(editor.content);
      toast.success(song ? 'Canto aggiornato.' : 'Canto creato.');
      void refresh();
      if (!song) navigate(`/admin/canti/${id}`, { replace: true });
      else {
        setNote('');
        setRevisions(await fetchRevisions(song.id));
      }
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack-lg">
      <div className="row row--between">
        <div>
          <Link to="/admin/canti" className="small">← Tutti i canti</Link>
          <h2>{song ? `${song.number ? song.number + '. ' : ''}${song.title}` : 'Nuovo canto'}</h2>
          {song?.deleted_at && <span className="badge badge--danger">Eliminato</span>}
        </div>
        <div className="row">
          <Button icon="upload" onClick={() => setImportOpen(true)}>Importa testo</Button>
          {song && !song.deleted_at && song.status === 'published' && <ButtonLink to={`/canti/${song.id}`} variant="ghost" icon="eye">Vedi</ButtonLink>}
        </div>
      </div>

      {duplicates.length > 0 && (
        <Alert tone="warning" title="Possibili duplicati">
          <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
            {duplicates.map((d) => (
              <li key={d.item.id}>
                <Link to={`/admin/canti/${d.item.id}`}>{d.item.number ? `${d.item.number}. ` : ''}{d.item.title}</Link>{' '}
                ({d.reason === 'number' ? 'stesso numero' : d.reason === 'title' ? `titolo simile al ${Math.round(d.score * 100)}%` : 'prima riga simile'})
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <section className="stack">
        <h3>Informazioni</h3>
        <MetadataForm value={meta} onChange={(m) => setMeta({ ...meta, ...m })} categories={categories.filter((c) => !c.archived_at)} categoryIds={categoryIds} onCategories={setCategoryIds} />
        <div className="form-row">
          <Field label="Stato">
            <select className="select" value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value as FullMeta['status'] })}>
              <option value="draft">Bozza (visibile solo agli amministratori)</option>
              <option value="published">Pubblicato</option>
              <option value="archived">Archiviato</option>
            </select>
          </Field>
          <Field label="Diritti del testo">
            <select className="select" value={meta.text_rights} onChange={(e) => setMeta({ ...meta, text_rights: e.target.value as RightsStatus })}>
              {(Object.keys(RIGHTS_LABEL) as RightsStatus[]).map((r) => <option key={r} value={r}>{RIGHTS_LABEL[r]}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Fonte del testo" hint="Es. «Libretto parrocchiale, ed. 2019, p. 34» o «Testo liturgico latino (pubblico dominio)».">
          <input className="input" maxLength={500} value={meta.text_source ?? ''} onChange={(e) => setMeta({ ...meta, text_source: e.target.value || null })} />
        </Field>
        <Field label="Note sui diritti (interne)">
          <input className="input" maxLength={1000} value={meta.text_rights_note ?? ''} onChange={(e) => setMeta({ ...meta, text_rights_note: e.target.value || null })} />
        </Field>
      </section>

      <section className="stack">
        <h3>Testo e accordi</h3>
        <ContentEditor content={editor.content} onChange={editor.set} undo={editor.undo} redo={editor.redo} canUndo={editor.canUndo} canRedo={editor.canRedo} />
      </section>

      <section className="panel panel__body">
        <Field label="Nota sulla modifica" hint="Resta nella cronologia delle revisioni.">
          <input className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Es. corretta la seconda strofa secondo il libretto" />
        </Field>
        <div className="row">
          <Button variant="primary" icon="check" loading={busy} onClick={save}>{song ? 'Salva (nuova revisione)' : 'Crea il canto'}</Button>
          {song && (
            song.deleted_at
              ? <Button onClick={async () => { await setSongDeleted(song.id, false); toast.success('Canto ripristinato.'); navigate(0); }}>Ripristina il canto</Button>
              : <Button variant="danger-soft" icon="trash" onClick={() => setConfirmDelete(true)}>Elimina</Button>
          )}
        </div>
      </section>

      {song && (
        <section className="stack-sm">
          <h3>Cronologia delle revisioni</h3>
          {!revisions ? <Spinner /> : revisions.length === 0 ? <p className="small muted">Nessuna revisione.</p> : (
            <ul role="list" className="list">
              {revisions.map((r) => (
                <li key={r.id} className="list-row row row--between">
                  <div>
                    <strong>Revisione {r.revision_number}</strong>
                    {r.id === song.current_revision_id && <span className="badge badge--accent" style={{ marginLeft: 8 }}>corrente</span>}
                    <p className="small muted">{new Date(r.created_at).toLocaleString('it-IT')}{r.note ? ` · ${r.note}` : ''}{r.contribution_id ? ' · da una proposta' : ''}{r.restored_from ? ' · ripristino' : ''}</p>
                  </div>
                  {r.id !== song.current_revision_id && (
                    <Button size="sm" onClick={async () => setCompare({ rev: r, content: await fetchRevisionContent(r.id) })}>Confronta</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Dialog open={!!compare} onClose={() => setCompare(null)} wide title={compare ? `Revisione ${compare.rev.revision_number} → attuale` : ''}
        footer={<>
          <Button onClick={() => setCompare(null)}>Chiudi</Button>
          <Button variant="primary" loading={busy} onClick={async () => {
            if (!compare) return;
            setBusy(true);
            try {
              await restoreRevision(compare.rev.id, `Ripristino della revisione ${compare.rev.revision_number}`);
              toast.success('Revisione ripristinata come nuova revisione.');
              navigate(0);
            } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(false); }
          }}>Ripristina questa revisione</Button>
        </>}>
        {compare && <DiffView ops={diffContent(compare.content, initialContent)} beforeLabel={`Revisione ${compare.rev.revision_number}`} afterLabel="Attuale" />}
      </Dialog>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} onImport={(content, title) => {
        editor.set(content);
        if (title && !meta.title) setMeta((m) => ({ ...m, title }));
        setImportOpen(false);
      }} />

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminare il canto?"
        message="Il canto non sarà più visibile. L'eliminazione è reversibile: potrai ripristinarlo dall'elenco «Eliminati»."
        confirmLabel="Elimina"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!song) return;
          try {
            await setSongDeleted(song.id, true);
            toast.success('Canto eliminato.');
            void refresh();
            navigate('/admin/canti');
          } catch (e) { toast.error(friendlyError(e)); }
        }}
      />
    </div>
  );
}

/** Import with mandatory manual review: file → extracted text → editable → structured preview. */
function ImportDialog({ open, onClose, onImport }: { open: boolean; onClose: () => void; onImport: (c: SongContent, title: string | null) => void }) {
  const [text, setText] = useState('');
  const [progress, setProgress] = useState<ExtractProgress | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const result = useMemo(() => (text.trim() ? importPlainText(text) : null), [text]);
  const guessedTitle = useMemo(() => {
    const first = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
    return first.length <= 80 ? first.replace(/^\d+[.)\s-]+/, '') : null;
  }, [text]);

  const onFile = async (file: File) => {
    setError(null);
    setMethod(null);
    try {
      const r = await extractText(file, setProgress);
      setText(r.text);
      setMethod(r.method === 'ocr' ? 'Testo riconosciuto con OCR: controlla con attenzione lettere accentate, apostrofi e a capo.' : 'Testo estratto dal PDF.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Estrazione non riuscita.');
    } finally {
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} wide title="Importa il testo di un canto"
      footer={<>
        <Button onClick={onClose}>Annulla</Button>
        <Button variant="primary" disabled={!result} onClick={() => result && onImport(result.content, guessedTitle)}>Usa questo testo</Button>
      </>}>
      <div className="stack">
        <Alert tone="info">Importa solo materiale di cui la parrocchia dispone dei diritti. Il risultato va sempre riletto: strofe, ritornelli e accordi possono richiedere correzioni manuali.</Alert>
        <Field label="File (PDF, immagine o testo)" hint="Il riconoscimento avviene nel browser: il file non viene caricato su server esterni. La prima volta l'OCR scarica circa 15 MB di dati.">
          <input className="input" type="file" accept="application/pdf,image/png,image/jpeg,image/webp,text/plain" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); e.target.value = ''; }} />
        </Field>
        {progress && (
          <div className="stack-sm" aria-live="polite">
            <span className="small">{progress.stage}</span>
            <progress max={1} value={progress.progress} style={{ width: '100%' }} />
          </div>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        {method && <p className="small muted">{method}</p>}
        <Field label="Testo da rivedere" hint="Separa le strofe con una riga vuota. «Rit.» identifica il ritornello. Le righe con soli accordi vengono agganciate alla riga successiva.">
          <textarea className="textarea textarea--mono" rows={14} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
        {result && (
          <div className="stack-sm">
            <span className="field__label">Struttura riconosciuta</span>
            <p className="small">
              {result.content.sections.length} sezioni: {result.content.sections.map((s) => (s.kind === 'chorus' ? 'ritornello' : s.kind === 'verse' ? 'strofa' : s.kind)).join(', ')} · ordine {result.content.sequence.join(' → ')}
              {(result.content.chords?.length ?? 0) > 0 && ` · ${result.content.chords!.length} accordi`}
            </p>
            {result.warnings.length > 0 && <Alert tone="warning">{result.warnings.join(' ')}</Alert>}
          </div>
        )}
      </div>
    </Dialog>
  );
}
