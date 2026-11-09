import { describe, expect, it } from 'vitest';
import { findDuplicates, importPlainText, similarity } from './textImport';

describe('importPlainText', () => {
  it('detects verses, chorus and repeats', () => {
    const { content, warnings } = importPlainText(
      `1. Prima strofa\nseconda riga\n\nRit. Questo è il ritornello\nche si ripete\n\n2. Seconda strofa\naltra riga\n\nRit.\n`,
    );
    expect(warnings).toEqual([]);
    expect(content.sections.map((s) => [s.key, s.kind])).toEqual([
      ['v1', 'verse'],
      ['c1', 'chorus'],
      ['v2', 'verse'],
    ]);
    expect(content.sections[1]!.lines).toEqual(['Questo è il ritornello', 'che si ripete']);
    expect(content.sequence).toEqual(['v1', 'c1', 'v2', 'c1']);
  });

  it('turns an identical repeated block into a repeat', () => {
    const { content } = importPlainText('Strofa A\n\nCanto comune X\n\nStrofa B\n\nCanto comune X');
    expect(content.sections).toHaveLength(3);
    expect(content.sequence).toEqual(['v1', 'v2', 'v3', 'v2']);
    expect(content.sections[1]!.kind).toBe('chorus');
  });

  it('converts chord lines above lyrics into placements', () => {
    const { content } = importPlainText('G       D\nSorge la luce\n  Em\n  sopra il colle');
    expect(content.sections[0]!.lines).toEqual(['Sorge la luce', 'sopra il colle']);
    expect(content.chords).toEqual([
      { section: 'v1', line: 0, offset: 0, chord: 'G' },
      { section: 'v1', line: 0, offset: 8, chord: 'D' },
      { section: 'v1', line: 1, offset: 0, chord: 'Em' },
    ]);
  });

  it('preserves punctuation and line breaks', () => {
    const { content } = importPlainText('Alleluia, alleluia!\nLode a te, o Cristo: amen.');
    expect(content.sections[0]!.lines).toEqual(['Alleluia, alleluia!', 'Lode a te, o Cristo: amen.']);
  });

  it('warns when nothing is recognized', () => {
    expect(importPlainText('   \n\n ').warnings.length).toBeGreaterThan(0);
  });
});

describe('duplicates', () => {
  const existing = [
    { number: 12, title: 'Luce del mattino', first_line: 'Sorge la luce sopra il colle' },
    { number: 40, title: 'Salve Regina', first_line: 'Salve, Regina' },
  ];
  it('matches by number, title (accents/case) and first line', () => {
    expect(findDuplicates({ number: 12, title: 'Altro' }, existing)[0]?.reason).toBe('number');
    expect(findDuplicates({ title: 'LUCE DEL MATTINO!' }, existing)[0]?.reason).toBe('title');
    expect(findDuplicates({ title: 'Canto nuovo', firstLine: 'Sorge la luce sopra il colle,' }, existing)[0]?.reason).toBe('first_line');
    expect(findDuplicates({ title: 'Canto completamente diverso' }, existing)).toEqual([]);
  });
  it('similarity is accent-insensitive', () => {
    expect(similarity('Perché', 'perche')).toBe(1);
  });
});
