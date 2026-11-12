import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/ui/Icon';

type Tone = 'success' | 'danger' | 'info';
interface Toast { id: number; tone: Tone; message: string; action?: { label: string; onClick: () => void } }

interface ToastApi {
  show: (message: string, tone?: Tone, action?: Toast['action']) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback<ToastApi['show']>(
    (message, tone = 'info', action) => {
      const id = ++seq.current;
      setToasts((t) => [...t.slice(-2), { id, tone, message, action }]);
      window.setTimeout(() => dismiss(id), tone === 'danger' ? 7000 : 4000);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({ show, success: (m) => show(m, 'success'), error: (m) => show(m, 'danger') }),
    [show],
  );

  // Toasts live in the top layer (popover) so they stay visible above modal dialogs.
  const layer = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = layer.current as (HTMLDivElement & { showPopover?: () => void; hidePopover?: () => void }) | null;
    if (!el?.showPopover) return;
    try {
      if (el.matches(':popover-open')) el.hidePopover!();
      if (toasts.length) el.showPopover();
    } catch { /* unsupported: falls back to z-index */ }
  }, [toasts]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div ref={layer} popover="manual" className="toasts" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone}`} role={t.tone === 'danger' ? 'alert' : 'status'}>
            <span className="toast__icon" aria-hidden="true">
              <Icon name={t.tone === 'success' ? 'checkCircle' : t.tone === 'danger' ? 'alert' : 'info'} />
            </span>
            <span className="toast__message">{t.message}</span>
            {t.action && (
              <button type="button" className="toast__action" onClick={() => { t.action!.onClick(); dismiss(t.id); }}>
                {t.action.label}
              </button>
            )}
            <button type="button" className="toast__close" aria-label="Chiudi messaggio" onClick={() => dismiss(t.id)}>
              <Icon name="x" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}
