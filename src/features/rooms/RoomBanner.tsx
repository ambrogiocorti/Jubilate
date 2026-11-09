import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRoom } from './RoomProvider';
import { useLibrary } from '../../app/LibraryProvider';
import { Button } from '../../components/ui/Button';

/**
 * Persistent indicator shown everywhere except on the live view itself while
 * the user is a room member. Leaving the live page switches to BROWSING_FREELY
 * without leaving the room; "Torna alla diretta" goes back without a code.
 */
export function RoomBanner() {
  const room = useRoom();
  const location = useLocation();
  const navigate = useNavigate();
  const { byId } = useLibrary();
  const { roomId, snapshot, mode, ended, connection, liveChangedWhileBrowsing } = room.state;
  const onLivePage = roomId ? location.pathname === `/stanze/${roomId}` : false;

  useEffect(() => {
    document.documentElement.classList.toggle('has-room-banner', Boolean(roomId && !onLivePage));
  }, [roomId, onLivePage]);

  // Navigating away from the live page = browsing freely (still a member).
  useEffect(() => {
    if (roomId && !onLivePage && mode === 'FOLLOWING_LIVE' && !ended) room.browse();
  }, [roomId, onLivePage, mode, ended, room]);

  if (!roomId || onLivePage) return null;
  const title = snapshot?.title ?? 'Stanza';
  const current = snapshot?.current_song_id ? byId.get(snapshot.current_song_id) : undefined;

  if (ended) {
    return (
      <div className="room-banner no-print" role="status">
        <span className="room-banner__title">{ended === 'revoked' ? 'Non partecipi più alla stanza' : `Stanza terminata — ${title}`}</span>
        <Button size="sm" onClick={() => void room.leave()}>Chiudi</Button>
      </div>
    );
  }

  return (
    <div className={`room-banner no-print${liveChangedWhileBrowsing ? ' room-banner--attention' : ''}`} role="region" aria-label="Stanza attiva">
      <span className="status-dot status-dot--live" aria-hidden />
      <span className="grow" style={{ display: 'grid', minWidth: 0 }}>
        <span className="room-banner__title">Stanza attiva — {title}</span>
        <span className="room-banner__meta" aria-live="polite">
          {connection === 'offline'
            ? 'Connessione assente: riproverò automaticamente'
            : liveChangedWhileBrowsing && current
              ? `Il direttore è passato a: ${current.number ? current.number + ' · ' : ''}${current.title}`
              : current
                ? `In diretta: ${current.title}`
                : 'Navigazione libera'}
        </span>
      </span>
      <Button
        size="sm"
        onClick={async () => {
          navigate(`/stanze/${roomId}`);
          await room.returnToLive();
        }}
      >
        Torna alla diretta
      </Button>
    </div>
  );
}
