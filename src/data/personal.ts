/** Favorites, collections and personal arrangements (registered users). */
import { supabase } from '../lib/supabase';
import type { SongContent } from '../domain/song';

// ---------------- Favorites ----------------
export async function fetchFavoriteIds(): Promise<Set<string>> {
  const { data, error } = await supabase.from('favorites').select('song_id');
  if (error) throw error;
  return new Set((data as { song_id: string }[]).map((f) => f.song_id));
}

export async function setFavorite(songId: string, on: boolean): Promise<void> {
  if (on) {
    const { error } = await supabase.from('favorites').upsert({ song_id: songId }, { onConflict: 'user_id,song_id', ignoreDuplicates: true });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('favorites').delete().eq('song_id', songId);
    if (error) throw error;
  }
}

// ---------------- Collections ----------------
export type CollectionKind = 'personal' | 'celebration' | 'rehearsal';
export interface Collection {
  id: string;
  title: string;
  description: string | null;
  kind: CollectionKind;
  visibility: 'private' | 'users' | 'link';
  share_token: string | null;
  celebration_id: string | null;
  updated_at: string;
  created_at: string;
  collection_items?: { count: number }[];
}
export interface CollectionItem {
  id: string;
  collection_id: string;
  song_id: string;
  arrangement_id: string | null;
  position: number;
  note: string | null;
}

export async function fetchCollections(): Promise<Collection[]> {
  const { data, error } = await supabase
    .from('collections')
    .select('id, title, description, kind, visibility, share_token, celebration_id, updated_at, created_at, collection_items(count)')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data as Collection[];
}

export async function fetchCollection(id: string): Promise<{ collection: Collection; items: CollectionItem[] }> {
  const [c, i] = await Promise.all([
    supabase.from('collections').select('id, title, description, kind, visibility, share_token, celebration_id, updated_at, created_at').eq('id', id).maybeSingle(),
    supabase.from('collection_items').select('id, collection_id, song_id, arrangement_id, position, note').eq('collection_id', id).order('position'),
  ]);
  if (c.error) throw c.error;
  if (!c.data) throw new Error('not_found');
  if (i.error) throw i.error;
  return { collection: c.data as Collection, items: i.data as CollectionItem[] };
}

