import { publicAsset } from '../../lib/env';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="auth-page" id="main">
      <div className="stack" style={{ width: 'min(100%, 420px)' }}>
        <div className="auth-card">
          <div className="auth-card__head">
            <Link to="/" aria-label="Torna alla biblioteca"><img src={publicAsset('favicon.svg')} alt="" /></Link>
            <h1 style={{ fontSize: 'var(--text-xl)' }}>{title}</h1>
            {subtitle && <p className="muted small">{subtitle}</p>}
          </div>
          {children}
        </div>
        {footer && <p className="small muted" style={{ textAlign: 'center' }}>{footer}</p>}
      </div>
    </main>
  );
}

/** Only allow same-origin relative redirects after login (no open redirect). */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}
