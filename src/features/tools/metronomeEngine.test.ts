import { describe, expect, it } from 'vitest';
import { clampBpm, secondsPerBeat, tapTempo } from './metronomeEngine';

describe('metronome math', () => {
  it('clamps BPM', () => {
    expect(clampBpm(5)).toBe(20);
    expect(clampBpm(500)).toBe(300);
    expect(clampBpm(84.4)).toBe(84);
  });
  it('computes beat duration', () => {
    expect(secondsPerBeat(60)).toBe(1);
    expect(secondsPerBeat(120)).toBe(0.5);
  });
  it('derives tempo from taps (median, ignores outliers)', () => {
    expect(tapTempo([0, 500, 1000, 1500])).toBe(120);
    expect(tapTempo([0, 750, 1500, 9000])).toBe(80);
    expect(tapTempo([0])).toBeNull();
  });
});
