import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '../components/ui/Button';
import { Icon } from '../components/ui/Icon';

/**
 * Registers the service worker. A new version is applied only when the user
 * accepts, so a song is never reloaded in the middle of a celebration.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      // Check for updates hourly while the app stays open.
      if (reg) setInterval(() => void reg.update(), 60 * 60 * 1000);
    },
  });

  // The "ready for offline" notice is informative only: hide it by itself.
  useEffect(() => {
    if (!offlineReady || needRefresh) return;
    const t = window.setTimeout(() => setOfflineReady(false), 5000);
    return () => window.clearTimeout(t);
  }, [offlineReady, needRefresh, setOfflineReady]);

  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="toasts toasts--bottom" style={{ zIndex: 950 }}>
      <div className={`toast ${needRefresh ? '' : 'toast--success'}`} role="status">
        <span className="toast__icon" aria-hidden="true">
          <Icon name={needRefresh ? 'download' : 'checkCircle'} />
        </span>
        <span className="toast__message">
          {needRefresh ? 'È disponibile una nuova versione di Jubilate Deo.' : 'Jubilate Deo è pronta per l’uso offline.'}
        </span>
        {needRefresh && (
          <Button size="sm" variant="primary" style={{ alignSelf: 'center' }} onClick={() => void updateServiceWorker(true)}>
            Aggiorna
          </Button>
        )}
        <button
          type="button"
          className="toast__close"
          aria-label={needRefresh ? 'Più tardi' : 'Chiudi messaggio'}
          onClick={() => {
            setNeedRefresh(false);
            setOfflineReady(false);
          }}
        >
          <Icon name="x" />
        </button>
      </div>
    </div>
  );
}
