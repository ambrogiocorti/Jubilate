import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchCelebration, fetchCelebrationSongs, type Celebration, type CelebrationSong } from '../../data/celebrations';
import { friendlyError } from '../../lib/errors';
import { EmptyState, Spinner } from '../../components/ui/Feedback';
import { PrintSongs } from '../print/PrintSongs';
import { formatDateTime } from './CelebrationsPage';

export default function CelebrationPrintPage() {
  const { celebrationId } = useParams();
  const [c, setC] = useState<Celebration | null>(null);
  const [songs, setSongs] = useState<CelebrationSong[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!celebrationId) return;
    Promise.all([fetchCelebration(celebrationId), fetchCelebrationSongs(celebrationId)])
      .then(([a, b]) => { setC(a); setSongs(b); })
      .catch((e) => setError(friendlyError(e)));
  }, [celebrationId]);
  const items = useMemo(() => songs.map((s) => ({ songId: s.song_id, arrangementId: s.arrangement_id, heading: s.moment_label, note: [s.suggested_key && `Tonalità ${s.suggested_key}`, s.notes].filter(Boolean).join(' · ') || null })), [songs]);
  if (error) return <EmptyState icon="alert" title="Stampa non disponibile">{error}</EmptyState>;
  if (!c) return <Spinner />;
  return <PrintSongs title={c.title} subtitle={formatDateTime(c.starts_at)} items={items} />;
}
