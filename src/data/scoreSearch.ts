/**
 * Scores from CPDL (Choral Public Domain Library). CPDL is protected by a
 * Cloudflare challenge that rejects every automated request, from servers and
 * from the browser alike (verified: HTTP 403 "Just a moment..."), so Jubilate
 * opens the search on CPDL and the user loads the downloaded file.
 */
export interface ScoreSource {
  site: 'CPDL';
  query: string;
  file: string;
}

export function cpdlSearchUrl(title: string): string {
  const q = new URLSearchParams({ search: title.trim(), title: 'Special:Search', fulltext: '1' });
  return `https://www.cpdl.org/wiki/index.php?${q.toString()}`;
}

/** Text for the score's "source" field. */
export function candidateSource(s: ScoreSource): string {
  return `CPDL (www.cpdl.org), ricerca «${s.query}», file ${s.file}. Verificare la licenza sulla pagina CPDL dello spartito.`;
}
