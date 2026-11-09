import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { fetchFavoriteIds, setFavorite } from '../data/personal';
import { queueFavorite } from '../data/outbox';
import { kvGet, kvSet } from '../lib/localdb';
import { useAuth } from './AuthProvider';

let ids = new Set<string>();
let loadedFor: string | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Favorites shared across the app; optimistic, works offline (queued). */
export function useFavorites() {
  const { user } = useAuth();
  const snapshot = useSyncExternalStore(subscribe, () => ids);

  useEffect(() => {
    if (!user) {
      ids = new Set();
      loadedFor = null;
      emit();
      return;
    }
    if (loadedFor === user.id) return;
    loadedFor = user.id;
    kvGet<string[]>(`favorites:${user.id}`).then((cached) => {
      if (cached && loadedFor === user.id && ids.size === 0) {
        ids = new Set(cached);
        emit();
      }
    }).catch(() => undefined);
    fetchFavoriteIds()
      .then((remote) => {
        ids = remote;
        emit();
        void kvSet(`favorites:${user.id}`, [...remote]).catch(() => undefined);
      })
      .catch(() => undefined);
  }, [user]);

  const toggle = useCallback(
    async (songId: string) => {
      if (!user) return;
      const on = !ids.has(songId);
      ids = new Set(ids);
      if (on) ids.add(songId);
      else ids.delete(songId);
      emit();
      void kvSet(`favorites:${user.id}`, [...ids]).catch(() => undefined);
      try {
        if (!navigator.onLine) throw new Error('offline');
        await setFavorite(songId, on);
      } catch {
        await queueFavorite(songId, on);
      }
      return on;
    },
    [user],
  );

  return { ids: snapshot, isFavorite: (id: string) => snapshot.has(id), toggle };
}
