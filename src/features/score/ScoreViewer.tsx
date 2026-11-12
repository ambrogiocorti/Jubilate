import { useEffect, useRef, useState } from 'react';
import { renderScore, type RenderedScore } from '../../music/verovio';
import { Alert, Spinner } from '../../components/ui/Feedback';

interface Props {
  xml: string;
  scale: number;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /** Accessible description of the score (title, instrument). */
  label: string;
}

/**
 * Renders MusicXML with Verovio, all pages stacked (reads like a long sheet and
 * works with autoscroll). Note ids in the SVG equal the MusicXML note ids, so a
 * click maps straight to the editable model.
 */
export function ScoreViewer({ xml, scale, selectedId, onSelect, label }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [pages, setPages] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rendered = useRef<RenderedScore | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry!.contentRect.width);
      // Re-layout only on meaningful width changes.
      setWidth((prev) => (Math.abs(prev - w) > 24 ? w : prev));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!width) return;
    let cancelled = false;
    setError(null);
    renderScore(xml, { scale, width: Math.max(320, width - 32) })
      .then((r) => {
        if (cancelled) return;
        rendered.current = r;
        setPages(Array.from({ length: r.pages }, (_, i) => r.svg(i + 1)));
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Impossibile visualizzare la partitura.');
      });
    return () => {
      cancelled = true;
    };
  }, [xml, scale, width]);

  // Highlight selection and bring it into view.
  useEffect(() => {
    const el = box.current;
    if (!el || !pages) return;
    el.querySelectorAll('g.note.is-selected').forEach((n) => n.classList.remove('is-selected'));
    if (!selectedId) return;
    const target = el.querySelector(`g.note[id="${CSS.escape(selectedId)}"]`);
    if (target) {
      target.classList.add('is-selected');
      const r = target.getBoundingClientRect();
      const host = el.getBoundingClientRect();
      if (r.left < host.left || r.right > host.right || r.top < 0 || r.bottom > window.innerHeight) {
        (target as Element).scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
  }, [selectedId, pages]);

  const onClick = (e: React.MouseEvent) => {
    if (!onSelect) return;
    const direct = (e.target as Element).closest('g.note');
    if (direct) return onSelect(direct.id || null);
    // Taps often land on a staff line or stem: pick the nearest notehead within reach.
    let best: { id: string; d: number } | null = null;
    for (const n of Array.from(box.current?.querySelectorAll('g.note') ?? [])) {
      const r = n.getBoundingClientRect();
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      const d = Math.hypot(dx, dy);
      if (d <= 22 && (!best || d < best.d)) best = { id: n.id, d };
    }
    onSelect(best?.id ?? null);
  };

  return (
    <div className="score-viewer">
      {error && <Alert tone="danger" title="Partitura non visualizzabile">{error}</Alert>}
      <div
        ref={box}
        className="score-canvas"
        role="img"
        aria-label={label}
        onClick={onClick}
        style={{ cursor: onSelect ? 'pointer' : undefined }}
      >
        {!pages && !error && <Spinner label="Preparazione della partitura…" />}
        {pages?.map((svg, i) => (
          // SVG produced locally by Verovio from a parsed MusicXML document.
          <div key={i} dangerouslySetInnerHTML={{ __html: svg }} />
        ))}
      </div>
    </div>
  );
}
