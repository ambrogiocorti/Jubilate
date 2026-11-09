/**
 * Text extraction for the import tool. Everything runs in the browser:
 * - PDF with a text layer → pdf.js text content (exact, no OCR);
 * - scanned PDF pages and images → Tesseract OCR (Italian + Latin).
 * The result is always shown to the administrator for manual review.
 * Note: Tesseract downloads its engine and language data (~15 MB) on first use.
 */
export interface ExtractProgress {
  stage: string;
  progress: number; // 0..1
}

type OnProgress = (p: ExtractProgress) => void;

async function loadPdf(data: ArrayBuffer) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  return pdfjs.getDocument({ data }).promise;
}

/** Groups text items into lines by their baseline. */
function itemsToText(items: { str: string; transform: number[]; hasEOL?: boolean }[]): string {
  const lines: { y: number; parts: { x: number; s: string }[] }[] = [];
  for (const it of items) {
    if (!it.str) continue;
    const x = it.transform[4] ?? 0;
    const y = Math.round(it.transform[5] ?? 0);
    let line = lines.find((l) => Math.abs(l.y - y) <= 2);
    if (!line) lines.push((line = { y, parts: [] }));
    line.parts.push({ x, s: it.str });
  }
  lines.sort((a, b) => b.y - a.y);
  const out: string[] = [];
  let prevY: number | null = null;
  for (const l of lines) {
    if (prevY !== null && prevY - l.y > 22) out.push(''); // paragraph gap
    out.push(l.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join('').replace(/\s+$/, ''));
    prevY = l.y;
  }
  return out.join('\n');
}

async function ocrCanvasOrImage(sources: (HTMLCanvasElement | File)[], onProgress?: OnProgress): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  onProgress?.({ stage: 'Preparazione del riconoscimento del testo…', progress: 0 });
  const worker = await createWorker(['ita', 'lat'], 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.({ stage: 'Riconoscimento del testo…', progress: m.progress });
    },
  });
  try {
    const texts: string[] = [];
    for (const [i, src] of sources.entries()) {
      onProgress?.({ stage: `Pagina ${i + 1} di ${sources.length}…`, progress: i / sources.length });
      const { data } = await worker.recognize(src);
      texts.push(data.text);
    }
    return texts.join('\n\n');
  } finally {
    await worker.terminate();
  }
}

export async function extractText(file: File, onProgress?: OnProgress): Promise<{ text: string; method: 'pdf-text' | 'ocr' }> {
  if (file.size > 30 * 1024 * 1024) throw new Error('Il file supera il limite di 30 MB.');
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    onProgress?.({ stage: 'Lettura del PDF…', progress: 0 });
    const pdf = await loadPdf(await file.arrayBuffer());
    const pages = Math.min(pdf.numPages, 40);
    const texts: string[] = [];
    for (let p = 1; p <= pages; p++) {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      texts.push(itemsToText(content.items as { str: string; transform: number[] }[]));
      onProgress?.({ stage: `Pagina ${p} di ${pages}…`, progress: p / pages });
    }
    const text = texts.join('\n\n').trim();
    if (text.replace(/\s/g, '').length > 40) return { text, method: 'pdf-text' };
    // No text layer: scanned PDF. Render pages and OCR them.
    const canvases: HTMLCanvasElement[] = [];
    for (let p = 1; p <= Math.min(pages, 10); p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, viewport }).promise;
      canvases.push(canvas);
    }
    return { text: await ocrCanvasOrImage(canvases, onProgress), method: 'ocr' };
  }
  if (/^image\/(png|jpeg|webp)$/.test(file.type)) return { text: await ocrCanvasOrImage([file], onProgress), method: 'ocr' };
  if (file.type.startsWith('text/') || /\.txt$/i.test(file.name)) return { text: await file.text(), method: 'pdf-text' };
  throw new Error('Formato non supportato: usa PDF, immagini (JPG, PNG, WebP) o testo.');
}
