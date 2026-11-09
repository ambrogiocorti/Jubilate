import { describe, expect, it } from 'vitest';
import { initialRoomState, liveTarget, normalizeRoomCode, reconnectDelay, roomReducer, type RoomSnapshot } from './room';

const snap = (v: number, song: string, extra: Partial<RoomSnapshot> = {}): RoomSnapshot => ({
  id: 'r1', code: '482916', title: 'Messa delle 10:00', status: 'active', current_song_id: song,
  current_arrangement_id: null, current_item_index: 0, state_version: v,
  expires_at: new Date(Date.now() + 3600_000).toISOString(), director_id: 'd', celebration_id: null, ...extra,
});

const joined = roomReducer(initialRoomState, { type: 'joined', roomId: 'r1' });

describe('room state machine', () => {
  it('follows the live song', () => {
    const s = roomReducer(joined, { type: 'snapshot', snapshot: snap(1, 'A') });
    expect(liveTarget(s)).toEqual({ songId: 'A', arrangementId: null });
  });

  it('ignores duplicate and out-of-order snapshots', () => {
    let s = roomReducer(joined, { type: 'snapshot', snapshot: snap(3, 'C') });
    s = roomReducer(s, { type: 'snapshot', snapshot: snap(2, 'B') });
    s = roomReducer(s, { type: 'snapshot', snapshot: snap(3, 'X') });
    expect(s.snapshot!.current_song_id).toBe('C');
  });

  it('ignores snapshots of other rooms', () => {
    const s = roomReducer(joined, { type: 'snapshot', snapshot: { ...snap(1, 'A'), id: 'other' } });
    expect(s.snapshot).toBeNull();
  });

  it('Scenario G: browsing keeps membership and is not interrupted', () => {
    let s = roomReducer(joined, { type: 'snapshot', snapshot: snap(1, 'A') });
    s = roomReducer(s, { type: 'browse' });
    expect(s.mode).toBe('BROWSING_FREELY');
    s = roomReducer(s, { type: 'snapshot', snapshot: snap(2, 'B') });
    expect(liveTarget(s)).toBeNull();            // no redirect while browsing
    expect(s.roomId).toBe('r1');                 // still a member
    expect(s.liveChangedWhileBrowsing).toBe(true);
    s = roomReducer(s, { type: 'returnToLive' });
    expect(liveTarget(s)).toEqual({ songId: 'B', arrangementId: null });
    expect(s.liveChangedWhileBrowsing).toBe(false);
  });

  it('marks closed and expired rooms as ended', () => {
    const closed = roomReducer(joined, { type: 'snapshot', snapshot: snap(2, 'A', { status: 'closed' }) });
    expect(closed.ended).toBe('closed');
    expect(liveTarget(closed)).toBeNull();
    const expired = roomReducer(joined, { type: 'snapshot', snapshot: snap(2, 'A', { expires_at: new Date(Date.now() - 1000).toISOString() }) });
    expect(expired.ended).toBe('expired');
  });

  it('re-joining the same room keeps state (page reload / reconnect)', () => {
    const s = roomReducer(roomReducer(joined, { type: 'snapshot', snapshot: snap(4, 'A') }), { type: 'joined', roomId: 'r1' });
    expect(s.snapshot?.state_version).toBe(4);
  });

  it('leaving resets everything', () => {
    const s = roomReducer(roomReducer(joined, { type: 'browse' }), { type: 'left' });
    expect(s.roomId).toBeNull();
    expect(s.mode).toBe('FOLLOWING_LIVE');
  });

  it('backoff grows and is capped', () => {
    expect(reconnectDelay(0, () => 1)).toBe(1000);
    expect(reconnectDelay(3, () => 1)).toBe(8000);
    expect(reconnectDelay(20, () => 1)).toBe(30000);
    expect(reconnectDelay(2, () => 0)).toBe(2000);
  });

  it('normalizes typed codes', () => {
    expect(normalizeRoomCode(' 482-916 ')).toBe('482916');
  });
});
