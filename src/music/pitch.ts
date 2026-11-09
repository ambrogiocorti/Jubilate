/**
 * Pitch spelling primitives.
 *
 * A pitch is spelled as a letter (C..B) plus an accidental (-2..+2). Keeping the
 * letter separate from the pitch class lets transposition preserve correct
 * enharmonic spelling (e.g. E# in F# major) instead of blindly swapping text.
 */
export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export interface SpelledPitch {
  letter: Letter;
  /** -2 = double flat, -1 = flat, 0 = natural, 1 = sharp, 2 = double sharp */
  accidental: number;
}

export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const NATURAL_PC: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export type Notation = 'international' | 'italian';

const ITALIAN: Record<Letter, string> = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };

export const mod12 = (n: number): number => ((n % 12) + 12) % 12;

export function pitchClass(p: SpelledPitch): number {
  return mod12(NATURAL_PC[p.letter] + p.accidental);
}

export function letterIndex(l: Letter): number {
  return LETTERS.indexOf(l);
}

/** Spells a pitch class using sharps or flats (single accidental at most). */
export function spellPitchClass(pc: number, preferFlats: boolean): SpelledPitch {
  const target = mod12(pc);
  for (const letter of LETTERS) {
    if (NATURAL_PC[letter] === target) return { letter, accidental: 0 };
  }
  if (preferFlats) {
    const letter = LETTERS.find((l) => mod12(NATURAL_PC[l] - 1) === target)!;
    return { letter, accidental: -1 };
  }
  const letter = LETTERS.find((l) => mod12(NATURAL_PC[l] + 1) === target)!;
  return { letter, accidental: 1 };
}

/**
 * Moves a pitch by `letterSteps` letters and `semitones` semitones, choosing the
 * accidental that makes the pitch class correct. Returns null if that would
 * require more than a double accidental.
 */
export function movePitch(p: SpelledPitch, letterSteps: number, semitones: number): SpelledPitch | null {
  const idx = letterIndex(p.letter);
  const letter = LETTERS[((idx + letterSteps) % 7 + 7) % 7]!;
  const targetPc = mod12(pitchClass(p) + semitones);
  let acc = mod12(targetPc - NATURAL_PC[letter]);
  if (acc > 6) acc -= 12;
  if (Math.abs(acc) > 2) return null;
  return { letter, accidental: acc };
}

export function accidentalText(acc: number): string {
  if (acc > 0) return '#'.repeat(acc);
  if (acc < 0) return 'b'.repeat(-acc);
  return '';
}

export function formatPitch(p: SpelledPitch, notation: Notation = 'international'): string {
  const name = notation === 'italian' ? ITALIAN[p.letter] : p.letter;
  return name + accidentalText(p.accidental);
}

/** Parses a note name at the start of `input`. Returns the pitch and consumed length. */
export function parsePitchPrefix(
  input: string,
  notation: Notation | 'auto' = 'auto',
): { pitch: SpelledPitch; length: number } | null {
  const it = notation === 'international' ? null : /^(do|re|mi|fa|sol|la|si)/i.exec(input);
  let letter: Letter | undefined;
  let length = 0;
  if (it) {
    const map: Record<string, Letter> = { do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B' };
    letter = map[it[1]!.toLowerCase()];
    length = it[1]!.length;
  } else if (notation !== 'italian' && /^[A-G]/.test(input)) {
    letter = input[0] as Letter;
    length = 1;
  } else {
    return null;
  }
  let accidental = 0;
  while (length < input.length && accidental > -2 && accidental < 2) {
    const ch = input[length];
    if (ch === '#' || ch === '♯') {
      if (accidental < 0) break;
      accidental += 1;
    } else if (ch === 'b' || ch === '♭') {
      if (accidental > 0) break;
      // "b" followed by letters of a suffix that starts with 'b'? No chord suffix
      // starts with 'b', so a 'b' right after the root is always a flat.
      accidental -= 1;
    } else break;
    length += 1;
  }
  return { pitch: { letter: letter!, accidental }, length };
}
