import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { usePrefs } from '../../app/PrefsProvider';
import { useToast } from '../../app/ToastProvider';
import { fetchSharedArrangement } from '../../data/personal';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/errors';
import { Button } from '../../components/ui/Button';
import { EmptyState, Spinner } from '../../components/ui/Feedback';
import { SongView } from '../song/SongView';

export default function SharedArrangementPage() {
  const { token } = useParams();
  const { prefs } = usePrefs();
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchSharedArrangement>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (token) fetchSharedArrangement(token).then(setData).catch((e) => setError(friendlyError(e, 'Collegamento non valido o condivisione disattivata.')));
  }, [token]);
  if (error) return <EmptyState icon="link" title="Versione non disponibile">{error}</EmptyState>;
  if (!data) return <Spinner />;
  return (
    <div className="song-body">
      <article className="song" style={{ ['--song-scale' as string]: prefs.fontScale }}>
        <header className="song__header">
          <span className="song__number">Versione condivisa da {data.owner_name}</span>
          <h1 className="song__title">{data.name}</h1>
          <div className="row">
            <Button size="sm" icon="copy" onClick={async () => {
              const { data: id, error: err } = await supabase.rpc('duplicate_personal_arrangement', { p_id: data.id, p_name: null });
              if (err) {
                // Link-shared copies are readable only through the token: copy the content directly.
                const ins = await supabase.from('personal_arrangements').insert({ song_id: data.song_id, name: `${data.name} (copia)`, content: data.content, display_key: data.display_key, capo: data.capo }).select('id').single();
                if (ins.error) return toast.error(friendlyError(ins.error));
                return navigate(`/versioni/${(ins.data as { id: string }).id}`);
              }
              navigate(`/versioni/${id as string}`);
            }}>Salva una copia nelle mie versioni</Button>
          </div>
        </header>
        <SongView content={data.content} baseKey={data.content.key ?? data.display_key} showChords chordOptions={{ transpose: 0, capo: data.capo, notation: prefs.notation, showShapes: prefs.showCapoShapes }} />
      </article>
    </div>
  );
}
