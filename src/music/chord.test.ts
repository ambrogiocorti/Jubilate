import { describe, expect, it } from 'vitest';
import {
  capoShape,
  formatChord,
  formatKey,
  keyPrefersFlats,
  parseChord,
  parseKey,
  shapeKey,
  suggestCapo,
  transposeChord,
  transposeChordText,
  transposeKey,
} from './chord';

const fmt = (t: string) => {
  const c = parseChord(t);
  return c ? formatChord(c) : null;
};

describe('parseChord', () => {
  it.each([
    ['C', 'C'],
    ['Am', 'Am'],
    ['F#m7', 'F#m7'],
    ['Bbmaj7', 'Bbmaj7'],
    ['CΔ7', 'Cmaj7'],
    ['CM7', 'Cmaj7'],
    ['CM', 'C'],
    ['Dsus', 'Dsus4'],
    ['Dsus2', 'Dsus2'],
    ['A7sus4', 'A7sus4'],
    ['Bdim', 'Bdim'],
    ['B°7', 'Bdim7'],
    ['Bø', 'Bm7b5'],
    ['C+', 'Caug'],
    ['Cadd9', 'Cadd9'],
    ['C6/9', 'C6/9'],
    ['G7(b9)', 'G7(b9)'],
    ['C/E', 'C/E'],
    ['D/F#', 'D/F#'],
    ['Am7/G', 'Am7/G'],
    ['Ebm', 'Ebm'],
    ['C♯m', 'C#m'],
    ['B♭', 'Bb'],
    ['Cmin7', 'Cm7'],
  ])('%s -> %s', (input, expected) => {
    expect(fmt(input)).toBe(expected);
  });

  it.each([
    ['Do', 'C'],
    ['Rem', 'Dm'],
    ['Mi7', 'E7'],
    ['Fa#m', 'F#m'],
    ['Sol', 'G'],
    ['SOL7', 'G7'],
    ['La-', 'Am'],
    ['Sib', 'Bb'],
    ['Do/Mi', 'C/E'],
    ['Re/Fa#', 'D/F#'],
  ])('Italian %s -> %s', (input, expected) => {
    expect(fmt(input)).toBe(expected);
  });

  it.each(['', 'H', 'xyz', 'N.C.', 'C/Q', 'Chello'])('rejects %j', (input) => {
    expect(parseChord(input)).toBeNull();
  });

  it('formats in Italian notation', () => {
    expect(formatChord(parseChord('F#m7/C#')!, 'italian')).toBe('Fa#m7/Do#');
    expect(formatChord(parseChord('Bb')!, 'italian')).toBe('Sib');
  });
});

describe('keys', () => {
  it('parses keys', () => {
    expect(formatKey(parseKey('G')!)).toBe('G');
    expect(formatKey(parseKey('Dm')!)).toBe('Dm');
    expect(parseKey('G7')).toBeNull();
  });
  it('transposes to conventional key names', () => {
    expect(formatKey(transposeKey(parseKey('G')!, 1))).toBe('Ab');
    expect(formatKey(transposeKey(parseKey('G')!, -1))).toBe('F#');
    expect(formatKey(transposeKey(parseKey('Am')!, 1))).toBe('Bbm');
    expect(formatKey(transposeKey(parseKey('Em')!, -1))).toBe('Ebm');
    expect(formatKey(transposeKey(parseKey('C')!, 12))).toBe('C');
  });
  it('knows flat keys', () => {
    expect(keyPrefersFlats(parseKey('F')!)).toBe(true);
    expect(keyPrefersFlats(parseKey('Dm')!)).toBe(true);
    expect(keyPrefersFlats(parseKey('Bb')!)).toBe(true);
    expect(keyPrefersFlats(parseKey('E')!)).toBe(false);
    expect(keyPrefersFlats(parseKey('Em')!)).toBe(false);
  });
});

describe('transposeChord', () => {
  const G = parseKey('G')!;
  it('transposes by semitones with key-aware spelling', () => {
    const to = transposeKey(G, 2); // A
    const t = (c: string) => transposeChordText(c, 2, { from: G, to });
    expect(t('G')).toBe('A');
    expect(t('D/F#')).toBe('E/G#');
    expect(t('Em')).toBe('F#m');
    expect(t('Am7')).toBe('Bm7');
    expect(t('Dsus4')).toBe('Esus4');
    expect(t('C')).toBe('D');
  });

  it('uses flats in flat keys', () => {
    const to = transposeKey(G, 3); // Bb
    const t = (c: string) => transposeChordText(c, 3, { from: G, to });
    expect(t('G')).toBe('Bb');
    expect(t('D/F#')).toBe('F/A');
    expect(t('Em')).toBe('Gm');
    expect(t('C')).toBe('Eb');
    expect(t('Bm7')).toBe('Dm7');
  });

  it('keeps correct enharmonics for chromatic chords', () => {
    const C = parseKey('C')!;
    const E = transposeKey(C, 4);
    // bVII in C (Bb) becomes D in E; secondary dominant E7 becomes G#7.
    expect(transposeChordText('Bb', 4, { from: C, to: E })).toBe('D');
    expect(transposeChordText('E7', 4, { from: C, to: E })).toBe('G#7');
  });

  it('round-trips to the original', () => {
    const chords = ['G', 'D/F#', 'Em', 'Am7', 'Dsus4', 'Cmaj7', 'Bm7b5', 'F#dim'];
    for (let s = -11; s <= 11; s++) {
      const to = transposeKey(G, s);
      for (const c of chords) {
        const there = transposeChordText(c, s, { from: G, to });
        const back = transposeChordText(there, -s, { from: to, to: G });
        expect(back, `${c} by ${s}`).toBe(c);
      }
    }
  });

  it('without keys uses sharps or flats as requested', () => {
    expect(formatChord(transposeChord(parseChord('C')!, 1))).toBe('C#');
    expect(formatChord(transposeChord(parseChord('C')!, 1, { preferFlats: true }))).toBe('Db');
  });

  it('leaves unknown symbols untouched', () => {
    expect(transposeChordText('N.C.', 3)).toBe('N.C.');
  });

  it('outputs Italian notation', () => {
    const to = transposeKey(G, 2);
    expect(transposeChordText('D/F#', 2, { from: G, to, notation: 'italian' })).toBe('Mi/Sol#');
  });
});

describe('capo', () => {
  it('computes shape key', () => {
    expect(formatKey(shapeKey(parseKey('Bb')!, 3))).toBe('G');
    expect(formatKey(shapeKey(parseKey('F#m')!, 2))).toBe('Em');
  });
  it('computes shapes to play', () => {
    const Bb = parseKey('Bb')!;
    const shape = (c: string) => formatChord(capoShape(parseChord(c)!, 3, Bb));
    expect(shape('Bb')).toBe('G');
    expect(shape('F/A')).toBe('D/F#');
    expect(shape('Gm')).toBe('Em');
    expect(shape('Eb')).toBe('C');
    expect(formatChord(capoShape(parseChord('Bb')!, 0, Bb))).toBe('Bb');
  });
  it('suggests capo positions for easy shapes', () => {
    expect(suggestCapo(parseKey('Bb')!)).toEqual([1, 3, 6]);
    expect(suggestCapo(parseKey('G')!)[0]).toBe(0);
    expect(suggestCapo(parseKey('F#m')!)).toContain(2);
  });
});
