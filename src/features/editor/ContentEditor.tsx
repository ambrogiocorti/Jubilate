import { useMemo, useState } from 'react';
import { usePrefs } from '../../app/PrefsProvider';
import {
  SECTION_KINDS, SECTION_KIND_LABEL, expandSequence, isValidContent, sectionTitle, unknownChords, unusedSections,
  validateContent, ContentError, chordsFor, type SectionKind, type SongContent,
} from '../../domain/song';
import { formatChord, parseChord } from '../../music/chord';
import {
  addSection, insertSequenceItem, moveChord, moveSection, moveSequenceItem, normalizeChordNames, removeSection,
  removeSequenceItem, sectionToInline, setChordAt, setSectionInline, transposeContent, updateSection,
} from './contentOps';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Alert } from '../../components/ui/Feedback';
import { SongView } from '../song/SongView';

interface Props {
  content: SongContent;
  onChange: (c: SongContent, tag?: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Hide chord tools (e.g. for text-only corrections). */
  textOnly?: boolean;
}

function displayChord(text: string, notation: 'italian' | 'international'): string {
  const c = parseChord(text);
  return c ? formatChord(c, notation) : text;
}

type Tab = 'text' | 'chords' | 'order' | 'preview';

/**
 * Structured song editor: sections (verse/chorus/bridge…), inline chord
 * notation ("[G]Sorge la [D/F#]luce"), click-to-place chord editor, sequence
 * with repeats, transposition, undo/redo and live preview.
 */
export function ContentEditor({ content, onChange, undo, redo, canUndo, canRedo, textOnly }: Props) {
  const [tab, setTab] = useState<Tab>('text');
  const { prefs } = usePrefs();
  const errors = useMemo(() => {
    try {
      validateContent(content);
      return null;
    } catch (e) {
      return e instanceof ContentError ? e.message : 'Contenuto non valido.';
    }
  }, [content]);
  const unknown = useMemo(() => unknownChords(content), [content]);
  const unused = useMemo(() => unusedSections(content), [content]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'text', label: textOnly ? 'Testo' : 'Testo e accordi' },
    ...(!textOnly ? [{ id: 'chords' as Tab, label: 'Posiziona accordi' }] : []),
    { id: 'order', label: 'Ordine e ripetizioni' },
    { id: 'preview', label: 'Anteprima' },
  ];

  return (
    <div className="stack">
      <div className="row row--between">
        <div className="tabs" role="tablist" aria-label="Sezioni dell’editor">
          {tabs.map((t) => (
            <button key={t.id} role="tab" className="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
          ))}
        </div>
        <div className="row" style={{ gap: 'var(--space-1)' }}>
          <Button variant="ghost" size="sm" iconOnly icon="undo" disabled={!canUndo} onClick={undo}>Annulla (Ctrl+Z)</Button>
          <Button variant="ghost" size="sm" iconOnly icon="redo" disabled={!canRedo} onClick={redo}>Ripristina (Ctrl+Y)</Button>
        </div>
      </div>

      {errors && <Alert tone="warning">{errors}</Alert>}
      {!textOnly && unknown.length > 0 && <Alert tone="warning">Accordi non riconosciuti (non verranno trasposti): {unknown.join(', ')}</Alert>}
      {unused.length > 0 && <Alert tone="info">Sezioni non presenti nell’ordine di esecuzione: {unused.map((s) => sectionTitle(s, content)).join(', ')}.</Alert>}

      {tab === 'text' && <TextTab content={content} onChange={onChange} textOnly={textOnly} />}
      {tab === 'chords' && !textOnly && <ChordsTab content={content} onChange={onChange} notation={prefs.notation} />}
      {tab === 'order' && <OrderTab content={content} onChange={onChange} />}
      {tab === 'preview' && (
        <div className="panel" style={{ padding: 'var(--space-6)' }}>
          {isValidContent(content) ? (
            <div className="song"><SongView content={content} showChords={!textOnly} chordOptions={{ transpose: 0, capo: 0, notation: prefs.notation, showShapes: false }} /></div>
          ) : (
            <p className="muted">Correggi gli errori per vedere l’anteprima.</p>
          )}
        </div>
      )}
    </div>
  );
}

