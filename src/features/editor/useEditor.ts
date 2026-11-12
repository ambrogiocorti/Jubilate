import { useCallback, useEffect, useReducer, useRef } from 'react';
import { createHistory, push, redo, undo, type History } from './history';
import type { SongContent } from '../../domain/song';

type Action =
  | { type: 'set'; value: SongContent; tag?: string }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'reset'; value: SongContent };

function reducer(h: History<SongContent>, a: Action): History<SongContent> {
  switch (a.type) {
    case 'set':
      return push(h, a.value, { tag: a.tag });
    case 'undo':
      return undo(h);
    case 'redo':
      return redo(h);
    case 'reset':
      return createHistory(a.value);
  }
}

/**
 * Editor state with undo/redo and local draft autosave. Drafts are kept in
 * localStorage under `draftKey` until the content is saved, so a failed save
 * or a closed tab never loses work.
 */
export function useEditor(initial: SongContent, draftKey: string | null) {
  const [h, dispatch] = useReducer(reducer, initial, createHistory);
  const saved = useRef<string>(JSON.stringify(initial));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) {
        e.preventDefault();
        dispatch({ type: 'undo' });
      } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
        e.preventDefault();
        dispatch({ type: 'redo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const dirty = JSON.stringify(h.present) !== saved.current;

  useEffect(() => {
    if (!draftKey) return;
    try {
      if (dirty) localStorage.setItem(draftKey, JSON.stringify({ at: Date.now(), content: h.present }));
      else localStorage.removeItem(draftKey);
    } catch {
      /* storage full */
    }
  }, [h.present, dirty, draftKey]);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  return {
    content: h.present,
    set: useCallback((value: SongContent, tag?: string) => dispatch({ type: 'set', value, tag }), []),
    undo: useCallback(() => dispatch({ type: 'undo' }), []),
    redo: useCallback(() => dispatch({ type: 'redo' }), []),
    canUndo: h.past.length > 0,
    canRedo: h.future.length > 0,
    dirty,
    markSaved: useCallback((value: SongContent) => {
      saved.current = JSON.stringify(value);
      dispatch({ type: 'reset', value });
      if (draftKey) localStorage.removeItem(draftKey);
    }, [draftKey]),
    reset: useCallback((value: SongContent) => dispatch({ type: 'reset', value }), []),
  };
}

export function readDraft(draftKey: string): { at: number; content: SongContent } | null {
  try {
    const v = JSON.parse(localStorage.getItem(draftKey) ?? 'null');
    return v?.content ? v : null;
  } catch {
    return null;
  }
}
