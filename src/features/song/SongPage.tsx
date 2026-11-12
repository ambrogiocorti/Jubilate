import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { usePrefs } from '../../app/PrefsProvider';
import { useToast } from '../../app/ToastProvider';
import { useLibrary } from '../../app/LibraryProvider';
import { useFavorites } from '../../app/useFavorites';
import { useRoom } from '../rooms/RoomProvider';
import { loadSong } from '../../data/library';
import { fetchArrangement, type Arrangement } from '../../data/personal';
import type { SongDetail } from '../../data/types';
import { effectiveMode, type ViewMode } from '../../domain/preferences';
import { hasChords } from '../../domain/song';
import { formatKey } from '../../music/chord';
import { friendlyError } from '../../lib/errors';
import { setPinned, getCachedSong } from '../../lib/localdb';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Segmented } from '../../components/ui/Field';
import { Alert, EmptyState, Skeleton } from '../../components/ui/Feedback';
import { Icon } from '../../components/ui/Icon';
import { SongView, displayKeys } from './SongView';
import { useAutoScroll } from './useAutoScroll';
import { useWakeLock } from './useWakeLock';
import { loadSongSettings, saveSongSettings } from './songSettings';
import { SongActionsDialog } from './SongActionsDialog';
import { ScorePanel } from '../score/ScorePanel';
import { MediaPanel } from '../media/MediaPanel';

export interface SongReaderProps {
  songId: string;
  arrangementId?: string | null;
  /** Rendered inside a live room. */
  live?: boolean;
}

export function SongPage() {
  const { songId } = useParams();
  const [params] = useSearchParams();
  return <SongReader key={`${songId}:${params.get('versione') ?? ''}`} songId={songId!} arrangementId={params.get('versione')} />;
}

