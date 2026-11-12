/**
 * Where an imported score comes from.
 *
 * - Catalogue: Jubilate's own catalogue of free sacred scores, built at deploy
 *   time from PDMX (public-domain / CC0 MusicXML from MuseScore) and served
 *   next to the app, so it is searched automatically and always reachable.
 * - CPDL (Choral Public Domain Library) sits behind a Cloudflare challenge that
 *   rejects every automated request (verified: HTTP 403 "Just a moment..."), so
 *   Jubilate opens the search on CPDL and the user loads the downloaded file.
 */
import { publicAsset } from '../lib/env';
import type { CatalogItem } from '../domain/catalogSearch';

export { searchCatalog, type CatalogItem } from '../domain/catalogSearch';

export type ScoreSource =
  | { site: 'CPDL'; query: string; file: string }
  | { site: 'Catalogo'; id: string; title: string; composer: string; license: 'pd' | 'cc0' };

export function cpdlSearchUrl(title: string): string {
  const q = new URLSearchParams({ search: title.trim(), title: 'Special:Search', fulltext: '1' });
  return `https://www.cpdl.org/wiki/index.php?${q.toString()}`;
}

/** Text for the score's "source" field. */
export function candidateSource(s: ScoreSource): string {
  if (s.site === 'CPDL') {
    return `CPDL (www.cpdl.org), ricerca «${s.query}», file ${s.file}. Verificare la licenza sulla pagina CPDL dello spartito.`;
  }
  const who = s.composer ? ` di ${s.composer}` : '';
  const lic = s.license === 'cc0' ? 'CC0' : 'pubblico dominio';
  return `«${s.title}»${who}, MuseScore (licenza ${lic}), dal catalogo PDMX (Long et al., 2024, CC BY 4.0), id ${s.id}.`;
}

/** Rights status to propose when saving an imported score. */
export function candidateRights(s: ScoreSource): 'public_domain' | 'licensed' {
  return s.site === 'Catalogo' ? 'public_domain' : 'licensed';
}

let catalog: Promise<CatalogItem[]> | null = null;

/** Loads the catalogue index once; resolves to [] when it is not published. */
export function loadCatalog(): Promise<CatalogItem[]> {
  catalog ??= fetch(publicAsset('catalogo/index.json'))
    .then((r) => (r.ok ? r.json() : { items: [] }))
    .then((d: { items?: CatalogItem[] }) => (Array.isArray(d.items) ? d.items : []))
    .catch(() => { catalog = null; return []; });
  return catalog;
}

export async function fetchCatalogScore(item: CatalogItem): Promise<string> {
  if (!/^[A-Za-z0-9]+$/.test(item.i)) throw new Error('Spartito non valido.');
  const r = await fetch(publicAsset(`catalogo/${item.i}.mxl`));
  if (!r.ok) throw new Error('Spartito non disponibile. Riprova più tardi.');
  const { readMxl } = await import('../music/musicxml');
  return readMxl(await r.arrayBuffer());
}
