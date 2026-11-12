import { useState, type ReactNode } from 'react';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { NOTE_TYPES, STEPS, type ClefName, type NoteInfo, type NoteType, type Step } from '../../music/musicxml';

export const TYPE_LABEL: Record<NoteType, string> = { whole: 'Semibreve', half: 'Minima', quarter: 'Semiminima', eighth: 'Croma', '16th': 'Semicroma', '32nd': 'Biscroma' };
export const STEP_IT: Record<Step, string> = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
const KEYS: { fifths: number; label: string }[] = [
  { fifths: -6, label: 'Sol♭ maggiore / Mi♭ minore' }, { fifths: -5, label: 'Re♭ maggiore / Si♭ minore' }, { fifths: -4, label: 'La♭ maggiore / Fa minore' },
  { fifths: -3, label: 'Mi♭ maggiore / Do minore' }, { fifths: -2, label: 'Si♭ maggiore / Sol minore' }, { fifths: -1, label: 'Fa maggiore / Re minore' },
  { fifths: 0, label: 'Do maggiore / La minore' }, { fifths: 1, label: 'Sol maggiore / Mi minore' }, { fifths: 2, label: 'Re maggiore / Si minore' },
  { fifths: 3, label: 'La maggiore / Fa♯ minore' }, { fifths: 4, label: 'Mi maggiore / Do♯ minore' }, { fifths: 5, label: 'Si maggiore / Sol♯ minore' },
  { fifths: 6, label: 'Fa♯ maggiore / Re♯ minore' },
];
const CLEF_LABEL: Record<ClefName, string> = { treble: 'Violino', bass: 'Basso', alto: 'Contralto', tenor: 'Tenore', treble8vb: 'Violino 8va bassa' };
const TIMES = ['2/4', '3/4', '4/4', '2/2', '3/8', '6/8', '9/8', '12/8', '5/4'];

/** Text describing the selected note, e.g. "Battuta 3: Sol♯4, croma puntata". */
export function describeNote(n: NoteInfo): string {
  const pitch = n.isRest || !n.pitch ? 'pausa' : `${STEP_IT[n.pitch.step]}${n.pitch.alter > 0 ? '♯'.repeat(n.pitch.alter) : '♭'.repeat(-n.pitch.alter)}${n.pitch.octave}`;
  return `Battuta ${n.measure}: ${pitch}, ${n.type ? TYPE_LABEL[n.type].toLowerCase() : 'durata libera'}${n.dots ? ' puntata' : ''}`;
}

/** Small drawing of a note value (whole … 32nd), so durations are recognisable at a glance. */
export function NoteGlyph({ type }: { type: NoteType }) {
  const hollow = type === 'whole' || type === 'half';
  const stem = type !== 'whole';
  const flags = { whole: 0, half: 0, quarter: 0, eighth: 1, '16th': 2, '32nd': 3 }[type];
  return (
    <svg viewBox="0 0 20 30" width="16" height="24" aria-hidden="true" className="note-glyph">
      <ellipse cx="7.5" cy="24" rx="5.2" ry="3.7" transform="rotate(-22 7.5 24)" fill={hollow ? 'none' : 'currentColor'} stroke="currentColor" strokeWidth="1.6" />
      {stem && <path d="M12.2 22.5V3" stroke="currentColor" strokeWidth="1.6" />}
      {Array.from({ length: flags }, (_, i) => (
        <path key={i} d={`M12.2 ${3 + i * 5}c1 3 5.5 4.5 4.5 9.5`} fill="none" stroke="currentColor" strokeWidth="1.6" />
      ))}
    </svg>
  );
}

export interface EditActions {
  prev: () => void;
  next: () => void;
  deselect: () => void;
  selectFirst: () => void;
  setStep: (s: Step, addToChord: boolean) => void;
  alter: (delta: -1 | 0 | 1) => void;
  move: (degrees: number) => void;
  duration: (t: NoteType) => void;
  dot: () => void;
  insert: (rest: boolean) => void;
  toRest: () => void;
  tie: () => void;
  slur: (kind: 'start' | 'stop') => void;
  addMeasure: () => void;
  deleteMeasure: () => void;
  lyric: (v: string) => void;
  harmony: (v: string) => void;
  key: (fifths: number) => void;
  time: (beats: number, beatType: number) => void;
  clef: (c: ClefName) => void;
  title: (t: string) => void;
}

type Tab = 'nota' | 'durata' | 'aggiungi' | 'testo' | 'battuta';
const TABS: { id: Tab; label: string }[] = [
  { id: 'nota', label: 'Nota' },
  { id: 'durata', label: 'Durata' },
  { id: 'aggiungi', label: 'Aggiungi' },
  { id: 'testo', label: 'Testo e accordi' },
  { id: 'battuta', label: 'Battuta' },
];

