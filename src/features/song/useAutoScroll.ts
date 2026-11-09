import { useCallback, useEffect, useRef, useState } from 'react';
import { scrollPixelsPerSecond } from '../../domain/preferences';

export type ScrollState = 'stopped' | 'running' | 'paused';

/**
 * Smooth auto-scroll driven by requestAnimationFrame (sub-pixel accumulation,
 * pauses when the tab is hidden, stops at the end of the page).
 * Keyboard: Space toggles while the song view is focused.
 */
export function useAutoScroll(speed: number, container?: HTMLElement | null) {
  const [state, setState] = useState<ScrollState>('stopped');
  const raf = useRef<number>(0);
  const last = useRef<number>(0);
  const carry = useRef(0);

  const target = useCallback((): { el: HTMLElement | Window; top: () => number; max: () => number; by: (d: number) => void } => {
    if (container) {
      return {
        el: container,
        top: () => container.scrollTop,
        max: () => container.scrollHeight - container.clientHeight,
        by: (d) => container.scrollBy(0, d),
      };
    }
    return {
      el: window,
      top: () => window.scrollY,
      max: () => document.documentElement.scrollHeight - window.innerHeight,
      by: (d) => window.scrollBy(0, d),
    };
  }, [container]);

  useEffect(() => {
    if (state !== 'running') return;
    const t = target();
    const pps = scrollPixelsPerSecond(speed);
    last.current = performance.now();
    const step = (now: number) => {
      const dt = Math.min(100, now - last.current) / 1000;
      last.current = now;
      carry.current += pps * dt;
      const whole = Math.floor(carry.current);
      if (whole >= 1) {
        carry.current -= whole;
        t.by(whole);
      }
      if (t.top() >= t.max() - 1) {
        setState('stopped');
        return;
      }
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    const onVis = () => document.hidden && setState('paused');
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [state, speed, target]);

  return {
    state,
    start: () => setState('running'),
    pause: () => setState('paused'),
    resume: () => setState('running'),
    stop: () => {
      setState('stopped');
      carry.current = 0;
    },
    toggle: () => setState((s) => (s === 'running' ? 'paused' : 'running')),
  };
}
