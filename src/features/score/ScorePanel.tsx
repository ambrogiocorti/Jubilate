import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { fetchScoreXml, fetchSongScores, downloadText, safeFilename, INSTRUMENT_LABEL, type MusicScore } from '../../data/scores';
import { friendlyError } from '../../lib/errors';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Alert, EmptyState, Spinner } from '../../components/ui/Feedback';
import { ScoreViewer } from './ScoreViewer';

const ZOOM_KEY = 'jubilate.scoreZoom';
const readZoom = () => {
  try {
    const v = Number(localStorage.getItem(ZOOM_KEY));
    return v >= 20 && v <= 150 ? v : 40;
  } catch {
    return 40;
  }
};

/** Score mode of the song page: official and personal scores of the song. */
export function ScorePanel({ songId }: { songId: string }) {
  const { isRegistered, isAdmin } = useAuth();
  const [scores, setScores] = useState<MusicScore[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [xml, setXml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(readZoom);

  useEffect(() => {
    if (!isRegistered) return;
    setScores(null);
    fetchSongScores(songId)
      .then((list) => {
        const visible = list.filter((s) => s.current_version_id && (s.owner_id || s.status === 'published' || isAdmin));
        setScores(visible);
        setActiveId(visible[0]?.id ?? null);
      })
      .catch((e) => setError(friendlyError(e)));
  }, [songId, isRegistered, isAdmin]);

  const active = scores?.find((s) => s.id === activeId) ?? null;
  useEffect(() => {
    setXml(null);
    if (!active) return;
    fetchScoreXml(active).then(setXml).catch((e) => setError(friendlyError(e)));
  }, [active]);

  const changeZoom = (d: number) => {
    const z = Math.max(20, Math.min(150, zoom + d));
    setZoom(z);
    try { localStorage.setItem(ZOOM_KEY, String(z)); } catch { /* ignore */ }
  };

  if (!isRegistered) {
    return (
      <EmptyState icon="music" title="Spartiti per gli utenti registrati" action={<ButtonLink to={`/accedi?next=/canti/${songId}`} variant="primary">Accedi</ButtonLink>}>
        Accedi per consultare gli spartiti disponibili.
      </EmptyState>
    );
  }
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!scores) return <Spinner label="Ricerca degli spartiti…" />;
  if (scores.length === 0) {
    return (
      <EmptyState
        icon="music"
        title="Nessuno spartito disponibile"
        action={
          <div className="row" style={{ justifyContent: 'center' }}>
            <ButtonLink to={`/spartiti/nuovo?canto=${songId}`} icon="plus">Crea il tuo spartito</ButtonLink>
            <ButtonLink to={`/proposte/nuova?tipo=score&canto=${songId}`} variant="ghost">Proponi uno spartito</ButtonLink>
          </div>
        }
      >
        Per questo canto non è ancora stato digitalizzato uno spartito.
      </EmptyState>
    );
  }

  return (
    <div className="stack" style={{ fontFamily: 'var(--font-ui)' }}>
      <div className="row row--between">
        {scores.length > 1 ? (
          <div className="chips" role="group" aria-label="Spartiti disponibili">
            {scores.map((s) => (
              <button key={s.id} type="button" className="chip" aria-pressed={s.id === activeId} onClick={() => setActiveId(s.id)}>
                {s.title} · {INSTRUMENT_LABEL[s.instrument]}{s.owner_id ? ' (personale)' : ''}
              </button>
            ))}
          </div>
        ) : (
          <p className="small muted">{active?.title} · {active && INSTRUMENT_LABEL[active.instrument]}{active?.owner_id ? ' (personale)' : ''}</p>
        )}
        <div className="row" style={{ gap: 'var(--space-1)' }}>
          <Button size="sm" icon="minus" iconOnly onClick={() => changeZoom(-10)} disabled={zoom <= 20}>Riduci</Button>
          <span className="small" style={{ minWidth: '3.5rem', textAlign: 'center' }} aria-live="polite">{zoom}%</span>
          <Button size="sm" icon="plus" iconOnly onClick={() => changeZoom(10)} disabled={zoom >= 150}>Ingrandisci</Button>
        </div>
      </div>
      {active?.status !== 'published' && !active?.owner_id && <Alert tone="warning">Spartito ufficiale non ancora pubblicato: lo vedi perché sei amministratore.</Alert>}
      {xml ? <ScoreViewer xml={xml} scale={zoom} label={`Spartito: ${active?.title ?? ''}`} /> : <Spinner label="Caricamento dello spartito…" />}
      {active && (
        <div className="row">
          <ButtonLink size="sm" icon="edit" to={active.owner_id || isAdmin ? `/spartiti/${active.id}` : `/spartiti/nuovo?da=${active.id}&canto=${songId}`}>
            {active.owner_id || isAdmin ? 'Modifica spartito' : 'Crea una copia personale'}
          </ButtonLink>
          {xml && (
            <Button size="sm" variant="ghost" icon="download" onClick={() => downloadText(`${safeFilename(active.title)}.musicxml`, xml)}>
              Esporta MusicXML
            </Button>
          )}
          {!active.owner_id && (
            <Link className="small" to={`/proposte/nuova?tipo=score&canto=${songId}`}>Segnala o proponi una correzione</Link>
          )}
        </div>
      )}
    </div>
  );
}
