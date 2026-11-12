/** Administrator data access. Every call is authorized again by RLS/RPC on the server. */
import { supabase } from '../lib/supabase';
import type { SongContent } from '../domain/song';
import type { AppRole, Category, CategoryKind, DirectorRequest, SongRow } from './types';
import { SONG_COLUMNS } from './library';

export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  is_suspended: boolean;
  roles: AppRole[];
  created_at: string;
  email_confirmed: boolean;
}

export async function listUsers(search = ''): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_list_users', { p_search: search || null });
  if (error) throw error;
  return data as AdminUser[];
}
export async function setRole(userId: string, role: AppRole, grant: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_role', { p_user_id: userId, p_role: role, p_grant: grant });
  if (error) throw error;
}
export async function setSuspended(userId: string, suspended: boolean, reason?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_set_suspended', { p_user_id: userId, p_suspended: suspended, p_reason: reason ?? null });
  if (error) throw error;
}

export interface DirectorRequestRow extends DirectorRequest {
  profile: { display_name: string } | null;
}
export async function listDirectorRequests(): Promise<DirectorRequestRow[]> {
  const { data, error } = await supabase
    .from('director_requests')
    .select('id, user_id, motivation, status, review_note, reviewed_at, created_at, profile:profiles!director_requests_user_id_fkey(display_name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data as unknown as DirectorRequestRow[];
}
export async function reviewDirectorRequest(id: string, approve: boolean, note?: string): Promise<void> {
  const { error } = await supabase.rpc('review_director_request', { p_request_id: id, p_approve: approve, p_note: note ?? null });
  if (error) throw error;
}

/** All songs including drafts and deleted ones (admins only by RLS). */
export async function listAllSongs(): Promise<SongRow[]> {
  const { data, error } = await supabase.from('songs').select(`${SONG_COLUMNS}, deleted_at`).order('number', { nullsFirst: false }).order('title').limit(2000);
  if (error) throw error;
  return data as SongRow[];
}

export interface SongMetaInput {
  number?: number | null;
  title?: string;
  alt_titles?: string[];
  author?: string | null;
  composer?: string | null;
  original_key?: string | null;
  time_signature?: string | null;
  tempo_bpm?: number | null;
  status?: 'draft' | 'published' | 'archived';
  text_source?: string | null;
  text_rights?: string;
  text_rights_note?: string | null;
}

export async function saveSong(songId: string | null, meta: SongMetaInput, content: SongContent | null, note: string | null, categoryIds: string[] | null): Promise<string> {
  const { data, error } = await supabase.rpc('admin_save_song', {
    p_song_id: songId, p_meta: meta, p_content: content, p_note: note, p_category_ids: categoryIds,
  });
  if (error) throw error;
  return data as string;
}
export async function restoreRevision(revisionId: string, note?: string): Promise<void> {
  const { error } = await supabase.rpc('admin_restore_revision', { p_revision_id: revisionId, p_note: note ?? null });
  if (error) throw error;
}
export async function setSongDeleted(songId: string, deleted: boolean): Promise<void> {
  const { error } = await supabase.rpc('admin_set_song_deleted', { p_song_id: songId, p_deleted: deleted });
  if (error) throw error;
}

export async function createCategory(c: { name: string; slug: string; kind: CategoryKind; sort_order: number }): Promise<void> {
  const { error } = await supabase.from('song_categories').insert(c);
  if (error) throw error;
}
export async function updateCategory(id: string, patch: Partial<Pick<Category, 'name' | 'kind' | 'sort_order' | 'archived_at'>>): Promise<void> {
  const { error } = await supabase.from('song_categories').update(patch).eq('id', id);
  if (error) throw error;
}
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from('song_categories').delete().eq('id', id);
  if (error) throw error;
}

export interface ActivityRow {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  created_at: string;
  actor: { display_name: string } | null;
}
export async function listActivity(limit = 200, before?: string): Promise<ActivityRow[]> {
  let q = supabase.from('activity_logs').select('id, actor_id, action, entity_type, entity_id, details, created_at, actor:profiles(display_name)').order('created_at', { ascending: false }).limit(limit);
  if (before) q = q.lt('created_at', before);
  const { data, error } = await q;
  if (error) throw error;
  return data as unknown as ActivityRow[];
}

export interface AdminRoom {
  id: string;
  code: string;
  title: string;
  status: string;
  expires_at: string;
  created_at: string;
  director_id: string;
  current_song_id: string | null;
  director: { display_name: string } | null;
}
export async function listRooms(): Promise<AdminRoom[]> {
  const { data, error } = await supabase
    .from('rooms')
    .select('id, code, title, status, expires_at, created_at, director_id, current_song_id, director:profiles!rooms_director_id_fkey(display_name)')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data as unknown as AdminRoom[];
}

export interface ParishSettings {
  chord_notation?: 'italian' | 'international';
  room_ttl_hours?: number;
  contact_email?: string;
  welcome_message?: string;
}
export async function fetchParish(): Promise<{ id: string; name: string; settings: ParishSettings }> {
  const { data, error } = await supabase.from('parishes').select('id, name, settings').eq('is_default', true).single();
  if (error) throw error;
  return data as { id: string; name: string; settings: ParishSettings };
}
export async function updateParish(id: string, name: string, settings: ParishSettings): Promise<void> {
  const { error } = await supabase.from('parishes').update({ name, settings }).eq('id', id);
  if (error) throw error;
}

export async function counts(): Promise<Record<string, number>> {
  const head = { count: 'exact' as const, head: true };
  const [songs, published, contribs, requests, media, scores] = await Promise.all([
    supabase.from('songs').select('id', head).is('deleted_at', null),
    supabase.from('songs').select('id', head).is('deleted_at', null).eq('status', 'published'),
    supabase.from('contribution_requests').select('id', head).in('status', ['submitted', 'in_review']),
    supabase.from('director_requests').select('id', head).eq('status', 'pending'),
    supabase.from('media_assets').select('id', head).eq('status', 'pending'),
    supabase.from('music_scores').select('id', head).is('owner_id', null),
  ]);
  return {
    songs: songs.count ?? 0,
    published: published.count ?? 0,
    contributions: contribs.count ?? 0,
    directorRequests: requests.count ?? 0,
    pendingMedia: media.count ?? 0,
    officialScores: scores.count ?? 0,
  };
}
