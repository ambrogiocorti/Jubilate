import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { createCelebration, fetchCelebrations, KIND_LABEL, STATUS_LABEL, type Celebration, type CelebrationKind } from '../../data/celebrations';
import { friendlyError } from '../../lib/errors';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Alert, EmptyState, ListSkeleton } from '../../components/ui/Feedback';
import { Icon } from '../../components/ui/Icon';

export function formatDateTime(iso: string | null): string {
  if (!iso) return 'Data da definire';
  return new Date(iso).toLocaleString('it-IT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function CelebrationsPage({ kind }: { kind: 'celebration' | 'rehearsal' }) {
  const { isDirector, user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [items, setItems] = useState<Celebration[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<CelebrationKind>(kind === 'rehearsal' ? 'rehearsal' : 'mass');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const base = kind === 'rehearsal' ? '/prove' : '/celebrazioni';

  useEffect(() => {
    setItems(null);
    fetchCelebrations(kind).then(setItems).catch((e) => setError(friendlyError(e)));
  }, [kind]);

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const id = await createCelebration({ kind: type, title, starts_at: when ? new Date(when).toISOString() : null }, user.id);
      navigate(`${base}/${id}`);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  const now = Date.now();
  const upcoming = (items ?? []).filter((c) => !c.starts_at || new Date(c.starts_at).getTime() >= now - 3 * 3600_000);
  const past = (items ?? []).filter((c) => c.starts_at && new Date(c.starts_at).getTime() < now - 3 * 3600_000);

  const List = ({ list }: { list: Celebration[] }) => (
    <ul role="list" className="list">
      {list.map((c) => (
        <li key={c.id}>
          <Link to={`${base}/${c.id}`} className="list-row">
            <Icon name={kind === 'rehearsal' ? 'mic' : 'calendar'} />
            <span className="list-row__main">
              <span className="list-row__title">{c.title}</span>
              <span className="list-row__meta">{formatDateTime(c.starts_at)} · {KIND_LABEL[c.kind]}</span>
            </span>
            <span className="list-row__end">
              <span className={`badge ${c.status === 'ready' ? 'badge--success' : c.status === 'cancelled' ? 'badge--danger' : ''}`}>{STATUS_LABEL[c.status]}</span>
              <Icon name="chevronRight" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="container stack-lg">
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header__text">
          <h1>{kind === 'rehearsal' ? 'Prove del coro' : 'Celebrazioni e scalette'}</h1>
          <p>{kind === 'rehearsal' ? 'Programma delle prove, canti da preparare, note del direttore e annotazioni personali.' : 'Le scalette dei canti preparate dai direttori.'}</p>
        </div>
        {isDirector ? (
          <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>{kind === 'rehearsal' ? 'Nuova prova' : 'Nuova celebrazione'}</Button>
        ) : (
          <ButtonLink to="/direttore" variant="ghost">Sei un direttore?</ButtonLink>
        )}
      </header>
      {error && <Alert tone="danger">{error}</Alert>}
      {!items && !error ? (
        <ListSkeleton rows={4} />
      ) : items && items.length === 0 ? (
        <EmptyState icon={kind === 'rehearsal' ? 'mic' : 'calendar'} title={kind === 'rehearsal' ? 'Nessuna prova in programma' : 'Nessuna celebrazione'}>
          {isDirector ? 'Crea la prima scaletta e aggiungi i canti dalla biblioteca.' : 'Quando un direttore pubblicherà una scaletta la troverai qui.'}
        </EmptyState>
      ) : (
        <>
          {upcoming.length > 0 && (<section className="stack-sm"><h2 className="section-title">In programma</h2><List list={upcoming} /></section>)}
          {past.length > 0 && (<section className="stack-sm"><h2 className="section-title">Passate</h2><List list={past} /></section>)}
        </>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title={kind === 'rehearsal' ? 'Nuova prova' : 'Nuova celebrazione'}
        footer={<><Button onClick={() => setOpen(false)}>Annulla</Button><Button variant="primary" type="submit" form="new-celebration" loading={busy} disabled={title.trim().length < 2}>Crea</Button></>}>
        <form id="new-celebration" className="form" onSubmit={create}>
          <Field label="Titolo" hint={kind === 'rehearsal' ? 'Es. «Prova del giovedì».' : 'Es. «Messa domenicale delle 10:00».'}>
            <input className="input" required maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          {kind !== 'rehearsal' && (
            <Field label="Tipo">
              <select className="select" value={type} onChange={(e) => setType(e.target.value as CelebrationKind)}>
                {(['mass', 'adoration', 'vigil', 'other'] as const).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
              </select>
            </Field>
          )}
          <Field label="Data e ora">
            <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        </form>
      </Dialog>
    </div>
  );
}
