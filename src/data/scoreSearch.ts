import { supabase } from '../lib/supabase';
import { readScoreFile } from './scores';

/** A MusicXML file found on CPDL (see supabase/functions/_shared/cpdl.ts). */
export interface ScoreCandidate {
  page: string;
  pageUrl: string;
  file: string;
  url: string;
  size: number | null;
}

const FUNCTION = 'score-search';

/** Searches CPDL for MusicXML scores whose page matches the song title. */
export async function searchScoresByTitle(title: string): Promise<ScoreCandidate[]> {
  const { data, error } = await supabase.functions.invoke<{ results: ScoreCandidate[] }>(FUNCTION, {
    body: { action: 'search', title },
  });
  if (error) throw new Error('La ricerca degli spartiti non è disponibile in questo momento.');
  return data?.results ?? [];
}

/** Downloads a CPDL file through the proxy and returns the MusicXML text. */
export async function importCandidate(c: ScoreCandidate): Promise<string> {
  const { data, error } = await supabase.functions.invoke<Blob>(FUNCTION, { body: { action: 'fetch', url: c.url } });
  if (error || !(data instanceof Blob)) throw new Error('Non è stato possibile scaricare lo spartito da CPDL.');
  return readScoreFile(new File([data], c.file));
}

/** Text for the score's "source" field. */
export function candidateSource(c: ScoreCandidate): string {
  return `CPDL – ${c.page} (${c.pageUrl}), file ${c.file}. Licenza indicata sulla pagina CPDL.`;
}
