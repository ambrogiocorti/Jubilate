import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLibrary } from '../../app/LibraryProvider';
import { useToast } from '../../app/ToastProvider';
import { fetchContribution, fetchContributions, reviewContribution, KIND_LABEL, STATUS_LABEL, type Contribution, type ContributionStatus } from '../../data/contributions';
import { fetchRevisionContent, fetchSongRemote } from '../../data/library';
import { signedUrl, youtubeId } from '../../data/media';
import { supabase } from '../../lib/supabase';
import { diffContent } from '../../domain/diff';
import type { SongContent } from '../../domain/song';
import { friendlyError } from '../../lib/errors';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { Alert, EmptyState, ListSkeleton, Spinner } from '../../components/ui/Feedback';
import { DiffView } from '../../components/ui/DiffView';
import { SongView } from '../song/SongView';
import { ScoreViewer } from '../score/ScoreViewer';
import { AudioPlayer } from '../media/AudioPlayer';
import { STATUS_TONE } from '../contributions/ContributionsPage';

export function AdminContributionList() {
  const { byId } = useLibrary();
  const [filter, setFilter] = useState<'open' | ContributionStatus>('open');
  const [items, setItems] = useState<Contribution[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setItems(null);
    fetchContributions({ statuses: filter === 'open' ? ['submitted', 'in_review'] : [filter] }).then(setItems).catch((e) => setError(friendlyError(e)));
  }, [filter]);
  return (
    <div className="stack">
      <div className="row row--between">
        <h2>Proposte della comunità</h2>
        <select className="select" style={{ width: 'auto' }} aria-label="Filtro" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="open">Da valutare</option>
          <option value="approved">Approvate</option>
          <option value="rejected">Rifiutate</option>
        </select>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {!items ? <ListSkeleton /> : items.length === 0 ? <EmptyState icon="inbox" title="Nessuna proposta">Non ci sono proposte in questo stato.</EmptyState> : (
        <ul role="list" className="list">
          {items.map((c) => {
            const song = c.song_id ? byId.get(c.song_id) : undefined;
            return (
              <li key={c.id} className="list-row row row--between">
                <div>
                  <Link to={`/admin/proposte/${c.id}`}><strong>{c.title}</strong></Link>
                  <p className="small muted">{KIND_LABEL[c.kind]}{song ? ` · ${song.number ? song.number + '. ' : ''}${song.title}` : ''} · {new Date(c.submitted_at ?? c.created_at).toLocaleString('it-IT')}</p>
                </div>
                <span className={`badge ${STATUS_TONE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function AdminContributionReview() {
  const { contributionId } = useParams();
  const toast = useToast();
  const navigate = useNavigate();
  const { byId, refresh } = useLibrary();
  const [c, setC] = useState<Contribution | null>(null);
  const [author, setAuthor] = useState<string>('');
  const [current, setCurrent] = useState<{ content: SongContent; revisionId: string | null } | null>(null);
  const [base, setBase] = useState<SongContent | null>(null);
  const [mediaUrl, setMediaUrl] = useState<{ kind: string; url: string } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contributionId) return;
    (async () => {
      try {
        const x = await fetchContribution(contributionId);
        setC(x);
        const { data: p } = await supabase.from('profiles').select('display_name').eq('id', x.author_id).maybeSingle();
        setAuthor((p as { display_name: string } | null)?.display_name || 'Utente');
        if (x.song_id) {
          const d = await fetchSongRemote(x.song_id);
          setCurrent({ content: d.content, revisionId: d.song.current_revision_id });
          if (x.base_revision_id && x.base_revision_id !== d.song.current_revision_id) setBase(await fetchRevisionContent(x.base_revision_id));
        }
        if (x.kind === 'recording' && x.payload.media_asset_id) {
          const { data: m } = await supabase.from('media_assets').select('kind, storage_path, external_url').eq('id', x.payload.media_asset_id).maybeSingle();
          const media = m as { kind: string; storage_path: string | null; external_url: string | null } | null;
          if (media?.storage_path) setMediaUrl({ kind: 'audio', url: media.storage_path });
          else if (media?.external_url) setMediaUrl({ kind: 'youtube', url: media.external_url });
        }
      } catch (e) {
        setError(friendlyError(e));
      }
    })();
  }, [contributionId]);

  const diff = useMemo(() => (c?.payload.content && current ? diffContent(current.content, c.payload.content) : null), [c, current]);
  const outdated = !!(c?.base_revision_id && current && c.base_revision_id !== current.revisionId);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!c) return <Spinner />;
  const song = c.song_id ? byId.get(c.song_id) : undefined;
  const open = c.status === 'submitted' || c.status === 'in_review';

  const decide = async (decision: 'approve' | 'reject' | 'in_review', force = false) => {
    if (decision === 'reject' && !note.trim()) return toast.error('Per rifiutare indica una motivazione: sarà visibile all\'autore.');
    setBusy(true);
    try {
      await reviewContribution(c.id, decision, note.trim() || undefined, force);
      toast.success(decision === 'approve' ? 'Proposta approvata: creata una nuova revisione.' : decision === 'reject' ? 'Proposta rifiutata.' : 'Proposta presa in carico.');
      if (decision === 'approve') void refresh();
      if (decision === 'in_review') setC({ ...c, status: 'in_review' });
      else navigate('/admin/proposte');
    } catch (e) {
      const code = (e as { message?: string }).message ?? '';
      if (code.includes('conflict_outdated_base')) setConflict(true);
      else toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack-lg">
      <div>
        <Link to="/admin/proposte" className="small">← Proposte</Link>
        <h2>{c.title}</h2>
        <p className="small muted">
          {KIND_LABEL[c.kind]} di {author}{song && <> per <Link to={`/admin/canti/${song.id}`}>{song.number ? `${song.number}. ` : ''}{song.title}</Link></>} · <span className={`badge ${STATUS_TONE[c.status]}`}>{STATUS_LABEL[c.status]}</span>
        </p>
      </div>
      {c.message && <Alert tone="info" title="Messaggio dell'autore">{c.message}</Alert>}
      {outdated && <Alert tone="warning" title="Proposta basata su una versione precedente">Dopo l'invio la versione ufficiale è stata modificata. Il confronto qui sotto è con la versione attuale: verifica di non perdere correzioni recenti.</Alert>}

      {c.payload.metadata && (
        <section className="stack-sm">
          <h3>Informazioni proposte</h3>
          <div className="table-wrap"><table className="table"><tbody>
            {Object.entries(c.payload.metadata).map(([k, v]) => (
              <tr key={k}><th>{k}</th><td>{Array.isArray(v) ? v.join('; ') : String(v ?? '—')}</td></tr>
            ))}
          </tbody></table></div>
        </section>
      )}
      {diff && (
        <section className="stack-sm">
          <h3>Differenze con la versione ufficiale attuale</h3>
          <DiffView ops={diff} beforeLabel="Ufficiale" afterLabel="Proposta" />
          {base && c.payload.content && (
            <details><summary className="small">Differenze rispetto alla versione su cui era basata</summary>
              <DiffView ops={diffContent(base, c.payload.content)} beforeLabel="Base" afterLabel="Proposta" />
            </details>
          )}
        </section>
      )}
      {c.payload.content && !diff && (
        <section className="stack-sm">
          <h3>Testo proposto</h3>
          <div className="panel panel__body"><SongView content={c.payload.content} showChords chordOptions={{ transpose: 0, capo: 0, notation: 'italian', showShapes: false }} /></div>
        </section>
      )}
      {c.kind === 'score' && c.payload.musicxml && (
        <section className="stack-sm">
          <h3>Spartito proposto: {c.payload.score_title}</h3>
          <ScoreViewer xml={c.payload.musicxml} scale={40} label="Spartito proposto" />
        </section>
      )}
      {c.kind === 'recording' && mediaUrl && (
        <section className="stack-sm">
          <h3>Registrazione</h3>
          {mediaUrl.kind === 'audio'
            ? <AudioPlayer title={c.title} resolveSrc={() => signedUrl(mediaUrl.url)} />
            : <a href={`https://www.youtube.com/watch?v=${encodeURIComponent(youtubeId(mediaUrl.url) ?? '')}`} target="_blank" rel="noopener noreferrer">Apri il video su YouTube</a>}
        </section>
      )}

      {open ? (
        <section className="panel panel__body">
          <Field label="Nota per l'autore" hint="Obbligatoria in caso di rifiuto. In caso di approvazione diventa la nota della revisione.">
            <textarea className="textarea" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="row">
            <Button variant="primary" icon="check" loading={busy} onClick={() => void decide('approve')}>Approva</Button>
            <Button variant="danger-soft" icon="x" loading={busy} onClick={() => void decide('reject')}>Rifiuta</Button>
            {c.status === 'submitted' && <Button variant="ghost" loading={busy} onClick={() => void decide('in_review')}>Prendi in carico</Button>}
          </div>
        </section>
      ) : c.review_note && <Alert tone="info" title="Nota della revisione">{c.review_note}</Alert>}

      <Dialog open={conflict} onClose={() => setConflict(false)} title="La versione ufficiale è cambiata"
        footer={<>
          <Button onClick={() => setConflict(false)}>Annulla</Button>
          <Button variant="primary" loading={busy} onClick={() => { setConflict(false); void decide('approve', true); }}>Approva comunque</Button>
        </>}>
        <p>La proposta è stata scritta su una versione precedente. Approvandola, il testo proposto sostituirà quello attuale (la versione attuale resterà nella cronologia e potrà essere ripristinata).</p>
      </Dialog>
    </div>
  );
}
