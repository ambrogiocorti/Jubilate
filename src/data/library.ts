/**
 * Library data access. Network first, falling back to the IndexedDB cache so
 * that reading keeps working offline.
 */
import { supabase } from '../lib/supabase';
import { cacheSong, getCachedSong, loadLibrary, pruneCache, saveLibrary } from '../lib/localdb';
import type { SongContent } from '../domain/song';
import type { Category, LibraryEntry, RevisionRow, SongDetail, SongRow } from './types';

export const SONG_COLUMNS =
  'id, number, title, alt_titles, author, composer, original_key, time_signature, tempo_bpm, status, current_revision_id, first_line, text_source, text_rights, text_rights_note, created_at, updated_at';

export async function fetchCategories(includeArchived = false): Promise<Category[]> {
  let q = supabase.from('song_categories').select('id, name, slug, kind, sort_order, archived_at').order('sort_order');
  if (!includeArchived) q = q.is('archived_at', null);
  const { data, error } = await q;
  if (error) throw error;
  return data as Category[];
}

export async function fetchLibraryRemote(): Promise<{ entries: LibraryEntry[]; categories: Category[] }> {
  const [songsRes, linksRes, categories] = await Promise.all([
    supabase
      .from('songs')
      .select(`${SONG_COLUMNS}, search_text`)
      .eq('status', 'published')
      .is('deleted_at', null)
      .order('number', { ascending: true, nullsFirst: false })
      .limit(5000),
    supabase.from('song_category_links').select('song_id, category_id').limit(20000),
    fetchCategories(),
  ]);
  if (songsRes.error) throw songsRes.error;
  if (linksRes.error) throw linksRes.error;
  const bySong = new Map<string, string[]>();
  for (const l of linksRes.data as { song_id: string; category_id: string }[]) {
    const arr = bySong.get(l.song_id) ?? [];
    arr.push(l.category_id);
    bySong.set(l.song_id, arr);
  }
  const entries = (songsRes.data as (SongRow & { search_text: string })[]).map((s) => ({
    ...s,
    category_ids: bySong.get(s.id) ?? [],
  }));
  return { entries, categories };
}

/** Loads the library: cache immediately, then refresh from network. */
export async function syncLibrary(): Promise<{ entries: LibraryEntry[]; categories: Category[] }> {
  const remote = await fetchLibraryRemote();
  await saveLibrary(remote.entries, remote.categories).catch(() => undefined);
  return remote;
}

export { loadLibrary };

export async function fetchSongRemote(id: string): Promise<SongDetail> {
  const { data: song, error } = await supabase.from('songs').select(SONG_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!song) throw new Error('not_found');
  const row = song as SongRow;
  const [contentRes, catsRes] = await Promise.all([
    row.current_revision_id
      ? supabase.rpc('get_revision_content', { p_revision_id: row.current_revision_id })
      : Promise.resolve({ data: null, error: null }),
    supabase.from('song_category_links').select('category_id').eq('song_id', id),
  ]);
  if (contentRes.error) throw contentRes.error;
  if (catsRes.error) throw catsRes.error;
  const content = (contentRes.data as SongContent | null) ?? { sections: [], sequence: [], chords: [] };
  return {
    song: row,
    content,
    categories: (catsRes.data as { category_id: string }[]).map((c) => c.category_id),
    fetchedAt: Date.now(),
  };
}

export interface SongLoadResult {
  detail: SongDetail;
  fromCache: boolean;
}

/**
 * Network first; on failure (offline) returns the cached copy. Every song
 * opened online is cached (bounded), pinned songs are never pruned.
 */
export async function loadSong(id: string, opts: { cacheChords: boolean }): Promise<SongLoadResult> {
  try {
    const detail = await fetchSongRemote(id);
    // Avoid caching an anonymous (chord-less) copy over a registered one.
    const cached = await getCachedSong(id).catch(() => undefined);
    if (opts.cacheChords || !cached || !(cached.content.chords?.length)) {
      await cacheSong(detail).catch(() => undefined);
      void pruneCache().catch(() => undefined);
    }
    return { detail, fromCache: false };
  } catch (err) {
    const cached = await getCachedSong(id).catch(() => undefined);
    if (cached) return { detail: cached, fromCache: true };
    throw err;
  }
}

export async function fetchRevisions(songId: string): Promise<RevisionRow[]> {
  const { data, error } = await supabase
    .from('song_revisions')
    .select('id, song_id, revision_number, note, contribution_id, restored_from, created_by, created_at')
    .eq('song_id', songId)
    .order('revision_number', { ascending: false });
  if (error) throw error;
  return data as RevisionRow[];
}

export async function fetchRevisionContent(revisionId: string): Promise<SongContent> {
  const { data, error } = await supabase.rpc('get_revision_content', { p_revision_id: revisionId });
  if (error) throw error;
  return data as SongContent;
}
