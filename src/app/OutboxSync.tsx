import { useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { useToast } from './ToastProvider';
import { flushOutbox } from '../data/outbox';

/** Replays changes made offline when the connection returns. */
export function OutboxSync() {
  const { user } = useAuth();
  const toast = useToast();
  useEffect(() => {
    if (!user) return;
    const run = async () => {
      const r = await flushOutbox();
      if (r.synced) toast.success(`${r.synced} modifiche salvate offline sono state sincronizzate.`);
      if (r.conflicts) toast.error(`${r.conflicts} modifiche non sono state applicate perché esiste una versione più recente. Le trovi nelle tue versioni come copia.`);
    };
    void run();
    window.addEventListener('online', run);
    return () => window.removeEventListener('online', run);
  }, [user, toast]);
  return null;
}
