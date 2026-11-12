/** Bounded undo/redo history (pure). Consecutive edits within `mergeMs` with the same tag are merged. */
export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  lastTag?: string;
  lastAt?: number;
}

export const createHistory = <T,>(present: T): History<T> => ({ past: [], present, future: [] });

export function push<T>(h: History<T>, next: T, opts: { tag?: string; now?: number; mergeMs?: number; limit?: number } = {}): History<T> {
  if (Object.is(next, h.present)) return h;
  const now = opts.now ?? Date.now();
  const merge = opts.tag && opts.tag === h.lastTag && h.lastAt !== undefined && now - h.lastAt < (opts.mergeMs ?? 800);
  const limit = opts.limit ?? 200;
  const past = merge ? h.past : [...h.past, h.present].slice(-limit);
  return { past, present: next, future: [], lastTag: opts.tag, lastAt: now };
}

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  const previous = h.past[h.past.length - 1]!;
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next!, future: rest };
}
