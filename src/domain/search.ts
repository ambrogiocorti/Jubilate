/**
 * Client-side search over the cached library index. Works offline and stays
 * instantaneous for hundreds of songs. Mirrors public.search_songs() ranking.
 */
import { normalizeTitle } from './textImport';

export interface SearchableSong {
  id: string;
  number: number | null;
  title: string;
  alt_titles: string[];
  author: string | null;
  composer?: string | null;
  original_key?: string | null;
  first_line: string;
  lyrics?: string;
  category_ids: string[];
}

export interface SearchFilters {
  categoryIds?: string[];
  key?: string | null;
}

export const normalizeQuery = normalizeTitle;

interface Prepared {
  song: SearchableSong;
  title: string;
  alt: string;
  people: string;
  body: string;
}

export function prepareIndex(songs: SearchableSong[]): Prepared[] {
  return songs.map((song) => ({
    song,
    title: normalizeTitle(song.title),
    alt: normalizeTitle(song.alt_titles.join(' ')),
    people: normalizeTitle(`${song.author ?? ''} ${song.composer ?? ''}`),
    body: normalizeTitle(`${song.first_line} ${song.lyrics ?? ''}`),
  }));
}

export function searchSongs(index: Prepared[], query: string, filters: SearchFilters = {}): SearchableSong[] {
  const q = normalizeTitle(query);
  const terms = q.split(' ').filter(Boolean);
  const results: { song: SearchableSong; score: number }[] = [];
  for (const p of index) {
    const s = p.song;
    if (filters.categoryIds?.length && !filters.categoryIds.some((c) => s.category_ids.includes(c))) continue;
    if (filters.key && s.original_key !== filters.key) continue;
    if (!terms.length) {
      results.push({ song: s, score: 0 });
      continue;
    }
    let score = 0;
    if (/^\d+$/.test(q)) {
      if (s.number === Number(q)) score += 100;
      else if (s.number !== null && String(s.number).startsWith(q)) score += 20;
    }
    if (p.title === q) score += 50;
    else if (p.title.startsWith(q)) score += 30;
    else if (p.title.includes(q)) score += 20;
    if (p.alt.includes(q)) score += 15;
    const haystack = `${p.title} ${p.alt} ${p.people} ${p.body}`;
    const allTerms = terms.every((t) => haystack.includes(t));
    if (allTerms) {
      score += 5 * terms.length;
      if (p.body.includes(q)) score += 8;
      if (p.people.includes(q)) score += 6;
    }
    if (score > 0) results.push({ song: s, score });
  }
  return results
    .sort((a, b) => b.score - a.score || (a.song.number ?? 1e9) - (b.song.number ?? 1e9) || a.song.title.localeCompare(b.song.title, 'it'))
    .map((r) => r.song);
}
