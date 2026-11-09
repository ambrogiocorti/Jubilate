import { supabase } from '../lib/supabase';
import type { SongContent } from '../domain/song';

export type ContributionKind = 'new_song' | 'correction' | 'chords' | 'metadata' | 'arrangement' | 'score' | 'recording';
export type ContributionStatus = 'draft' | 'submitted' | 'in_review' | 'approved' | 'rejected';

export interface ContributionPayload {
  metadata?: Record<string, unknown>;
  content?: SongContent;
  musicxml?: string;
  score_title?: string;
  instrument?: string;
  media_asset_id?: string;
  arrangement_id?: string;
  category_ids?: string[];
}

export interface Contribution {
  id: string;
  author_id: string;
  kind: ContributionKind;
  song_id: string | null;
  base_revision_id: string | null;
  title: string;
  message: string | null;
  payload: ContributionPayload;
  status: ContributionStatus;
  reviewer_id: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  resulting_revision_id: string | null;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export const KIND_LABEL: Record<ContributionKind, string> = {
  new_song: 'Nuovo canto',
  correction: 'Correzione del testo',
  chords: 'Accordi',
  metadata: 'Informazioni sul canto',
  arrangement: 'Arrangiamento',
  score: 'Spartito',
  recording: 'Registrazione',
};

export const STATUS_LABEL: Record<ContributionStatus, string> = {
  draft: 'Bozza',
  submitted: 'Inviata',
  in_review: 'In revisione',
  approved: 'Approvata',
  rejected: 'Rifiutata',
};

const COLS = 'id, author_id, kind, song_id, base_revision_id, title, message, payload, status, reviewer_id, review_note, reviewed_at, resulting_revision_id, submitted_at, created_at, updated_at';

export async function fetchContributions(opts: { mine?: string; statuses?: ContributionStatus[] } = {}): Promise<Contribution[]> {
  let q = supabase.from('contribution_requests').select(COLS).order('created_at', { ascending: false }).limit(300);
  if (opts.mine) q = q.eq('author_id', opts.mine);
  if (opts.statuses) q = q.in('status', opts.statuses);
  const { data, error } = await q;
  if (error) throw error;
  return data as Contribution[];
}

export async function fetchContribution(id: string): Promise<Contribution> {
  const { data, error } = await supabase.from('contribution_requests').select(COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('not_found');
  return data as Contribution;
}

export async function saveContribution(input: {
  id?: string;
  kind: ContributionKind;
  song_id: string | null;
  base_revision_id: string | null;
  title: string;
  message: string | null;
  payload: ContributionPayload;
  status: 'draft' | 'submitted';
}): Promise<string> {
  const { id, ...row } = input;
  if (id) {
    const { error } = await supabase.from('contribution_requests')
      .update({ title: row.title, message: row.message, payload: row.payload, status: row.status, base_revision_id: row.base_revision_id })
      .eq('id', id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase.from('contribution_requests').insert(row).select('id').single();
  if (error) throw error;
  return (data as { id: string }).id;
}

export async function deleteContribution(id: string): Promise<void> {
  const { error } = await supabase.from('contribution_requests').delete().eq('id', id);
  if (error) throw error;
}

export async function reviewContribution(id: string, decision: 'approve' | 'reject' | 'in_review', note?: string, force = false): Promise<string | null> {
  const { data, error } = await supabase.rpc('review_contribution', { p_id: id, p_decision: decision, p_note: note ?? null, p_force: force });
  if (error) throw error;
  return (data as string | null) ?? null;
}
