import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { useRoom } from './RoomProvider';
import { createRoom, myRooms } from '../../data/rooms';
import { fetchCelebrations, type Celebration } from '../../data/celebrations';
import { normalizeRoomCode, ROOM_CODE_RE, type RoomSnapshot } from '../../domain/room';
import { friendlyError } from '../../lib/errors';
import { useOnline } from '../../lib/useOnline';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Alert, EmptyState } from '../../components/ui/Feedback';
import { Icon } from '../../components/ui/Icon';

export default function RoomsPage() {
  const { isRegistered, isDirector, user } = useAuth();
  const room = useRoom();
  const toast = useToast();
  const online = useOnline();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<RoomSnapshot[]>([]);
  const [celebrations, setCelebrations] = useState<Celebration[]>([]);
  const [title, setTitle] = useState('');
  const [celebrationId, setCelebrationId] = useState('');

  useEffect(() => {
    if (!isRegistered || !online) return;
    myRooms().then(setRooms).catch(() => undefined);
    if (isDirector) fetchCelebrations('celebration').then((c) => setCelebrations(c.filter((x) => x.status !== 'cancelled'))).catch(() => undefined);
  }, [isRegistered, isDirector, online]);

  if (!isRegistered) {
    return (
      <div className="container container--narrow">
        <EmptyState icon="radio" title="Stanze in tempo reale" action={<ButtonLink to="/accedi?next=/stanze" variant="primary">Accedi per partecipare</ButtonLink>}>
          Durante la celebrazione il direttore mostra il canto corrente sul tuo dispositivo. Per entrare in una stanza serve un account.
        </EmptyState>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const c = normalizeRoomCode(code);
    if (!ROOM_CODE_RE.test(c)) return setError('Il codice è composto da 6 cifre.');
    setBusy(true);
    setError(null);
    try {
      const id = await room.join(c);
      if (!id) setError('Nessuna stanza attiva con questo codice.');
      else navigate(`/stanze/${id}`);
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await createRoom(title.trim() || 'Celebrazione', celebrationId || null);
      room.attach(r.id);
      toast.success(`Stanza creata. Codice ${r.code}`);
      navigate(`/stanze/${r.id}`);
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container container--narrow stack-lg">
      <header className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header__text">
          <h1>Stanze</h1>
          <p>Segui in diretta i canti scelti dal direttore, mantenendo le tue impostazioni di lettura.</p>
        </div>
      </header>

      {!online && <Alert tone="warning">Le stanze richiedono una connessione a Internet.</Alert>}

      {room.state.roomId && !room.state.ended && (
        <Alert tone="info" title="Partecipi già a una stanza">
          <div className="row" style={{ marginTop: 'var(--space-2)' }}>
            <ButtonLink to={`/stanze/${room.state.roomId}`} variant="primary" size="sm">Torna alla diretta</ButtonLink>
            <Button size="sm" onClick={() => void room.leave()}>Esci dalla stanza</Button>
          </div>
        </Alert>
      )}

      <section className="panel">
        <div className="panel__header"><h2 style={{ fontSize: 'var(--text-lg)' }}>Entra con un codice</h2></div>
        <form className="panel__body" onSubmit={submit}>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Codice della stanza" hint="Il codice di 6 cifre comunicato dal direttore.">
            <input
              className="input"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={7}
              placeholder="000000"
              style={{ fontSize: 'var(--text-2xl)', letterSpacing: '0.3em', textAlign: 'center', minHeight: 60 }}
              value={code}
              onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
            />
          </Field>
          <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!online || code.length !== 6}>Entra</Button>
        </form>
      </section>

      {rooms.length > 0 && (
        <section className="stack-sm">
          <h2 className="section-title">Stanze attive a cui partecipi</h2>
          <ul role="list" className="list">
            {rooms.map((r) => (
              <li key={r.id}>
                <Link to={`/stanze/${r.id}`} className="list-row" onClick={() => room.attach(r.id)}>
                  <span className="status-dot status-dot--live" aria-hidden />
                  <span className="list-row__main">
                    <span className="list-row__title">{r.title}</span>
                    <span className="list-row__meta">{r.director_id === user?.id ? `Sei il direttore · codice ${r.code}` : `Codice ${r.code}`}</span>
                  </span>
                  <span className="list-row__end"><Icon name="chevronRight" /></span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isDirector ? (
        <section className="panel">
          <div className="panel__header"><h2 style={{ fontSize: 'var(--text-lg)' }}>Crea una stanza</h2></div>
          <form className="panel__body" onSubmit={create}>
            <Field label="Titolo" hint="Per esempio «Messa delle 10:00».">
              <input className="input" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Scaletta (facoltativa)">
              <select className="select" value={celebrationId} onChange={(e) => {
                setCelebrationId(e.target.value);
                const c = celebrations.find((x) => x.id === e.target.value);
                if (c && !title) setTitle(c.title);
              }}>
                <option value="">Nessuna scaletta</option>
                {celebrations.map((c) => (
                  <option key={c.id} value={c.id}>{c.title}{c.starts_at ? ` — ${new Date(c.starts_at).toLocaleDateString('it-IT')}` : ''}</option>
                ))}
              </select>
            </Field>
            <Button type="submit" variant="primary" loading={busy} disabled={!online}>Crea stanza e genera il codice</Button>
          </form>
        </section>
      ) : (
        <p className="small muted">
          Vuoi guidare le celebrazioni? <Link to="/direttore">Richiedi il ruolo di direttore</Link>.
        </p>
      )}
    </div>
  );
}
