import { supabase } from '../lib/supabase';
import type { PublicationStatus, RightsStatus } from './types';

export type Instrument = 'piano' | 'organ' | 'guitar' | 'voice' | 'choir' | 'other';
export const INSTRUMENT_LABEL: Record<Instrument, string> = {
  piano: 'Pianoforte', organ: 'Organo', guitar: 'Chitarra', voice: 'Voce', choir: 'Coro', other: 'Altro',
};

export interface MusicScore {
  id: string;
  song_id: string | null;
  owner_id: string | null;
  title: string;
  instrument: Instrument;
  status: PublicationStatus;
  current_version_id: string | null;
  source: string | null;
  rights: RightsStatus;
  rights_note: string | null;
  updated_at: string;
  created_at: string;
}

export interface ScoreVersion {
  id: string;
  score_id: string;
  version: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

const COLS = 'id, song_id, owner_id, title, instrument, status, current_version_id, source, rights, rights_note, updated_at, created_at';

/** Scores of a song visible to the current user (RLS filters the rest). */
export async function fetchSongScores(songId: string): Promise<MusicScore[]> {
  const { data, error } = await supabase.from('music_scores').select(COLS).eq('song_id', songId).order('owner_id', { nullsFirst: true }).order('created_at');
  if (error) throw error;
  return data as MusicScore[];
}

export async function fetchMyScores(userId: string): Promise<MusicScore[]> {
  const { data, error } = await supabase.from('music_scores').select(COLS).eq('owner_id', userId).order('updated_at', { ascending: false });
  if (error) throw error;
  return data as MusicScore[];
}

export async function fetchAllScores(): Promise<MusicScore[]> {
  const { data, error } = await supabase.from('music_scores').select(COLS).order('updated_at', { ascending: false }).limit(500);
  if (error) throw error;
  return data as MusicScore[];
}

export async function fetchScore(id: string): Promise<MusicScore> {
  const { data, error } = await supabase.from('music_scores').select(COLS).eq('id', id).single();
  if (error) throw error;
  return data as MusicScore;
}

export async function fetchScoreXml(score: Pick<MusicScore, 'current_version_id'>): Promise<string | null> {
  if (!score.current_version_id) return null;
  const { data, error } = await supabase.from('score_versions').select('musicxml').eq('id', score.current_version_id).single();
  if (error) throw error;
  return (data as { musicxml: string }).musicxml;
}

export async function fetchVersionXml(versionId: string): Promise<string> {
  const { data, error } = await supabase.from('score_versions').select('musicxml').eq('id', versionId).single();
  if (error) throw error;
  return (data as { musicxml: string }).musicxml;
}

export async function fetchScoreVersions(scoreId: string): Promise<ScoreVersion[]> {
  const { data, error } = await supabase.from('score_versions').select('id, score_id, version, note, created_by, created_at').eq('score_id', scoreId).order('version', { ascending: false });
  if (error) throw error;
  return data as ScoreVersion[];
}

export interface NewScore {
  song_id: string | null;
  title: string;
  instrument: Instrument;
  /** true = official score (admins only; enforced by RLS). */
  official: boolean;
  ownerId: string;
  source?: string | null;
  rights?: RightsStatus;
}

export async function createScore(s: NewScore, musicxml: string, note = 'Prima versione'): Promise<MusicScore> {
  const { data, error } = await supabase
    .from('music_scores')
    .insert({
      song_id: s.song_id,
      title: s.title,
      instrument: s.instrument,
      owner_id: s.official ? null : s.ownerId,
      source: s.source ?? null,
      rights: s.rights ?? 'unknown',
    })
    .select(COLS)
    .single();
  if (error) throw error;
  await addScoreVersion((data as MusicScore).id, musicxml, note);
  return fetchScore((data as MusicScore).id);
}

/** Appends a version (history is insert-only) and makes it current. */
export async function addScoreVersion(scoreId: string, musicxml: string, note: string | null): Promise<void> {
  const { error } = await supabase.from('score_versions').insert({ score_id: scoreId, musicxml, note });
  if (error) throw error;
}

export async function updateScoreMeta(id: string, patch: Partial<Pick<MusicScore, 'title' | 'instrument' | 'status' | 'source' | 'rights' | 'rights_note'>>): Promise<void> {
  const { error } = await supabase.from('music_scores').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteScore(id: string): Promise<void> {
  const { error } = await supabase.from('music_scores').delete().eq('id', id);
  if (error) throw error;
}

/** Reads an uploaded .musicxml / .xml / .mxl file as MusicXML text. */
export async function readScoreFile(file: File): Promise<string> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Il file supera il limite di 5 MB.');
  if (/\.mxl$/i.test(file.name)) {
    const { readMxl } = await import('../music/musicxml');
    return readMxl(await file.arrayBuffer());
  }
  if (!/\.(musicxml|xml)$/i.test(file.name)) throw new Error('Formato non supportato: usa .musicxml, .xml o .mxl.');
  return file.text();
}

export function downloadText(filename: string, text: string, mime = 'application/vnd.recordare.musicxml+xml') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const safeFilename = (s: string) => (s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'partitura');
