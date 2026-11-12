/**
 * Local structured storage (IndexedDB) for offline use:
 *   library    the published library index (all songs' metadata)
 *   songs      full song documents; `pinned` marks explicit downloads
 *   kv         small values (categories, last sync, ...)
 *   outbox     changes made offline, replayed when back online
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Category, LibraryEntry, SongDetail } from '../data/types';

export interface StoredSong extends SongDetail {
  id: string;
  pinned: boolean;
  bytes: number;
}

export interface OutboxItem {
  id?: number;
  kind: string;
  payload: unknown;
  createdAt: number;
  /** Version the change was based on, for conflict detection. */
  baseVersion?: number | null;
  attempts: number;
  lastError?: string;
}

interface JubilateDB extends DBSchema {
  library: { key: string; value: LibraryEntry };
  songs: { key: string; value: StoredSong; indexes: { pinned: number } };
  kv: { key: string; value: unknown };
  outbox: { key: number; value: OutboxItem };
}

let dbPromise: Promise<IDBPDatabase<JubilateDB>> | null = null;

export function localDb(): Promise<IDBPDatabase<JubilateDB>> {
  dbPromise ??= openDB<JubilateDB>('jubilate', 1, {
    upgrade(db) {
      db.createObjectStore('library', { keyPath: 'id' });
      const songs = db.createObjectStore('songs', { keyPath: 'id' });
      songs.createIndex('pinned', 'pinned' as never);
      db.createObjectStore('kv');
      db.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
    },
  });
  return dbPromise;
}

export async function saveLibrary(entries: LibraryEntry[], categories: Category[]): Promise<void> {
  const db = await localDb();
  const tx = db.transaction(['library', 'kv'], 'readwrite');
  await tx.objectStore('library').clear();
  for (const e of entries) await tx.objectStore('library').put(e);
  await tx.objectStore('kv').put(categories, 'categories');
  await tx.objectStore('kv').put(Date.now(), 'librarySyncedAt');
  await tx.done;
}

export async function loadLibrary(): Promise<{ entries: LibraryEntry[]; categories: Category[]; syncedAt: number | null }> {
  const db = await localDb();
  const [entries, categories, syncedAt] = await Promise.all([
    db.getAll('library'),
    db.get('kv', 'categories') as Promise<Category[] | undefined>,
    db.get('kv', 'librarySyncedAt') as Promise<number | undefined>,
  ]);
  return { entries, categories: categories ?? [], syncedAt: syncedAt ?? null };
}

const sizeOf = (v: unknown) => new Blob([JSON.stringify(v)]).size;

export async function cacheSong(detail: SongDetail, pin?: boolean): Promise<void> {
  const db = await localDb();
  const existing = await db.get('songs', detail.song.id);
  const pinned = pin ?? existing?.pinned ?? false;
  await db.put('songs', { ...detail, id: detail.song.id, pinned, bytes: sizeOf(detail) });
}

export async function getCachedSong(id: string): Promise<StoredSong | undefined> {
  return (await localDb()).get('songs', id);
}

export async function setPinned(id: string, pinned: boolean): Promise<void> {
  const db = await localDb();
  const s = await db.get('songs', id);
  if (s) await db.put('songs', { ...s, pinned });
}

export async function listStoredSongs(): Promise<StoredSong[]> {
  return (await localDb()).getAll('songs');
}

export async function removeStoredSong(id: string): Promise<void> {
  await (await localDb()).delete('songs', id);
}

/** Drops cached (non-pinned) songs beyond `keep`, oldest first. */
export async function pruneCache(keep = 150): Promise<void> {
  const db = await localDb();
  const all = (await db.getAll('songs')).filter((s) => !s.pinned).sort((a, b) => a.fetchedAt - b.fetchedAt);
  for (const s of all.slice(0, Math.max(0, all.length - keep))) await db.delete('songs', s.id);
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await localDb()).get('kv', key) as Promise<T | undefined>;
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  await (await localDb()).put('kv', value, key);
}

export async function enqueue(item: Omit<OutboxItem, 'id' | 'attempts' | 'createdAt'>): Promise<number> {
  return (await localDb()).add('outbox', { ...item, attempts: 0, createdAt: Date.now() });
}
export async function outboxItems(): Promise<OutboxItem[]> {
  return (await localDb()).getAll('outbox');
}
export async function outboxRemove(id: number): Promise<void> {
  await (await localDb()).delete('outbox', id);
}
export async function outboxUpdate(item: OutboxItem): Promise<void> {
  await (await localDb()).put('outbox', item);
}

export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const e = await navigator.storage.estimate();
  return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
