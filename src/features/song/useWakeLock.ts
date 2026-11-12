import { useEffect } from 'react';

/** Keeps the screen on while a song is being read (where supported). */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        /* not allowed (battery saver, iframe): ignore */
      }
      if (cancelled) void lock?.release();
    };
    void acquire();
    const onVis = () => document.visibilityState === 'visible' && void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
