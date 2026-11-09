import { describe, expect, it } from 'vitest';
import { createHistory, push, redo, undo } from './history';

describe('editor history', () => {
  it('undoes and redoes', () => {
    let h = createHistory(1);
    h = push(h, 2);
    h = push(h, 3);
    h = undo(h);
    expect(h.present).toBe(2);
    h = undo(h);
    expect(h.present).toBe(1);
    h = undo(h);
    expect(h.present).toBe(1);
    h = redo(h);
    expect(h.present).toBe(2);
  });
  it('clears redo on new edits', () => {
    let h = push(push(createHistory('a'), 'b'), 'c');
    h = undo(h);
    h = push(h, 'd');
    expect(h.future).toEqual([]);
    expect(redo(h).present).toBe('d');
  });
  it('merges rapid typing with the same tag', () => {
    let h = createHistory('');
    h = push(h, 'a', { tag: 'line', now: 0 });
    h = push(h, 'ab', { tag: 'line', now: 100 });
    h = push(h, 'abc', { tag: 'line', now: 200 });
    expect(h.past).toEqual(['']);
    h = push(h, 'abcd', { tag: 'line', now: 5000 });
    expect(h.past).toEqual(['', 'abc']);
  });
  it('is bounded', () => {
    let h = createHistory(0);
    for (let i = 1; i <= 10; i++) h = push(h, i, { limit: 3 });
    expect(h.past).toEqual([7, 8, 9]);
  });
});
