import { Link } from 'react-router-dom';
import { useFavorites } from '../../app/useFavorites';
import { useLibrary } from '../../app/LibraryProvider';
import { EmptyState } from '../../components/ui/Feedback';
import { ButtonLink } from '../../components/ui/Button';
import { Icon } from '../../components/ui/Icon';

export default function FavoritesPage() {
  const { ids } = useFavorites();
  const { byId } = useLibrary();
  const songs = [...ids].map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s))
    .sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9));
  return (
    <div className="container stack-lg">
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header__text"><h1>Preferiti</h1><p>I canti che hai contrassegnato con il cuore.</p></div>
      </header>
      {songs.length === 0 ? (
        <EmptyState icon="heart" title="Nessun preferito" action={<ButtonLink to="/" variant="primary">Sfoglia la biblioteca</ButtonLink>}>
          Apri un canto e tocca il cuore nella barra in alto per ritrovarlo qui.
        </EmptyState>
      ) : (
        <ul role="list" className="list">
          {songs.map((s) => (
            <li key={s.id}>
              <Link to={`/canti/${s.id}`} className="list-row">
                <span className="list-row__num">{s.number ?? '—'}</span>
                <span className="list-row__main"><span className="list-row__title">{s.title}</span><span className="list-row__meta">{s.first_line}</span></span>
                <span className="list-row__end"><Icon name="chevronRight" /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
