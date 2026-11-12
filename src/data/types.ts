/** Row types for the tables the client reads (subset of columns). */
import type { SongContent } from '../domain/song';

export type AppRole = 'director' | 'admin';
export type PublicationStatus = 'draft' | 'published' | 'archived';
export type RightsStatus = 'unknown' | 'public_domain' | 'own_work' | 'permission_granted' | 'licensed';
export type CategoryKind = 'mass_moment' | 'liturgical_season' | 'theme' | 'other';

export interface Profile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_suspended: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  kind: CategoryKind;
  sort_order: number;
  archived_at: string | null;
}

export interface SongRow {
  id: string;
  number: number | null;
  title: string;
  alt_titles: string[];
  author: string | null;
  composer: string | null;
  original_key: string | null;
  time_signature: string | null;
  tempo_bpm: number | null;
  status: PublicationStatus;
  current_revision_id: string | null;
  first_line: string;
  text_source: string | null;
  text_rights: RightsStatus;
  text_rights_note: string | null;
  updated_at: string;
  created_at: string;
  deleted_at?: string | null;
}

/** Library index entry (cached offline). */
export interface LibraryEntry extends SongRow {
  category_ids: string[];
  /** Normalized lyrics for full-text search (from songs.search_text). */
  search_text: string;
}

export interface SongDetail {
  song: SongRow;
  content: SongContent;
  categories: string[];
  fetchedAt: number;
}

export interface RevisionRow {
  id: string;
  song_id: string;
  revision_number: number;
  note: string | null;
  contribution_id: string | null;
  restored_from: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DirectorRequest {
  id: string;
  user_id: string;
  motivation: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface AdminUserRow {
  id: string;
  email: string;
  display_name: string;
  is_suspended: boolean;
  roles: AppRole[];
  created_at: string;
  email_confirmed: boolean;
}

export const RIGHTS_LABEL: Record<RightsStatus, string> = {
  unknown: 'Da verificare',
  public_domain: 'Pubblico dominio',
  own_work: 'Opera propria',
  permission_granted: 'Autorizzazione ottenuta',
  licensed: 'Su licenza',
};

export const STATUS_LABEL: Record<PublicationStatus, string> = {
  draft: 'Bozza',
  published: 'Pubblicato',
  archived: 'Archiviato',
};
