import { supabase } from '../lib/supabase';
import { readScoreFile } from './scores';
import { findScores, isAllowedFileUrl, MAX_SCORE_BYTES, type ScoreCandidate } from '../../supabase/functions/_shared/cpdl';

export type { ScoreCandidate };

const FUNCTION = 'score-search';

/**
 * CPDL is queried directly from the browser first: its MediaWiki API allows
 * anonymous CORS, and CPDL refuses requests coming from cloud servers (the
 * Edge Function got HTTP 403). The function stays as a fallback.
 */
async function browserJson(url: string): Promise<unknown> {
  const r = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) throw new Error(`cpdl_${r.status}`);
  return r.json();
}

/** Searches CPDL for MusicXML scores whose page matches the song title. */
export async function searchScoresByTitle(title: string): Promise<ScoreCandidate[]> {
  try {
    return await findScores(title, browserJson);
  } catch {
    const { data, error } = await supabase.functions.invoke<{ results: ScoreCandidate[] }>(FUNCTION, {
      body: { action: 'search', title },
    });
    if (error) throw new Error(await describe(error));
    return data?.results ?? [];
  }
}

/** Downloads a CPDL file (directly, else through the proxy) and returns the MusicXML text. */
export async function importCandidate(c: ScoreCandidate): Promise<string> {
  if (!isAllowedFileUrl(c.url)) throw new Error('Indirizzo dello spartito non valido.');
  let blob: Blob | null = null;
  try {
    const r = await fetch(c.url, { signal: AbortSignal.timeout(20_000) });
    if (r.ok) blob = await r.blob();
  } catch { /* CORS or network: try the proxy */ }
  if (!blob) {
    const { data, error } = await supabase.functions.invoke<Blob>(FUNCTION, { body: { action: 'fetch', url: c.url } });
    if (!error && data instanceof Blob) blob = data;
  }
  if (!blob) {
    throw new Error('CPDL non permette di scaricare questo file da qui. Aprilo con «licenza e dettagli», scaricalo e caricalo con «Importa».');
  }
  if (blob.size > MAX_SCORE_BYTES) throw new Error('Il file supera il limite di 5 MB.');
  return readScoreFile(new File([blob], c.file));
}

/** Turns a function error into a message the user can act on. */
async function describe(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response }).context;
  let code = '';
  try { if (ctx && typeof ctx.json === 'function') code = ((await ctx.clone().json()) as { error?: string }).error ?? ''; } catch { /* not JSON */ }
  const status = ctx?.status;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 'Sei offline: la ricerca degli spartiti richiede la connessione.';
  if (status === 401 || code === 'not_authenticated') return 'Accedi di nuovo per cercare gli spartiti.';
  if (status === 404) return 'Il servizio di ricerca degli spartiti non è ancora attivo.';
  if (code === 'source_unavailable') return 'CPDL non risponde in questo momento. Riprova più tardi o carica un file.';
  return `La ricerca degli spartiti non è disponibile in questo momento${status ? ` (errore ${status})` : ''}.`;
}

/** Text for the score's "source" field. */
export function candidateSource(c: ScoreCandidate): string {
  return `CPDL – ${c.page} (${c.pageUrl}), file ${c.file}. Licenza indicata sulla pagina CPDL.`;
}
