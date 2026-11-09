import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useLibrary } from '../../app/LibraryProvider';
import { useToast } from '../../app/ToastProvider';
import {
  deleteContribution, fetchContribution, saveContribution, KIND_LABEL, STATUS_LABEL,
  type Contribution, type ContributionKind, type ContributionPayload,
} from '../../data/contributions';
import { fetchSongRemote } from '../../data/library';
import { fetchArrangement } from '../../data/personal';
import { createMediaAsset, uploadMediaFile, validateUpload, youtubeId, audioDuration } from '../../data/media';
import { readScoreFile, INSTRUMENT_LABEL, type Instrument } from '../../data/scores';
import { candidateSource } from '../../data/scoreSearch';
import { ScoreFinder } from '../score/ScoreFinder';
import { diffContent } from '../../domain/diff';
import { emptyContent, isValidContent, type SongContent } from '../../domain/song';
import { importPlainText } from '../../domain/textImport';
import { parseMusicXml, scoreTitle } from '../../music/musicxml';
import { friendlyError } from '../../lib/errors';
import { Button, ButtonLink } from '../../components/ui/Button';
import { ConfirmDialog, Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Alert, EmptyState, Spinner } from '../../components/ui/Feedback';
import { DiffView } from '../../components/ui/DiffView';
import { ContentEditor } from '../editor/ContentEditor';
import { useEditor } from '../editor/useEditor';
import { MetadataForm, metaFromSong, type SongMeta } from './MetadataForm';
import { STATUS_TONE } from './ContributionsPage';
import { ScoreViewer } from '../score/ScoreViewer';

const KINDS_FOR_SONG: ContributionKind[] = ['correction', 'chords', 'metadata', 'score', 'recording'];
const CONTENT_KINDS: ContributionKind[] = ['new_song', 'correction', 'chords', 'arrangement'];

interface Loaded {
  existing: Contribution | null;
  kind: ContributionKind;
  songId: string | null;
  baseRevisionId: string | null;
  official: SongContent | null;
  officialMeta: SongMeta | null;
  content: SongContent;
  meta: SongMeta;
}

export default function ContributionEditorPage() {
  const { contributionId } = useParams();
  const [params] = useSearchParams();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let existing: Contribution | null = null;
        let kind = (params.get('tipo') as ContributionKind | null) ?? 'new_song';
        let songId = params.get('canto');
        if (contributionId) {
          existing = await fetchContribution(contributionId);
          kind = existing.kind;
          songId = existing.song_id;
        }
        if (!(kind in KIND_LABEL)) kind = 'new_song';
        if (kind !== 'new_song' && !songId) kind = 'new_song';
        let official: SongContent | null = null;
        let officialMeta: SongMeta | null = null;
        let baseRevisionId: string | null = existing?.base_revision_id ?? null;
        if (songId) {
          const d = await fetchSongRemote(songId);
          official = d.content;
          officialMeta = metaFromSong(d.song as unknown as Record<string, unknown>);
          if (!existing) baseRevisionId = d.song.current_revision_id;
        }
        let content = existing?.payload.content ?? official ?? emptyContent();
        const arrId = params.get('versione');
        if (!existing && kind === 'arrangement' && arrId) content = (await fetchArrangement(arrId)).content;
        const meta = (existing?.payload.metadata as SongMeta | undefined) ?? officialMeta ?? { title: '' };
        if (!cancelled) setLoaded({ existing, kind, songId, baseRevisionId, official, officialMeta, content, meta });
      } catch (e) {
        if (!cancelled) setError(friendlyError(e));
      }
    })();
    return () => { cancelled = true; };
  }, [contributionId, params]);

  if (error) return <EmptyState icon="send" title="Proposta non disponibile" action={<ButtonLink to="/proposte">Le mie proposte</ButtonLink>}>{error}</EmptyState>;
  if (!loaded) return <Spinner />;
  return <ContributionForm key={loaded.existing?.id ?? `${loaded.kind}-${loaded.songId}`} loaded={loaded} arrangementId={params.get('versione')} />;
}

