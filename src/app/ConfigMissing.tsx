import { env, publicAsset } from '../lib/env';

/** Shown when the build has no Supabase configuration (developer setup issue). */
export function ConfigMissing() {
  return (
    <main className="auth-page">
      <div className="auth-card">
        <div className="auth-card__head">
          <img src={publicAsset('favicon.svg')} alt="" />
          <h1>Configurazione mancante</h1>
          <p className="muted">
            {env.secretKeyRejected
              ? 'È stata indicata una chiave segreta (service role). Per sicurezza non viene mai usata nel browser: imposta la chiave pubblicabile.'
              : 'Jubilate non è collegata a un progetto Supabase.'}
          </p>
        </div>
        <p className="small muted">
          Imposta <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> (vedi <code>.env.example</code> e DEPLOYMENT.md), poi ricompila l’applicazione.
        </p>
      </div>
    </main>
  );
}