export async function createCollection(title: string, kind: CollectionKind = 'personal', description?: string): Promise<string> {
  const { data, error } = await supabase.from('collections').insert({ title: title.trim(), kind, description: description?.trim() || null }).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateCollection(id: string, patch: Partial<Pick<Collection, 'title' | 'description' | 'kind'>>): Promise<void> {
  const { error } = await supabase.from('collections').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteCollection(id: string): Promise<void> {
  const { error } = await supabase.from('collections').delete().eq('id', id);
  if (error) throw error;
}

export async function duplicateCollection(id: string): Promise<string> {
  const { data, error } = await supabase.rpc('duplicate_collection', { p_id: id });
  if (error) throw error;
  return data as string;
}

export async function setCollectionSharing(id: string, enabled: boolean): Promise<string | null> {
  const { data, error } = await supabase.rpc('set_collection_link_sharing', { p_id: id, p_enabled: enabled });
  if (error) throw error;
  return data as string | null;
}

export async function addToCollection(collectionId: string, songId: string, arrangementId?: string | null): Promise<void> {
  const { data: last } = await supabase
    .from('collection_items').select('position').eq('collection_id', collectionId).order('position', { ascending: false }).limit(1);
  const position = ((last as { position: number }[] | null)?.[0]?.position ?? -1) + 1;
  const { error } = await supabase.from('collection_items').insert({ collection_id: collectionId, song_id: songId, arrangement_id: arrangementId ?? null, position });
  if (error) throw error;
}

export async function removeCollectionItem(itemId: string): Promise<void> {
  const { error } = await supabase.from('collection_items').delete().eq('id', itemId);
  if (error) throw error;
}

export async function updateCollectionItem(itemId: string, patch: Partial<Pick<CollectionItem, 'arrangement_id' | 'note' | 'position'>>): Promise<void> {
  const { error } = await supabase.from('collection_items').update(patch).eq('id', itemId);
  if (error) throw error;
}

/** Persists a new order (positions 0..n-1). */
export async function reorderCollection(items: CollectionItem[]): Promise<void> {
  const results = await Promise.all(items.map((it, i) => (it.position === i ? null : supabase.from('collection_items').update({ position: i }).eq('id', it.id))));
  const failed = results.find((r) => r?.error);
  if (failed?.error) throw failed.error;
}

// ---------------- Personal arrangements ----------------
export interface Arrangement {
  id: string;
  owner_id: string;
  song_id: string;
  base_revision_id: string | null;
  name: string;
  content: SongContent;
  display_key: string | null;
  capo: number;
  score_id: string | null;
  visibility: 'private' | 'users' | 'link';
  share_token: string | null;
  is_draft: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

const ARR_COLS = 'id, owner_id, song_id, base_revision_id, name, content, display_key, capo, score_id, visibility, share_token, is_draft, version, created_at, updated_at';

export async function fetchArrangements(songId?: string): Promise<Arrangement[]> {
  let q = supabase.from('personal_arrangements').select(ARR_COLS).order('updated_at', { ascending: false });
  if (songId) q = q.eq('song_id', songId);
  const { data, error } = await q;
  if (error) throw error;
  return data as Arrangement[];
}

export async function fetchArrangement(id: string): Promise<Arrangement> {
  const { data, error } = await supabase.from('personal_arrangements').select(ARR_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('not_found');
  return data as Arrangement;
}

export async function createArrangement(songId: string, name: string): Promise<string> {
  const { data, error } = await supabase.rpc('create_personal_arrangement', { p_song_id: songId, p_name: name });
  if (error) throw error;
  return data as string;
}

export async function duplicateArrangement(id: string, name?: string): Promise<string> {
  const { data, error } = await supabase.rpc('duplicate_personal_arrangement', { p_id: id, p_name: name ?? null });
  if (error) throw error;
  return data as string;
}

export type SaveResult = { status: 'saved'; version: number } | { status: 'conflict'; server: Arrangement };

/** Optimistic concurrency: the update only applies if `version` is unchanged. */
export async function saveArrangement(
  a: Pick<Arrangement, 'id' | 'name' | 'content' | 'display_key' | 'capo' | 'version'> & { is_draft?: boolean },
): Promise<SaveResult> {
  const { data, error } = await supabase
    .from('personal_arrangements')
    .update({ name: a.name, content: a.content, display_key: a.display_key, capo: a.capo, is_draft: a.is_draft ?? false })
    .eq('id', a.id)
    .eq('version', a.version)
    .select('version');
  if (error) throw error;
  if (data && data.length) return { status: 'saved', version: (data[0] as { version: number }).version };
  return { status: 'conflict', server: await fetchArrangement(a.id) };
}

export async function deleteArrangement(id: string): Promise<void> {
  const { error } = await supabase.from('personal_arrangements').delete().eq('id', id);
  if (error) throw error;
}

export async function setArrangementSharing(id: string, enabled: boolean): Promise<string | null> {
  const { data, error } = await supabase.rpc('set_arrangement_link_sharing', { p_id: id, p_enabled: enabled });
  if (error) throw error;
  return data as string | null;
}

export interface ArrangementVersion {
  id: string;
  version: number;
  name: string;
  content: SongContent;
  display_key: string | null;
  capo: number;
  created_at: string;
}

export async function fetchArrangementVersions(id: string): Promise<ArrangementVersion[]> {
  const { data, error } = await supabase
    .from('arrangement_versions')
    .select('id, version, name, content, display_key, capo, created_at')
    .eq('arrangement_id', id)
    .order('version', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data as ArrangementVersion[];
}

export async function fetchSharedArrangement(token: string) {
  const { data, error } = await supabase.rpc('get_shared_arrangement', { p_token: token });
  if (error) throw error;
  const row = (data as Record<string, unknown>[] | null)?.[0];
  if (!row) throw new Error('not_found');
  return row as { id: string; song_id: string; name: string; content: SongContent; display_key: string | null; capo: number; owner_name: string; updated_at: string };
}
