import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../app/AuthProvider';
import { fetchRoom, joinRoom, leaveRoom, touchMembership } from '../../data/rooms';
import { initialRoomState, reconnectDelay, roomReducer, type FollowMode, type RoomClientState, type RoomSnapshot } from '../../domain/room';

const STORAGE_KEY = 'jubilate.room';

interface RoomApi {
  state: RoomClientState;
  /** Joins by code; returns the room id or null when the code is not valid. */
  join: (code: string) => Promise<string | null>;
  /** Re-attaches to a room the user is already a member of (no code). */
  attach: (roomId: string) => void;
  leave: () => Promise<void>;
  browse: () => void;
  returnToLive: () => Promise<void>;
  /** Forces a re-read of the authoritative state. */
  resync: () => Promise<void>;
  /** Applies a snapshot returned by a director command. */
  applySnapshot: (s: RoomSnapshot) => void;
}

const RoomContext = createContext<RoomApi | null>(null);

function readStored(): { roomId: string; mode: FollowMode } | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    return v && typeof v.roomId === 'string' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Live room connection. The DB row is authoritative; realtime only notifies.
 * Resync happens on subscribe, reconnect, coming back online, tab visible and
 * every 20 s as a safety net (cheap single-row read).
 */
export function RoomProvider({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const [state, dispatch] = useReducer(roomReducer, initialRoomState, (s) => {
    const stored = readStored();
    return stored ? { ...s, roomId: stored.roomId, mode: stored.mode } : s;
  });
  const channelRef = useRef<RealtimeChannel | null>(null);
  const attempt = useRef(0);
  const retryTimer = useRef<number | undefined>(undefined);
  const roomId = state.roomId;

  // Persist participation + follow mode (survives reloads).
  useEffect(() => {
    try {
      if (roomId) localStorage.setItem(STORAGE_KEY, JSON.stringify({ roomId, mode: state.mode }));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [roomId, state.mode]);

  // Signed out => drop local participation.
  useEffect(() => {
    if (ready && !user && roomId) dispatch({ type: 'left' });
  }, [ready, user, roomId]);

  const resync = useCallback(async () => {
    if (!roomId || !user) return;
    try {
      const snap = await fetchRoom(roomId);
      if (!snap) {
        // RLS hides the row: membership revoked or room removed.
        dispatch({ type: 'ended', reason: 'revoked' });
        return;
      }
      dispatch({ type: 'snapshot', snapshot: snap });
      dispatch({ type: 'connection', connection: 'online' });
    } catch {
      if (!navigator.onLine) dispatch({ type: 'connection', connection: 'offline' });
    }
  }, [roomId, user]);

  // Realtime subscription with backoff reconnection.
  useEffect(() => {
    if (!roomId || !user) return;
    let disposed = false;

    const subscribe = () => {
      if (disposed) return;
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
      dispatch({ type: 'connection', connection: navigator.onLine ? 'connecting' : 'offline' });
      const channel = supabase
        .channel(`room:${roomId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (payload) => {
          dispatch({ type: 'snapshot', snapshot: payload.new as RoomSnapshot });
        })
        .subscribe((status) => {
          if (disposed) return;
          if (status === 'SUBSCRIBED') {
            attempt.current = 0;
            dispatch({ type: 'connection', connection: 'online' });
            void resync(); // never trust only the last event received
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            dispatch({ type: 'connection', connection: navigator.onLine ? 'connecting' : 'offline' });
            window.clearTimeout(retryTimer.current);
            retryTimer.current = window.setTimeout(subscribe, reconnectDelay(attempt.current++));
          }
        });
      channelRef.current = channel;
    };

    void resync();
    subscribe();

    const onOnline = () => {
      attempt.current = 0;
      subscribe();
    };
    const onOffline = () => dispatch({ type: 'connection', connection: 'offline' });
    const onVisible = () => document.visibilityState === 'visible' && void resync();
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const poll = window.setInterval(() => document.visibilityState === 'visible' && void resync(), 20_000);
    const heartbeat = window.setInterval(() => navigator.onLine && void touchMembership(roomId).catch(() => undefined), 60_000);

    return () => {
      disposed = true;
      window.clearTimeout(retryTimer.current);
      window.clearInterval(poll);
      window.clearInterval(heartbeat);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      if (channelRef.current) void supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    };
  }, [roomId, user, resync]);

  const api = useMemo<RoomApi>(
    () => ({
      state,
      join: async (code) => {
        const id = await joinRoom(code);
        if (id) dispatch({ type: 'joined', roomId: id });
        return id;
      },
      attach: (id) => dispatch({ type: 'joined', roomId: id }),
      leave: async () => {
        const id = state.roomId;
        dispatch({ type: 'left' });
        if (id) await leaveRoom(id).catch(() => undefined);
      },
      browse: () => dispatch({ type: 'browse' }),
      returnToLive: async () => {
        dispatch({ type: 'returnToLive' });
        await resync();
      },
      resync,
      applySnapshot: (s) => dispatch({ type: 'snapshot', snapshot: s }),
    }),
    [state, resync],
  );

  return <RoomContext.Provider value={api}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomApi {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error('useRoom outside RoomProvider');
  return ctx;
}
