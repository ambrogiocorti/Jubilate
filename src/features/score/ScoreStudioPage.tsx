import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useLibrary } from '../../app/LibraryProvider';
import { useToast } from '../../app/ToastProvider';
import {
  addScoreVersion, createScore, deleteScore, downloadText, fetchScore, fetchScoreVersions, fetchScoreXml, fetchVersionXml,
  readScoreFile, safeFilename, updateScoreMeta, INSTRUMENT_LABEL, type Instrument, type MusicScore, type ScoreVersion,
} from '../../data/scores';
import {
  addChordNote, appendMeasure, checkMeasures, createEmptyScore, deleteMeasureOf, insertNoteAfter, listNotes, NOTE_TYPES,
  parseMusicXml, scoreTitle, serializeMusicXml, setAlter, setClef, setDuration, setHarmony, setKeySignature, setLyric,
  setPitch, setScoreTitle, setTimeSignature, stepPitch, STEPS, toggleSlur, toggleTie, toNote, toRest,
  type NoteInfo, type NoteType, type Step,
} from '../../music/musicxml';
import { createHistory, push, redo, undo, type History } from '../editor/history';
import { friendlyError } from '../../lib/errors';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Alert, EmptyState, Spinner } from '../../components/ui/Feedback';
import { SongPicker } from '../../components/ui/SongPicker';
import { ScoreViewer } from './ScoreViewer';
import { ScoreFinder } from './ScoreFinder';
import { ScoreEditPanel, type EditActions } from './ScoreEditPanel';
import { candidateRights, candidateSource, type ScoreSource } from '../../data/scoreSearch';


/** Same step, octave chosen to stay closest to the previous pitch. */
function nearestOctave(prev: NoteInfo['pitch'], step: Step): number {
  if (!prev) return 4;
  const idx = (s: Step) => STEPS.indexOf(s);
  const base = prev.octave * 7 + idx(prev.step);
  let best = prev.octave;
  let dist = Infinity;
  for (const o of [prev.octave - 1, prev.octave, prev.octave + 1]) {
    const d = Math.abs(o * 7 + idx(step) - base);
    if (d < dist) { dist = d; best = o; }
  }
  return best;
}

export default function ScoreStudioPage() {
  const { scoreId } = useParams();
  const [params] = useSearchParams();
  const { user, isAdmin } = useAuth();
  const [state, setState] = useState<{ score: MusicScore | null; xml: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (scoreId && scoreId !== 'nuovo') {
          const score = await fetchScore(scoreId);
          const xml = (await fetchScoreXml(score)) ?? createEmptyScore({ title: score.title });
          if (!cancelled) setState({ score, xml });
        } else if (params.get('da')) {
          const src = await fetchScore(params.get('da')!);
          const xml = await fetchScoreXml(src);
          if (!xml) throw new Error('not_found');
          if (!cancelled) setState({ score: null, xml });
        } else if (!cancelled) setState({ score: null, xml: createEmptyScore({ title: 'Nuovo spartito', measures: 4 }) });
      } catch (e) {
        if (!cancelled) setError(friendlyError(e));
      }
    })();
    return () => { cancelled = true; };
  }, [scoreId, params]);

  if (error) return <EmptyState icon="music" title="Spartito non disponibile" action={<ButtonLink to="/">Torna alla libreria</ButtonLink>}>{error}</EmptyState>;
  if (!state || !user) return <Spinner />;
  const canWrite = !state.score || state.score.owner_id === user.id || (state.score.owner_id === null && isAdmin);
  return <Studio key={state.score?.id ?? 'new'} initialScore={state.score} initialXml={state.xml} canWrite={canWrite} songIdParam={params.get('canto')} isCopy={!!params.get('da')} />;
}

interface StudioProps {
  initialScore: MusicScore | null;
  initialXml: string;
  canWrite: boolean;
  songIdParam: string | null;
  isCopy?: boolean;
}

