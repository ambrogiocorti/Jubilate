import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { env } from '../../lib/env';
import { friendlyError } from '../../lib/errors';
import { useAuth } from '../../app/AuthProvider';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Alert } from '../../components/ui/Feedback';
import { AuthLayout, GoogleButton, safeNext } from './AuthLayout';

export default function SignInPage() {
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const navigate = useNavigate();
  const { session } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(friendlyError(err));
    else navigate(next, { replace: true });
  }

  async function withGoogle() {
    setGoogle(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${env.siteUrl}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (err) {
      setGoogle(false);
      setError(friendlyError(err, 'Accesso con Google non disponibile al momento.'));
    }
  }

  return (
    <AuthLayout
      title="Accedi a Jubilate"
      subtitle="Preferiti, raccolte, accordi, versioni personali e stanze."
      footer={<>Non hai un account? <Link to={`/registrati?next=${encodeURIComponent(next)}`}>Registrati</Link> · <Link to="/">Continua senza accedere</Link></>}
    >
      <GoogleButton onClick={withGoogle} loading={google} />
      <div className="auth-divider">oppure</div>
      <form className="form" onSubmit={submit} noValidate>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="E-mail">
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="row row--between">
          <Link to="/recupera-password" className="small">Password dimenticata?</Link>
        </div>
        <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!email || !password}>
          Accedi
        </Button>
      </form>
    </AuthLayout>
  );
}
