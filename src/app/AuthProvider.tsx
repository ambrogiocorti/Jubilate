import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { env } from '../lib/env';
import { kvGet, kvSet } from '../lib/localdb';
import type { AppRole, Profile } from '../data/types';

interface AuthState {
  ready: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  isRegistered: boolean;
  isDirector: boolean;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/**
 * Session + profile + roles. Roles are fetched from the database (my_roles RPC)
 * and used ONLY to adapt the UI; every protected operation is re-checked by
 * RLS and SECURITY DEFINER functions on the server.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(!env.isConfigured);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) {
      setProfile(null);
      setRoles([]);
      return;
    }
    try {
      const [p, r] = await Promise.all([
        supabase.from('profiles').select('id, display_name, avatar_url, is_suspended, created_at').eq('id', s.user.id).maybeSingle(),
        supabase.rpc('my_roles'),
      ]);
      if (p.data) setProfile(p.data as Profile);
      const rolesValue = (r.data as AppRole[] | null) ?? [];
      setRoles(rolesValue);
      void kvSet(`roles:${s.user.id}`, rolesValue).catch(() => undefined);
    } catch {
      // Offline: fall back to the last known roles for UI purposes only.
      const cached = await kvGet<AppRole[]>(`roles:${s.user.id}`).catch(() => undefined);
      if (cached) setRoles(cached);
    }
  }, []);

  useEffect(() => {
    if (!env.isConfigured) return;
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (active) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Defer: calling Supabase inside the callback can deadlock the auth lock.
        setTimeout(() => void loadProfile(s), 0);
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const value = useMemo<AuthState>(() => {
    const isRegistered = Boolean(session) && !profile?.is_suspended;
    return {
      ready,
      session,
      user: session?.user ?? null,
      profile,
      roles,
      isRegistered,
      isAdmin: isRegistered && roles.includes('admin'),
      isDirector: isRegistered && (roles.includes('director') || roles.includes('admin')),
      refreshProfile: () => loadProfile(session),
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        setRoles([]);
      },
    };
  }, [ready, session, profile, roles, loadProfile]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
