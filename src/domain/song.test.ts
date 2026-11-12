import { describe, expect, it } from 'vitest';
import {
  ContentError,
  expandSequence,
  layoutLine,
  nextSectionKey,
  parseInlineChords,
  plainText,
  sectionTitle,
  toInlineChords,
  unusedSections,
  validateContent,
  type SongContent,
} from './song';

const content: SongContent = {
  sections: [
    { key: 'v1', kind: 'verse', lines: ['Prima strofa riga uno', 'riga due'] },
    { key: 'c', kind: 'chorus', lines: ['Ritornello'] },
    { key: 'v2', kind: 'verse', lines: ['Seconda strofa'] },
    { key: 'x', kind: 'bridge', label: 'Ponte musicale', lines: ['...'] },
  ],
  sequence: ['v1', 'c', 'v2', 'c'],
  chords: [{ section: 'v1', line: 0, offset: 6, chord: 'G' }],
};

describe('sections and order', () => {
  it('expands the sequence and marks repeats without duplicating data', () => {
    const e = expandSequence(content);
    expect(e.map((x) => x.section.key)).toEqual(['v1', 'c', 'v2', 'c']);
    expect(e[3]!.isRepeat).toBe(true);
    expect(e[3]!.occurrence).toBe(2);
    expect(e[3]!.section).toBe(e[1]!.section);
  });
  it('numbers verses and honors custom labels', () => {
    expect(sectionTitle(content.sections[0]!, content)).toBe('Strofa 1');
    expect(sectionTitle(content.sections[2]!, content)).toBe('Strofa 2');
    expect(sectionTitle(content.sections[1]!, content)).toBe('Ritornello');
    expect(sectionTitle(content.sections[3]!, content)).toBe('Ponte musicale');
  });
  it('reports unused sections', () => {
    expect(unusedSections(content).map((s) => s.key)).toEqual(['x']);
  });
  it('generates next keys', () => {
    expect(nextSectionKey(content, 'verse')).toBe('v3');
    expect(nextSectionKey(content, 'chorus')).toBe('c1');
  });
  it('exports plain text in performance order', () => {
    expect(plainText(content)).toBe('Prima strofa riga uno\nriga due\n\nRitornello\n\nSeconda strofa\n\nRitornello');
  });
});

describe('validateContent', () => {
  it('accepts valid content', () => expect(() => validateContent(content)).not.toThrow());
  it.each<[string, SongContent]>([
    ['no sections', { sections: [], sequence: [] }],
    ['unknown key in sequence', { sections: [{ key: 'v1', kind: 'verse', lines: ['a'] }], sequence: ['v2'] }],
    ['duplicate keys', { sections: [{ key: 'v1', kind: 'verse', lines: ['a'] }, { key: 'v1', kind: 'verse', lines: ['b'] }], sequence: ['v1'] }],
    ['bad key', { sections: [{ key: 'V 1', kind: 'verse', lines: ['a'] }], sequence: ['V 1'] }],
    ['chord on missing line', { sections: [{ key: 'v1', kind: 'verse', lines: ['a'] }], sequence: ['v1'], chords: [{ section: 'v1', line: 3, offset: 0, chord: 'C' }] }],
  ])('rejects %s', (_label, c) => {
    expect(() => validateContent(c)).toThrow(ContentError);
  });
});

describe('chord layout', () => {
  it('splits the line at chord offsets', () => {
    expect(layoutLine('Sorge la luce', [{ offset: 6, chord: 'D' }, { offset: 0, chord: 'G' }])).toEqual([
      { chord: 'G', text: 'Sorge ' },
      { chord: 'D', text: 'la luce' },
    ]);
  });
  it('keeps leading text without a chord', () => {
    expect(layoutLine('canta la valle', [{ offset: 6, chord: 'Am' }])).toEqual([
      { text: 'canta ' },
      { chord: 'Am', text: 'la valle' },
    ]);
  });
  it('supports chords inside a word and past the end', () => {
    expect(layoutLine('stupore', [{ offset: 3, chord: 'Am7' }, { offset: 5, chord: 'D' }, { offset: 20, chord: 'G' }])).toEqual([
      { text: 'stu' },
      { chord: 'Am7', text: 'po' },
      { chord: 'D', text: 're' },
      { chord: 'G', text: '' },
    ]);
  });
  it('returns the plain line when there are no chords', () => {
    expect(layoutLine('solo testo', [])).toEqual([{ text: 'solo testo' }]);
  });
});

describe('inline chord notation', () => {
  it('parses and serializes symmetrically', () => {
    const src = '[G]Sorge la luce [D/F#]sopra il [Em]colle,';
    const parsed = parseInlineChords(src);
    expect(parsed.text).toBe('Sorge la luce sopra il colle,');
    expect(parsed.chords).toEqual([
      { offset: 0, chord: 'G' },
      { offset: 14, chord: 'D/F#' },
      { offset: 23, chord: 'Em' },
    ]);
    expect(toInlineChords(parsed.text, parsed.chords)).toBe(src);
  });
});