function Studio({ initialScore, initialXml, canWrite, songIdParam, isCopy = false }: StudioProps) {
  const toast = useToast();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { byId } = useLibrary();
  const draftKey = `jubilate.draft.score.${initialScore?.id ?? 'new'}`;
  const [score, setScore] = useState(initialScore);
  const [history, setHistory] = useState<History<string>>(() => createHistory(initialXml));
  const [savedXml, setSavedXml] = useState(initialScore ? initialXml : '');
  const [loadedVersion, setLoadedVersion] = useState(initialScore?.current_version_id ?? null);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(() => (typeof window !== "undefined" && window.innerWidth < 640 ? 60 : 45));
  const [duration, setDurationPick] = useState<NoteType>('quarter');
  const [saveOpen, setSaveOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<ScoreVersion[]>([]);
  const [conflict, setConflict] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draftOffer, setDraftOffer] = useState<string | null>(() => {
    try {
      const d = localStorage.getItem(draftKey);
      return d && d !== initialXml ? d : null;
    } catch {
      return null;
    }
  });
  const fileInput = useRef<HTMLInputElement>(null);
  const xml = history.present;

  const parsed = useMemo(() => {
    try {
      const doc = parseMusicXml(xml);
      return { doc, notes: listNotes(doc), issues: checkMeasures(doc), title: scoreTitle(doc), error: null as string | null };
    } catch (e) {
      return { doc: null, notes: [] as NoteInfo[], issues: [], title: '', error: e instanceof Error ? e.message : 'Errore' };
    }
  }, [xml]);
  const sel = parsed.notes.find((n) => n.id === selected) ?? null;
  const dirty = xml !== savedXml;
  // The editor still shows the blank score it opened with.
  const firstXml = useRef(xml).current;

  // Local draft (protects against crashes/closing the tab).
  useEffect(() => {
    if (!dirty || draftOffer) return;
    const t = setTimeout(() => {
      try { localStorage.setItem(draftKey, xml); } catch { /* quota: ignore */ }
    }, 600);
    return () => clearTimeout(t);
  }, [xml, dirty, draftKey, draftOffer]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  /** Applies an operation on a fresh copy of the document and records it in history. */
  const apply = useCallback((op: (doc: Document) => void, tag?: string) => {
    if (!canWrite) return;
    try {
      const doc = parseMusicXml(history.present);
      op(doc);
      const next = serializeMusicXml(doc);
      setHistory((h) => push(h, next, { tag }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Operazione non riuscita.');
    }
  }, [history.present, canWrite, toast]);

  const selectRelative = useCallback((d: number) => {
    const list = parsed.notes;
    if (!list.length) return;
    const i = list.findIndex((n) => n.id === selected);
    const next = list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + d))]!;
    setSelected(next.id);
  }, [parsed.notes, selected]);

  const setStep = useCallback((step: Step, addToChord = false) => {
    if (!sel) return;
    const pitch = { step, alter: 0, octave: nearestOctave(sel.pitch, step) };
    if (addToChord) {
      let nid = '';
      apply((d) => { nid = addChordNote(d, sel.id, pitch); });
      if (nid) setSelected(nid);
    } else if (sel.isRest) apply((d) => toNote(d, sel.id, pitch));
    else apply((d) => setPitch(d, sel.id, pitch));
  }, [sel, apply]);

  const insertAfter = useCallback((rest: boolean) => {
    if (!sel) return;
    let nid = '';
    apply((d) => { nid = insertNoteAfter(d, sel.id, rest ? null : (sel.pitch ?? { step: 'B', alter: 0, octave: 4 }), duration); });
    if (nid) setSelected(nid);
  }, [sel, apply, duration]);

  // Keep the selected note in view, above the editing panel.
  useEffect(() => {
    if (!selected) return;
    const el = document.querySelector('.score-canvas g.note.is-selected');
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selected]);

  const actions: EditActions = useMemo(() => ({
    prev: () => selectRelative(-1),
    next: () => selectRelative(1),
    deselect: () => setSelected(null),
    selectFirst: () => { const f = parsed.notes[0]; if (f) setSelected(f.id); },
    setStep: (st, chord) => setStep(st, chord),
    alter: (delta) => { if (sel && !sel.isRest) apply((d) => setAlter(d, sel.id, delta === 0 ? 0 : Math.max(-2, Math.min(2, (sel.pitch?.alter ?? 0) + delta)))); },
    move: (deg) => { if (sel && !sel.isRest) apply((d) => stepPitch(d, sel.id, deg), Math.abs(deg) === 1 ? 'step' : undefined); },
    duration: (t) => { setDurationPick(t); if (sel) apply((d) => setDuration(d, sel.id, t, 0)); },
    dot: () => { if (sel) apply((d) => setDuration(d, sel.id, sel.type ?? 'quarter', sel.dots ? 0 : 1)); },
    insert: (rest) => insertAfter(rest),
    toRest: () => { if (sel) apply((d) => toRest(d, sel.id)); },
    tie: () => { if (sel && !sel.isRest) apply((d) => toggleTie(d, sel.id)); },
    slur: (kind) => { if (sel && !sel.isRest) apply((d) => toggleSlur(d, sel.id, kind)); },
    addMeasure: () => apply((d) => appendMeasure(d)),
    deleteMeasure: () => { if (sel) { apply((d) => deleteMeasureOf(d, sel.id)); setSelected(null); } },
    lyric: (v) => { if (sel) apply((d) => setLyric(d, sel.id, v), 'lyric'); },
    harmony: (v) => { if (sel) apply((d) => setHarmony(d, sel.id, v)); },
    key: (f) => { if (sel) apply((d) => setKeySignature(d, sel.id, f)); },
    time: (b, bt) => { if (sel) apply((d) => setTimeSignature(d, sel.id, b, bt)); },
    clef: (c) => { if (sel) apply((d) => setClef(d, sel.id, c)); },
    title: (t) => apply((d) => setScoreTitle(d, t), 'title'),
  }), [sel, apply, selectRelative, setStep, insertAfter, parsed.notes]);

  // Keyboard shortcuts (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); setHistory((h) => (e.shiftKey ? redo(h) : undo(h))); return; }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); setHistory(redo); return; }
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (canWrite) setSaveOpen(true); return; }
      if (mod || e.altKey) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); selectRelative(-1); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); selectRelative(1); return; }
      if (e.key === 'Escape') { setSelected(null); return; }
      if (!sel || !canWrite) return;
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        if (!sel.isRest) apply((d) => stepPitch(d, sel.id, (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 7 : 1)), 'step');
        return;
      }
      const upper = e.key.toUpperCase();
      if ((STEPS as string[]).includes(upper) && e.key.length === 1) { e.preventDefault(); setStep(upper as Step, e.shiftKey); return; }
      if (/^[1-6]$/.test(e.key)) {
        const type = NOTE_TYPES[Number(e.key) - 1]!;
        setDurationPick(type);
        apply((d) => setDuration(d, sel.id, type, 0));
        return;
      }
      switch (e.key) {
        case '.': apply((d) => setDuration(d, sel.id, sel.type ?? 'quarter', sel.dots ? 0 : 1)); break;
        case '+': case '#': if (!sel.isRest) apply((d) => setAlter(d, sel.id, Math.min(2, (sel.pitch?.alter ?? 0) + 1))); break;
        case '-': if (!sel.isRest) apply((d) => setAlter(d, sel.id, Math.max(-2, (sel.pitch?.alter ?? 0) - 1))); break;
        case '=': case '0': if (!sel.isRest) apply((d) => setAlter(d, sel.id, 0)); break;
        case 'Delete': case 'Backspace': e.preventDefault(); apply((d) => toRest(d, sel.id)); break;
        case 'n': case 'N': insertAfter(false); break;
        case 'r': case 'R': insertAfter(true); break;
        case 't': case 'T': if (!sel.isRest) apply((d) => toggleTie(d, sel.id)); break;
        default:
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sel, canWrite, apply, selectRelative, setStep, insertAfter]);

  const importFile = async (file: File) => {
    try {
      const text = await readScoreFile(file);
      parseMusicXml(text); // validate
      setHistory((h) => push(h, serializeMusicXml(parseMusicXml(text))));
      setSelected(null);
      toast.success('Partitura importata. Controlla il risultato prima di salvare.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Importazione non riuscita.');
    }
  };

  const doSave = async (meta: SaveMeta, force = false) => {
    if (!user) return;
    setBusy(true);
    try {
      if (!score) {
        const created = await createScore(
          { song_id: meta.songId, title: meta.title, instrument: meta.instrument, official: meta.official, ownerId: user.id, source: meta.source || null, rights: meta.rights },
          xml,
          meta.note || 'Prima versione',
        );
        if (meta.official && meta.publish) await updateScoreMeta(created.id, { status: 'published' });
        try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
        setSavedXml(xml);
        toast.success('Spartito salvato.');
        navigate(`/spartiti/${created.id}`, { replace: true });
        return;
      }
      const remote = await fetchScore(score.id);
      if (!force && remote.current_version_id !== loadedVersion) {
        setConflict(true);
        return;
      }
      await addScoreVersion(score.id, xml, meta.note || null);
      const patch: Parameters<typeof updateScoreMeta>[1] = {};
      if (meta.title !== score.title) patch.title = meta.title;
      if (meta.instrument !== score.instrument) patch.instrument = meta.instrument;
      if (score.owner_id === null && meta.publish && score.status !== 'published') patch.status = 'published';
      if (Object.keys(patch).length) await updateScoreMeta(score.id, patch);
      const fresh = await fetchScore(score.id);
      setScore(fresh);
      setLoadedVersion(fresh.current_version_id);
      setSavedXml(xml);
      try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      setSaveOpen(false);
      setConflict(false);
      toast.success('Nuova versione salvata.');
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };
  const [pendingMeta, setPendingMeta] = useState<SaveMeta | null>(null);
  const [importedFrom, setImportedFrom] = useState<ScoreSource | null>(null);

  const openHistory = async () => {
    if (!score) return;
    setHistoryOpen(true);
    try { setVersions(await fetchScoreVersions(score.id)); } catch (e) { toast.error(friendlyError(e)); }
  };

  const song = score?.song_id ? byId.get(score.song_id) : songIdParam ? byId.get(songIdParam) : undefined;
  const backTo = song ? `/canti/${song.id}` : '/';

  return (
    <div className="stack" style={{ maxWidth: 'var(--content-max)', margin: '0 auto' }}>
      <div className="page-header score-studio-header" style={{ marginBottom: 0 }}>
        <div className="page-header__text">
          <Link to={backTo} className="small">← {song ? `${song.number ? song.number + '. ' : ''}${song.title}` : 'Libreria'}</Link>
          <h1>{parsed.title || 'Spartito'}</h1>
          <p className="small">
            {score ? (score.owner_id ? 'Spartito personale' : `Spartito ufficiale · ${score.status === 'published' ? 'pubblicato' : 'bozza'}`) : 'Nuovo spartito (non ancora salvato)'}
            {score && ` · ${INSTRUMENT_LABEL[score.instrument]}`}
            {dirty && ' · modifiche non salvate'}
          </p>
        </div>
        <div className="row">
          <input ref={fileInput} type="file" accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/vnd.recordare.musicxml" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
          {canWrite && <Button size="sm" icon="upload" onClick={() => fileInput.current?.click()}>Importa</Button>}
          <Button size="sm" icon="download" onClick={() => downloadText(`${safeFilename(parsed.title)}.musicxml`, xml)} title="Scarica il file MusicXML" aria-label="Esporta MusicXML">Esporta</Button>
          {score && <Button size="sm" icon="history" onClick={openHistory}>Cronologia</Button>}
          {canWrite && <Button size="sm" variant="primary" icon="check" onClick={() => setSaveOpen(true)} disabled={!dirty && !!score}>Salva</Button>}
          {!canWrite && score && <ButtonLink variant="primary" icon="copy" to={`/spartiti/nuovo?da=${score.id}${score.song_id ? `&canto=${score.song_id}` : ''}`}>Crea una copia personale</ButtonLink>}
        </div>
      </div>

      {!score && canWrite && song && (
        <ScoreFinder title={song.title} autoImport={!isCopy && xml === firstXml && !draftOffer} onImported={(text, c) => {
          setHistory((h) => push(h, serializeMusicXml(parseMusicXml(text))));
          setSelected(null);
          setImportedFrom(c);
          toast.success(c.site === 'Catalogo' ? `Caricato «${c.title}» dal catalogo. Controllalo prima di salvare.` : 'Spartito caricato. Controllalo prima di salvare.');
        }} />
      )}

      {draftOffer && (
        <Alert tone="info" title="Modifiche non salvate trovate">
          <div className="row" style={{ marginTop: 'var(--space-2)' }}>
            <span>Su questo dispositivo c'è una bozza più recente di questo spartito.</span>
            <Button size="sm" onClick={() => { setHistory((h) => push(h, draftOffer)); setDraftOffer(null); }}>Ripristina bozza</Button>
            <Button size="sm" variant="ghost" onClick={() => { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } setDraftOffer(null); }}>Scarta</Button>
          </div>
        </Alert>
      )}
      {parsed.error && <Alert tone="danger">{parsed.error}</Alert>}
      {!canWrite && <Alert tone="info">Puoi consultare ed esportare questo spartito. Per modificarlo crea una copia personale.</Alert>}

      <div className="stack-sm score-studio">
        <div className="score-studio__bar">
          {canWrite ? (
            <div className="row" style={{ gap: 'var(--space-1)' }}>
              <Button size="sm" icon="undo" iconOnly onClick={() => setHistory(undo)} disabled={!history.past.length}>Annulla (Ctrl+Z)</Button>
              <Button size="sm" icon="redo" iconOnly onClick={() => setHistory(redo)} disabled={!history.future.length}>Ripeti (Ctrl+Shift+Z)</Button>
            </div>
          ) : <p className="small muted" style={{ margin: 0 }}>Anteprima dello spartito.</p>}
          <div className="row" style={{ gap: 'var(--space-1)' }}>
            <Button size="sm" icon="minus" iconOnly onClick={() => setZoom((z) => Math.max(20, z - 10))}>Riduci</Button>
            <span className="small" style={{ minWidth: '3rem', textAlign: 'center' }}>{zoom}%</span>
            <Button size="sm" icon="plus" iconOnly onClick={() => setZoom((z) => Math.min(150, z + 10))}>Ingrandisci</Button>
          </div>
        </div>
        {!parsed.error && <ScoreViewer xml={xml} scale={zoom} selectedId={selected} onSelect={setSelected} label={`Spartito ${parsed.title}`} />}
        {parsed.issues.length > 0 && (
          <Alert tone="warning" title="Controllo delle battute">
            <ul style={{ margin: 0, paddingLeft: '1.2em' }}>
              {parsed.issues.slice(0, 8).map((i) => (
                <li key={`${i.partId}-${i.measure}`}>Battuta {i.measure}: {i.actual < i.expected ? 'mancano valori' : 'durate in eccesso'} rispetto al tempo indicato.</li>
              ))}
              {parsed.issues.length > 8 && <li>…e altre {parsed.issues.length - 8}.</li>}
            </ul>
          </Alert>
        )}
      </div>

      {canWrite && parsed.doc && (
        <ScoreEditPanel key={parsed.title} sel={sel} title={parsed.title} duration={duration} act={actions} />
      )}

      <details className="small muted">
        <summary>Scorciatoie da tastiera</summary>
        <p style={{ marginTop: 'var(--space-2)' }}>
          ← → nota precedente/successiva · ↑ ↓ grado (Maiusc: ottava) · A–G nome della nota (Maiusc: aggiungi all'accordo) · 1–6 durata ·
          . punto · + − 0 alterazioni · N nuova nota · R nuova pausa · Canc trasforma in pausa · T legatura · Ctrl+Z / Ctrl+Maiusc+Z annulla/ripeti · Ctrl+S salva.
        </p>
      </details>

      {score && canWrite && (
        <div>
          <Button variant="danger-soft" icon="trash" onClick={() => setConfirmDelete(true)}>Elimina spartito</Button>
        </div>
      )}

      <SaveDialog
        defaultSource={importedFrom ? candidateSource(importedFrom) : undefined}
        defaultRights={importedFrom ? candidateRights(importedFrom) : undefined}
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        busy={busy}
        isNew={!score}
        isAdmin={isAdmin}
        score={score}
        defaultTitle={parsed.title}
        defaultSongId={score?.song_id ?? songIdParam}
        issues={parsed.issues.length}
        onSave={(m) => { setPendingMeta(m); void doSave(m); }}
      />

      <Dialog open={conflict} onClose={() => setConflict(false)} title="Lo spartito è stato modificato altrove"
        footer={<>
          <Button onClick={() => setConflict(false)}>Annulla</Button>
          <Button onClick={() => { downloadText(`${safeFilename(parsed.title)}-mia-copia.musicxml`, xml); }}>Scarica la mia copia</Button>
          <Button variant="primary" loading={busy} onClick={() => pendingMeta && void doSave(pendingMeta, true)}>Salva comunque come nuova versione</Button>
        </>}>
        <p>Dopo che hai aperto lo spartito è stata salvata un'altra versione (da un altro dispositivo o da un altro amministratore). Se salvi, la tua diventa la versione corrente; quella precedente resta comunque nella cronologia e può essere ripristinata.</p>
      </Dialog>

      <Dialog open={historyOpen} onClose={() => setHistoryOpen(false)} title="Cronologia delle versioni">
        {versions.length === 0 ? <Spinner /> : (
          <ul role="list" className="stack-sm">
            {versions.map((v) => (
              <li key={v.id} className="row row--between">
                <div>
                  <strong>Versione {v.version}</strong>{v.id === score?.current_version_id && <span className="badge badge--accent" style={{ marginLeft: 8 }}>corrente</span>}
                  <p className="small muted">{new Date(v.created_at).toLocaleString('it-IT')}{v.note ? ` · ${v.note}` : ''}</p>
                </div>
                <Button size="sm" onClick={async () => {
                  try {
                    const text = await fetchVersionXml(v.id);
                    setHistory((h) => push(h, text));
                    setHistoryOpen(false);
                    toast.show(`Versione ${v.version} caricata nell'editor. Salva per renderla corrente.`);
                  } catch (e) { toast.error(friendlyError(e)); }
                }}>Carica</Button>
              </li>
            ))}
          </ul>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminare lo spartito?"
        message="Lo spartito e tutta la sua cronologia saranno eliminati. Le versioni personali che lo usano non lo mostreranno più."
        confirmLabel="Elimina"
        destructive
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!score) return;
          setBusy(true);
          try {
            await deleteScore(score.id);
            try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
            setSavedXml(xml);
            toast.success('Spartito eliminato.');
            navigate(backTo, { replace: true });
          } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(false); }
        }}
      />
    </div>
  );
}

