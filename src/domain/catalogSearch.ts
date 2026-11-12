/** Search over Jubilate's catalogue of free sacred scores (see data/scoreSearch.ts). */

export interface CatalogItem {
  /** File id: the score is at catalogo/<i>.mxl */
  i: string;
  /** Title */
  t: string;
  /** Composer or arranger, may be empty */
  c: string;
  /** Licence declared by the author on MuseScore */
  l: 'pd' | 'cc0';
  /** 1 when the score has lyrics */
  y: 0 | 1;
  /** Number of parts */
  n: number;
}

export function normalizeTitle(s: string): string {
  return s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[’`]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const STOP = new Set(['il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una', 'di', 'a', 'da', 'in', 'con', 'su', 'per', 'e', 'o', 'the', 'of', 'and', 'del', 'della', 'dei', "l'", 'al', 'tu', 'te']);

/**
 * Ranks catalogue items for a song title. Every significant word of the query
 * must appear in the item's title (as a word prefix); scores with lyrics, few
 * parts and a title that starts with the query rank first.
 */
export function searchCatalog(items: CatalogItem[], query: string, limit = 8): CatalogItem[] {
  const q = normalizeTitle(query);
  if (q.length < 2) return [];
  const words = q.split(' ').filter((w) => w.length > 1 && !STOP.has(w));
  const needed = words.length ? words : q.split(' ');
  const scored: { item: CatalogItem; score: number }[] = [];
  for (const item of items) {
    const t = normalizeTitle(item.t);
    const tw = t.split(' ');
    if (!needed.every((w) => tw.some((x) => x.startsWith(w)))) continue;
    let score = 0;
    if (t === q) score += 6;
    else if (t.startsWith(q)) score += 4;
    else if (t.includes(q)) score += 2;
    score += item.y ? 2 : 0;
    score += item.n <= 4 ? 1 : 0;
    score -= Math.max(0, tw.length - needed.length) * 0.15;
    scored.push({ item, score });
  }
  // Stable: equal scores keep the catalogue order (most viewed / best rated first).
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.item);
}
