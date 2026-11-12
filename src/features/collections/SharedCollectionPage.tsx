import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/errors';
import { EmptyState, Spinner } from '../../components/ui/Feedback';
import { Icon } from '../../components/ui/Icon';

interface Shared { id: string; title: string; description: string | null; owner_name: string; items: { song_id: string; number: number | null; title: string; note: string | null }[] }

export default function SharedCollectionPage() {
  const { token } = useParams();
  const [data, setData] = useState<Shared | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    supabase.rpc('get_shared_collection', { p_token: token }).then(({ data: d, error: e }) => {
      if (e) setError(friendlyError(e));
      else if (!d) setError('Collegamento non valido o condivisione disattivata.');
      else setData(d as Shared);
    });
  }, [token]);
  if (error) return <EmptyState icon="link" title="Raccolta non disponibile">{error}</EmptyState>;
  if (!data) return <Spinner />;
  return (
    <div className="container container--narrow stack-lg">
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header__text"><h1>{data.title}</h1><p>Raccolta condivisa da {data.owner_name}{data.description ? ` · ${data.description}` : ''}</p></div>
      </header>
      <ol className="list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {data.items.map((s, i) => (
          <li key={i}>
            <Link to={`/canti/${s.song_id}`} className="list-row">
              <span className="list-row__num">{s.number ?? i + 1}</span>
              <span className="list-row__main"><span className="list-row__title">{s.title}</span>{s.note && <span className="list-row__meta">{s.note}</span>}</span>
              <span className="list-row__end"><Icon name="chevronRight" /></span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