function ContributionForm({ loaded, arrangementId }: { loaded: Loaded; arrangementId: string | null }) {
  const { user } = useAuth();
  const { byId, categories } = useLibrary();
  const toast = useToast();
  const navigate = useNavigate();
  const { existing, songId, official } = loaded;
  const editable = !existing || (existing.author_id === user?.id && existing.status === 'draft');
  const [kind, setKind] = useState<ContributionKind>(loaded.kind);
  const editor = useEditor(loaded.content, editable ? `jubilate.draft.contribution.${existing?.id ?? `${kind}-${songId ?? 'new'}`}` : null);
  const [meta, setMeta] = useState<SongMeta>(loaded.meta);
  const [categoryIds, setCategoryIds] = useState<string[]>(existing?.payload.category_ids ?? []);
  const song = songId ? byId.get(songId) : undefined;
  const [title, setTitle] = useState(existing?.title ?? (song ? `${KIND_LABEL[loaded.kind]}: ${song.title}` : ''));
  const [message, setMessage] = useState(existing?.message ?? '');
  const [musicxml, setMusicxml] = useState<string | null>(existing?.payload.musicxml ?? null);
  const [scoreName, setScoreName] = useState(existing?.payload.score_title ?? '');
  const [instrument, setInstrument] = useState<Instrument>((existing?.payload.instrument as Instrument) ?? 'piano');
  const [mediaId, setMediaId] = useState<string | null>(existing?.payload.media_asset_id ?? null);
  const [recording, setRecording] = useState<{ file: File | null; youtube: string; performer: string; rights: string }>({ file: null, youtube: '', performer: '', rights: 'own_work' });
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const usesContent = CONTENT_KINDS.includes(kind);
  const usesMeta = kind === 'new_song' || kind === 'metadata';
  const diff = useMemo(() => (official && usesContent ? diffContent(official, editor.content, kind !== 'correction') : null), [official, editor.content, usesContent, kind]);

  const validate = (): string | null => {
    if (title.trim().length < 3) return 'Scrivi un titolo di almeno 3 caratteri per la proposta.';
    if (usesContent && !isValidContent(editor.content)) return 'Correggi gli errori nel testo prima di continuare.';
    if (kind === 'new_song' && !meta.title?.trim()) return 'Indica il titolo del canto.';
    if (kind === 'score' && !musicxml) return 'Carica un file MusicXML.';
    if (kind === 'recording' && !mediaId && !recording.file && !youtubeId(recording.youtube)) return 'Carica un file audio o inserisci un link YouTube valido.';
    if (diff && !diff.some((d) => d.type !== 'same') && kind !== 'new_song') return 'Non hai ancora apportato modifiche rispetto alla versione ufficiale.';
    return null;
  };

  const save = async (status: 'draft' | 'submitted') => {
    if (!user) return;
    const problem = status === 'submitted' ? validate() : title.trim().length < 3 ? 'Scrivi un titolo di almeno 3 caratteri per la proposta.' : null;
    if (problem) return toast.error(problem);
    setBusy(true);
    try {
      let media = mediaId;
      if (kind === 'recording' && !media && (recording.file || youtubeId(recording.youtube))) {
        if (recording.file) {
          const bad = validateUpload(recording.file, 'audio');
          if (bad) throw new Error(bad);
          const path = await uploadMediaFile(recording.file, user.id);
          media = await createMediaAsset({
            kind: 'audio', title: title.trim(), song_id: songId, storage_path: path, mime_type: recording.file.type, size_bytes: recording.file.size,
            duration_seconds: await audioDuration(recording.file), performer: recording.performer || null, rights: recording.rights as never, status: 'pending',
          });
        } else {
          media = await createMediaAsset({
            kind: 'youtube', title: title.trim(), song_id: songId, external_url: recording.youtube.trim(), performer: recording.performer || null,
            rights: recording.rights as never, status: 'pending',
          });
        }
        setMediaId(media);
      }
      const payload: ContributionPayload = {};
      if (usesContent) payload.content = editor.content;
      if (usesMeta) payload.metadata = meta as Record<string, unknown>;
      if (kind === 'new_song' && categoryIds.length) payload.category_ids = categoryIds;
      if (kind === 'score' && musicxml) { payload.musicxml = musicxml; payload.score_title = scoreName || title; payload.instrument = instrument; }
      if (kind === 'recording' && media) payload.media_asset_id = media;
      if (kind === 'arrangement' && arrangementId) payload.arrangement_id = arrangementId;
      const id = await saveContribution({
        id: existing?.id, kind, song_id: kind === 'new_song' ? null : songId, base_revision_id: kind === 'new_song' ? null : loaded.baseRevisionId,
        title: title.trim(), message: message.trim() || null, payload, status,
      });
      editor.markSaved(editor.content);
      toast.success(status === 'submitted' ? 'Proposta inviata. Riceverai l\'esito nella pagina «Proposte».' : 'Bozza salvata.');
      navigate(status === 'submitted' ? '/proposte' : `/proposte/${id}`, { replace: true });
    } catch (e) {
      toast.error(e instanceof Error && !('code' in e) ? e.message : friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const onScoreFile = async (file: File) => {
    try {
      const text = await readScoreFile(file);
      const doc = parseMusicXml(text);
      setMusicxml(text);
      if (!scoreName) setScoreName(scoreTitle(doc));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'File non valido.');
    }
  };

  return (
    <div className="container stack-lg">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header__text">
          <Link to="/proposte" className="small">← Le mie proposte</Link>
          <h1>{existing ? existing.title : 'Nuova proposta'}</h1>
          <p>
            {KIND_LABEL[kind]}{song && <> per <Link to={`/canti/${song.id}`}>{song.number ? `${song.number}. ` : ''}{song.title}</Link></>}
            {existing && <span className={`badge ${STATUS_TONE[existing.status]}`} style={{ marginLeft: 8 }}>{STATUS_LABEL[existing.status]}</span>}
          </p>
        </div>
      </div>

      {existing?.review_note && (
        <Alert tone={existing.status === 'rejected' ? 'danger' : existing.status === 'approved' ? 'success' : 'info'} title="Nota del revisore">{existing.review_note}</Alert>
      )}
      {!editable && existing && existing.status !== 'draft' && (
        <Alert tone="info">La proposta è stata inviata e non può più essere modificata. Puoi seguirne lo stato da questa pagina.</Alert>
      )}

      {!existing && songId && (
        <div className="stack-sm">
          <span className="field__label">Che cosa vuoi proporre?</span>
          <div className="chips" role="group" aria-label="Tipo di proposta">
            {(arrangementId ? (['arrangement', ...KINDS_FOR_SONG] as ContributionKind[]) : KINDS_FOR_SONG).map((k) => (
              <button key={k} type="button" className="chip" aria-pressed={kind === k} onClick={() => { setKind(k); if (song) setTitle(`${KIND_LABEL[k]}: ${song.title}`); }}>{KIND_LABEL[k]}</button>
            ))}
          </div>
        </div>
      )}

      <section className="panel panel__body" aria-label="Descrizione della proposta">
        <Field label="Titolo della proposta">
          <input className="input" value={title} maxLength={160} disabled={!editable} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Messaggio per l'amministratore" hint="Spiega che cosa hai cambiato e da quale fonte (es. libretto parrocchiale, edizione originale).">
          <textarea className="textarea" rows={3} maxLength={4000} value={message} disabled={!editable} onChange={(e) => setMessage(e.target.value)} />
        </Field>
      </section>

      {usesMeta && (
        <section className="stack" aria-label="Informazioni sul canto">
          <h2>Informazioni sul canto</h2>
          <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0 }}>
            <MetadataForm value={meta} onChange={setMeta} categories={kind === 'new_song' ? categories.filter((c) => !c.archived_at) : undefined} categoryIds={categoryIds} onCategories={setCategoryIds} />
          </fieldset>
        </section>
      )}

      {usesContent && (
        <section className="stack" aria-label="Testo">
          <div className="row row--between">
            <h2>{kind === 'correction' ? 'Testo corretto' : kind === 'new_song' ? 'Testo del canto' : 'Testo e accordi'}</h2>
            {editable && kind === 'new_song' && <Button icon="file" onClick={() => setImportOpen(true)}>Incolla da testo</Button>}
          </div>
          {kind === 'new_song' && (
            <Alert tone="warning">Inserisci soltanto testi di cui conosci la fonte e per cui la parrocchia ha i diritti d'uso (testi propri, di pubblico dominio o autorizzati). Indica la fonte nel messaggio.</Alert>
          )}
          {editable ? (
            <ContentEditor content={editor.content} onChange={editor.set} undo={editor.undo} redo={editor.redo} canUndo={editor.canUndo} canRedo={editor.canRedo} textOnly={kind === 'correction'} />
          ) : null}
          {diff && (
            <details open={!editable}>
              <summary className="small">Confronto con la versione ufficiale</summary>
              <div style={{ marginTop: 'var(--space-3)' }}><DiffView ops={diff} beforeLabel="Ufficiale" afterLabel="Proposta" /></div>
            </details>
          )}
        </section>
      )}

      {kind === 'score' && (
        <section className="stack" aria-label="Spartito">
          <h2>Spartito</h2>
          {editable && song && (
            <ScoreFinder title={song.title} onImported={(text, c) => {
              setMusicxml(text);
              if (!scoreName) setScoreName(scoreTitle(parseMusicXml(text)));
              setMessage((m) => (m.trim() ? m : candidateSource(c)));
            }} />
          )}
          {editable && (
            <div className="form-row">
              <Field label="File MusicXML" hint=".musicxml, .xml o .mxl, al massimo 5 MB. Esportalo da MuseScore, Sibelius, Finale o Dorico.">
                <input className="input" type="file" accept=".musicxml,.xml,.mxl" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onScoreFile(f); }} />
              </Field>
              <Field label="Titolo dello spartito"><input className="input" value={scoreName} maxLength={160} onChange={(e) => setScoreName(e.target.value)} /></Field>
              <Field label="Strumento">
                <select className="select" value={instrument} onChange={(e) => setInstrument(e.target.value as Instrument)}>
                  {(Object.keys(INSTRUMENT_LABEL) as Instrument[]).map((i) => <option key={i} value={i}>{INSTRUMENT_LABEL[i]}</option>)}
                </select>
              </Field>
            </div>
          )}
          {musicxml ? <ScoreViewer xml={musicxml} scale={40} label="Anteprima dello spartito proposto" /> : <p className="small muted">Nessun file caricato.</p>}
        </section>
      )}

      {kind === 'recording' && (
        <section className="stack" aria-label="Registrazione">
          <h2>Registrazione</h2>
          {mediaId ? (
            <Alert tone="success">Registrazione caricata. Sarà pubblicata solo dopo l'approvazione.</Alert>
          ) : editable ? (
            <>
              <Field label="File audio" hint="MP3, M4A, OGG, WAV o WebM, al massimo 50 MB.">
                <input className="input" type="file" accept="audio/*" onChange={(e) => setRecording({ ...recording, file: e.target.files?.[0] ?? null })} />
              </Field>
              <Field label="Oppure link YouTube" hint="Il video sarà incorporato nella pagina del canto; non viene scaricato.">
                <input className="input" type="url" inputMode="url" placeholder="https://www.youtube.com/watch?v=…" value={recording.youtube} onChange={(e) => setRecording({ ...recording, youtube: e.target.value })} />
              </Field>
              <div className="form-row">
                <Field label="Esecutori (facoltativo)"><input className="input" maxLength={200} value={recording.performer} onChange={(e) => setRecording({ ...recording, performer: e.target.value })} /></Field>
                <Field label="Diritti">
                  <select className="select" value={recording.rights} onChange={(e) => setRecording({ ...recording, rights: e.target.value })}>
                    <option value="own_work">Registrazione propria</option>
                    <option value="permission_granted">Autorizzazione degli esecutori</option>
                    <option value="licensed">Licenza</option>
                    <option value="unknown">Da verificare</option>
                  </select>
                </Field>
              </div>
            </>
          ) : null}
        </section>
      )}

      {editable && (
        <div className="row">
          <Button variant="primary" icon="send" loading={busy} onClick={() => void save('submitted')}>Invia per la revisione</Button>
          <Button loading={busy} onClick={() => void save('draft')}>Salva bozza</Button>
          {existing && <Button variant="danger-soft" icon="trash" onClick={() => setConfirmDelete(true)}>Elimina bozza</Button>}
        </div>
      )}

      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="Incolla il testo" wide
        footer={<>
          <Button onClick={() => setImportOpen(false)}>Annulla</Button>
          <Button variant="primary" onClick={() => {
            const r = importPlainText(importText);
            editor.set(r.content);
            setImportOpen(false);
            if (r.warnings.length) toast.show(r.warnings.join(' '));
          }}>Importa</Button>
        </>}>
        <div className="stack">
          <p className="small muted">Separa le strofe con una riga vuota. Le righe che iniziano con «Rit.» o «Ritornello» diventano il ritornello; le righe di soli accordi vengono agganciate alla riga successiva. Controlla sempre il risultato.</p>
          <textarea className="textarea textarea--mono" rows={14} value={importText} onChange={(e) => setImportText(e.target.value)} aria-label="Testo da importare" />
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        title="Eliminare la bozza?"
        message="La bozza della proposta sarà eliminata definitivamente."
        confirmLabel="Elimina"
        destructive
        busy={busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          if (!existing) return;
          setBusy(true);
          try {
            await deleteContribution(existing.id);
            editor.markSaved(editor.content);
            navigate('/proposte', { replace: true });
          } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(false); }
        }}
      />
    </div>
  );
}
