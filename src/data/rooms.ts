import { supabase } from '../lib/supabase';
import type { RoomSnapshot } from '../domain/room';

export const ROOM_COLS = 'id, code, title, status, current_song_id, current_arrangement_id, current_item_index, state_version, expires_at, director_id, celebration_id';

/** Authoritative state from the database (RLS: members and controllers only). */
export async function fetchRoom(id: string): Promise<RoomSnapshot | null> {
  const { data, error } = await supabase.from('rooms').select(ROOM_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as RoomSnapshot | null) ?? null;
}

export async function joinRoom(code: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('join_room', { p_code: code });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function leaveRoom(id: string): Promise<void> {
  const { error } = await supabase.rpc('leave_room', { p_room_id: id });
  if (error) throw error;
}

export async function touchMembership(id: string): Promise<void> {
  await supabase.rpc('touch_room_membership', { p_room_id: id });
}

export async function createRoom(title: string, celebrationId?: string | null): Promise<RoomSnapshot> {
  const { data, error } = await supabase.rpc('create_room', { p_title: title, p_celebration_id: celebrationId ?? null });
  if (error) throw error;
  return data as RoomSnapshot;
}

export async function setRoomSong(roomId: string, songId: string, itemIndex: number | null, expectedVersion?: number): Promise<RoomSnapshot> {
  const { data, error } = await supabase.rpc('set_room_song', {
    p_room_id: roomId, p_song_id: songId, p_item_index: itemIndex, p_arrangement_id: null, p_expected_version: expectedVersion ?? null,
  });
  if (error) throw error;
  return data as RoomSnapshot;
}

export async function stepRoom(roomId: string, delta: number): Promise<RoomSnapshot> {
  const { data, error } = await supabase.rpc('step_room', { p_room_id: roomId, p_delta: delta });
  if (error) throw error;
  return data as RoomSnapshot;
}

export async function closeRoom(roomId: string): Promise<void> {
  const { error } = await supabase.rpc('close_room', { p_room_id: roomId });
  if (error) throw error;
}

export async function roomParticipants(roomId: string) {
  const { data, error } = await supabase.rpc('room_participants', { p_room_id: roomId });
  if (error) throw error;
  return data as { user_id: string; display_name: string; joined_at: string; last_seen_at: string; revoked: boolean }[];
}

export async function revokeMember(roomId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('revoke_room_member', { p_room_id: roomId, p_user_id: userId });
  if (error) throw error;
}

export async function myRooms(): Promise<RoomSnapshot[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select(ROOM_COLS)
    .eq('status', 'active')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw error;
  return data as RoomSnapshot[];
}
