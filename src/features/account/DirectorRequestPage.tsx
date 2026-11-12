import { useEffect, useState } from 'react';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { cancelDirectorRequest, fetchMyDirectorRequests, requestDirectorRole } from '../../data/account';
import type { DirectorRequest } from '../../data/types';
import { friendlyError } from '../../lib/errors';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Alert, EmptyState, Spinner } from '../../components/ui/Feedback';

const STATUS: Record<DirectorRequest['status'], [string, string]> = {
  pending: ['In attesa', 'badge--warning'],
  approved: ['Approvata', 'badge--success'],
  rejected: ['Non approvata', 'badge--danger'],
  cancelled: ['Annullata', ''],
};

export default function DirectorRequestPage() {
  const { user, isDirector, refreshProfile } = useAuth();
  const toast = useToast();
  const [requests, setRequests] = useState<DirectorRequest[] | null>(null);
  const [motivation, setMotivation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    if (!user) return;
    fetchMyDirectorRequests(user.id).then(setRequests).catch((e) => setError(friendlyError(e)));
  };
  useEffect(load, [user]);
  // Roles may have changed since sign-in (request approved): refresh once.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void refreshProfile(); }, []);

  if (isDirector) {
    return (
      <EmptyState icon="radio" title="Sei già direttore" action={<ButtonLink to="/stanze" variant="primary">Vai alle stanze</ButtonLink>}>
        Puoi creare stanze in diretta, celebrazioni e prove.
      </EmptyState>
    );
  }
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!requests) return <Spinner />;
  const pending = requests.find((r) => r.status === 'pending');

  const submit = async () => {
    if (motivation.trim().length < 10) return toast.error('Scrivi almeno qualche parola (minimo 10 caratteri).');
    setBusy(true);
    try {
      await requestDirectorRole(motivation);
      setMotivation('');
      toast.success('Richiesta inviata.');
      load();
    } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="container container--narrow stack-lg">
      <div className="page-header__text">
        <h1>Diventa direttore</h1>
        <p className="muted">Il direttore guida il canto durante le celebrazioni: crea stanze in diretta con un codice, prepara scalette e organizza le prove. Un amministratore della parrocchia valuterà la richiesta.</p>
      </div>
      {pending ? (
        <Alert tone="info" title="Richiesta in attesa">
          <p>Inviata il {new Date(pending.created_at).toLocaleDateString('it-IT')}. Riceverai il ruolo appena sarà approvata.</p>
          <div style={{ marginTop: 'var(--space-3)' }}>
            <Button size="sm" loading={busy} onClick={async () => {
              setBusy(true);
              try { await cancelDirectorRequest(pending.id); load(); } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(false); }
            }}>Annulla la richiesta</Button>
          </div>
        </Alert>
      ) : (
        <section className="panel panel__body">
          <Field label="Perché chiedi il ruolo?" hint="Ad esempio: «Dirigo il coro dei giovani alla Messa delle 11».">
            <textarea className="textarea" rows={4} maxLength={2000} value={motivation} onChange={(e) => setMotivation(e.target.value)} />
          </Field>
          <div><Button variant="primary" icon="send" loading={busy} onClick={submit}>Invia la richiesta</Button></div>
        </section>
      )}
      {requests.length > 0 && (
        <section className="stack-sm">
          <h2 className="section-title">Richieste precedenti</h2>
          <ul role="list" className="list">
            {requests.map((r) => (
              <li key={r.id} className="list-row" style={{ display: 'grid', gap: 4 }}>
                <div className="row row--between">
                  <span className="small">{new Date(r.created_at).toLocaleDateString('it-IT')}</span>
                  <span className={`badge ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
                </div>
                <p className="small muted">{r.motivation}</p>
                {r.review_note && <p className="small">Nota: {r.review_note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
