import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../app/ToastProvider';
import { useLibrary } from '../../app/LibraryProvider';
import {
  deleteArrangement, duplicateArrangement, fetchArrangement, fetchArrangementVersions, saveArrangement, setArrangementSharing,
  type Arrangement, type ArrangementVersion,
} from '../../data/personal';
import { fetchSongRemote } from '../../data/library';
import { queueArrangementSave } from '../../data/outbox';
import { diffContent } from '../../domain/diff';
import { isValidContent, type SongContent } from '../../domain/song';
import { friendlyError } from '../../lib/errors';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Alert, EmptyState, Spinner } from '../../components/ui/Feedback';
import { DiffView } from '../../components/ui/DiffView';
import { ContentEditor } from '../editor/ContentEditor';
import { readDraft, useEditor } from '../editor/useEditor';

export default function ArrangementEditorPage() {
  const { arrangementId } = useParams();
  const [a, setA] = useState<Arrangement | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!arrangementId) return;
    fetchArrangement(arrangementId).then(setA).catch((e) => setError(friendlyError(e)));
  }, [arrangementId]);
  if (error) return <EmptyState icon="layers" title="Versione non disponibile" action={<ButtonLink to="/versioni">Le mie versioni</ButtonLink>}>{error}</EmptyState>;
  if (!a) return <Spinner />;
  return <Editor key={a.id} initial={a} />;
}

