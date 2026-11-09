/**
 * Song content model shared by the viewer, the editors, personal arrangements
 * and contributions. Mirrors private.validate_song_content() in the database.
 */
import { parseChord } from '../music/chord';

export type SectionKind = 'verse' | 'chorus' | 'bridge' | 'intro' | 'outro' | 'refrain' | 'antiphon' | 'other';

export const SECTION_KINDS: readonly SectionKind[] = [
  'verse', 'chorus', 'refrain', 'bridge', 'intro', 'outro', 'antiphon', 'other',
];

export const SECTION_KIND_LABEL: Record<SectionKind, string> = {
  verse: 'Strofa',
  chorus: 'Ritornello',
  refrain: 'Ritornello',
  bridge: 'Ponte',
  intro: 'Introduzione',
  outro: 'Finale',
  antiphon: 'Antifona',
  other: 'Sezione',
};

export interface SongSection {
  /** Stable identifier within the song, e.g. "v1", "c". */
  key: string;
  kind: SectionKind;
  label?: string;
  /** One entry per line; line breaks and punctuation are preserved verbatim. */
  lines: string[];
}

/** A chord anchored to a character offset of a lyric line. */
export interface ChordPlacement {
  section: string;
  line: number;
  offset: number;
  chord: string;
}

export interface SongContent {
  sections: SongSection[];
  /** Performance order by section key; repeats reference the same section. */
  sequence: string[];
  chords?: ChordPlacement[];
  /** Key the chords are written in. */
  key?: string | null;
}

export const LIMITS = {
  sections: 60,
  linesPerSection: 80,
  lineLength: 300,
  chords: 2000,
  chordLength: 24,
  sequence: 200,
} as const;

export class ContentError extends Error {}

/** Validates content; throws ContentError with an Italian message. */
export function validateContent(c: SongContent): void {
  if (!c.sections.length) throw new ContentError('Il canto deve avere almeno una sezione.');
  if (c.sections.length > LIMITS.sections) throw new ContentError('Troppe sezioni.');
  const keys = new Set<string>();
  for (const s of c.sections) {
    if (!/^[a-z0-9_-]{1,24}$/.test(s.key)) throw new ContentError(`Identificativo di sezione non valido: «${s.key}».`);
    if (keys.has(s.key)) throw new ContentError(`Sezione duplicata: «${s.key}».`);
    keys.add(s.key);
    if (!SECTION_KINDS.includes(s.kind)) throw new ContentError('Tipo di sezione non valido.');
    if (!s.lines.length) throw new ContentError(`La sezione «${sectionTitle(s, c)}» è vuota.`);
    if (s.lines.length > LIMITS.linesPerSection) throw new ContentError('Troppe righe in una sezione.');
    if (s.lines.some((l) => l.length > LIMITS.lineLength)) throw new ContentError('Una riga è troppo lunga.');
  }
  if (!c.sequence.length) throw new ContentError('L’ordine delle sezioni è vuoto.');
  if (c.sequence.length > LIMITS.sequence) throw new ContentError('Ordine delle sezioni troppo lungo.');
  for (const k of c.sequence) {
    if (!keys.has(k)) throw new ContentError(`L’ordine fa riferimento a una sezione inesistente («${k}»).`);
  }
  const chords = c.chords ?? [];
  if (chords.length > LIMITS.chords) throw new ContentError('Troppi accordi.');
  for (const ch of chords) {
    const s = c.sections.find((x) => x.key === ch.section);
    if (!s || ch.line < 0 || ch.line >= s.lines.length || ch.offset < 0 || ch.offset > LIMITS.lineLength) {
      throw new ContentError('Un accordo è collegato a una posizione inesistente.');
    }
    if (!ch.chord || ch.chord.length > LIMITS.chordLength) throw new ContentError('Accordo non valido.');
  }
}

export function isValidContent(c: SongContent): boolean {
  try {
    validateContent(c);
    return true;
  } catch {
    return false;
  }
}

/** Display title of a section, numbering verses automatically when unlabeled. */
export function sectionTitle(section: SongSection, content: SongContent): string {
  if (section.label) return section.label;
  const base = SECTION_KIND_LABEL[section.kind];
  const sameKind = content.sections.filter((s) => s.kind === section.kind);
  if (sameKind.length > 1) return `${base} ${sameKind.indexOf(section) + 1}`;
  return base;
}

