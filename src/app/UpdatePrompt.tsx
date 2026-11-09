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

  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="toasts" style={{ zIndex: 950 }}>
      <div className="toast" role="status">
        <Icon name={needRefresh ? 'download' : 'checkCircle'} />
        <span>{needRefresh ? 'È disponibile una nuova versione di Jubilate.' : 'Jubilate è pronta per l’uso offline.'}</span>
        {needRefresh ? (
          <Button size="sm" variant="primary" style={{ marginLeft: 'auto' }} onClick={() => void updateServiceWorker(true)}>
            Aggiorna
          </Button>
        ) : null}
        <button
          className="toast__action"
          style={needRefresh ? { marginLeft: 0 } : undefined}
          onClick={() => {
            setNeedRefresh(false);
            setOfflineReady(false);
          }}
        >
          {needRefresh ? 'Più tardi' : 'OK'}
        </button>
      </div>
    </div>
  );
}
