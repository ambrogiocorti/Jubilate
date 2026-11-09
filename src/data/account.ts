import { supabase } from '../lib/supabase';
import type { DirectorRequest } from './types';

export async function updateDisplayName(userId: string, name: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ display_name: name.trim().slice(0, 80) }).eq('id', userId);
  if (error) throw error;
}

export async function changePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function fetchMyDirectorRequests(userId: string): Promise<DirectorRequest[]> {
  const { data, error } = await supabase
    .from('director_requests')
    .select('id, user_id, motivation, status, review_note, reviewed_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as DirectorRequest[];
}

export async function requestDirectorRole(motivation: string): Promise<void> {
  const { error } = await supabase.rpc('request_director_role', { p_motivation: motivation.trim() });
  if (error) throw error;
}

export async function cancelDirectorRequest(id: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_director_request', { p_request_id: id });
  if (error) throw error;
}
