import { useState } from 'react';
import { useAuth } from '../../app/AuthProvider';
import { usePrefs } from '../../app/PrefsProvider';
import { useToast } from '../../app/ToastProvider';
import { changePassword, updateDisplayName } from '../../data/account';
import { friendlyError } from '../../lib/errors';
import { Button, ButtonLink } from '../../components/ui/Button';
import { Field, Segmented } from '../../components/ui/Field';
import { passwordProblem } from '../auth/SignUpPage';
import type { ReadingPrefs } from '../../domain/preferences';

export default function ProfilePage() {
  const { user, profile, roles, isDirector, isAdmin, refreshProfile, signOut } = useAuth();
  const { prefs, update, reset } = usePrefs();
  const toast = useToast();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [pw, setPw] = useState({ next: '', confirm: '' });
  const [busy, setBusy] = useState<string | null>(null);
  const isEmailAccount = user?.app_metadata?.provider === 'email' || (user?.identities ?? []).some((i) => i.provider === 'email');
  const pwError = pw.next ? passwordProblem(pw.next) : null;

  const saveName = async () => {
    if (!user) return;
    setBusy('name');
    try {
      await updateDisplayName(user.id, name);
      await refreshProfile();
      toast.success('Nome aggiornato.');
    } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(null); }
  };

  const savePassword = async () => {
    if (pwError) return toast.error(pwError);
    if (pw.next !== pw.confirm) return toast.error('Le due password non coincidono.');
    setBusy('pw');
    try {
      await changePassword(pw.next);
      setPw({ next: '', confirm: '' });
      toast.success('Password aggiornata.');
    } catch (e) { toast.error(friendlyError(e)); } finally { setBusy(null); }
  };

  const roleLabel = isAdmin ? 'Amministratore' : isDirector ? 'Direttore del coro' : 'Utente registrato';

  return (
    <div className="container container--narrow stack-lg">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="page-header__text">
          <h1>Profilo</h1>
          <p>{user?.email} · {roleLabel}</p>
        </div>
        <Button icon="x" variant="ghost" onClick={() => void signOut()}>Esci</Button>
      </div>

      <section className="panel panel__body" aria-labelledby="p-name">
        <h2 id="p-name" style={{ fontSize: 'var(--text-lg)' }}>Il tuo nome</h2>
        <Field label="Nome visibile" hint="Compare ai direttori nelle stanze e agli amministratori nelle proposte.">
          <input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <div><Button onClick={saveName} loading={busy === 'name'} disabled={name.trim() === (profile?.display_name ?? '')}>Salva nome</Button></div>
      </section>

      <section className="panel panel__body" aria-labelledby="p-roles">
        <h2 id="p-roles" style={{ fontSize: 'var(--text-lg)' }}>Ruoli</h2>
        <p className="small">{roles.length ? roles.map((r) => (r === 'admin' ? 'Amministratore' : 'Direttore')).join(', ') : 'Nessun ruolo speciale.'}</p>
        {!isDirector && !isAdmin && (
          <div>
            <ButtonLink to="/direttore" icon="radio">Richiedi il ruolo di direttore</ButtonLink>
            <p className="small muted" style={{ marginTop: 'var(--space-2)' }}>Il direttore può creare stanze in diretta, scalette e prove. La richiesta è valutata da un amministratore.</p>
          </div>
        )}
        {isAdmin && <div><ButtonLink to="/admin" icon="shield">Apri l'amministrazione</ButtonLink></div>}
      </section>

      <section className="panel panel__body" aria-labelledby="p-read">
        <h2 id="p-read" style={{ fontSize: 'var(--text-lg)' }}>Lettura</h2>
        <p className="small muted">Le preferenze sono salvate su questo dispositivo e sincronizzate con il tuo account.</p>
        <div className="stack-sm">
          <span className="field__label">Visualizzazione predefinita</span>
          <Segmented<ReadingPrefs['mode']> label="Visualizzazione predefinita" value={prefs.mode} onChange={(mode) => update({ mode })}
            options={[{ value: 'text', label: 'Testo' }, { value: 'chords', label: 'Accordi' }, { value: 'score', label: 'Spartito' }]} />
        </div>
        <div className="stack-sm">
          <span className="field__label">Notazione degli accordi</span>
          <Segmented<ReadingPrefs['notation']> label="Notazione" value={prefs.notation} onChange={(notation) => update({ notation })}
            options={[{ value: 'italian', label: 'Do Re Mi' }, { value: 'international', label: 'C D E' }]} />
        </div>
        <div className="stack-sm">
          <span className="field__label">Tema</span>
          <Segmented<ReadingPrefs['theme']> label="Tema" value={prefs.theme} onChange={(theme) => update({ theme })}
            options={[{ value: 'system', label: 'Automatico' }, { value: 'light', label: 'Chiaro' }, { value: 'dark', label: 'Scuro' }]} />
        </div>
        <Field label={`Dimensione del testo: ${Math.round(prefs.fontScale * 100)}%`}>
          <input type="range" min={0.8} max={2.5} step={0.05} value={prefs.fontScale} onChange={(e) => update({ fontScale: Number(e.target.value) })} />
        </Field>
        <Field label={`Interlinea: ${prefs.lineHeight.toFixed(2)}`}>
          <input type="range" min={1.2} max={2.2} step={0.05} value={prefs.lineHeight} onChange={(e) => update({ lineHeight: Number(e.target.value) })} />
        </Field>
        <Field label={`Velocità di scorrimento automatico: ${prefs.scrollSpeed}`}>
          <input type="range" min={1} max={10} step={1} value={prefs.scrollSpeed} onChange={(e) => update({ scrollSpeed: Number(e.target.value) })} />
        </Field>
        <label className="row small"><input type="checkbox" checked={prefs.showCapoShapes} onChange={(e) => update({ showCapoShapes: e.target.checked })} /> Con il capotasto mostra anche gli accordi reali</label>
        <label className="row small"><input type="checkbox" checked={prefs.showRepeats === 'compact'} onChange={(e) => update({ showRepeats: e.target.checked ? 'compact' : 'full' })} /> Mostra le ripetizioni del ritornello in forma compatta</label>
        <p className="song" style={{ fontSize: `calc(1.25rem * ${prefs.fontScale})`, lineHeight: prefs.lineHeight, margin: 0 }} aria-label="Anteprima">
          Anteprima del testo dei canti con le impostazioni scelte.
        </p>
        <div><Button variant="ghost" onClick={reset}>Ripristina le impostazioni predefinite</Button></div>
      </section>

      {isEmailAccount && (
        <section className="panel panel__body" aria-labelledby="p-pw">
          <h2 id="p-pw" style={{ fontSize: 'var(--text-lg)' }}>Cambia password</h2>
          <Field label="Nuova password" error={pwError} hint="Almeno 8 caratteri, con lettere e numeri.">
            <input className="input" type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
          </Field>
          <Field label="Ripeti la nuova password" error={pw.confirm && pw.confirm !== pw.next ? 'Le password non coincidono.' : null}>
            <input className="input" type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </Field>
          <div><Button onClick={savePassword} loading={busy === 'pw'} disabled={!pw.next || !pw.confirm}>Aggiorna password</Button></div>
        </section>
      )}
    </div>
  );
}
