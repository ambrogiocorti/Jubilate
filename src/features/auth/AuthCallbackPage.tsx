import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Alert, Spinner } from '../../components/ui/Feedback';
import { AuthLayout, safeNext } from './AuthLayout';

/** Landing page for OAuth, e-mail confirmation and password recovery (PKCE). */
export default function AuthCallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const next = safeNext(params.get('next'));

  useEffect(() => {
    const errorDesc = params.get('error_description');
    if (errorDesc) {
      setFailed(true);
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      navigate(next, { replace: true });
    };
    const code = params.get('code');
    // supabase-js (detectSessionInUrl) exchanges the code automatically; we wait for the session.
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => s && finish());
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) finish();
      else if (code) {
        supabase.auth.exchangeCodeForSession(code).then(({ data: d, error }) => {
          if (d.session) finish();
          else if (error) setFailed(true);
        });
      }
    });
    const t = window.setTimeout(() => !done && setFailed(true), 12000);
    return () => {
      sub.subscription.unsubscribe();
      window.clearTimeout(t);
    };
  }, [navigate, next, params]);

  if (failed) {
    return (
      <AuthLayout title="Accesso non completato" footer={<Link to="/accedi">Torna all’accesso</Link>}>
        <Alert tone="danger">Il collegamento non è valido o è scaduto. Riprova ad accedere.</Alert>
      </AuthLayout>
    );
  }
  return <Spinner label="Accesso in corso…" />;
}