function TextTab({ content, onChange, textOnly }: { content: SongContent; onChange: Props['onChange']; textOnly?: boolean }) {
  const [newKind, setNewKind] = useState<SectionKind>('verse');
  return (
    <div className="stack">
      {!textOnly && (
        <p className="small muted">
          Scrivi gli accordi tra parentesi quadre subito prima della sillaba: <code>[G]Sorge la [D/F#]luce</code>. Puoi usare anche la notazione italiana (<code>[Sol]</code>, <code>[Re/Fa#]</code>).
        </p>
      )}
      {content.sections.map((s, i) => (
        <section key={s.key} className="panel">
          <div className="panel__header" style={{ flexWrap: 'wrap' }}>
            <div className="row">
              <select className="select" style={{ width: 'auto', minHeight: 36 }} aria-label="Tipo di sezione" value={s.kind} onChange={(e) => onChange(updateSection(content, s.key, { kind: e.target.value as SectionKind }))}>
                {SECTION_KINDS.map((k) => <option key={k} value={k}>{SECTION_KIND_LABEL[k]}</option>)}
              </select>
              <input className="input" style={{ width: 200, minHeight: 36 }} aria-label="Etichetta (facoltativa)" placeholder={sectionTitle(s, content)} value={s.label ?? ''} maxLength={60}
                onChange={(e) => onChange(updateSection(content, s.key, { label: e.target.value }), `label:${s.key}`)} />
            </div>
            <div className="row" style={{ gap: 'var(--space-1)' }}>
              <Button variant="ghost" size="sm" iconOnly icon="chevronUp" disabled={i === 0} onClick={() => onChange(moveSection(content, s.key, -1))}>Sposta su</Button>
              <Button variant="ghost" size="sm" iconOnly icon="chevronDown" disabled={i === content.sections.length - 1} onClick={() => onChange(moveSection(content, s.key, 1))}>Sposta giù</Button>
              <Button variant="ghost" size="sm" iconOnly icon="trash" disabled={content.sections.length <= 1} onClick={() => onChange(removeSection(content, s.key))}>Elimina sezione</Button>
            </div>
          </div>
          <div className="panel__body">
            <textarea
              className={`textarea${textOnly ? '' : ' textarea--mono'}`}
              aria-label={`Testo di ${sectionTitle(s, content)}`}
              rows={Math.max(3, s.lines.length + 1)}
              value={textOnly ? s.lines.join('\n') : sectionToInline(content, s.key)}
              spellCheck
              lang="it"
              onChange={(e) => {
                const next = textOnly
                  ? setSectionInline(content, s.key, e.target.value.replace(/\[|\]/g, ''))
                  : setSectionInline(content, s.key, e.target.value);
                onChange(next, `text:${s.key}`);
              }}
            />
          </div>
        </section>
      ))}
      <div className="row">
        <select className="select" style={{ width: 'auto' }} aria-label="Tipo della nuova sezione" value={newKind} onChange={(e) => setNewKind(e.target.value as SectionKind)}>
          {SECTION_KINDS.map((k) => <option key={k} value={k}>{SECTION_KIND_LABEL[k]}</option>)}
        </select>
        <Button icon="plus" onClick={() => onChange(addSection(content, newKind).content)}>Aggiungi sezione</Button>
      </div>
    </div>
  );
}

interface Sel { section: string; line: number; offset: number }

function ChordsTab({ content, onChange, notation }: { content: SongContent; onChange: Props['onChange']; notation: 'italian' | 'international' }) {
  const [sel, setSel] = useState<Sel | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const existing = sel ? (content.chords ?? []).find((p) => p.section === sel.section && p.line === sel.line && p.offset === sel.offset) : undefined;

  const select = (s: Sel) => {
    setSel(s);
    const ex = (content.chords ?? []).find((p) => p.section === s.section && p.line === s.line && p.offset === s.offset);
    setDraft(ex?.chord ?? '');
    setError(null);
  };
  const apply = () => {
    if (!sel) return;
    if (draft.trim() && !parseChord(draft)) {
      setError('Accordo non riconosciuto. Esempi: G, Am7, D/F#, Sol, Re/Fa#.');
      return;
    }
    const normalized = draft.trim() ? formatChord(parseChord(draft)!) : null;
    onChange(setChordAt(content, sel.section, sel.line, sel.offset, normalized));
    setError(null);
  };

  return (
    <div className="stack">
      <div className="row row--between">
        <p className="small muted grow">Tocca una lettera per inserire un accordo in quella posizione. Seleziona un accordo esistente per modificarlo o spostarlo.</p>
        <div className="row">
          <span className="small muted">Trasponi tutto:</span>
          <Button size="sm" onClick={() => onChange(transposeContent(content, -1))}>−1</Button>
          <Button size="sm" onClick={() => onChange(transposeContent(content, 1))}>+1</Button>
          <Button size="sm" onClick={() => onChange(normalizeChordNames(content))} title="Converte la notazione italiana nel formato di archiviazione">Normalizza nomi</Button>
        </div>
      </div>
      <Field label="Tonalità in cui sono scritti gli accordi" hint="Serve per trasporre con le alterazioni corrette (es. G, Dm, Bb).">
        <input className="input" style={{ maxWidth: 160 }} value={content.key ?? ''} maxLength={4}
          onChange={(e) => onChange({ ...content, key: e.target.value.trim() || null }, 'key')} />
      </Field>

      {sel && (
        <div className="panel" style={{ position: 'sticky', top: 'calc(var(--topbar-h) + 8px)', zIndex: 5, boxShadow: 'var(--shadow-lg)' }}>
          <div className="panel__body">
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div style={{ width: 160 }}>
                <Field label="Accordo" error={error}>
                  <input className="input" autoFocus value={draft} maxLength={24} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && apply()} />
                </Field>
              </div>
              <Button variant="primary" onClick={apply}>{existing ? 'Aggiorna' : 'Inserisci'}</Button>
              {existing && (
                <>
                  <Button iconOnly icon="chevronLeft" onClick={() => {
                    const r = moveChord(content, sel.section, sel.line, sel.offset, -step);
                    onChange(r.content);
                    setSel({ ...sel, offset: r.offset });
                  }}>Sposta a sinistra</Button>
                  <Button iconOnly icon="chevronRight" onClick={() => {
                    const r = moveChord(content, sel.section, sel.line, sel.offset, step);
                    onChange(r.content);
                    setSel({ ...sel, offset: r.offset });
                  }}>Sposta a destra</Button>
                  <select className="select" style={{ width: 'auto' }} aria-label="Passo di spostamento" value={step} onChange={(e) => setStep(Number(e.target.value))}>
                    <option value={1}>1 lettera</option>
                    <option value={3}>3 lettere</option>
                  </select>
                  <Button variant="danger-soft" icon="trash" onClick={() => { onChange(setChordAt(content, sel.section, sel.line, sel.offset, null)); setSel(null); }}>Elimina</Button>
                </>
              )}
              <Button variant="ghost" onClick={() => setSel(null)}>Chiudi</Button>
            </div>
          </div>
        </div>
      )}

      {content.sections.map((s) => (
        <section key={s.key} className="stack-sm">
          <div className="section-title">{sectionTitle(s, content)}</div>
          <div style={{ fontFamily: 'var(--font-reading)', fontSize: '1.15rem' }}>
            {s.lines.map((line, li) => {
              const placements = chordsFor(content, s.key, li);
              const at = new Map(placements.map((p) => [p.offset, p.chord]));
              const chars = [...line, ' ']; // trailing slot for line-end chords
              return (
                <div key={li} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', margin: '0 0 0.4em' }} role="group" aria-label={`Riga ${li + 1}`}>
                  {chars.map((ch, ci) => {
                    const chord = at.get(ci);
                    const selected = sel?.section === s.key && sel.line === li && sel.offset === ci;
                    return (
                      <button
                        key={ci}
                        type="button"
                        onClick={() => select({ section: s.key, line: li, offset: ci })}
                        aria-label={chord ? `Accordo ${chord} sulla lettera ${ch.trim() || 'spazio'}` : `Inserisci accordo prima di «${ch.trim() || 'spazio'}»`}
                        aria-pressed={selected}
                        style={{
                          display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start',
                          border: 0, padding: 0, background: selected ? 'var(--accent-soft-strong)' : 'transparent',
                          font: 'inherit', color: 'inherit', cursor: 'pointer', minHeight: 44, justifyContent: 'flex-end',
                          borderRadius: 3,
                        }}
                      >
                        <span style={{ fontFamily: 'var(--font-ui)', fontSize: '0.8em', fontWeight: 600, color: 'var(--chord)', minHeight: '1.2em', whiteSpace: 'pre' }}>
                          {chord ? displayChord(chord, notation) : ''}
                        </span>
                        <span style={{ whiteSpace: 'pre' }}>{ch === ' ' ? ' ' : ch}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function OrderTab({ content, onChange }: { content: SongContent; onChange: Props['onChange'] }) {
  const byKey = new Map(content.sections.map((s) => [s.key, s]));
  const entries = expandSequence(content);
  const [toAdd, setToAdd] = useState(content.sections[0]?.key ?? '');
  return (
    <div className="stack">
      <p className="small muted">L’ordine di esecuzione richiama le sezioni senza duplicarle: per ripetere il ritornello aggiungilo di nuovo all’ordine.</p>
      <ol className="list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {content.sequence.map((key, i) => {
          const s = byKey.get(key);
          const e = entries.find((x) => x.index === i);
          return (
            <li key={`${key}-${i}`} className="list-row">
              <span className="list-row__num">{i + 1}</span>
              <span className="list-row__main">
                <span className="list-row__title">{s ? sectionTitle(s, content) : key}{e?.isRepeat ? ' (ripetizione)' : ''}</span>
                <span className="list-row__meta">{s?.lines[0]}</span>
              </span>
              <span className="list-row__end">
                <Button size="sm" variant="ghost" iconOnly icon="chevronUp" disabled={i === 0} onClick={() => onChange(moveSequenceItem(content, i, -1))}>Sposta su</Button>
                <Button size="sm" variant="ghost" iconOnly icon="chevronDown" disabled={i === content.sequence.length - 1} onClick={() => onChange(moveSequenceItem(content, i, 1))}>Sposta giù</Button>
                <Button size="sm" variant="ghost" iconOnly icon="x" disabled={content.sequence.length <= 1} onClick={() => onChange(removeSequenceItem(content, i))}>Rimuovi dall’ordine</Button>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="row">
        <select className="select" style={{ width: 'auto' }} aria-label="Sezione da aggiungere" value={toAdd} onChange={(e) => setToAdd(e.target.value)}>
          {content.sections.map((s) => <option key={s.key} value={s.key}>{sectionTitle(s, content)}</option>)}
        </select>
        <Button icon="plus" onClick={() => toAdd && onChange(insertSequenceItem(content, toAdd))}>Aggiungi all’ordine</Button>
      </div>
    </div>
  );
}
