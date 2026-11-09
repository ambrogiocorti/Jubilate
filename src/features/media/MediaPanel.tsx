import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchMedia, signedUrl, youtubeId, type MediaAsset } from '../../data/media';
import { Button } from '../../components/ui/Button';
import { AudioPlayer } from './AudioPlayer';

/** Recordings and attachments of a song (registered users). */
export function MediaPanel({ songId }: { songId: string }) {
  const [items, setItems] = useState<MediaAsset[] | null>(null);
  const [openVideo, setOpenVideo] = useState<string | null>(null);
  useEffect(() => {
    if (!navigator.onLine) return setItems([]);
    fetchMedia(songId).then((m) => setItems(m.filter((x) => x.status === 'published'))).catch(() => setItems([]));
  }, [songId]);

  return (
    <section className="no-print stack" style={{ fontFamily: 'var(--font-ui)', marginTop: 'var(--space-10)', paddingTop: 'var(--space-6)', borderTop: '1px solid var(--border)' }} aria-label="Registrazioni e allegati">
      <div className="row row--between">
        <h2 style={{ fontSize: 'var(--text-lg)' }}>Registrazioni e allegati</h2>
        <Link to={`/proposte/nuova?tipo=recording&canto=${songId}`} className="small">Proponi una registrazione</Link>
      </div>
      {items === null ? null : items.length === 0 ? (
        <p className="small muted">Nessuna registrazione disponibile per questo canto.</p>
      ) : (
        <ul role="list" className="stack">
          {items.map((m) => {
            const vid = m.kind === 'youtube' && m.external_url ? youtubeId(m.external_url) : null;
            return (
              <li key={m.id} className="stack-sm">
                <div>
                  <strong>{m.title}</strong>
                  {(m.performer || m.description) && <p className="small muted">{[m.performer, m.description].filter(Boolean).join(' · ')}</p>}
                </div>
                {m.kind === 'audio' && m.storage_path && <AudioPlayer title={m.title} resolveSrc={() => signedUrl(m.storage_path!)} />}
                {m.kind === 'youtube' && vid && (
                  openVideo === m.id ? (
                    <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                      <iframe
                        title={m.title}
                        src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(vid)}?autoplay=1&rel=0`}
                        allow="autoplay; encrypted-media; picture-in-picture"
                        allowFullScreen
                        referrerPolicy="strict-origin-when-cross-origin"
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
                      />
                    </div>
                  ) : (
                    <Button icon="play" onClick={() => setOpenVideo(m.id)}>Guarda su YouTube (incorporato)</Button>
                  )
                )}
                {(m.kind === 'pdf' || m.kind === 'image') && m.storage_path && (
                  <Button icon="file" onClick={async () => window.open(await signedUrl(m.storage_path!, 600), '_blank', 'noopener')}>
                    Apri {m.kind === 'pdf' ? 'PDF' : 'immagine'}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
