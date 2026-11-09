import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { env } from '../../lib/env';
import { friendlyError } from '../../lib/errors';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Alert } from '../../components/ui/Feedback';
import { AuthLayout } from './AuthLayout';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${env.siteUrl}/auth/callback?next=/reimposta-password`,
    });
    setBusy(false);
    // Same message whether or not the address exists (no account enumeration).
    if (err && /rate/i.test(err.message)) setError(friendlyError(err));
    else setDone(true);
  }

  return (
    <AuthLayout title="Recupera la password" footer={<Link to="/accedi">Torna all’accesso</Link>}>
      {done ? (
        <Alert tone="success">Se l’indirizzo è registrato, riceverai un’e-mail con le istruzioni per reimpostare la password.</Alert>
      ) : (
        <form className="form" onSubmit={submit}>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="E-mail">
            <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" size="lg" block loading={busy} disabled={!email}>Invia istruzioni</Button>
        </form>
      )}
    </AuthLayout>
  );
}
