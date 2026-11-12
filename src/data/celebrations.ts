import { supabase } from '../lib/supabase';

export type CelebrationKind = 'mass' | 'adoration' | 'vigil' | 'rehearsal' | 'other';
export type CelebrationStatus = 'draft' | 'ready' | 'done' | 'cancelled';

export interface Celebration {
  id: string;
  kind: CelebrationKind;
  title: string;
  starts_at: string | null;
  description: string | null;
  notes: string | null;
  director_id: string | null;
  status: CelebrationStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CelebrationSong {
  id: string;
  celebration_id: string;
  position: number;
  moment_label: string | null;
  category_id: string | null;
  song_id: string;
  arrangement_id: string | null;
  score_id: string | null;
  suggested_key: string | null;
  notes: string | null;
}

export interface RehearsalNote {
  id: string;
  celebration_id: string;
  song_id: string | null;
  author_id: string;
  is_shared: boolean;
  body: string;
  created_at: string;
  updated_at: string;
}

export const KIND_LABEL: Record<CelebrationKind, string> = {
  mass: 'Messa',
  adoration: 'Adorazione',
  vigil: 'Veglia',
  rehearsal: 'Prova del coro',
  other: 'Altra celebrazione',
};
export const STATUS_LABEL: Record<CelebrationStatus, string> = {
  draft: 'Bozza',
  ready: 'Pronta',
  done: 'Svolta',
  cancelled: 'Annullata',
};

const COLS = 'id, kind, title, starts_at, description, notes, director_id, status, created_by, created_at, updated_at';

export async function fetchCelebrations(scope: 'celebration' | 'rehearsal'): Promise<Celebration[]> {
  let q = supabase.from('celebrations').select(COLS).order('starts_at', { ascending: false, nullsFirst: true }).limit(200);
  q = scope === 'rehearsal' ? q.eq('kind', 'rehearsal') : q.neq('kind', 'rehearsal');
  const { data, error } = await q;
  if (error) throw error;
  return data as Celebration[];
}

export async function fetchCelebration(id: string): Promise<Celebration> {
  const { data, error } = await supabase.from('celebrations').select(COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('not_found');
  return data as Celebration;
}

export async function createCelebration(input: Pick<Celebration, 'kind' | 'title'> & Partial<Celebration>, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from('celebrations')
    .insert({ kind: input.kind, title: input.title.trim(), starts_at: input.starts_at ?? null, description: input.description ?? null, status: input.status ?? 'draft', created_by: userId, director_id: userId })
    .select('id')
    .single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateCelebration(id: string, patch: Partial<Celebration>): Promise<void> {
  const { error } = await supabase.from('celebrations').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteCelebration(id: string): Promise<void> {
  const { error } = await supabase.from('celebrations').delete().eq('id', id);
  if (error) throw error;
}

export async function duplicateCelebration(id: string, title?: string, startsAt?: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('duplicate_celebration', { p_id: id, p_title: title ?? null, p_starts_at: startsAt ?? null });
  if (error) throw error;
  return data as string;
}

export async function fetchCelebrationSongs(id: string): Promise<CelebrationSong[]> {
  const { data, error } = await supabase
    .from('celebration_songs')
    .select('id, celebration_id, position, moment_label, category_id, song_id, arrangement_id, score_id, suggested_key, notes')
    .eq('celebration_id', id)
    .order('position');
  if (error) throw error;
  return data as CelebrationSong[];
}

export async function addCelebrationSong(celebrationId: string, songId: string, position: number, momentLabel?: string | null): Promise<void> {
  const { error } = await supabase.from('celebration_songs').insert({ celebration_id: celebrationId, song_id: songId, position, moment_label: momentLabel ?? null });
  if (error) throw error;
}

export async function updateCelebrationSong(id: string, patch: Partial<CelebrationSong>): Promise<void> {
  const { error } = await supabase.from('celebration_songs').update(patch).eq('id', id);
  if (error) throw error;
}

export async function removeCelebrationSong(id: string): Promise<void> {
  const { error } = await supabase.from('celebration_songs').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderCelebrationSongs(items: CelebrationSong[]): Promise<void> {
  const res = await Promise.all(items.map((it, i) => (it.position === i ? null : supabase.from('celebration_songs').update({ position: i }).eq('id', it.id))));
  const failed = res.find((r) => r?.error);
  if (failed?.error) throw failed.error;
}

export async function fetchNotes(celebrationId: string): Promise<RehearsalNote[]> {
  const { data, error } = await supabase
    .from('rehearsal_notes')
    .select('id, celebration_id, song_id, author_id, is_shared, body, created_at, updated_at')
    .eq('celebration_id', celebrationId)
    .order('created_at');
  if (error) throw error;
  return data as RehearsalNote[];
}

export async function addNote(celebrationId: string, body: string, isShared: boolean, songId?: string | null): Promise<void> {
  const { error } = await supabase.from('rehearsal_notes').insert({ celebration_id: celebrationId, body: body.trim(), is_shared: isShared, song_id: songId ?? null });
  if (error) throw error;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('rehearsal_notes').delete().eq('id', id);
  if (error) throw error;
}
