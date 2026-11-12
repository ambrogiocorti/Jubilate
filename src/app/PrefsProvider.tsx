import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_PREFS, sanitizePrefs, type ReadingPrefs } from '../domain/preferences';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthProvider';

const STORAGE_KEY = 'jubilate.prefs';

interface PrefsState {
  prefs: ReadingPrefs;
  update: (patch: Partial<ReadingPrefs>) => void;
  reset: () => void;
  syncedAt: number | null;
}

const PrefsContext = createContext<PrefsState | null>(null);

function readLocal(): ReadingPrefs {
  try {
    return sanitizePrefs(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'));
  } catch {
    return DEFAULT_PREFS;
  }
}

function applyTheme(theme: ReadingPrefs['theme']) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

/**
 * Preferences live in localStorage (instant, offline) and, for registered
 * users, in public.user_preferences (restored on other devices). Server values
 * win on login; later local edits are pushed with a short debounce.
 */
export function PrefsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<ReadingPrefs>(readLocal);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);
  const pushTimer = useRef<number | undefined>(undefined);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => applyTheme(prefs.theme), [prefs.theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* storage full or disabled: preferences still work for this session */
    }
  }, [prefs]);

  // Pull from server once per signed-in user.
  useEffect(() => {
    if (!user || loadedFor.current === user.id) return;
    loadedFor.current = user.id;
    supabase
      .from('user_preferences')
      .select('prefs, updated_at')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.prefs) {
          setPrefs(sanitizePrefs(data.prefs));
          setSyncedAt(Date.now());
        }
      });
  }, [user]);

  const push = useCallback(
    (next: ReadingPrefs) => {
      if (!user) return;
      window.clearTimeout(pushTimer.current);
      pushTimer.current = window.setTimeout(async () => {
        const { error } = await supabase.from('user_preferences').upsert({ user_id: user.id, prefs: next });
        if (!error) setSyncedAt(Date.now());
      }, 800);
    },
    [user],
  );

  const value = useMemo<PrefsState>(
    () => ({
      prefs,
      syncedAt,
      update: (patch) =>
        setPrefs((p) => {
          const next = sanitizePrefs({ ...p, ...patch });
          push(next);
          return next;
        }),
      reset: () => {
        setPrefs(DEFAULT_PREFS);
        push(DEFAULT_PREFS);
      },
    }),
    [prefs, syncedAt, push],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsState {
  const ctx = useContext(PrefsContext);
  if (!ctx) throw new Error('usePrefs outside PrefsProvider');
  return ctx;
}
