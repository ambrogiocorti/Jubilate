import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { fetchArrangements, type Arrangement } from '../../data/personal';
import { friendlyError } from '../../lib/errors';
import { Alert, EmptyState, ListSkeleton } from '../../components/ui/Feedback';
import { ButtonLink } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';

export default function ArrangementsPage() {
  const { byId } = useLibrary();
  const [items, setItems] = useState<Arrangement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchArrangements().then(setItems).catch((e) => setError(friendlyError(e)));
  }, []);
  return (
    <div className="container stack-lg">
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header__text">
          <h1>Le mie versioni</h1>
          <p>Copie personali dei canti con testo, accordi e tonalità modificati. La versione ufficiale resta sempre intatta.</p>
        </div>
      </header>
      {error && <Alert tone="danger">{error}</Alert>}
      {!items && !error ? <ListSkeleton rows={4} /> : items && items.length === 0 ? (
        <EmptyState icon="layers" title="Nessuna versione personale" action={<ButtonLink to="/" variant="primary">Vai alla biblioteca</ButtonLink>}>
          Apri un canto e scegli «Crea versione personale» dal menu delle azioni.
        </EmptyState>
      ) : (
        <ul role="list" className="list">
          {items?.map((a) => {
            const s = byId.get(a.song_id);
            return (
              <li key={a.id}>
                <Link to={`/versioni/${a.id}`} className="list-row">
                  <Icon name="layers" />
                  <span className="list-row__main">
                    <span className="list-row__title">{a.name}</span>
                    <span className="list-row__meta">
                      {s ? `${s.number ? s.number + ' · ' : ''}${s.title}` : 'Canto'} · modificata il {new Date(a.updated_at).toLocaleDateString('it-IT')}
                      {a.visibility === 'link' && ' · condivisa'}
                    </span>
                  </span>
                  <span className="list-row__end">{a.is_draft && <span className="badge badge--warning">Bozza</span>}<Icon name="chevronRight" /></span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
