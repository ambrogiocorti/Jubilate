import { useState } from 'react';
import { Metronome } from './Metronome';
import { formatKey, parseKey, suggestCapo, shapeKey } from '../../music/chord';
import { usePrefs } from '../../app/PrefsProvider';
import { Field } from '../../components/ui/Field';

const KEYS = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B', 'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

export default function ToolsPage() {
  const { prefs } = usePrefs();
  const [key, setKey] = useState('Bb');
  const k = parseKey(key)!;
  const caps = suggestCapo(k);
  return (
    <div className="container container--narrow stack-lg">
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header__text">
          <h1>Strumenti</h1>
          <p>Metronomo e calcolo del capotasto per la chitarra.</p>
        </div>
      </header>
      <section className="panel">
        <div className="panel__header"><h2 style={{ fontSize: 'var(--text-lg)' }}>Metronomo</h2></div>
        <div className="panel__body"><Metronome /></div>
      </section>
      <section className="panel">
        <div className="panel__header"><h2 style={{ fontSize: 'var(--text-lg)' }}>Capotasto</h2></div>
        <div className="panel__body">
          <Field label="Tonalità del canto">
            <select className="select" value={key} onChange={(e) => setKey(e.target.value)}>
              {KEYS.map((x) => <option key={x} value={x}>{formatKey(parseKey(x)!, prefs.notation)}</option>)}
            </select>
          </Field>
          <table className="table">
            <thead><tr><th>Capotasto</th><th>Posizioni da suonare</th></tr></thead>
            <tbody>
              {Array.from({ length: 8 }, (_, c) => (
                <tr key={c} style={caps.includes(c) ? { fontWeight: 600 } : undefined}>
                  <td>{c === 0 ? 'Nessuno' : `${c}° tasto`}</td>
                  <td>{formatKey(shapeKey(k, c), prefs.notation)} {caps.includes(c) && <span className="badge badge--success">consigliato</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
