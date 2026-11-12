import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

/** Shared layout for the privacy notice and the rights page: readable text column. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="legal stack" style={{ maxWidth: '72ch', margin: '0 auto' }}>
      <header className="stack-sm">
        <h1>{title}</h1>
        <p className="small muted" style={{ margin: 0 }}>Ultimo aggiornamento: {updated}</p>
      </header>
      {children}
    </article>
  );
}

/** Links shown at the foot of every page and in the sign-up form. */
export function LegalLinks() {
  return (
    <nav className="legal-links small" aria-label="Informazioni legali">
      <Link to="/privacy">Informativa privacy</Link>
      <span aria-hidden="true">·</span>
      <Link to="/diritti">Diritti dei canti e degli spartiti</Link>
    </nav>
  );
}
