import { describe, expect, it } from 'vitest';
import { addSection, moveChord, normalizeChordNames, removeSection, sectionToInline, setChordAt, setSectionInline, transposeContent } from './contentOps';
import type { SongContent } from '../../domain/song';

const base: SongContent = {
  key: 'G',
  sections: [
    { key: 'v1', kind: 'verse', lines: ['Sorge la luce', 'sopra il colle'] },
    { key: 'c', kind: 'chorus', lines: ['Luce del mattino'] },
  ],
  sequence: ['v1', 'c', 'c'],
  chords: [
    { section: 'v1', line: 0, offset: 0, chord: 'G' },
    { section: 'v1', line: 0, offset: 9, chord: 'D/F#' },
    { section: 'c', line: 0, offset: 0, chord: 'C' },
  ],
};

describe('content operations', () => {
  it('round-trips a section through inline notation', () => {
    const inline = sectionToInline(base, 'v1');
    expect(inline).toBe('[G]Sorge la [D/F#]luce\nsopra il colle');
    const back = setSectionInline(base, 'v1', inline);
    const sort = (c: SongContent) => ({ ...c, chords: [...(c.chords ?? [])].sort((a, b) => (a.section + a.line + ':' + a.offset).localeCompare(b.section + b.line + ':' + b.offset)) });
    expect(sort(back)).toEqual(sort(base));
  });

  it('chords follow the text when a line is edited', () => {
    const edited = setSectionInline(base, 'v1', '[G]Ecco, sorge la [D/F#]luce\nsopra il colle');
    expect(edited.sections[0]!.lines[0]).toBe('Ecco, sorge la luce');
    expect(edited.chords!.filter((p) => p.section === 'v1')).toEqual([
      { section: 'v1', line: 0, offset: 0, chord: 'G' },
      { section: 'v1', line: 0, offset: 15, chord: 'D/F#' },
    ]);
    expect(edited.chords!.find((p) => p.section === 'c')).toBeDefined();
  });

  it('adds and removes sections with sequence and chords', () => {
    const { content, key } = addSection(base, 'verse');
    expect(key).toBe('v2');
    expect(content.sequence).toEqual(['v1', 'c', 'c', 'v2']);
    const removed = removeSection(content, 'c');
    expect(removed.sequence).toEqual(['v1', 'v2']);
    expect(removed.chords!.some((p) => p.section === 'c')).toBe(false);
  });

  it('places, moves and deletes chords', () => {
    let c = setChordAt(base, 'v1', 1, 6, 'Em');
    expect(c.chords!.some((p) => p.line === 1 && p.chord === 'Em')).toBe(true);
    const moved = moveChord(c, 'v1', 1, 6, 3);
    expect(moved.offset).toBe(9);
    c = setChordAt(moved.content, 'v1', 1, 9, null);
    expect(c.chords!.some((p) => p.line === 1)).toBe(false);
  });

  it('does not move a chord onto another one or outside the line', () => {
    expect(moveChord(base, 'v1', 0, 0, 9).offset).toBe(0);
    expect(moveChord(base, 'v1', 0, 9, 100).offset).toBe(13);
  });

  it('transposes all chords and the key', () => {
    const t = transposeContent(base, 2);
    expect(t.key).toBe('A');
    expect(t.chords!.map((p) => p.chord)).toEqual(['A', 'E/G#', 'D']);
    expect(base.chords![0]!.chord).toBe('G'); // immutable
  });

  it('normalizes Italian chord names', () => {
    const c = normalizeChordNames({ ...base, chords: [{ section: 'v1', line: 0, offset: 0, chord: 'Sol' }, { section: 'v1', line: 0, offset: 9, chord: 'Re/Fa#' }] });
    expect(c.chords!.map((p) => p.chord)).toEqual(['G', 'D/F#']);
  });
});
