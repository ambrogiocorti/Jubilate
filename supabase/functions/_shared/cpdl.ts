/**
 * Score search on CPDL (Choral Public Domain Library, https://www.cpdl.org),
 * a MediaWiki site with free choral scores, many with a MusicXML edition.
 *
 * Pure helpers shared by the app (which queries CPDL directly from the
 * browser), the `score-search` Edge Function (fallback proxy) and the tests:
 * no Deno or browser APIs here, the HTTP client is injected.
 */

export const CPDL_ORIGIN = 'https://www.cpdl.org';
export const CPDL_API = `${CPDL_ORIGIN}/wiki/api.php`;
export const MAX_SCORE_BYTES = 5 * 1024 * 1024;
const MUSICXML_FILE = /\.(mxl|musicxml|xml)$/i;

export interface ScoreCandidate {
  /** CPDL page title, e.g. "Adeste fideles (John Francis Wade)". */
  page: string;
  pageUrl: string;
  /** File name without the "File:" prefix. */
  file: string;
  url: string;
  size: number | null;
}

export type FetchJson = (url: string) => Promise<unknown>;

export function apiUrl(params: Record<string, string>): string {
  // origin=* enables anonymous CORS, so the same URLs work from the browser.
  const q = new URLSearchParams({ format: 'json', formatversion: '2', origin: '*', ...params });
  return `${CPDL_API}?${q.toString()}`;
}

/** Only files served by CPDL itself may be downloaded through the proxy. */
export function isAllowedFileUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && (u.hostname === 'www.cpdl.org' || u.hostname === 'cpdl.org')
      && u.pathname.startsWith('/wiki/images/') && MUSICXML_FILE.test(u.pathname);
  } catch {
    return false;
  }
}

export function cleanTitle(title: string): string {
  return title.replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
}

interface SearchResponse { query?: { search?: { title: string; pageid: number }[] } }
interface PagesResponse { query?: { pages?: { pageid?: number; title: string; images?: { title: string }[]; imageinfo?: { url: string; size?: number }[]; missing?: boolean }[] } }

/**
 * Searches CPDL for `title` and returns the MusicXML files found on the
 * matching score pages, best matches first.
 */
export async function findScores(title: string, fetchJson: FetchJson, limit = 12): Promise<ScoreCandidate[]> {
  const q = cleanTitle(title);
  if (q.length < 3) return [];
  const search = (await fetchJson(apiUrl({ action: 'query', list: 'search', srsearch: q, srnamespace: '0', srlimit: '10', srwhat: 'title' }))) as SearchResponse;
  let hits = search.query?.search ?? [];
  if (!hits.length) {
    const text = (await fetchJson(apiUrl({ action: 'query', list: 'search', srsearch: q, srnamespace: '0', srlimit: '10' }))) as SearchResponse;
    hits = text.query?.search ?? [];
  }
  if (!hits.length) return [];

  const pages = (await fetchJson(apiUrl({
    action: 'query', prop: 'images', imlimit: '500', pageids: hits.map((h) => h.pageid).join('|'),
  }))) as PagesResponse;
  const order = new Map(hits.map((h, i) => [h.pageid, i]));
  const files: { page: string; file: string; rank: number }[] = [];
  for (const p of pages.query?.pages ?? []) {
    for (const img of p.images ?? []) {
      if (MUSICXML_FILE.test(img.title)) files.push({ page: p.title, file: img.title, rank: order.get(p.pageid ?? -1) ?? 99 });
    }
  }
  files.sort((a, b) => a.rank - b.rank || preferMxl(a.file) - preferMxl(b.file));
  const chosen = files.slice(0, limit);
  if (!chosen.length) return [];

  const info = (await fetchJson(apiUrl({
    action: 'query', prop: 'imageinfo', iiprop: 'url|size', titles: chosen.map((f) => f.file).join('|'),
  }))) as PagesResponse;
  const byFile = new Map((info.query?.pages ?? []).map((p) => [p.title, p.imageinfo?.[0]]));
  const out: ScoreCandidate[] = [];
  for (const f of chosen) {
    const ii = byFile.get(f.file);
    if (!ii?.url || !isAllowedFileUrl(ii.url)) continue;
    if (ii.size && ii.size > MAX_SCORE_BYTES) continue;
    out.push({
      page: f.page,
      pageUrl: `${CPDL_ORIGIN}/wiki/index.php/${encodeURIComponent(f.page.replace(/ /g, '_'))}`,
      file: f.file.replace(/^File:/, ''),
      url: ii.url,
      size: ii.size ?? null,
    });
  }
  return out;
}

/** Compressed MusicXML first: smaller and always a complete score. */
function preferMxl(name: string): number {
  return /\.mxl$/i.test(name) ? 0 : 1;
}
