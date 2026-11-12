import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';

const fmt = (s: number) => (Number.isFinite(s) ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '–:––');

/** Accessible audio player; the source URL is resolved lazily on first play. */
export function AudioPlayer({ title, resolveSrc }: { title: string; resolveSrc: () => Promise<string> }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(NaN);
  const [volume, setVolume] = useState(1);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  useEffect(() => {
    if (audio.current) audio.current.volume = volume;
  }, [volume]);

  const toggle = async () => {
    const el = audio.current;
    if (!el) return;
    if (!src) {
      setState('loading');
      try {
        const url = await resolveSrc();
        setSrc(url);
        el.src = url;
      } catch {
        setState('error');
        return;
      }
    }
    if (el.paused) {
      try {
        await el.play();
      } catch {
        setState('error');
      }
    } else el.pause();
  };

  if (state === 'error') {
    return <p className="small muted">La registrazione «{title}» non è al momento disponibile.</p>;
  }

  return (
    <div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'nowrap' }} role="group" aria-label={`Lettore: ${title}`}>
      <audio
        ref={audio}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => { setDuration(e.currentTarget.duration); setState('ready'); }}
        onError={() => src && setState('error')}
      />
      <Button variant="primary" iconOnly icon={playing ? 'pause' : 'play'} loading={state === 'loading' && !playing} onClick={toggle}>
        {playing ? 'Pausa' : 'Riproduci'}
      </Button>
      <span className="small muted" style={{ fontVariantNumeric: 'tabular-nums', minWidth: 80 }}>{fmt(time)} / {fmt(duration)}</span>
      <input
        type="range" min={0} max={Number.isFinite(duration) ? duration : 0} step={0.5} value={time}
        disabled={!Number.isFinite(duration)}
        onChange={(e) => { if (audio.current) audio.current.currentTime = Number(e.target.value); }}
        aria-label="Posizione" className="grow" style={{ accentColor: 'var(--accent)', minWidth: 60 }}
      />
      <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} aria-label="Volume" style={{ width: 80, accentColor: 'var(--accent)' }} />
    </div>
  );
}
