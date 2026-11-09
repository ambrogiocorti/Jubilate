import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { friendlyError } from '../../lib/errors';
import { useAuth } from '../../app/AuthProvider';
import { useToast } from '../../app/ToastProvider';
import { Button } from '../../components/ui/Button';
import { Field } from '../../components/ui/Field';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { AuthLayout } from './AuthLayout';
import { passwordProblem } from './SignUpPage';

export default function ResetPasswordPage() {
  const { ready, session } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ready) return <Spinner />;
  if (!session) {
    return (
      <AuthLayout title="Collegamento non valido">
        <Alert tone="warning">Il collegamento è scaduto o è già stato usato. Richiedi una nuova e-mail di recupero.</Alert>
      </AuthLayout>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const p = passwordProblem(password);
    if (p) return setError(p);
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (err) return setError(friendlyError(err));
    toast.success('Password aggiornata.');
    navigate('/', { replace: true });
  }

  return (
    <AuthLayout title="Imposta una nuova password">
      <form className="form" onSubmit={submit}>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Nuova password" hint="Almeno 8 caratteri, con lettere e numeri.">
          <input className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" variant="primary" size="lg" block loading={busy}>Salva password</Button>
      </form>
    </AuthLayout>
  );
}
