/**
 * Converts pasted / OCR'd plain text into structured sections. The result is
 * always a proposal for manual review: nothing is published automatically.
 *
 * Recognized conventions (Italian booklets):
 *   - blank lines separate sections
 *   - "Rit.", "Rit:", "RIT.", "Ritornello" mark a chorus (the marker is removed)
 *   - "1.", "2)", "I." at the start mark verses
 *   - a block identical to an earlier one becomes a repeat in the sequence
 *   - a lone "Rit." line means "repeat the chorus here"
 *   - lines with chords only (e.g. "G   D/F#   Em") above a lyric line are
 *     converted to chord placements by column position
 */
import { parseChord } from '../music/chord';
import type { ChordPlacement, SongContent, SongSection } from './song';
import { nextSectionKey } from './song';

const CHORUS_RE = /^\s*(rit(?:ornello)?\.?|r\.)\s*[:.)-]?\s*/i;
const VERSE_RE = /^\s*(\d{1,2}|[ivx]{1,4})\s*[.)]\s+/i;

function isChordLine(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((t) => parseChord(t) !== null);
}

function chordColumns(line: string): { offset: number; chord: string }[] {
  const out: { offset: number; chord: string }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push({ offset: m.index, chord: m[0] });
  return out;
}

const normalizeBlock = (lines: string[]) => lines.map((l) => l.trim().toLowerCase()).join('\n');

export interface ImportResult {
  content: SongContent;
  warnings: string[];
}

export function importPlainText(raw: string): ImportResult {
  const warnings: string[] = [];
  const text = raw.replace(/\r\n?/g, '\n').replace(/ /g, ' ');
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.split('\n').map((l) => l.replace(/\s+$/, '')))
    .map((b) => b.filter((l, i, arr) => !(l.trim() === '' && (i === 0 || i === arr.length - 1))))
    .filter((b) => b.some((l) => l.trim() !== ''));

  const content: SongContent = { sections: [], sequence: [], chords: [], key: null };
  const seenBlocks = new Map<string, string>();
  let chorusKey: string | null = null;

  for (const block of blocks) {
    // Lone chorus marker => repeat chorus.
    if (block.length === 1 && CHORUS_RE.test(block[0]!) && block[0]!.replace(CHORUS_RE, '').trim() === '') {
      if (chorusKey) content.sequence.push(chorusKey);
      else warnings.push('Trovato «Rit.» prima di un ritornello: verificare.');
      continue;
    }
    let lines = [...block];
    let kind: SongSection['kind'] = 'verse';
    if (CHORUS_RE.test(lines[0]!)) {
      kind = 'chorus';
      lines[0] = lines[0]!.replace(CHORUS_RE, '');
      if (lines[0]!.trim() === '') lines = lines.slice(1);
    } else if (VERSE_RE.test(lines[0]!)) {
      lines[0] = lines[0]!.replace(VERSE_RE, '');
    }

    // Pair chord-only lines with the following lyric line.
    const lyricLines: string[] = [];
    const placements: { line: number; offset: number; chord: string }[] = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]!;
      if (isChordLine(l)) {
        const next = lines[i + 1];
        const target = lyricLines.length;
        if (next !== undefined && !isChordLine(next)) {
          for (const c of chordColumns(l)) placements.push({ line: target, ...c });
        } else {
          // Instrumental line: keep the chords on an empty lyric line.
          lyricLines.push('');
          for (const c of chordColumns(l)) placements.push({ line: target, ...c });
        }
        continue;
      }
      lyricLines.push(l.trim() === '' ? '' : l.replace(/^\s+/, ''));
      // Leading spaces removed: shift chord offsets accordingly.
      const removed = l.length - l.replace(/^\s+/, '').length;
      if (removed) {
        for (const p of placements) if (p.line === lyricLines.length - 1) p.offset = Math.max(0, p.offset - removed);
      }
    }
    if (!lyricLines.length) continue;

    const signature = normalizeBlock(lyricLines);
    const existing = seenBlocks.get(signature);
    if (existing) {
      content.sequence.push(existing);
      if (kind !== 'chorus') {
        const s = content.sections.find((x) => x.key === existing);
        if (s && s.kind === 'verse') s.kind = 'chorus';
      }
      continue;
    }
    const key = nextSectionKey(content, kind);
    content.sections.push({ key, kind, lines: lyricLines });
    content.sequence.push(key);
    seenBlocks.set(signature, key);
    if (kind === 'chorus') chorusKey = key;
    for (const p of placements) {
      const placement: ChordPlacement = { section: key, line: p.line, offset: p.offset, chord: p.chord };
      content.chords!.push(placement);
    }
  }

  if (!content.sections.length) {
    warnings.push('Nessun testo riconosciuto.');
    content.sections.push({ key: 'v1', kind: 'verse', lines: [''] });
    content.sequence.push('v1');
  }
  if (content.sections.some((s) => s.lines.some((l) => l.length > 300))) {
    warnings.push('Alcune righe superano 300 caratteri: vanno spezzate.');
  }
  return { content, warnings };
}

/** Normalized title used to detect possible duplicates on import. */
export function normalizeTitle(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/æ/gi, 'ae')
    .replace(/œ/gi, 'oe')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Dice coefficient on character bigrams (0..1). */
export function similarity(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const grams = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return m;
  };
  const gx = grams(x);
  const gy = grams(y);
  let overlap = 0;
  for (const [g, n] of gx) overlap += Math.min(n, gy.get(g) ?? 0);
  return (2 * overlap) / (x.length - 1 + y.length - 1);
}

export interface DuplicateCandidate<T> {
  item: T;
  score: number;
  reason: 'number' | 'title' | 'first_line';
}

export function findDuplicates<T extends { number: number | null; title: string; first_line?: string }>(
  candidate: { number?: number | null; title: string; firstLine?: string },
  existing: T[],
  threshold = 0.75,
): DuplicateCandidate<T>[] {
  const out: DuplicateCandidate<T>[] = [];
  for (const item of existing) {
    if (candidate.number != null && item.number === candidate.number) {
      out.push({ item, score: 1, reason: 'number' });
      continue;
    }
    const t = similarity(candidate.title, item.title);
    if (t >= threshold) {
      out.push({ item, score: t, reason: 'title' });
      continue;
    }
    if (candidate.firstLine && item.first_line) {
      const f = similarity(candidate.firstLine, item.first_line);
      if (f >= threshold) out.push({ item, score: f, reason: 'first_line' });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
