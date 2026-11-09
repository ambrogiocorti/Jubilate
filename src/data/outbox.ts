/**
 * Offline write queue. Each item records the version it was based on; on
 * replay a newer server version is never overwritten silently: the offline
 * edit is saved as a separate copy instead (conflict preserved, nothing lost).
 */
import { supabase } from '../lib/supabase';
import { enqueue, outboxItems, outboxRemove, outboxUpdate, type OutboxItem } from '../lib/localdb';
import type { SongContent } from '../domain/song';

export interface ArrangementSavePayload {
  id: string;
  name: string;
  content: SongContent;
  display_key: string | null;
  capo: number;
}

export async function queueArrangementSave(p: ArrangementSavePayload, baseVersion: number): Promise<void> {
  await enqueue({ kind: 'arrangement.save', payload: p, baseVersion });
}

export async function queueFavorite(songId: string, on: boolean): Promise<void> {
  await enqueue({ kind: on ? 'favorite.add' : 'favorite.remove', payload: { songId } });
}

async function apply(item: OutboxItem): Promise<'ok' | 'conflict'> {
  switch (item.kind) {
    case 'arrangement.save': {
      const p = item.payload as ArrangementSavePayload;
      const { data, error } = await supabase
        .from('personal_arrangements')
        .update({ name: p.name, content: p.content, display_key: p.display_key, capo: p.capo })
        .eq('id', p.id)
        .eq('version', item.baseVersion ?? -1)
        .select('id');
      if (error) throw error;
      if (data && data.length) return 'ok';
      // Version moved on (edited elsewhere): keep both by creating a copy.
      const { data: orig } = await supabase.from('personal_arrangements').select('song_id, base_revision_id').eq('id', p.id).maybeSingle();
      if (!orig) return 'conflict';
      const { error: insErr } = await supabase.from('personal_arrangements').insert({
        song_id: orig.song_id,
        base_revision_id: orig.base_revision_id,
        name: `${p.name} (modifica offline)`,
        content: p.content,
        display_key: p.display_key,
        capo: p.capo,
      });
      if (insErr) throw insErr;
      return 'conflict';
    }
    case 'favorite.add': {
      const { error } = await supabase.from('favorites').upsert({ song_id: (item.payload as { songId: string }).songId }, { onConflict: 'user_id,song_id', ignoreDuplicates: true });
      if (error) throw error;
      return 'ok';
    }
    case 'favorite.remove': {
      const { error } = await supabase.from('favorites').delete().eq('song_id', (item.payload as { songId: string }).songId);
      if (error) throw error;
      return 'ok';
    }
    default:
      return 'ok';
  }
}

let flushing = false;

export async function flushOutbox(): Promise<{ synced: number; conflicts: number; failed: number }> {
  const result = { synced: 0, conflicts: 0, failed: 0 };
  if (flushing || !navigator.onLine) return result;
  flushing = true;
  try {
    const items = (await outboxItems()).sort((a, b) => a.createdAt - b.createdAt);
    for (const item of items) {
      try {
        const r = await apply(item);
        await outboxRemove(item.id!);
        if (r === 'ok') result.synced++;
        else result.conflicts++;
      } catch (err) {
        result.failed++;
        await outboxUpdate({ ...item, attempts: item.attempts + 1, lastError: String((err as Error)?.message ?? err) });
        if (!navigator.onLine) break;
      }
    }
  } finally {
    flushing = false;
  }
  return result;
}

export async function pendingCount(): Promise<number> {
  return (await outboxItems()).length;
}
