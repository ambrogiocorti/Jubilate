import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { loadLibrary, syncLibrary } from '../data/library';
import type { Category, LibraryEntry } from '../data/types';
import { prepareIndex, type SearchableSong } from '../domain/search';
import { friendlyError } from '../lib/errors';
import { env } from '../lib/env';

interface LibraryState {
  entries: LibraryEntry[];
  categories: Category[];
  index: ReturnType<typeof prepareIndex>;
  loading: boolean;
  error: string | null;
  syncedAt: number | null;
  fromCache: boolean;
  refresh: () => Promise<void>;
  byId: Map<string, LibraryEntry>;
}

const LibraryContext = createContext<LibraryState | null>(null);

function toSearchable(e: LibraryEntry): SearchableSong {
  return {
    id: e.id,
    number: e.number,
    title: e.title,
    alt_titles: e.alt_titles,
    author: e.author,
    composer: e.composer,
    original_key: e.original_key,
    first_line: e.first_line,
    lyrics: e.search_text,
    category_ids: e.category_ids,
  };
}

/** Stale-while-revalidate library index shared by search, lists and pickers. */
export function LibraryProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const [fromCache, setFromCache] = useState(false);

  const refresh = useCallback(async () => {
    if (!env.isConfigured) {
      setLoading(false);
      return;
    }
    try {
      const remote = await syncLibrary();
      setEntries(remote.entries);
      setCategories(remote.categories);
      setSyncedAt(Date.now());
      setFromCache(false);
      setError(null);
    } catch (err) {
      setError(friendlyError(err, 'Impossibile aggiornare la biblioteca.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadLibrary()
      .then((cached) => {
        if (cancelled || !cached.entries.length) return;
        setEntries(cached.entries);
        setCategories(cached.categories);
        setSyncedAt(cached.syncedAt);
        setFromCache(true);
        setLoading(false);
      })
      .catch(() => undefined)
      .finally(() => void refresh());
    const onOnline = () => void refresh();
    window.addEventListener('online', onOnline);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
    };
  }, [refresh]);

  const value = useMemo<LibraryState>(() => {
    const sorted = [...entries].sort((a, b) => (a.number ?? 1e9) - (b.number ?? 1e9) || a.title.localeCompare(b.title, 'it'));
    return {
      entries: sorted,
      categories,
      index: prepareIndex(sorted.map(toSearchable)),
      loading,
      error,
      syncedAt,
      fromCache,
      refresh,
      byId: new Map(sorted.map((e) => [e.id, e])),
    };
  }, [entries, categories, loading, error, syncedAt, fromCache, refresh]);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryState {
  const ctx = useContext(LibraryContext);
  if (!ctx) throw new Error('useLibrary outside LibraryProvider');
  return ctx;
}
