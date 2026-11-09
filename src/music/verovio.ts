/**
 * Lazy Verovio loader. The engine (WASM, several MB) is downloaded only when a
 * score is first shown; the service worker then caches it for offline use.
 */
import type { VerovioToolkit } from 'verovio/esm';

let toolkitPromise: Promise<VerovioToolkit> | null = null;

export function loadVerovio(): Promise<VerovioToolkit> {
  toolkitPromise ??= (async () => {
    const [{ default: createVerovioModule }, { VerovioToolkit }] = await Promise.all([
      import('verovio/wasm'),
      import('verovio/esm'),
    ]);
    const module = await createVerovioModule();
    return new VerovioToolkit(module);
  })().catch((e) => {
    toolkitPromise = null;
    throw e;
  });
  return toolkitPromise;
}

export interface RenderOptions {
  /** Percentage, 20–150. */
  scale: number;
  /** Page width in CSS pixels; layout reflows to fit. */
  width: number;
}

export interface RenderedScore {
  pages: number;
  svg: (page: number) => string;
  pageOf: (noteId: string) => number;
}

/** Loads MusicXML into the (shared) toolkit and returns page accessors. */
export async function renderScore(musicxml: string, opts: RenderOptions): Promise<RenderedScore> {
  const tk = await loadVerovio();
  const scale = Math.max(20, Math.min(150, Math.round(opts.scale)));
  tk.setOptions({
    scale,
    pageWidth: Math.max(600, Math.round((opts.width * 100) / scale)),
    adjustPageHeight: true,
    breaks: 'auto',
    footer: 'none',
    header: 'auto',
    svgViewBox: true,
  });
  if (!tk.loadData(musicxml)) throw new Error('Impossibile visualizzare la partitura.');
  const pages = tk.getPageCount();
  return {
    pages,
    svg: (p) => tk.renderToSVG(Math.min(Math.max(1, p), pages)),
    pageOf: (id) => tk.getPageWithElement(id) || 1,
  };
}
