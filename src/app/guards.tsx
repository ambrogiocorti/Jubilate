import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import { Spinner, EmptyState } from '../components/ui/Feedback';
import { ButtonLink } from '../components/ui/Button';
import type { AppRole } from '../data/types';

/** UI guard only: the server enforces the same rules with RLS. */
export function RequireAuth() {
  const { ready, session, profile } = useAuth();
  const location = useLocation();
  if (!ready) return <Spinner />;
  if (!session) return <Navigate to={`/accedi?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  if (profile?.is_suspended) {
    return (
      <EmptyState icon="shield" title="Account sospeso">
        Il tuo account è stato sospeso dall’amministratore. Puoi continuare a consultare il libretto dei canti.
      </EmptyState>
    );
  }
  return <Outlet />;
}

export function RequireRole({ role }: { role: AppRole }) {
  const { isAdmin, isDirector } = useAuth();
  const ok = role === 'admin' ? isAdmin : isDirector;
  if (!ok) {
    return (
      <EmptyState
        icon="shield"
        title="Accesso riservato"
        action={role === 'director' ? <ButtonLink to="/direttore" variant="primary">Richiedi il ruolo di direttore</ButtonLink> : undefined}
      >
        {role === 'admin'
          ? 'Questa sezione è riservata agli amministratori della parrocchia.'
          : 'Questa funzione è riservata ai direttori abilitati.'}
      </EmptyState>
    );
  }
  return <Outlet />;
}
