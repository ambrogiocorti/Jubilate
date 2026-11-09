import { describe, expect, it } from 'vitest';
import { diffContent, diffLines, hasChanges } from './diff';
import type { SongContent } from './song';

describe('diff', () => {
  it('computes a minimal line diff', () => {
    expect(diffLines(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual([
      { type: 'same', text: 'a' },
      { type: 'del', text: 'b' },
      { type: 'add', text: 'x' },
      { type: 'same', text: 'c' },
    ]);
  });
  it('detects chord-only changes', () => {
    const a: SongContent = { sections: [{ key: 'v1', kind: 'verse', lines: ['Luce'] }], sequence: ['v1'], chords: [{ section: 'v1', line: 0, offset: 0, chord: 'G' }] };
    const b: SongContent = { ...a, chords: [{ section: 'v1', line: 0, offset: 0, chord: 'C' }] };
    expect(hasChanges(diffContent(a, b))).toBe(true);
    expect(hasChanges(diffContent(a, b, false))).toBe(false);
  });
});