interface SaveMeta {
  title: string;
  instrument: Instrument;
  songId: string | null;
  official: boolean;
  publish: boolean;
  note: string;
  source: string;
  rights: 'unknown' | 'public_domain' | 'own_work' | 'permission_granted' | 'licensed';
}

function SaveDialog(props: {
  open: boolean; onClose: () => void; busy: boolean; isNew: boolean; isAdmin: boolean; score: MusicScore | null;
  defaultTitle: string; defaultSongId: string | null; issues: number; onSave: (m: SaveMeta) => void;
  defaultSource?: string; defaultRights?: SaveMeta['rights'];
}) {
  const { byId } = useLibrary();
  const [meta, setMeta] = useState<SaveMeta>({
    title: props.score?.title ?? props.defaultTitle,
    instrument: props.score?.instrument ?? 'piano',
    songId: props.defaultSongId,
    official: false,
    publish: false,
    note: '',
    source: props.defaultSource ?? '',
    rights: props.defaultRights ?? 'own_work',
  });
  const [picker, setPicker] = useState(false);
  useEffect(() => {
    if (props.open) setMeta((m) => ({ ...m, title: props.score?.title ?? props.defaultTitle, source: m.source || (props.defaultSource ?? ''), rights: props.defaultSource && !m.source ? (props.defaultRights ?? m.rights) : m.rights }));
  }, [props.open, props.score, props.defaultTitle, props.defaultSource, props.defaultRights]);
  const song = meta.songId ? byId.get(meta.songId) : undefined;
  const isOfficial = props.score ? props.score.owner_id === null : meta.official;
  return (
    <Dialog open={props.open} onClose={props.onClose} title={props.isNew ? 'Salva lo spartito' : 'Salva una nuova versione'}
      footer={<>
        <Button onClick={props.onClose}>Annulla</Button>
        <Button variant="primary" loading={props.busy} disabled={!meta.title.trim() || (isOfficial && !meta.songId)} onClick={() => props.onSave({ ...meta, title: meta.title.trim() })}>Salva</Button>
      </>}>
      <div className="stack">
        {props.issues > 0 && <Alert tone="warning">{props.issues === 1 ? 'Una battuta non torna' : `${props.issues} battute non tornano`} con il tempo indicato. Puoi salvare comunque e correggere più tardi.</Alert>}
        <Field label="Titolo">
          <input className="input" value={meta.title} maxLength={160} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
        </Field>
        <Field label="Strumento">
          <select className="select" value={meta.instrument} onChange={(e) => setMeta({ ...meta, instrument: e.target.value as Instrument })}>
            {(Object.keys(INSTRUMENT_LABEL) as Instrument[]).map((i) => <option key={i} value={i}>{INSTRUMENT_LABEL[i]}</option>)}
          </select>
        </Field>
        {props.isNew && (
          <div className="stack-sm">
            <span className="field__label">Canto collegato</span>
            <div className="row">
              <span>{song ? `${song.number ? song.number + '. ' : ''}${song.title}` : 'Nessuno'}</span>
              <Button size="sm" onClick={() => setPicker(true)}>{song ? 'Cambia' : 'Scegli'}</Button>
              {song && <Button size="sm" variant="ghost" onClick={() => setMeta({ ...meta, songId: null })}>Rimuovi</Button>}
            </div>
          </div>
        )}
        {props.isNew && props.isAdmin && (
          <label className="row small">
            <input type="checkbox" checked={meta.official} onChange={(e) => setMeta({ ...meta, official: e.target.checked })} />
            Spartito ufficiale della parrocchia (richiede un canto collegato)
          </label>
        )}
        {isOfficial && props.isAdmin && (!props.score || props.score.status !== 'published') && (
          <label className="row small">
            <input type="checkbox" checked={meta.publish} onChange={(e) => setMeta({ ...meta, publish: e.target.checked })} />
            Pubblica subito (visibile a tutti gli utenti registrati)
          </label>
        )}
        {props.isNew && isOfficial && (
          <>
            <Field label="Fonte" hint="Da dove proviene lo spartito (edizione, autore dell'arrangiamento…).">
              <input className="input" value={meta.source} maxLength={500} onChange={(e) => setMeta({ ...meta, source: e.target.value })} />
            </Field>
            <Field label="Diritti">
              <select className="select" value={meta.rights} onChange={(e) => setMeta({ ...meta, rights: e.target.value as SaveMeta['rights'] })}>
                <option value="own_work">Opera propria</option>
                <option value="public_domain">Pubblico dominio</option>
                <option value="permission_granted">Autorizzazione ottenuta</option>
                <option value="licensed">Licenza</option>
                <option value="unknown">Da verificare</option>
              </select>
            </Field>
          </>
        )}
        <Field label="Nota sulla versione (facoltativa)">
          <input className="input" value={meta.note} maxLength={500} placeholder="Es. corrette le durate della seconda strofa" onChange={(e) => setMeta({ ...meta, note: e.target.value })} />
        </Field>
      </div>
      <SongPicker open={picker} onClose={() => setPicker(false)} onPick={(id) => { setMeta({ ...meta, songId: id }); setPicker(false); }} />
    </Dialog>
  );
}
