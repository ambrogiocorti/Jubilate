/**
 * Chord model, parsing, formatting, transposition and capo.
 *
 * A chord is a spelled root, a quality suffix (kept verbatim but normalized,
 * e.g. "m7", "sus4", "maj7", "7b9") and an optional spelled bass. Transposition
 * moves root and bass as pitches; the suffix never changes. Nothing here is a
 * text substitution.
 */
import {
  type Notation,
  type SpelledPitch,
  formatPitch,
  letterIndex,
  mod12,
  movePitch,
  parsePitchPrefix,
  pitchClass,
  spellPitchClass,
} from './pitch';

export interface Chord {
  root: SpelledPitch;
  /** Quality / extensions, normalized: '' (major), 'm', 'm7', 'maj7', 'sus4', 'dim', ... */
  suffix: string;
  bass?: SpelledPitch;
}

const SUFFIX_RE = /^(?:maj|min|m|M|dim|aug|sus|add|[0-9]|\+|-|°|ø|º|Δ|\(|\)|b|#|♭|♯|o|\/(?=[0-9])|alt|no|omit|\s)*$/;

/** Normalizes the various ways of writing qualities into one canonical form. */
export function normalizeSuffix(raw: string): string {
  let s = raw.replace(/\s+/g, '').replace(/♭/g, 'b').replace(/♯/g, '#');
  s = s.replace(/^min(?!or)/, 'm').replace(/^mi(?=[0-9]|$)/, 'm');
  // Italian minor written with "-" (e.g. "La-") -> "m"
  s = s.replace(/^-(?=[0-9]|$|7|9|6)/, 'm');
  if (s === 'M' || s === 'maj') s = '';
  s = s.replace(/^(Δ|M)(?=7|9|11|13|$)/, 'maj');
  s = s.replace(/^(°|º|o)(?=7|$)/, 'dim');
  s = s.replace(/^ø7?/, 'm7b5');
  s = s.replace(/^\+(?=$|[0-9])/, 'aug');
  if (s === 'sus') s = 'sus4';
  return s;
}

export function parseChord(input: string, notation: Notation | 'auto' = 'auto'): Chord | null {
  const text = input.trim();
  if (!text) return null;
  const root = parsePitchPrefix(text, notation);
  if (!root) return null;
  let rest = text.slice(root.length);
  let bass: SpelledPitch | undefined;
  const slash = rest.lastIndexOf('/');
  if (slash >= 0) {
    const bassText = rest.slice(slash + 1);
    const parsedBass = parsePitchPrefix(bassText, notation);
    // "6/9" is a suffix, not a slash chord.
    if (parsedBass && parsedBass.length === bassText.length) {
      bass = parsedBass.pitch;
      rest = rest.slice(0, slash);
    } else if (!/^[0-9]+$/.test(bassText)) {
      return null;
    }
  }
  if (!SUFFIX_RE.test(rest)) return null;
  const chord: Chord = { root: root.pitch, suffix: normalizeSuffix(rest) };
  if (bass) chord.bass = bass;
  return chord;
}

export function isChord(input: string): boolean {
  return parseChord(input) !== null;
}

export function formatChord(chord: Chord, notation: Notation = 'international'): string {
  const root = formatPitch(chord.root, notation);
  const bass = chord.bass ? '/' + formatPitch(chord.bass, notation) : '';
  return root + chord.suffix + bass;
}

export function isMinorSuffix(suffix: string): boolean {
  return /^m(?!aj)/.test(suffix);
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

export interface Key {
  tonic: SpelledPitch;
  minor: boolean;
}

/** Conventional key names per pitch class (fewest accidentals; F# over Gb, C#m over Dbm). */
const MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

export function parseKey(input: string | null | undefined): Key | null {
  if (!input) return null;
  const c = parseChord(input);
  if (!c || c.bass) return null;
  if (c.suffix !== '' && c.suffix !== 'm') return null;
  return { tonic: c.root, minor: c.suffix === 'm' };
}

export function formatKey(key: Key, notation: Notation = 'international'): string {
  return formatPitch(key.tonic, notation) + (key.minor ? 'm' : '');
}

export function keyToString(key: Key): string {
  return formatKey(key, 'international');
}

/** The conventional key a given key becomes when shifted by `semitones`. */
export function transposeKey(key: Key, semitones: number): Key {
  const pc = mod12(pitchClass(key.tonic) + semitones);
  const name = (key.minor ? MINOR_KEYS : MAJOR_KEYS)[pc]!;
  return { tonic: parsePitchPrefix(name, 'international')!.pitch, minor: key.minor };
}

/** Whether a key is conventionally written with flats. */
export function keyPrefersFlats(key: Key): boolean {
  // Relative major determines the signature.
  const majorPc = key.minor ? mod12(pitchClass(key.tonic) + 3) : pitchClass(key.tonic);
  const majorName = MAJOR_KEYS[majorPc]!;
  if (majorName === 'F') return true;
  if (majorName === 'C') return key.tonic.accidental < 0;
  return majorName.includes('b') || key.tonic.accidental < 0;
}

// ---------------------------------------------------------------------------
// Transposition
// ---------------------------------------------------------------------------

function simplify(p: SpelledPitch, preferFlats: boolean): SpelledPitch {
  if (Math.abs(p.accidental) <= 1) {
    // Avoid rare spellings such as Cb, Fb, E#, B# unless in a key that needs them.
    return p;
  }
  return spellPitchClass(pitchClass(p), preferFlats);
}

/**
 * Transposes a chord by `semitones`. When the source and target keys are known
 * the letter distance between the tonics is preserved (correct enharmonic
 * spelling); otherwise the target is spelled with sharps or flats according to
 * `preferFlats`.
 */
export function transposeChord(
  chord: Chord,
  semitones: number,
  opts: { from?: Key | null; to?: Key | null; preferFlats?: boolean } = {},
): Chord {
  const shift = mod12(semitones);
  if (shift === 0 && !opts.to) return chord;
  const { from, to } = opts;
  const preferFlats = opts.preferFlats ?? (to ? keyPrefersFlats(to) : false);

  const move = (p: SpelledPitch): SpelledPitch => {
    if (from && to) {
      const steps = letterIndex(to.tonic.letter) - letterIndex(from.tonic.letter);
      const moved = movePitch(p, steps, semitones);
      if (moved) return simplifyRare(simplify(moved, preferFlats), to, preferFlats);
    }
    return spellPitchClass(pitchClass(p) + semitones, preferFlats);
  };

  const out: Chord = { root: move(chord.root), suffix: chord.suffix };
  if (chord.bass) out.bass = move(chord.bass);
  return out;
}

/** Cb/Fb/E#/B# are only kept in keys whose signature contains them. */
function simplifyRare(p: SpelledPitch, key: Key, preferFlats: boolean): SpelledPitch {
  const rare =
    (p.letter === 'C' && p.accidental === -1) ||
    (p.letter === 'F' && p.accidental === -1) ||
    (p.letter === 'E' && p.accidental === 1) ||
    (p.letter === 'B' && p.accidental === 1);
  if (!rare) return p;
  const majorPc = key.minor ? mod12(pitchClass(key.tonic) + 3) : pitchClass(key.tonic);
  // Keys with 6+ sharps (F#, C#) or 6+ flats (Gb, Cb) legitimately use them.
  const extremeSharp = majorPc === 6 && !preferFlats;
  const extremeFlat = majorPc === 6 && preferFlats;
  if ((p.accidental === 1 && extremeSharp) || (p.accidental === -1 && extremeFlat)) return p;
  return spellPitchClass(pitchClass(p), preferFlats);
}

export function transposeChordText(
  text: string,
  semitones: number,
  opts: { from?: Key | null; to?: Key | null; notation?: Notation; preferFlats?: boolean } = {},
): string {
  const chord = parseChord(text);
  if (!chord) return text; // unknown symbols (e.g. "N.C.") are left untouched
  return formatChord(transposeChord(chord, semitones, opts), opts.notation ?? 'international');
}

/** Semitone distance from one key to another (0..11). */
export function keyDistance(from: Key, to: Key): number {
  return mod12(pitchClass(to.tonic) - pitchClass(from.tonic));
}

// ---------------------------------------------------------------------------
// Capo
// ---------------------------------------------------------------------------

/** Keys whose open-position shapes are comfortable on guitar. */
const EASY_SHAPE_KEYS = ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm'];

/**
 * With a capo on fret `capo`, the guitarist plays shapes `capo` semitones below
 * the sounding chords. Returns the key of the shapes.
 */
export function shapeKey(sounding: Key, capo: number): Key {
  return transposeKey(sounding, -capo);
}

/** Chord shape to play with the capo so that `sounding` is heard. */
export function capoShape(sounding: Chord, capo: number, soundingKey?: Key | null): Chord {
  if (capo === 0) return sounding;
  if (soundingKey) {
    return transposeChord(sounding, -capo, { from: soundingKey, to: shapeKey(soundingKey, capo) });
  }
  return transposeChord(sounding, -capo, { preferFlats: false });
}

/** Capo positions (0-7) giving easy shapes, best first. */
export function suggestCapo(sounding: Key, maxFret = 7): number[] {
  const result: number[] = [];
  for (let capo = 0; capo <= maxFret; capo++) {
    if (EASY_SHAPE_KEYS.includes(keyToString(shapeKey(sounding, capo)))) result.push(capo);
  }
  return result;
}
