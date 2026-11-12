import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useToast } from '../../app/ToastProvider';
import { createCollection, fetchCollections, type Collection, type CollectionKind } from '../../data/personal';
import { friendlyError } from '../../lib/errors';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Alert, EmptyState, ListSkeleton } from '../../components/ui/Feedback';
import { Icon } from '../../components/ui/Icon';

export const COLLECTION_KIND_LABEL: Record<CollectionKind, string> = { personal: 'Personale', celebration: 'Per una celebrazione', rehearsal: 'Per una prova del coro' };

export default function CollectionsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<Collection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<CollectionKind>('personal');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetchCollections().then(setItems).catch((e) => setError(friendlyError(e)));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const id = await createCollection(title, kind);
      navigate(`/raccolte/${id}`);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container stack-lg">
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header__text"><h1>Raccolte</h1><p>Organizza i canti per celebrazioni, prove o uso personale.</p></div>
        <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>Nuova raccolta</Button>
      </header>
      {error && <Alert tone="danger">{error}</Alert>}
      {!items && !error ? <ListSkeleton rows={4} /> : items && items.length === 0 ? (
        <EmptyState icon="folder" title="Nessuna raccolta">Crea una raccolta e aggiungi i canti dalla biblioteca o dal menu di ogni canto.</EmptyState>
      ) : (
        <ul role="list" className="list">
          {items?.map((c) => (
            <li key={c.id}>
              <Link to={`/raccolte/${c.id}`} className="list-row">
                <Icon name="folder" />
                <span className="list-row__main">
                  <span className="list-row__title">{c.title}</span>
                  <span className="list-row__meta">{c.collection_items?.[0]?.count ?? 0} canti · {COLLECTION_KIND_LABEL[c.kind]}{c.visibility === 'link' ? ' · condivisa' : ''}</span>
                </span>
                <span className="list-row__end"><Icon name="chevronRight" /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Nuova raccolta"
        footer={<><Button onClick={() => setOpen(false)}>Annulla</Button><Button variant="primary" type="submit" form="new-collection" loading={busy} disabled={!title.trim()}>Crea</Button></>}>
        <form id="new-collection" className="form" onSubmit={create}>
          <Field label="Nome"><input className="input" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} autoFocus /></Field>
          <Field label="Uso">
            <select className="select" value={kind} onChange={(e) => setKind(e.target.value as CollectionKind)}>
              {(Object.keys(COLLECTION_KIND_LABEL) as CollectionKind[]).map((k) => <option key={k} value={k}>{COLLECTION_KIND_LABEL[k]}</option>)}
            </select>
          </Field>
        </form>
      </Dialog>
    </div>
  );
}
