import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRoom } from './RoomProvider';
import { useAuth } from '../../app/AuthProvider';
import { useLibrary } from '../../app/LibraryProvider';
import { liveTarget } from '../../domain/room';
import { SongReader } from '../song/SongPage';
import { DirectorControls } from './DirectorControls';
import { Button, ButtonLink } from '../../components/ui/Button';
import { EmptyState, Spinner } from '../../components/ui/Feedback';
import { Icon } from '../../components/ui/Icon';

export default function LiveRoomPage() {
  const { roomId } = useParams();
  const room = useRoom();
  const { user, isAdmin } = useAuth();
  const { byId } = useLibrary();
  const navigate = useNavigate();
  const { state } = room;
  const [showControls, setShowControls] = useState(true);

  // Opening the live page (link, reload, "Torna alla diretta") re-attaches
  // without a code; the server decides whether the membership is still valid.
  useEffect(() => {
    if (!roomId) return;
    if (state.roomId !== roomId) room.attach(roomId);
    else if (state.mode === 'BROWSING_FREELY') void room.returnToLive();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, state.roomId]);

  if (state.roomId !== roomId) return <Spinner label="Collegamento alla stanza…" />;

  if (state.ended) {
    const msg = {
      closed: ['La stanza è terminata', 'Il direttore ha chiuso la stanza. Grazie per aver partecipato.'],
      expired: ['La stanza è scaduta', 'Il tempo di validità della stanza è terminato.'],
      revoked: ['Non partecipi a questa stanza', 'La partecipazione non è valida o è stata revocata. Inserisci un nuovo codice per entrare.'],
      not_found: ['Stanza non trovata', 'Controlla il codice e riprova.'],
    }[state.ended];
    return (
      <div className="main">
        <EmptyState
          icon="radio"
          title={msg[0]}
          action={<Button variant="primary" onClick={async () => { await room.leave(); navigate('/stanze'); }}>Torna alle stanze</Button>}
        >
          {msg[1]}
        </EmptyState>
      </div>
    );
  }

  const snap = state.snapshot;
  if (!snap) return <Spinner label="Recupero dello stato della stanza…" />;
  const isController = Boolean(user && (snap.director_id === user.id || isAdmin));
  const target = liveTarget(state);
  const current = target ? byId.get(target.songId) : undefined;

  return (
    <div>
      <div className="room-banner no-print" role="region" aria-label="Stanza in diretta" style={{ position: 'static' }}>
        <span className={`status-dot ${state.connection === 'online' ? 'status-dot--live' : 'status-dot--offline'}`} aria-hidden />
        <span className="grow" style={{ display: 'grid', minWidth: 0 }}>
          <span className="room-banner__title">{snap.title}</span>
          <span className="room-banner__meta" aria-live="polite">
            {state.connection === 'online' ? 'In diretta' : state.connection === 'offline' ? 'Offline: il canto resta visibile, mi riconnetto appena possibile' : 'Riconnessione…'}
            {' · '}codice {snap.code}
          </span>
        </span>
        {isController && (
          <Button size="sm" variant="ghost" style={{ color: 'inherit' }} onClick={() => setShowControls((v) => !v)} aria-expanded={showControls}>
            {showControls ? 'Nascondi comandi' : 'Comandi'}
          </Button>
        )}
        <Button size="sm" onClick={() => { room.browse(); navigate('/'); }}>
          <Icon name="library" /> Navigazione libera
        </Button>
      </div>

      {isController && showControls && <DirectorControls snapshot={snap} />}

      {target ? (
        <SongReader key={`${target.songId}:${target.arrangementId ?? ''}`} songId={target.songId} arrangementId={null} live />
      ) : (
        <div className="main">
          <EmptyState icon="music" title="In attesa del primo canto">
            {isController ? 'Scegli il canto da mostrare ai partecipanti.' : 'Il direttore non ha ancora selezionato un canto. La pagina si aggiornerà da sola.'}
          </EmptyState>
        </div>
      )}
      {current === undefined && target && <span className="visually-hidden">Canto in diretta</span>}
      {!isController && (
        <div className="no-print" style={{ padding: '0 var(--space-4) var(--space-8)', textAlign: 'center' }}>
          <ButtonLink to="/stanze" variant="ghost" size="sm">Gestisci la partecipazione</ButtonLink>
        </div>
      )}
    </div>
  );
}
