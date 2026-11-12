import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, effectiveMode, sanitizePrefs, sanitizeSongSettings, scrollPixelsPerSecond } from './preferences';

describe('reading preferences', () => {
  it('returns defaults for garbage', () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs('x')).toEqual(DEFAULT_PREFS);
  });
  it('clamps numeric values and rejects unknown enums', () => {
    const p = sanitizePrefs({ fontScale: 99, lineHeight: 0, scrollSpeed: 4.6, theme: 'neon', mode: 'chords', extra: 1 });
    expect(p.fontScale).toBe(2.5);
    expect(p.lineHeight).toBe(1.2);
    expect(p.scrollSpeed).toBe(5);
    expect(p.theme).toBe('system');
    expect(p.mode).toBe('chords');
    expect('extra' in p).toBe(false);
  });
  it('restricts visitors to text mode', () => {
    expect(effectiveMode('chords', false)).toBe('text');
    expect(effectiveMode('score', true)).toBe('score');
  });
  it('scroll speed grows monotonically', () => {
    for (let s = 1; s < 10; s++) expect(scrollPixelsPerSecond(s + 1)).toBeGreaterThan(scrollPixelsPerSecond(s));
  });
  it('sanitizes per-song settings', () => {
    expect(sanitizeSongSettings({ transpose: 14, capo: -2 })).toEqual({ transpose: 11, capo: 0 });
  });
});