export interface SequenceEntry {
  section: SongSection;
  /** 1-based occurrence count of this section within the sequence. */
  occurrence: number;
  /** True when this section was already shown earlier in the sequence. */
  isRepeat: boolean;
  index: number;
}

/** Expands the performance order. */
export function expandSequence(content: SongContent): SequenceEntry[] {
  const byKey = new Map(content.sections.map((s) => [s.key, s]));
  const seen = new Map<string, number>();
  const out: SequenceEntry[] = [];
  content.sequence.forEach((key, index) => {
    const section = byKey.get(key);
    if (!section) return;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    out.push({ section, occurrence: n, isRepeat: n > 1, index });
  });
  return out;
}

/** Sections never referenced by the sequence (shown to editors as a warning). */
export function unusedSections(content: SongContent): SongSection[] {
  const used = new Set(content.sequence);
  return content.sections.filter((s) => !used.has(s.key));
}

export function nextSectionKey(content: SongContent, kind: SectionKind): string {
  const prefix = { verse: 'v', chorus: 'c', refrain: 'r', bridge: 'b', intro: 'i', outro: 'o', antiphon: 'a', other: 's' }[kind];
  for (let n = 1; n < 1000; n++) {
    const k = `${prefix}${n}`;
    if (!content.sections.some((s) => s.key === k)) return k;
  }
  throw new ContentError('Impossibile generare un identificativo di sezione.');
}

// ---------------------------------------------------------------------------
// Chord/lyric layout
// ---------------------------------------------------------------------------

export interface LineSegment {
  chord?: string;
  text: string;
}

/**
 * Splits a lyric line into segments starting at each chord offset. Rendering
 * each segment as a column (chord above, text below) keeps chords aligned to
 * their syllable at any font size, without padding spaces.
 * Chords past the end of the line are appended as trailing segments.
 */
export function layoutLine(text: string, placements: { offset: number; chord: string }[]): LineSegment[] {
  if (!placements.length) return [{ text }];
  const sorted = [...placements].sort((a, b) => a.offset - b.offset);
  const segments: LineSegment[] = [];
  const first = Math.min(sorted[0]!.offset, text.length);
  if (first > 0) segments.push({ text: text.slice(0, first) });
  sorted.forEach((p, i) => {
    const start = Math.min(p.offset, text.length);
    const end = i + 1 < sorted.length ? Math.min(sorted[i + 1]!.offset, text.length) : text.length;
    segments.push({ chord: p.chord, text: text.slice(start, Math.max(start, end)) });
  });
  return segments;
}

export function chordsFor(content: SongContent, sectionKey: string, line: number): ChordPlacement[] {
  return (content.chords ?? []).filter((c) => c.section === sectionKey && c.line === line);
}

export function hasChords(content: SongContent): boolean {
  return (content.chords ?? []).length > 0;
}

// ---------------------------------------------------------------------------
// ChordPro-style inline notation ("[G]Sorge la [D/F#]luce") used by the
// editor's text mode and by imports.
// ---------------------------------------------------------------------------

export function parseInlineChords(line: string): { text: string; chords: { offset: number; chord: string }[] } {
  let text = '';
  const chords: { offset: number; chord: string }[] = [];
  const re = /\[([^\]\n]{1,24})\]/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    text += line.slice(last, m.index);
    chords.push({ offset: text.length, chord: m[1]!.trim() });
    last = m.index + m[0].length;
  }
  text += line.slice(last);
  return { text, chords };
}

export function toInlineChords(text: string, placements: { offset: number; chord: string }[]): string {
  const sorted = [...placements].sort((a, b) => b.offset - a.offset);
  let out = text;
  for (const p of sorted) {
    const at = Math.min(p.offset, out.length);
    out = out.slice(0, at) + `[${p.chord}]` + out.slice(at);
  }
  return out;
}

/** Chords that the music engine cannot interpret (shown as warnings in editors). */
export function unknownChords(content: SongContent): string[] {
  const bad = new Set<string>();
  for (const c of content.chords ?? []) if (!parseChord(c.chord)) bad.add(c.chord);
  return [...bad];
}

/** Plain-text export of lyrics (no chords), following the performance order. */
export function plainText(content: SongContent): string {
  return expandSequence(content)
    .map((e) => e.section.lines.join('\n'))
    .join('\n\n');
}

export function emptyContent(): SongContent {
  return { sections: [{ key: 'v1', kind: 'verse', lines: [''] }], sequence: ['v1'], chords: [], key: null };
}

export function cloneContent(c: SongContent): SongContent {
  return structuredClone(c);
}
