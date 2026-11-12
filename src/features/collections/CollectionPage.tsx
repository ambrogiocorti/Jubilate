import { env } from '../../lib/env';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useToast } from '../../app/ToastProvider';
import { useLibrary } from '../../app/LibraryProvider';
import {
  addToCollection, deleteCollection, duplicateCollection, fetchArrangements, fetchCollection, removeCollectionItem, reorderCollection,
  setCollectionSharing, updateCollection, updateCollectionItem, type Arrangement, type Collection, type CollectionItem, type CollectionKind,
} from '../../data/personal';
import { loadSong } from '../../data/library';
import { setPinned } from '../../lib/localdb';
import { friendlyError } from '../../lib/errors';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { EmptyState, Spinner } from '../../components/ui/Feedback';
import { SongPicker } from '../../components/ui/SongPicker';
import { COLLECTION_KIND_LABEL } from './CollectionsPage';

export default function CollectionPage() {
  const { collectionId } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const { byId } = useLibrary();
  const [collection, setCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<CollectionItem[]>([]);
  const [arrangements, setArrangements] = useState<Arrangement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!collectionId) return;
    try {
      const r = await fetchCollection(collectionId);
      setCollection(r.collection);
      setItems(r.items);
    } catch (err) {
      setError(friendlyError(err));
    }
  }, [collectionId]);

  useEffect(() => {
    void load();
    fetchArrangements().then(setArrangements).catch(() => undefined);
  }, [load]);

  if (error) return <EmptyState icon="folder" title="Raccolta non disponibile" action={<ButtonLink to="/raccolte">Le mie raccolte</ButtonLink>}>{error}</EmptyState>;
  if (!collection) return <Spinner />;

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
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setItems(next);
    void act(() => reorderCollection(next));
  };

  const downloadAll = () => act(async () => {
    for (const it of items) {
      await loadSong(it.song_id, { cacheChords: true });
      await setPinned(it.song_id, true);
    }
  }, 'Canti della raccolta disponibili offline.');

  const shareUrl = collection.share_token ? `${env.siteUrl}/condivisi/raccolta/${collection.share_token}` : null;

  return (
    <div className="container stack-lg">
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header__text">
          <Link to="/raccolte" className="small">← Raccolte</Link>
          <h1>{collection.title}</h1>
          <p>{items.length} canti · {COLLECTION_KIND_LABEL[collection.kind]}</p>
        </div>
        <div className="row">
          <ButtonLink to={`/stampa/raccolta/${collection.id}`} target="_blank" icon="printer">Esporta PDF</ButtonLink>
          <Button icon="plus" variant="primary" onClick={() => setPicker(true)}>Aggiungi canto</Button>
        </div>
      </header>

      <section className="panel">
        <div className="panel__body">
          <div className="form-row">
            <Field label="Nome">
              <input className="input" defaultValue={collection.title} maxLength={120} onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== collection.title && act(() => updateCollection(collection.id, { title: e.target.value.trim() }), 'Raccolta rinominata.')} />
            </Field>
            <Field label="Uso">
              <select className="select" value={collection.kind} onChange={(e) => act(() => updateCollection(collection.id, { kind: e.target.value as CollectionKind }))}>
                {(Object.keys(COLLECTION_KIND_LABEL) as CollectionKind[]).map((k) => <option key={k} value={k}>{COLLECTION_KIND_LABEL[k]}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Descrizione">
            <textarea className="textarea" style={{ minHeight: 70 }} maxLength={1000} defaultValue={collection.description ?? ''} onBlur={(e) => (e.target.value || null) !== collection.description && act(() => updateCollection(collection.id, { description: e.target.value || null }))} />
          </Field>
        </div>
      </section>

      {items.length === 0 ? (
        <EmptyState icon="music" title="Raccolta vuota">Aggiungi i canti con il pulsante «Aggiungi canto».</EmptyState>
      ) : (
        <ol className="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((it, i) => {
            const s = byId.get(it.song_id);
            const versions = arrangements.filter((a) => a.song_id === it.song_id);
            return (
              <li key={it.id} className="list-row" style={{ flexWrap: 'wrap' }}>
                <span className="list-row__num">{i + 1}</span>
                <span className="list-row__main">
                  <Link className="list-row__title" to={`/canti/${it.song_id}${it.arrangement_id ? `?versione=${it.arrangement_id}` : ''}`}>{s ? `${s.number ? s.number + ' · ' : ''}${s.title}` : 'Canto non più disponibile'}</Link>
                  {versions.length > 0 && (
                    <select className="select" style={{ minHeight: 34, maxWidth: 320 }} aria-label="Versione da usare" value={it.arrangement_id ?? ''} onChange={(e) => act(() => updateCollectionItem(it.id, { arrangement_id: e.target.value || null }))}>
                      <option value="">Versione ufficiale</option>
                      {versions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  )}
                </span>
                <span className="list-row__end">
                  <Button size="sm" variant="ghost" iconOnly icon="chevronUp" disabled={i === 0 || busy} onClick={() => move(i, -1)}>Sposta su</Button>
                  <Button size="sm" variant="ghost" iconOnly icon="chevronDown" disabled={i === items.length - 1 || busy} onClick={() => move(i, 1)}>Sposta giù</Button>
                  <Button size="sm" variant="ghost" iconOnly icon="trash" onClick={() => act(() => removeCollectionItem(it.id), 'Canto rimosso.')}>Rimuovi</Button>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <section className="stack-sm">
        <h2 className="section-title">Condivisione e gestione</h2>
        <div className="row">
          <Button icon="download" loading={busy} onClick={downloadAll} disabled={!items.length}>Scarica per l’uso offline</Button>
          <Button icon="link" onClick={() => act(async () => {
            const t = await setCollectionSharing(collection.id, !collection.share_token);
            if (t) await navigator.clipboard?.writeText(`${env.siteUrl}/condivisi/raccolta/${t}`).catch(() => undefined);
          }, collection.share_token ? 'Condivisione disattivata.' : 'Collegamento copiato negli appunti.')}>
            {collection.share_token ? 'Disattiva collegamento' : 'Condividi con un collegamento'}
          </Button>
          <Button icon="copy" onClick={() => act(async () => { const id = await duplicateCollection(collection.id); navigate(`/raccolte/${id}`); }, 'Raccolta duplicata.')}>Duplica</Button>
          <Button variant="danger-soft" icon="trash" onClick={() => setConfirmDelete(true)}>Elimina</Button>
        </div>
        {shareUrl && <p className="small muted">Chi ha il collegamento vede titoli e testi ufficiali: <code style={{ wordBreak: 'break-all' }}>{shareUrl}</code></p>}
      </section>

      <SongPicker open={picker} onClose={() => setPicker(false)} onPick={(id) => { setPicker(false); void act(() => addToCollection(collection.id, id), 'Canto aggiunto.'); }} />
      <ConfirmDialog open={confirmDelete} title="Eliminare la raccolta?" message="La raccolta verrà eliminata. I canti e le tue versioni personali non vengono toccati." confirmLabel="Elimina" destructive busy={busy}
        onCancel={() => setConfirmDelete(false)} onConfirm={() => act(async () => { await deleteCollection(collection.id); navigate('/raccolte'); }, 'Raccolta eliminata.')} />
    </div>
  );
}