function Editor({ initial }: { initial: Arrangement }) {
  const toast = useToast();
  const navigate = useNavigate();
  const { byId } = useLibrary();
  const draftKey = `jubilate.draft.arrangement.${initial.id}`;
  const editor = useEditor(initial.content, draftKey);
  const [meta, setMeta] = useState({ name: initial.name, display_key: initial.display_key, capo: initial.capo });
  const [version, setVersion] = useState(initial.version);
  const [shareToken, setShareToken] = useState(initial.share_token);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<Arrangement | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<ArrangementVersion[]>([]);
  const [compare, setCompare] = useState<{ title: string; before: SongContent; after: SongContent } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draftOffer, setDraftOffer] = useState(() => {
    const d = readDraft(draftKey);
    return d && JSON.stringify(d.content) !== JSON.stringify(initial.content) ? d : null;
  });
  const song = byId.get(initial.song_id);
  const [savedMeta, setSavedMeta] = useState({ name: initial.name, display_key: initial.display_key, capo: initial.capo });
  const metaDirty = meta.name !== savedMeta.name || meta.display_key !== savedMeta.display_key || meta.capo !== savedMeta.capo;

  const save = useCallback(async (asDraft = false) => {
    if (!isValidContent(editor.content)) return toast.error('Correggi gli errori prima di salvare.');
    if (!meta.name.trim()) return toast.error('Assegna un nome alla versione.');
    setSaving(true);
    const payload = { id: initial.id, name: meta.name.trim(), content: editor.content, display_key: meta.display_key, capo: meta.capo };
    try {
      if (!navigator.onLine) {
        await queueArrangementSave(payload, version);
        setSavedMeta({ name: payload.name, display_key: payload.display_key, capo: payload.capo });
        editor.markSaved(editor.content);
        toast.success('Sei offline: modifiche salvate sul dispositivo, verranno sincronizzate al ritorno della connessione.');
        return;
      }
      const r = await saveArrangement({ ...payload, version, is_draft: asDraft });
      if (r.status === 'conflict') {
        setConflict(r.server);
        return;
      }
      setVersion(r.version);
      setSavedMeta({ name: payload.name, display_key: payload.display_key, capo: payload.capo });
      editor.markSaved(editor.content);
      toast.success(asDraft ? 'Bozza salvata.' : 'Versione salvata.');
    } catch (err) {
      // Changes stay in the editor and in the local draft.
      toast.error(`${friendlyError(err)} Le modifiche non sono andate perse.`);
    } finally {
      setSaving(false);
    }
  }, [editor, meta, initial.id, version, toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const openHistory = async () => {
    setHistoryOpen(true);
    try {
      setVersions(await fetchArrangementVersions(initial.id));
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  const compareWithOfficial = async () => {
    try {
      const official = await fetchSongRemote(initial.song_id);
      setCompare({ title: 'Confronto con la versione ufficiale attuale', before: official.content, after: editor.content });
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  return (
    <div className="container stack-lg">
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header__text">
          <Link to="/versioni" className="small">← Le mie versioni</Link>
          <h1>{meta.name || 'Versione senza nome'}</h1>
          <p>{song ? <>Basata su <Link to={`/canti/${song.id}`}>{song.number ? `${song.number} · ` : ''}{song.title}</Link></> : 'Versione personale'}{' · '}{editor.dirty || metaDirty ? 'Modifiche non salvate' : 'Tutto salvato'}</p>
        </div>
        <div className="row">
          <ButtonLink to={`/canti/${initial.song_id}?versione=${initial.id}`} icon="eye">Leggi</ButtonLink>
          <Button onClick={() => void save(true)} loading={saving}>Salva bozza</Button>
          <Button variant="primary" icon="check" onClick={() => void save(false)} loading={saving} disabled={!editor.dirty && !metaDirty}>Salva</Button>
        </div>
      </header>

      {draftOffer && (
        <Alert tone="warning" title="Hai modifiche non salvate">
          Abbiamo trovato una bozza locale del {new Date(draftOffer.at).toLocaleString('it-IT')}.
          <div className="row" style={{ marginTop: 'var(--space-2)' }}>
            <Button size="sm" variant="primary" onClick={() => { editor.set(draftOffer.content); setDraftOffer(null); }}>Recupera</Button>
            <Button size="sm" onClick={() => { localStorage.removeItem(draftKey); setDraftOffer(null); }}>Scarta</Button>
          </div>
        </Alert>
      )}

      <section className="panel">
        <div className="panel__body">
          <div className="form-row">
            <Field label="Nome della versione">
              <input className="input" maxLength={120} value={meta.name} onChange={(e) => setMeta({ ...meta, name: e.target.value })} />
            </Field>
            <Field label="Capotasto predefinito">
              <select className="select" value={meta.capo} onChange={(e) => setMeta({ ...meta, capo: Number(e.target.value) })}>
                {Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{i === 0 ? 'Nessuno' : `${i}° tasto`}</option>)}
              </select>
            </Field>
          </div>
        </div>
      </section>

      <ContentEditor content={editor.content} onChange={editor.set} undo={editor.undo} redo={editor.redo} canUndo={editor.canUndo} canRedo={editor.canRedo} />

      <section className="stack-sm">
        <h2 className="section-title">Gestione</h2>
        <div className="row">
          <Button icon="history" onClick={openHistory}>Storico versioni</Button>
          <Button icon="layers" onClick={compareWithOfficial}>Confronta con l’ufficiale</Button>
          <Button icon="copy" onClick={async () => {
            try {
              const id = await duplicateArrangement(initial.id);
              toast.success('Versione duplicata.');
              navigate(`/versioni/${id}`);
            } catch (err) { toast.error(friendlyError(err)); }
          }}>Duplica</Button>
          <Button icon="link" onClick={async () => {
            try {
              const token = await setArrangementSharing(initial.id, !shareToken);
              setShareToken(token);
              if (token) {
                const url = `${window.location.origin}/condivisi/versione/${token}`;
                await navigator.clipboard?.writeText(url).catch(() => undefined);
                toast.success('Collegamento di condivisione copiato. È visibile solo agli utenti registrati che lo ricevono.');
              } else toast.success('Condivisione disattivata.');
            } catch (err) { toast.error(friendlyError(err)); }
          }}>{shareToken ? 'Disattiva condivisione' : 'Condividi con un collegamento'}</Button>
          <ButtonLink to={`/proposte/nuova?tipo=arrangement&canto=${initial.song_id}&versione=${initial.id}`} icon="send">Proponi come ufficiale</ButtonLink>
          <ButtonLink to={`/spartiti/nuovo?canto=${initial.song_id}&versione=${initial.id}`} icon="music">Spartito personale</ButtonLink>
          <Button variant="danger-soft" icon="trash" onClick={() => setConfirmDelete(true)}>Elimina</Button>
        </div>
        {shareToken && <p className="small muted">Collegamento attivo: <code style={{ wordBreak: 'break-all' }}>{`${window.location.origin}/condivisi/versione/${shareToken}`}</code></p>}
      </section>

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} title="Storico delle versioni" wide>
        {versions.length === 0 ? <p className="muted">Nessuna versione precedente: lo storico si crea a ogni salvataggio.</p> : (
          <ul role="list" className="list">
            {versions.map((v) => (
              <li key={v.id} className="list-row">
                <span className="list-row__main">
                  <span className="list-row__title">Versione {v.version} — {v.name}</span>
                  <span className="list-row__meta">{new Date(v.created_at).toLocaleString('it-IT')}</span>
                </span>
                <span className="list-row__end">
                  <Button size="sm" onClick={() => setCompare({ title: `Versione ${v.version} → attuale`, before: v.content, after: editor.content })}>Confronta</Button>
                  <Button size="sm" onClick={() => { editor.set(v.content); setMeta({ ...meta, name: v.name, display_key: v.display_key, capo: v.capo }); setHistoryOpen(false); toast.success(`Versione ${v.version} caricata nell’editor: salva per ripristinarla.`); }}>Ripristina</Button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      <Dialog open={Boolean(compare)} onClose={() => setCompare(null)} title={compare?.title ?? ''} wide>
        {compare && <DiffView ops={diffContent(compare.before, compare.after)} />}
      </Dialog>

      <Dialog open={Boolean(conflict)} onClose={() => setConflict(null)} title="Versione modificata altrove" wide
        footer={<>
          <Button onClick={() => { if (conflict) { editor.markSaved(conflict.content); setVersion(conflict.version); setMeta({ name: conflict.name, display_key: conflict.display_key, capo: conflict.capo }); } setConflict(null); }}>Usa la versione salvata</Button>
          <Button variant="primary" onClick={async () => {
            if (!conflict) return;
            setVersion(conflict.version);
            setConflict(null);
            const r = await saveArrangement({ id: initial.id, name: meta.name, content: editor.content, display_key: meta.display_key, capo: meta.capo, version: conflict.version });
            if (r.status === 'saved') { setVersion(r.version); editor.markSaved(editor.content); toast.success('Le tue modifiche hanno sostituito quelle salvate (che restano nello storico).'); }
          }}>Mantieni le mie modifiche</Button>
        </>}>
        <p className="muted small">Questa versione è stata salvata da un altro dispositivo dopo che l’hai aperta. Ecco le differenze tra la versione salvata e le tue modifiche:</p>
        {conflict && <DiffView ops={diffContent(conflict.content, editor.content)} beforeLabel="Salvata" afterLabel="Le tue modifiche" />}
      </Dialog>

      <ConfirmDialog open={confirmDelete} title="Eliminare questa versione?" message="La versione personale e il suo storico verranno eliminati. La versione ufficiale del canto non viene toccata." confirmLabel="Elimina" destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          try { await deleteArrangement(initial.id); localStorage.removeItem(draftKey); toast.success('Versione eliminata.'); navigate('/versioni'); }
          catch (err) { toast.error(friendlyError(err)); }
        }} />
    </div>
  );
}
