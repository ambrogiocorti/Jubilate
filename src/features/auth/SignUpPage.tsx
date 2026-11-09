import { useState, type FormEvent } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { env } from '../../lib/env';
import { friendlyError } from '../../lib/errors';
import { useAuth } from '../../app/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Alert } from '../../components/ui/Feedback';
import { AuthLayout, GoogleButton, safeNext } from './AuthLayout';

export function passwordProblem(p: string): string | null {
  if (p.length < 8) return 'Almeno 8 caratteri.';
  if (!/[A-Za-z]/.test(p) || !/[0-9]/.test(p)) return 'Usa lettere e numeri.';
  return null;
}

export default function SignUpPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const { session } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [touched, setTouched] = useState(false);

  if (session) return <Navigate to={next} replace />;
  const pwError = touched ? passwordProblem(password) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (passwordProblem(password) || !name.trim()) return;
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: name.trim().slice(0, 80) },
        emailRedirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    // With e-mail confirmation enabled, no session is returned until confirmed.
    if (!data.session) setSent(true);
  }

  async function withGoogle() {
    setGoogle(true);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (err) {
      setGoogle(false);
      setError(friendlyError(err, 'Accesso con Google non disponibile al momento.'));
    }
  }

  if (sent) {
    return (
      <AuthLayout title="Controlla la tua e-mail" footer={<Link to="/accedi">Torna all’accesso</Link>}>
        <Alert tone="success">
          Abbiamo inviato un messaggio a <strong>{email}</strong>. Apri il collegamento per confermare l’indirizzo e completare la registrazione.
        </Alert>
        <p className="small muted">Non trovi il messaggio? Controlla la cartella spam. Il collegamento è valido per un tempo limitato.</p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Crea il tuo account"
      subtitle="La registrazione è gratuita. Per consultare i testi non serve un account."
      footer={<>Hai già un account? <Link to={`/accedi?next=${encodeURIComponent(next)}`}>Accedi</Link></>}
    >
      <GoogleButton onClick={withGoogle} loading={google} />
      <div className="auth-divider">oppure con e-mail</div>
      <form className="form" onSubmit={submit} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Nome visualizzato" error={touched && !name.trim() ? 'Inserisci un nome.' : null}>
          <input className="input" autoComplete="name" maxLength={80} required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="E-mail">
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" hint="Almeno 8 caratteri, con lettere e numeri." error={pwError}>
          <input className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} onBlur={() => setTouched(true)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!email || !password}>
          Registrati
        </Button>
      </form>
    </AuthLayout>
  );
}