export function SongReader({ songId, arrangementId, live }: SongReaderProps) {
  const { isRegistered } = useAuth();
  const { prefs, update } = usePrefs();
  const toast = useToast();
  const navigate = useNavigate();
  const { byId } = useLibrary();
  const favorites = useFavorites();
  const room = useRoom();
  const [detail, setDetail] = useState<SongDetail | null>(null);
  const [arrangement, setArrangement] = useState<Arrangement | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [pinned, setPinnedState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(() => loadSongSettings(songId));
  const [actionsOpen, setActionsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const readerRef = useRef<HTMLDivElement>(null);

  const mode: ViewMode = effectiveMode(prefs.mode, isRegistered);
  const scroll = useAutoScroll(prefs.scrollSpeed, fullscreen ? readerRef.current : null);
  useWakeLock(Boolean(detail));

  // Load song (+ personal arrangement when requested).
  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadSong(songId, { cacheChords: isRegistered })
      .then((r) => {
        if (cancelled) return;
        setDetail(r.detail);
        setFromCache(r.fromCache);
      })
      .catch((err) => !cancelled && setError(friendlyError(err, 'Impossibile caricare il canto.')));
    getCachedSong(songId).then((s) => !cancelled && setPinnedState(Boolean(s?.pinned))).catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [songId, isRegistered]);

  useEffect(() => {
    if (!arrangementId || !isRegistered) {
      setArrangement(null);
      return;
    }
    let cancelled = false;
    fetchArrangement(arrangementId)
      .then((a) => {
        if (cancelled) return;
        setArrangement(a);
        setSettings({ transpose: 0, capo: a.capo });
      })
      .catch((err) => !cancelled && toast.error(friendlyError(err)));
    return () => {
      cancelled = true;
    };
  }, [arrangementId, isRegistered, toast]);

  useEffect(() => {
    if (!arrangement) saveSongSettings(songId, settings);
  }, [songId, settings, arrangement]);

  // Space toggles auto-scroll; arrows adjust speed (not while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(t.tagName) || t.isContentEditable) return;
      if (e.key === ' ') {
        e.preventDefault();
        scroll.toggle();
      } else if (e.key === 'Escape' && fullscreen) {
        exitFullscreen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const content = arrangement?.content ?? detail?.content ?? null;
  const baseKey = arrangement ? (arrangement.content.key ?? arrangement.display_key) : (detail?.content.key ?? detail?.song.original_key ?? null);
  const keys = useMemo(() => displayKeys(baseKey, settings.transpose, settings.capo), [baseKey, settings.transpose, settings.capo]);
  const chordsAvailable = content ? hasChords(content) : false;

  const setTranspose = (delta: number) =>
    setSettings((s) => ({ ...s, transpose: Math.max(-11, Math.min(11, s.transpose + delta)) }));

  const enterFullscreen = useCallback(async () => {
    setFullscreen(true);
    try {
      await readerRef.current?.requestFullscreen?.();
    } catch {
      /* iOS Safari: CSS fullscreen fallback is used */
    }
  }, []);
  function exitFullscreen() {
    setFullscreen(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }
  useEffect(() => {
    const onChange = () => !document.fullscreenElement && setFullscreen(false);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const togglePin = async () => {
    if (!detail) return;
    const next = !pinned;
    await setPinned(detail.song.id, next);
    setPinnedState(next);
    toast.success(next ? 'Canto disponibile offline.' : 'Canto rimosso dai download.');
  };

  if (error && !detail) {
    return (
      <div className="song-body">
        <EmptyState
          icon={navigator.onLine ? 'alert' : 'wifiOff'}
          title={navigator.onLine ? 'Canto non disponibile' : 'Canto non scaricato'}
          action={<ButtonLink to="/" variant="primary">Torna alla biblioteca</ButtonLink>}
        >
          {navigator.onLine ? error : 'Questo canto non è stato salvato sul dispositivo. Scaricalo quando sei online per consultarlo offline.'}
        </EmptyState>
      </div>
    );
  }

  const song = detail?.song;
  const libEntry = song ? byId.get(song.id) : undefined;
  void libEntry;
  const fav = song ? favorites.isFavorite(song.id) : false;
  const inRoomNotFollowing = room.state.roomId && !live && room.state.mode === 'FOLLOWING_LIVE';
  void inRoomNotFollowing;

  return (
    <div
      ref={readerRef}
      className={fullscreen ? 'reading-fullscreen' : undefined}
      style={fullscreen ? { position: 'fixed', inset: 0, zIndex: 200 } : undefined}
    >
      <div className="song-toolbar no-print" role="toolbar" aria-label="Opzioni di lettura">
        {!live && !fullscreen && (
          <Button variant="ghost" size="sm" iconOnly icon="arrowLeft" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
            Indietro
          </Button>
        )}
        <Segmented<ViewMode>
          label="Modalità di visualizzazione"
          value={mode}
          onChange={(m) => update({ mode: m })}
          options={[
            { value: 'text', label: 'Testo' },
            { value: 'chords', label: 'Accordi', disabled: !isRegistered, title: isRegistered ? undefined : 'Accedi per vedere gli accordi' },
            { value: 'score', label: 'Spartito', disabled: !isRegistered, title: isRegistered ? undefined : 'Accedi per vedere gli spartiti' },
          ]}
        />
        {mode === 'chords' && chordsAvailable && (
          <div className="song-toolbar__group">
            <div className="key-control" role="group" aria-label="Tonalità">
              <Button variant="ghost" size="sm" iconOnly icon="minus" onClick={() => setTranspose(-1)}>Abbassa di un semitono</Button>
              <span className="key-control__value" aria-live="polite">
                {keys.sounding ? formatKey(keys.sounding, prefs.notation === 'italian' ? 'italian' : 'international') : settings.transpose > 0 ? `+${settings.transpose}` : settings.transpose}
              </span>
              <Button variant="ghost" size="sm" iconOnly icon="plus" onClick={() => setTranspose(1)}>Alza di un semitono</Button>
            </div>
            {settings.transpose !== 0 && (
              <Button variant="ghost" size="sm" onClick={() => setSettings((s) => ({ ...s, transpose: 0 }))}>Originale</Button>
            )}
            <label className="visually-hidden" htmlFor="capo">Capotasto</label>
            <select id="capo" className="select" style={{ minHeight: 36, width: 'auto' }} value={settings.capo} onChange={(e) => setSettings((s) => ({ ...s, capo: Number(e.target.value) }))}>
              <option value={0}>Senza capotasto</option>
              {Array.from({ length: 11 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>Capotasto {n}</option>
              ))}
            </select>
          </div>
        )}
        <span className="song-toolbar__spacer" />
        <div className="song-toolbar__group">
          <Button variant="ghost" size="sm" iconOnly icon="minus" onClick={() => update({ fontScale: prefs.fontScale - 0.1 })} disabled={prefs.fontScale <= 0.8}>
            Riduci il testo
          </Button>
          <Icon name="type" size={18} aria-hidden style={{ color: 'var(--text-muted)' }} />
          <Button variant="ghost" size="sm" iconOnly icon="plus" onClick={() => update({ fontScale: prefs.fontScale + 0.1 })} disabled={prefs.fontScale >= 2.5}>
            Ingrandisci il testo
          </Button>
          {isRegistered && song && (
            <Button variant="ghost" size="sm" iconOnly icon="heart" aria-pressed={fav} onClick={async () => {
              const on = await favorites.toggle(song.id);
              toast.success(on ? 'Aggiunto ai preferiti.' : 'Rimosso dai preferiti.');
            }}>
              {fav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}
            </Button>
          )}
          <Button variant="ghost" size="sm" iconOnly icon={fullscreen ? 'minimize' : 'maximize'} onClick={() => (fullscreen ? exitFullscreen() : void enterFullscreen())}>
            {fullscreen ? 'Esci da tutto schermo' : 'Tutto schermo'}
          </Button>
          {song && (
            <Button variant="ghost" size="sm" iconOnly icon="more" onClick={() => setActionsOpen(true)}>Altre azioni</Button>
          )}
        </div>
      </div>

      <div className="song-body">
        <article
          className="song"
          style={{ ['--song-scale' as string]: prefs.fontScale, ['--song-leading' as string]: prefs.lineHeight }}
          aria-busy={!detail}
        >
          {!detail || !song || !content ? (
            <div className="stack" aria-label="Caricamento del canto">
              <Skeleton width={60} height={14} />
              <Skeleton width="70%" height={36} />
              <Skeleton width="40%" height={14} />
              {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} width={`${55 + ((i * 17) % 40)}%`} height={20} />)}
            </div>
          ) : (
            <>
              <header className="song__header">
                {song.number != null && <span className="song__number">N. {song.number}</span>}
                <h1 className="song__title">{song.title}</h1>
                <div className="song__meta">
                  {song.author && <span>Testo: {song.author}</span>}
                  {song.composer && <span>Musica: {song.composer}</span>}
                  {mode === 'chords' && keys.sounding && (
                    <span>
                      Tonalità {formatKey(keys.sounding, prefs.notation)}
                      {settings.capo > 0 && keys.shape && ` · capotasto ${settings.capo} (posizioni di ${formatKey(keys.shape, prefs.notation)})`}
                    </span>
                  )}
                  {song.time_signature && <span>Tempo {song.time_signature}</span>}
                  {song.tempo_bpm && <span>♩ = {song.tempo_bpm}</span>}
                </div>
                {arrangement && (
                  <Alert tone="info">
                    Stai leggendo la tua versione personale «{arrangement.name}». <Link to={`/canti/${song.id}`}>Apri la versione ufficiale</Link>
                  </Alert>
                )}
                {fromCache && <p className="small muted no-print"><Icon name="wifiOff" size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Copia salvata sul dispositivo</p>}
              </header>

              {mode === 'score' ? (
                <ScorePanel songId={song.id} />
              ) : mode === 'chords' && !chordsAvailable ? (
                <>
                  <Alert tone="info">Per questo canto non sono ancora disponibili gli accordi. Puoi proporli dalla voce «Altre azioni».</Alert>
                  <div style={{ height: 'var(--space-6)' }} />
                  <SongView content={content} showChords={false} chordOptions={{ ...settings, notation: prefs.notation, showShapes: prefs.showCapoShapes }} compactRepeats={prefs.showRepeats === 'compact'} />
                </>
              ) : (
                <SongView
                  content={content}
                  baseKey={baseKey}
                  showChords={mode === 'chords'}
                  chordOptions={{ ...settings, notation: prefs.notation, showShapes: prefs.showCapoShapes }}
                  compactRepeats={prefs.showRepeats === 'compact'}
                />
              )}

              {isRegistered && !live && mode !== 'score' && <MediaPanel songId={song.id} />}
              {song.text_source && (
                <p className="small muted" style={{ fontFamily: 'var(--font-ui)', marginTop: 'var(--space-8)' }}>
                  Fonte del testo: {song.text_source}
                </p>
              )}
            </>
          )}
        </article>
      </div>

      {detail && mode !== 'score' && (
        <div className="scroll-fab no-print" role="group" aria-label="Scorrimento automatico">
          {scroll.state !== 'stopped' && (
            <Button variant="ghost" size="sm" iconOnly icon="minus" onClick={() => update({ scrollSpeed: prefs.scrollSpeed - 1 })} disabled={prefs.scrollSpeed <= 1}>
              Più lento
            </Button>
          )}
          {scroll.state !== 'stopped' && <span className="scroll-fab__speed" aria-label={`Velocità ${prefs.scrollSpeed}`}>{prefs.scrollSpeed}</span>}
          {scroll.state !== 'stopped' && (
            <Button variant="ghost" size="sm" iconOnly icon="plus" onClick={() => update({ scrollSpeed: prefs.scrollSpeed + 1 })} disabled={prefs.scrollSpeed >= 10}>
              Più veloce
            </Button>
          )}
          <Button
            variant="primary"
            iconOnly
            icon={scroll.state === 'running' ? 'pause' : 'play'}
            onClick={() => (scroll.state === 'stopped' ? scroll.start() : scroll.toggle())}
          >
            {scroll.state === 'running' ? 'Pausa scorrimento' : scroll.state === 'paused' ? 'Riprendi scorrimento' : 'Avvia scorrimento automatico'}
          </Button>
          {scroll.state !== 'stopped' && (
            <Button variant="ghost" size="sm" iconOnly icon="stop" onClick={scroll.stop}>Ferma scorrimento</Button>
          )}
        </div>
      )}

      {song && detail && (
        <SongActionsDialog
          open={actionsOpen}
          onClose={() => setActionsOpen(false)}
          detail={detail}
          arrangement={arrangement}
          pinned={pinned}
          onTogglePin={togglePin}
        />
      )}
    </div>
  );
}
