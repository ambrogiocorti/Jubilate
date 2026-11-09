/**
 * Client-side live room state machine (pure, unit-tested).
 *
 * Two independent concerns:
 *   membership  — server-side; survives navigation and page reloads.
 *   follow mode — FOLLOWING_LIVE or BROWSING_FREELY; purely local. Browsing
 *                 never leaves the room.
 *
 * The database row is authoritative. Realtime events and fetches are both
 * "snapshots" carrying state_version; older or duplicate snapshots are ignored.
 */
export type FollowMode = 'FOLLOWING_LIVE' | 'BROWSING_FREELY';
export type Connection = 'connecting' | 'online' | 'offline';

export interface RoomSnapshot {
  id: string;
  code: string;
  title: string;
  status: 'active' | 'closed';
  current_song_id: string | null;
  current_arrangement_id: string | null;
  current_item_index: number | null;
  state_version: number;
  expires_at: string;
  director_id: string;
  celebration_id: string | null;
}

export interface RoomClientState {
  roomId: string | null;
  snapshot: RoomSnapshot | null;
  mode: FollowMode;
  connection: Connection;
  /** Set when the room is closed, expired or membership revoked. */
  ended: null | 'closed' | 'expired' | 'revoked' | 'not_found';
  /** True when the live song changed while browsing freely. */
  liveChangedWhileBrowsing: boolean;
}

export const initialRoomState: RoomClientState = {
  roomId: null,
  snapshot: null,
  mode: 'FOLLOWING_LIVE',
  connection: 'connecting',
  ended: null,
  liveChangedWhileBrowsing: false,
};

export type RoomAction =
  | { type: 'joined'; roomId: string }
  | { type: 'snapshot'; snapshot: RoomSnapshot; now?: number }
  | { type: 'browse' }
  | { type: 'returnToLive' }
  | { type: 'connection'; connection: Connection }
  | { type: 'ended'; reason: NonNullable<RoomClientState['ended']> }
  | { type: 'left' };

export function isExpired(s: RoomSnapshot, now = Date.now()): boolean {
  return new Date(s.expires_at).getTime() <= now;
}

export function roomReducer(state: RoomClientState, action: RoomAction): RoomClientState {
  switch (action.type) {
    case 'joined':
      if (state.roomId === action.roomId) return { ...state, ended: null };
      return { ...initialRoomState, roomId: action.roomId };
    case 'snapshot': {
      const s = action.snapshot;
      if (!state.roomId || s.id !== state.roomId) return state;
      // Duplicate or out-of-order event: keep what we have.
      if (state.snapshot && s.state_version <= state.snapshot.state_version) return state;
      const songChanged = state.snapshot?.current_song_id !== s.current_song_id;
      let ended: RoomClientState['ended'] = null;
      if (s.status === 'closed') ended = 'closed';
      else if (isExpired(s, action.now)) ended = 'expired';
      return {
        ...state,
        snapshot: s,
        ended,
        liveChangedWhileBrowsing:
          state.mode === 'BROWSING_FREELY' ? state.liveChangedWhileBrowsing || songChanged : false,
      };
    }
    case 'browse':
      if (!state.roomId || state.mode === 'BROWSING_FREELY') return state;
      return { ...state, mode: 'BROWSING_FREELY', liveChangedWhileBrowsing: false };
    case 'returnToLive':
      if (!state.roomId) return state;
      return { ...state, mode: 'FOLLOWING_LIVE', liveChangedWhileBrowsing: false };
    case 'connection':
      return { ...state, connection: action.connection };
    case 'ended':
      return { ...state, ended: action.reason };
    case 'left':
      return { ...initialRoomState, connection: state.connection };
    default:
      return state;
  }
}

/**
 * Where a following participant should be. Returns null when no redirect is
 * needed (browsing freely, no song yet, or room ended).
 */
export function liveTarget(state: RoomClientState): { songId: string; arrangementId: string | null } | null {
  if (state.mode !== 'FOLLOWING_LIVE' || state.ended || !state.snapshot?.current_song_id) return null;
  return { songId: state.snapshot.current_song_id, arrangementId: state.snapshot.current_arrangement_id };
}

/** Exponential backoff with jitter for realtime reconnection (ms). */
export function reconnectDelay(attempt: number, random = Math.random): number {
  const base = Math.min(30_000, 1000 * 2 ** Math.max(0, attempt));
  return Math.round(base / 2 + (random() * base) / 2);
}

export const ROOM_CODE_RE = /^\d{6}$/;
export const normalizeRoomCode = (s: string): string => s.replace(/\D/g, '').slice(0, 6);
