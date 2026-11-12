import { useEffect, useRef, useState } from 'react';
import { MetronomeEngine, clampBpm, tapTempo } from './metronomeEngine';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';

export function Metronome({ initialBpm = 80, initialBeats = 4 }: { initialBpm?: number; initialBeats?: number }) {
  const [bpm, setBpm] = useState(clampBpm(initialBpm));
  const [beats, setBeats] = useState(initialBeats);
  const [running, setRunning] = useState(false);
  const [beat, setBeat] = useState(-1);
  const [volume, setVolume] = useState(0.8);
  const [error, setError] = useState<string | null>(null);
  const engine = useRef<MetronomeEngine | null>(null);
  const taps = useRef<number[]>([]);

  useEffect(() => {
    engine.current = new MetronomeEngine({ bpm, beatsPerBar: beats, onBeat: (b) => setBeat(b) });
    return () => void engine.current?.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => engine.current?.update({ bpm, beatsPerBar: beats }), [bpm, beats]);
  useEffect(() => {
    if (engine.current) engine.current.volume = volume;
  }, [volume]);

  const toggle = async () => {
    const e = engine.current;
    if (!e) return;
    if (e.running) {
      e.stop();
      setRunning(false);
      setBeat(-1);
      return;
    }
    try {
      await e.start();
      setRunning(true);
      setError(null);
    } catch {
      setError('Il browser non consente la riproduzione audio. Controlla che il dispositivo non sia in modalità silenziosa.');
    }
  };

  const tap = () => {
    const now = performance.now();
    taps.current = [...taps.current.filter((t) => now - t < 4000), now];
    const t = tapTempo(taps.current);
    if (t) setBpm(t);
  };

  return (
    <div className="stack" aria-label="Metronomo">
      <div className="row row--between">
        <div>
          <div className="stat__value" aria-live="off">{bpm} <span className="small muted">BPM</span></div>
        </div>
        <div className="row" aria-hidden="true">
          {Array.from({ length: beats }, (_, i) => (
            <span key={i} style={{
              width: i === 0 ? 22 : 16, height: i === 0 ? 22 : 16, borderRadius: '50%',
              background: beat === i ? (i === 0 ? 'var(--accent)' : 'var(--text-muted)') : 'var(--bg-muted)',
              border: '1px solid var(--border)', transition: 'background 60ms',
            }} />
          ))}
        </div>
      </div>
      <input type="range" min={20} max={300} value={bpm} onChange={(e) => setBpm(clampBpm(Number(e.target.value)))} aria-label="Battiti al minuto" style={{ width: '100%', accentColor: 'var(--accent)' }} />
      <div className="row">
        <Button iconOnly icon="minus" onClick={() => setBpm((b) => clampBpm(b - 1))}>Diminuisci BPM</Button>
        <Button iconOnly icon="plus" onClick={() => setBpm((b) => clampBpm(b + 1))}>Aumenta BPM</Button>
        <Button onClick={tap}>Tap</Button>
        <Field label="Tempo" hideLabel>
          <select className="select" value={beats} onChange={(e) => setBeats(Number(e.target.value))} style={{ width: 'auto' }}>
            {[2, 3, 4, 5, 6, 7, 9, 12].map((n) => <option key={n} value={n}>{n}/4</option>)}
          </select>
        </Field>
        <label className="row small muted" style={{ gap: 'var(--space-2)' }}>
          Volume
          <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => setVolume(Number(e.target.value))} style={{ accentColor: 'var(--accent)' }} />
        </label>
      </div>
      <Button variant="primary" size="lg" icon={running ? 'stop' : 'play'} onClick={toggle} aria-pressed={running}>
        {running ? 'Ferma' : 'Avvia'}
      </Button>
      {error && <p className="field__error">{error}</p>}
    </div>
  );
}
