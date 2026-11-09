/**
 * Pure editing operations on SongContent. Chord placements follow their text
 * when lines are edited in inline notation, and are re-anchored when sections
 * are renamed or removed.
 */
import { formatChord, parseChord, parseKey, transposeChord, transposeKey } from '../../music/chord';
import {
  nextSectionKey,
  parseInlineChords,
  toInlineChords,
  type ChordPlacement,
  type SectionKind,
  type SongContent,
} from '../../domain/song';

export function sectionToInline(c: SongContent, key: string): string {
  const s = c.sections.find((x) => x.key === key);
  if (!s) return '';
  return s.lines
    .map((line, i) => toInlineChords(line, (c.chords ?? []).filter((p) => p.section === key && p.line === i)))
    .join('\n');
}

/** Replaces a section's lines (and its chords) from inline-chord text. */
export function setSectionInline(c: SongContent, key: string, inline: string): SongContent {
  const lines = inline.replace(/\r\n?/g, '\n').split('\n');
  const parsed = lines.map(parseInlineChords);
  const chords: ChordPlacement[] = [
    ...(c.chords ?? []).filter((p) => p.section !== key),
    ...parsed.flatMap((p, line) => p.chords.map((ch) => ({ section: key, line, offset: ch.offset, chord: ch.chord }))),
  ];
  return {
    ...c,
    sections: c.sections.map((s) => (s.key === key ? { ...s, lines: parsed.map((p) => p.text) } : s)),
    chords,
  };
}

export function addSection(c: SongContent, kind: SectionKind, appendToSequence = true): { content: SongContent; key: string } {
  const key = nextSectionKey(c, kind);
  return {
    key,
    content: {
      ...c,
      sections: [...c.sections, { key, kind, lines: [''] }],
      sequence: appendToSequence ? [...c.sequence, key] : c.sequence,
    },
  };
}

export function removeSection(c: SongContent, key: string): SongContent {
  return {
    ...c,
    sections: c.sections.filter((s) => s.key !== key),
    sequence: c.sequence.filter((k) => k !== key),
    chords: (c.chords ?? []).filter((p) => p.section !== key),
  };
}

export function updateSection(c: SongContent, key: string, patch: { kind?: SectionKind; label?: string }): SongContent {
  return {
    ...c,
    sections: c.sections.map((s) => {
      if (s.key !== key) return s;
      const next = { ...s, ...patch };
      if (patch.label !== undefined && !patch.label.trim()) delete next.label;
      return next;
    }),
  };
}

export function moveSection(c: SongContent, key: string, delta: number): SongContent {
  const i = c.sections.findIndex((s) => s.key === key);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= c.sections.length) return c;
  const sections = [...c.sections];
  [sections[i], sections[j]] = [sections[j]!, sections[i]!];
  return { ...c, sections };
}

export function moveSequenceItem(c: SongContent, index: number, delta: number): SongContent {
  const j = index + delta;
  if (j < 0 || j >= c.sequence.length) return c;
  const sequence = [...c.sequence];
  [sequence[index], sequence[j]] = [sequence[j]!, sequence[index]!];
  return { ...c, sequence };
}

export function insertSequenceItem(c: SongContent, key: string, at = c.sequence.length): SongContent {
  const sequence = [...c.sequence];
  sequence.splice(at, 0, key);
  return { ...c, sequence };
}

export function removeSequenceItem(c: SongContent, index: number): SongContent {
  return { ...c, sequence: c.sequence.filter((_, i) => i !== index) };
}

// --------------------------- chords ---------------------------

export function setChordAt(c: SongContent, section: string, line: number, offset: number, chord: string | null): SongContent {
  const rest = (c.chords ?? []).filter((p) => !(p.section === section && p.line === line && p.offset === offset));
  return { ...c, chords: chord ? [...rest, { section, line, offset, chord: chord.trim() }] : rest };
}

/** Moves a chord horizontally within its line (bounded to the line length + 1). */
export function moveChord(c: SongContent, section: string, line: number, offset: number, delta: number): { content: SongContent; offset: number } {
  const s = c.sections.find((x) => x.key === section);
  if (!s) return { content: c, offset };
  const max = s.lines[line]?.length ?? 0;
  const target = Math.max(0, Math.min(max, offset + delta));
  if (target === offset) return { content: c, offset };
  const occupied = (c.chords ?? []).some((p) => p.section === section && p.line === line && p.offset === target);
  if (occupied) return { content: c, offset };
  return {
    offset: target,
    content: {
      ...c,
      chords: (c.chords ?? []).map((p) => (p.section === section && p.line === line && p.offset === offset ? { ...p, offset: target } : p)),
    },
  };
}

/**
 * Rewrites every chord transposed by `semitones` (key-aware spelling) and
 * updates the written key. Unknown chord symbols are kept unchanged.
 */
export function transposeContent(c: SongContent, semitones: number, preferFlats?: boolean): SongContent {
  const from = parseKey(c.key ?? null);
  const to = from ? transposeKey(from, semitones) : null;
  return {
    ...c,
    key: to ? formatChord({ root: to.tonic, suffix: to.minor ? 'm' : '' }) : c.key ?? null,
    chords: (c.chords ?? []).map((p) => {
      const parsed = parseChord(p.chord);
      if (!parsed) return p;
      return { ...p, chord: formatChord(transposeChord(parsed, semitones, { from, to, preferFlats })) };
    }),
  };
}

/** Converts chords written in Italian notation to the stored international form. */
export function normalizeChordNames(c: SongContent): SongContent {
  return {
    ...c,
    chords: (c.chords ?? []).map((p) => {
      const parsed = parseChord(p.chord);
      return parsed ? { ...p, chord: formatChord(parsed) } : p;
    }),
  };
}

/** Removes chords anchored beyond the end of edited lines (keeps one trailing slot). */
export function clampChords(c: SongContent): SongContent {
  return {
    ...c,
    chords: (c.chords ?? []).filter((p) => {
      const s = c.sections.find((x) => x.key === p.section);
      return s && p.line < s.lines.length && p.offset <= (s.lines[p.line]?.length ?? 0) + 1;
    }),
  };
}