/**
 * The editing palette. It stays at the bottom of the screen, next to the
 * thumb: with no selection it explains how to start and holds the score-wide
 * settings; with a note selected it shows what that note is and groups the
 * changes in tabs (pitch, duration, insert, lyrics/chords, bar).
 */
export function ScoreEditPanel({ sel, title, duration, act }: { sel: NoteInfo | null; title: string; duration: NoteType; act: EditActions }) {
  const [tab, setTab] = useState<Tab>('nota');
  const [chordMode, setChordMode] = useState(false);

  return (
    <section className="score-edit panel" aria-label="Modifica dello spartito">
      <div className="score-edit__head">
        {sel ? (
          <>
            <Button size="sm" icon="chevronLeft" iconOnly onClick={act.prev}>Nota precedente</Button>
            <p className="score-edit__status" aria-live="polite">{describeNote(sel)}</p>
            <Button size="sm" icon="chevronRight" iconOnly onClick={act.next}>Nota successiva</Button>
            <Button size="sm" icon="x" iconOnly variant="ghost" onClick={act.deselect}>Chiudi la nota</Button>
          </>
        ) : (
          <p className="score-edit__status" aria-live="polite">Tocca una nota nello spartito per modificarla.</p>
        )}
      </div>

      {!sel ? (
        <NoSelection title={title} act={act} />
      ) : (
        <>
          <div className="score-edit__tabs" role="tablist" aria-label="Cosa vuoi modificare">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>
          <div className="score-edit__body" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'nota' && (
              <div className="stack-sm">
                <div className="score-edit__notes" role="group" aria-label="Nome della nota">
                  {STEPS.map((s) => (
                    <button key={s} type="button" className="score-edit__key" aria-pressed={!sel.isRest && sel.pitch?.step === s} title={`${STEP_IT[s]} (tasto ${s})`} onClick={() => act.setStep(s, chordMode)}>
                      {STEP_IT[s]}
                    </button>
                  ))}
                </div>
                <div className="score-edit__notes score-edit__mods" role="group" aria-label="Alterazioni e altezza">
                  <button type="button" className="score-edit__key" disabled={sel.isRest} aria-label="Bemolle" title="Bemolle (−)" onClick={() => act.alter(-1)}>♭</button>
                  <button type="button" className="score-edit__key" disabled={sel.isRest} aria-label="Naturale" title="Naturale (0)" onClick={() => act.alter(0)}>♮</button>
                  <button type="button" className="score-edit__key" disabled={sel.isRest} aria-label="Diesis" title="Diesis (+)" onClick={() => act.alter(1)}>♯</button>
                  <button type="button" className="score-edit__key" disabled={sel.isRest} aria-label="Più alta di un grado" title="Più alta (freccia su)" onClick={() => act.move(1)}>▲</button>
                  <button type="button" className="score-edit__key" disabled={sel.isRest} aria-label="Più bassa di un grado" title="Più bassa (freccia giù)" onClick={() => act.move(-1)}>▼</button>
                  <button type="button" className="score-edit__key score-edit__key--sm" disabled={sel.isRest} aria-label="Un'ottava sopra" title="Un'ottava sopra (Maiusc + freccia su)" onClick={() => act.move(7)}>8va▲</button>
                  <button type="button" className="score-edit__key score-edit__key--sm" disabled={sel.isRest} aria-label="Un'ottava sotto" title="Un'ottava sotto (Maiusc + freccia giù)" onClick={() => act.move(-7)}>8va▼</button>
                </div>
                <label className="score-edit__check small">
                  <input type="checkbox" checked={chordMode} onChange={(e) => setChordMode(e.target.checked)} />
                  Aggiungi come nota dell'accordo, senza sostituire
                </label>
              </div>
            )}
            {tab === 'durata' && (
              <div className="stack-sm">
                <div className="score-edit__durations" role="group" aria-label="Durata">
                  {NOTE_TYPES.map((t, i) => (
                    <button key={t} type="button" aria-pressed={(sel.type ?? duration) === t} aria-label={TYPE_LABEL[t]} title={`${TYPE_LABEL[t]} (tasto ${i + 1})`} onClick={() => act.duration(t)}>
                      <NoteGlyph type={t} />
                    </button>
                  ))}
                </div>
                <Row>
                  <Button size="sm" aria-pressed={!!sel.dots} onClick={act.dot} title="Tasto punto">Punto di valore</Button>
                  <Button size="sm" disabled={sel.isRest} onClick={act.toRest} title="Tasto Canc">Trasforma in pausa</Button>
                </Row>
              </div>
            )}
            {tab === 'aggiungi' && (
              <div className="stack-sm">
                <Row>
                  <Button size="sm" icon="plus" onClick={() => act.insert(false)} title="Tasto N">Nota dopo questa</Button>
                  <Button size="sm" icon="plus" onClick={() => act.insert(true)} title="Tasto R">Pausa dopo questa</Button>
                </Row>
                <p className="small muted" style={{ margin: 0 }}>La nuova nota ha la durata scelta in «Durata» ({TYPE_LABEL[duration].toLowerCase()}).</p>
                <Row>
                  <Button size="sm" disabled={sel.isRest} aria-pressed={!!sel.tieStart} onClick={act.tie} title="Tasto T">Lega alla nota successiva</Button>
                  <Button size="sm" disabled={sel.isRest} aria-pressed={!!sel.slurStart} onClick={() => act.slur('start')}>Inizia il legato</Button>
                  <Button size="sm" disabled={sel.isRest} aria-pressed={!!sel.slurStop} onClick={() => act.slur('stop')}>Chiudi il legato</Button>
                </Row>
              </div>
            )}
            {tab === 'testo' && <TextTab key={sel.id} sel={sel} act={act} />}
            {tab === 'battuta' && (
              <div className="stack-sm">
                <p className="small muted" style={{ margin: 0 }}>Le modifiche valgono dalla battuta {sel.measure} in poi.</p>
                <div className="score-edit__fields">
                  <Field label="Tonalità">
<select className="select" defaultValue="" onChange={(e) => { if (e.target.value !== '') act.key(Number(e.target.value)); e.target.value = ''; }}>
                      <option value="" disabled>Scegli…</option>
                      {KEYS.map((k) => <option key={k.fifths} value={k.fifths}>{k.label}</option>)}
                    </select>
</Field>
                  <Field label="Tempo">
<select className="select" defaultValue="" onChange={(e) => { const [b, bt] = e.target.value.split('/').map(Number); if (b && bt) act.time(b, bt); e.target.value = ''; }}>
                      <option value="" disabled>Scegli…</option>
                      {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
</Field>
                  <Field label="Chiave">
<select className="select" defaultValue="" onChange={(e) => { if (e.target.value) act.clef(e.target.value as ClefName); e.target.value = ''; }}>
                      <option value="" disabled>Scegli…</option>
                      {(Object.keys(CLEF_LABEL) as ClefName[]).map((c) => <option key={c} value={c}>{CLEF_LABEL[c]}</option>)}
                    </select>
</Field>
                </div>
                <Row>
                  <Button size="sm" icon="plus" onClick={act.addMeasure}>Aggiungi battuta in fondo</Button>
                  <Button size="sm" variant="danger-soft" icon="trash" onClick={act.deleteMeasure}>Elimina battuta {sel.measure}</Button>
                </Row>
              </div>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Row({ children }: { children: ReactNode }) {
  return <div className="row" style={{ gap: 'var(--space-2)' }}>{children}</div>;
}

function NoSelection({ title, act }: { title: string; act: EditActions }) {
  const [name, setName] = useState(title);
  return (
    <div className="score-edit__body stack-sm">
      <Field label="Titolo dello spartito">
<input className="input" value={name} maxLength={160} onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== title && act.title(name.trim())}
          onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) act.title(name.trim()); }} />
</Field>
      <Row>
        <Button size="sm" icon="music" onClick={act.selectFirst}>Inizia dalla prima nota</Button>
        <Button size="sm" icon="plus" onClick={act.addMeasure}>Aggiungi battuta</Button>
      </Row>
    </div>
  );
}

function TextTab({ sel, act }: { sel: NoteInfo; act: EditActions }) {
  const [lyric, setLyric] = useState(sel.lyric ?? '');
  const [harmony, setHarmony] = useState(sel.harmony ?? '');
  const saveLyric = () => { if (lyric !== (sel.lyric ?? '')) act.lyric(lyric); };
  const saveHarmony = () => { if (harmony !== (sel.harmony ?? '')) act.harmony(harmony); };
  return (
    <div className="score-edit__fields">
      <Field label="Sillaba sotto la nota" hint="Premi Invio per passare alla nota successiva.">
<input className="input" value={lyric} maxLength={40} disabled={sel.isRest} placeholder={sel.isRest ? 'Le pause non hanno testo' : 'es. Glo-'}
          onChange={(e) => setLyric(e.target.value)} onBlur={saveLyric}
          onKeyDown={(e) => { if (e.key === 'Enter') { saveLyric(); act.next(); } }} />
</Field>
      <Field label="Accordo sopra la nota" hint="Lascia vuoto per toglierlo.">
<input className="input" value={harmony} maxLength={16} placeholder="es. Am7, Sol, Re/F#"
          onChange={(e) => setHarmony(e.target.value)} onBlur={saveHarmony}
          onKeyDown={(e) => { if (e.key === 'Enter') saveHarmony(); }} />
</Field>
    </div>
  );
}
