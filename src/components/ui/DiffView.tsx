import type { DiffOp } from '../../domain/diff';

export function DiffView({ ops, beforeLabel = 'Prima', afterLabel = 'Dopo' }: { ops: DiffOp[]; beforeLabel?: string; afterLabel?: string }) {
  if (!ops.some((o) => o.type !== 'same')) return <p className="muted small">Nessuna differenza.</p>;
  return (
    <div className="stack-sm">
      <div className="row small">
        <span className="badge badge--danger">− {beforeLabel}</span>
        <span className="badge badge--success">+ {afterLabel}</span>
      </div>
      <pre style={{ margin: 0, padding: 'var(--space-3)', background: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'auto', fontSize: 'var(--text-sm)', lineHeight: 1.6, fontFamily: 'var(--font-mono)', whiteSpace: 'pre-wrap' }}>
        {ops.map((o, i) => (
          <div key={i} style={{
            background: o.type === 'add' ? 'var(--success-soft)' : o.type === 'del' ? 'var(--danger-soft)' : undefined,
            textDecoration: o.type === 'del' ? 'line-through' : undefined,
            color: o.type === 'same' ? 'var(--text-muted)' : 'var(--text)',
          }}>
            <span aria-hidden style={{ display: 'inline-block', width: '1.5em', userSelect: 'none' }}>{o.type === 'add' ? '+' : o.type === 'del' ? '−' : ' '}</span>
            <span className="visually-hidden">{o.type === 'add' ? 'Aggiunto: ' : o.type === 'del' ? 'Rimosso: ' : ''}</span>
            {o.text || ' '}
          </div>
        ))}
      </pre>
    </div>
  );
}
