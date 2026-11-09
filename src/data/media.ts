import { supabase } from '../lib/supabase';
import type { RightsStatus } from './types';

export type MediaKind = 'audio' | 'youtube' | 'pdf' | 'image';
export type MediaStatus = 'pending' | 'published' | 'rejected' | 'archived';

export interface MediaAsset {
  id: string;
  song_id: string | null;
  kind: MediaKind;
  title: string;
  description: string | null;
  performer: string | null;
  duration_seconds: number | null;
  storage_path: string | null;
  external_url: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  source: string | null;
  rights: RightsStatus;
  rights_note: string | null;
  status: MediaStatus;
  uploaded_by: string | null;
  created_at: string;
}

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
export const ALLOWED_MIME: Record<MediaKind, string[]> = {
  audio: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/x-m4a'],
  pdf: ['application/pdf'],
  image: ['image/jpeg', 'image/png', 'image/webp'],
  youtube: [],
};

const COLS = 'id, song_id, kind, title, description, performer, duration_seconds, storage_path, external_url, mime_type, size_bytes, source, rights, rights_note, status, uploaded_by, created_at';

export async function fetchMedia(songId: string): Promise<MediaAsset[]> {
  const { data, error } = await supabase.from('media_assets').select(COLS).eq('song_id', songId).order('created_at');
  if (error) throw error;
  return data as MediaAsset[];
}

export async function fetchAllMedia(status?: MediaStatus): Promise<MediaAsset[]> {
  let q = supabase.from('media_assets').select(COLS).order('created_at', { ascending: false }).limit(500);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data as MediaAsset[];
}

/** Extracts a YouTube video id from the common URL forms (no download, embed only). */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (!/^(www\.|m\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(u.hostname)) return null;
    if (u.hostname.endsWith('youtu.be')) return u.pathname.slice(1).split('/')[0] || null;
    if (u.pathname.startsWith('/embed/') || u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || null;
    return u.searchParams.get('v');
  } catch {
    return null;
  }
}

export function validateUpload(file: File, kind: MediaKind): string | null {
  if (file.size > MAX_UPLOAD_BYTES) return 'Il file supera il limite di 50 MB.';
  if (!ALLOWED_MIME[kind].includes(file.type)) return 'Formato di file non supportato.';
  return null;
}

export async function uploadMediaFile(file: File, userId: string): Promise<string> {
  const ext = (file.name.split('.').pop() ?? 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin';
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw error;
  return path;
}

export async function createMediaAsset(row: Partial<MediaAsset> & { kind: MediaKind; title: string }): Promise<string> {
  const { data, error } = await supabase.from('media_assets').insert(row).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateMediaAsset(id: string, patch: Partial<MediaAsset>): Promise<void> {
  const { error } = await supabase.from('media_assets').update(patch).eq('id', id);
  if (error) throw error;
}

export async function deleteMediaAsset(asset: MediaAsset): Promise<void> {
  if (asset.storage_path) await supabase.storage.from('media').remove([asset.storage_path]);
  const { error } = await supabase.from('media_assets').delete().eq('id', asset.id);
  if (error) throw error;
}

export async function signedUrl(path: string, seconds = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from('media').createSignedUrl(path, seconds);
  if (error) throw error;
  return data.signedUrl;
}

/** Reads the duration of an audio file locally (seconds), when the browser can decode it. */
export function audioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(a.duration) ? Math.round(a.duration) : null);
    };
    a.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    a.src = url;
  });
}
