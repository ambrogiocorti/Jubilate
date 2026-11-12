import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useLibrary } from '../../app/LibraryProvider';
import { fetchContributions, KIND_LABEL, STATUS_LABEL, type Contribution, type ContributionStatus } from '../../data/contributions';
import { friendlyError } from '../../lib/errors';
import { ButtonLink } from '../../components/ui/Button';
import { Alert, EmptyState, ListSkeleton } from '../../components/ui/Feedback';
import { Icon } from '../../components/ui/Icon';

export const STATUS_TONE: Record<ContributionStatus, string> = {
  draft: '', submitted: 'badge--accent', in_review: 'badge--warning', approved: 'badge--success', rejected: 'badge--danger',
};

export default function ContributionsPage() {
  const { user } = useAuth();
  const { byId } = useLibrary();
  const [items, setItems] = useState<Contribution[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (user) fetchContributions({ mine: user.id }).then(setItems).catch((e) => setError(friendlyError(e)));
  }, [user]);
  return (
    <div className="container stack-lg">
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header__text"><h1>Le mie proposte</h1><p>Nuovi canti, correzioni, accordi, spartiti e registrazioni inviati all’amministratore.</p></div>
        <ButtonLink to="/proposte/nuova?tipo=new_song" variant="primary" icon="plus">Proponi un canto</ButtonLink>
      </header>
      {error && <Alert tone="danger">{error}</Alert>}
      {!items && !error ? <ListSkeleton rows={3} /> : items && items.length === 0 ? (
        <EmptyState icon="send" title="Nessuna proposta">Dal menu di un canto puoi proporre correzioni, accordi, spartiti o registrazioni.</EmptyState>
      ) : (
        <ul role="list" className="list">
          {items?.map((c) => (
            <li key={c.id}>
              <Link to={`/proposte/${c.id}`} className="list-row">
                <Icon name="send" />
                <span className="list-row__main">
                  <span className="list-row__title">{c.title}</span>
                  <span className="list-row__meta">
                    {KIND_LABEL[c.kind]}{c.song_id && byId.get(c.song_id) ? ` · ${byId.get(c.song_id)!.title}` : ''} · {new Date(c.created_at).toLocaleDateString('it-IT')}
                    {c.review_note ? ` · «${c.review_note}»` : ''}
                  </span>
                </span>
                <span className="list-row__end"><span className={`badge ${STATUS_TONE[c.status]}`}>{STATUS_LABEL[c.status]}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
