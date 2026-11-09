/**
 * Personal reading preferences. Stored locally (works for visitors and offline)
 * and, for registered users, synced to public.user_preferences.
 */
import type { Notation } from '../music/pitch';

export type ViewMode = 'text' | 'chords' | 'score';
export type ThemePref = 'system' | 'light' | 'dark';

export interface ReadingPrefs {
  fontScale: number;      // 0.8 .. 2.5 (1 = 20px base)
  lineHeight: number;     // 1.2 .. 2.2
  scrollSpeed: number;    // 1 .. 10
  theme: ThemePref;
  mode: ViewMode;
  notation: Notation;
  showCapoShapes: boolean;
  showRepeats: 'full' | 'compact';
}

export const DEFAULT_PREFS: ReadingPrefs = {
  fontScale: 1,
  lineHeight: 1.55,
  scrollSpeed: 3,
  theme: 'system',
  mode: 'text',
  notation: 'italian',
  showCapoShapes: true,
  showRepeats: 'full',
};

const clamp = (n: unknown, min: number, max: number, fallback: number): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
};
const oneOf = <T extends string>(v: unknown, values: readonly T[], fallback: T): T =>
  typeof v === 'string' && (values as readonly string[]).includes(v) ? (v as T) : fallback;

/** Coerces any stored value into valid preferences (unknown keys dropped). */
export function sanitizePrefs(input: unknown): ReadingPrefs {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    fontScale: Math.round(clamp(o.fontScale, 0.8, 2.5, DEFAULT_PREFS.fontScale) * 100) / 100,
    lineHeight: Math.round(clamp(o.lineHeight, 1.2, 2.2, DEFAULT_PREFS.lineHeight) * 100) / 100,
    scrollSpeed: Math.round(clamp(o.scrollSpeed, 1, 10, DEFAULT_PREFS.scrollSpeed)),
    theme: oneOf(o.theme, ['system', 'light', 'dark'] as const, DEFAULT_PREFS.theme),
    mode: oneOf(o.mode, ['text', 'chords', 'score'] as const, DEFAULT_PREFS.mode),
    notation: oneOf(o.notation, ['italian', 'international'] as const, DEFAULT_PREFS.notation),
    showCapoShapes: typeof o.showCapoShapes === 'boolean' ? o.showCapoShapes : DEFAULT_PREFS.showCapoShapes,
    showRepeats: oneOf(o.showRepeats, ['full', 'compact'] as const, DEFAULT_PREFS.showRepeats),
  };
}

/** Visitors cannot use modes reserved to registered users. */
export function effectiveMode(mode: ViewMode, isRegistered: boolean): ViewMode {
  return isRegistered ? mode : 'text';
}

/** Pixels per second for the auto-scroll speed setting (gentle, exponential). */
export function scrollPixelsPerSecond(speed: number): number {
  const s = clamp(speed, 1, 10, 3);
  return Math.round(8 * Math.pow(1.35, s - 1) * 10) / 10;
}

/** Per-song settings (key / capo) remembered per user. */
export interface SongSettings {
  transpose: number; // semitones, -11..11
  capo: number;      // 0..11
}

export function sanitizeSongSettings(input: unknown): SongSettings {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    transpose: Math.round(clamp(o.transpose, -11, 11, 0)),
    capo: Math.round(clamp(o.capo, 0, 11, 0)),
  };
}
