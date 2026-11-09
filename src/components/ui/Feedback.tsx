import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function EmptyState({ icon = 'info', title, children, action }: { icon?: IconName; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty" role="status">
      <div className="empty__icon"><Icon name={icon} /></div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

const ALERT_ICON: Record<string, IconName> = { info: 'info', success: 'checkCircle', danger: 'alert', warning: 'alert' };

export function Alert({ tone = 'info', children, title }: { tone?: 'info' | 'success' | 'danger' | 'warning'; children: ReactNode; title?: string }) {
  return (
    <div className={`alert alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon name={ALERT_ICON[tone]!} />
      <div className="stack-sm" style={{ gap: 2 }}>
        {title && <strong>{title}</strong>}
        <div>{children}</div>
      </div>
    </div>
  );
}

export function Skeleton({ width = '100%', height = 16, style }: { width?: number | string; height?: number | string; style?: React.CSSProperties }) {
  return <span className="skeleton" style={{ width, height, ...style }} aria-hidden />;
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="list" aria-busy="true" aria-label="Caricamento">
      {Array.from({ length: rows }, (_, i) => (
        <div className="list-row" key={i}>
          <Skeleton width={32} height={14} />
          <div className="list-row__main">
            <Skeleton width={`${50 + ((i * 13) % 40)}%`} height={16} />
            <Skeleton width={`${30 + ((i * 7) % 30)}%`} height={12} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Spinner({ label = 'Caricamento…' }: { label?: string }) {
  return (
    <div className="row" role="status" style={{ justifyContent: 'center', padding: 'var(--space-8)', color: 'var(--text-muted)' }}>
      <span className="spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
