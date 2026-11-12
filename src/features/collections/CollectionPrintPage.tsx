import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchCollection, type Collection, type CollectionItem } from '../../data/personal';
import { friendlyError } from '../../lib/errors';
import { EmptyState, Spinner } from '../../components/ui/Feedback';
import { PrintSongs } from '../print/PrintSongs';

export default function CollectionPrintPage() {
  const { collectionId } = useParams();
  const [data, setData] = useState<{ collection: Collection; items: CollectionItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (collectionId) fetchCollection(collectionId).then(setData).catch((e) => setError(friendlyError(e)));
  }, [collectionId]);
  const items = useMemo(() => (data?.items ?? []).map((i) => ({ songId: i.song_id, arrangementId: i.arrangement_id, note: i.note })), [data]);
  if (error) return <EmptyState icon="alert" title="Stampa non disponibile">{error}</EmptyState>;
  if (!data) return <Spinner />;
  return <PrintSongs title={data.collection.title} subtitle={data.collection.description ?? undefined} items={items} />;
}
