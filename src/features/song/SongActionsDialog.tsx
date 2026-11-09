import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { addToCollection, createArrangement, createCollection, fetchArrangements, fetchCollections, type Arrangement, type Collection } from '../../data/personal';
import type { SongDetail } from '../../data/types';
import { friendlyError } from '../../lib/errors';
import { Dialog } from '../../components/ui/Dialog';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Icon } from '../../components/ui/Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  detail: SongDetail;
  arrangement: Arrangement | null;
  pinned: boolean;
  onTogglePin: () => void;
}

export function SongActionsDialog({ open, onClose, detail, arrangement, pinned, onTogglePin }: Props) {
  const { isRegistered, isAdmin } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [mine, setMine] = useState<Arrangement[]>([]);
  const [target, setTarget] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const song = detail.song;

  useEffect(() => {
    if (!open || !isRegistered) return;
    fetchCollections().then(setCollections).catch(() => setCollections([]));
    fetchArrangements(song.id).then(setMine).catch(() => setMine([]));
  }, [open, isRegistered, song.id]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/canti/${song.id}`;
    try {
      if (navigator.share) await navigator.share({ title: song.title, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success('Collegamento copiato.');
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <Dialog open={open} onClose={onClose} title={song.title} sheet>
      <div className="stack">
        {isRegistered && (
          <section className="stack-sm">
            <h3 className="section-title">Versione personale</h3>
            <p className="small muted">Crea una copia modificabile: la versione ufficiale non viene mai modificata.</p>
            <div className="row">
              <Button
                variant="primary"
                icon="layers"
                loading={busy === 'arr'}
                onClick={() =>
                  run('arr', async () => {
                    const id = await createArrangement(song.id, `${song.title} — la mia versione`);
                    toast.success('Versione personale creata.');
                    navigate(`/versioni/${id}`);
                  })
                }
              >
                Crea versione personale
              </Button>
              {arrangement && <ButtonLink to={`/versioni/${arrangement.id}`} icon="edit">Modifica questa versione</ButtonLink>}
            </div>
            {mine.length > 0 && (
              <ul role="list" className="stack-sm">
                {mine.map((a) => (
                  <li key={a.id}>
                    <Link to={`/canti/${song.id}?versione=${a.id}`} onClick={onClose}>{a.name}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {isRegistered && (
          <section className="stack-sm">
            <h3 className="section-title">Aggiungi a una raccolta</h3>
            <div className="row" style={{ alignItems: 'flex-end' }}>
              <div className="grow">
                <Field label="Raccolta" hideLabel>
                  <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
                    <option value="">Scegli una raccolta…</option>
                    {(collections ?? []).map((c) => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                    <option value="__new">+ Nuova raccolta</option>
                  </select>
                </Field>
              </div>
              <Button
                disabled={!target || (target === '__new' && !newName.trim())}
                loading={busy === 'col'}
                onClick={() =>
                  run('col', async () => {
                    const id = target === '__new' ? await createCollection(newName) : target;
                    await addToCollection(id, song.id, arrangement?.id ?? null);
                    toast.success('Canto aggiunto alla raccolta.');
                    setTarget('');
                    setNewName('');
                  })
                }
              >
                Aggiungi
              </Button>
            </div>
            {target === '__new' && (
              <Field label="Nome della nuova raccolta">
                <input className="input" value={newName} maxLength={120} onChange={(e) => setNewName(e.target.value)} />
              </Field>
            )}
          </section>
        )}

        <section className="stack-sm">
          <h3 className="section-title">Altre azioni</h3>
          <div className="stack-sm">
            <Button icon="download" onClick={onTogglePin} aria-pressed={pinned}>
              {pinned ? 'Rimuovi dai canti offline' : 'Rendi disponibile offline'}
            </Button>
            <Button icon="printer" onClick={() => { onClose(); setTimeout(() => window.print(), 150); }}>
              Stampa o salva in PDF
            </Button>
            <Button icon="share" onClick={share}>Condividi collegamento</Button>
            {isRegistered && (
              <ButtonLink to={`/proposte/nuova?tipo=correction&canto=${song.id}`} icon="send">Proponi una correzione o gli accordi</ButtonLink>
            )}
            {isAdmin && <ButtonLink to={`/admin/canti/${song.id}`} icon="edit">Modifica versione ufficiale</ButtonLink>}
            {!isRegistered && (
              <p className="small muted"><Icon name="info" size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> <Link to="/accedi">Accedi</Link> per accordi, spartiti, preferiti, raccolte e versioni personali.</p>
            )}
          </div>
        </section>
      </div>
    </Dialog>
  );
}
