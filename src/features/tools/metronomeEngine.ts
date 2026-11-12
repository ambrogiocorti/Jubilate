/**
 * Web Audio metronome with a look-ahead scheduler: clicks are scheduled on the
 * audio clock (sample-accurate) a little ahead of time, so timer jitter on the
 * main thread never makes the beat uneven.
 */
export interface MetronomeOptions {
  bpm: number;
  beatsPerBar: number;
  onBeat?: (beat: number, time: number) => void;
}

export const clampBpm = (n: number) => Math.min(300, Math.max(20, Math.round(n)));
export const secondsPerBeat = (bpm: number) => 60 / clampBpm(bpm);

/** BPM from tap timestamps (ms), using the median interval of the last taps. */
export function tapTempo(taps: number[]): number | null {
  const recent = taps.slice(-6);
  if (recent.length < 2) return null;
  const intervals = recent.slice(1).map((t, i) => t - recent[i]!).filter((d) => d > 150 && d < 3000);
  if (!intervals.length) return null;
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return clampBpm(60000 / median);
}

export class MetronomeEngine {
  private ctx: AudioContext | null = null;
  private timer: number | undefined;
  private nextTime = 0;
  private beat = 0;
  private opts: MetronomeOptions;
  private readonly lookahead = 25; // ms between scheduler runs
  private readonly scheduleAhead = 0.12; // seconds scheduled in advance
  running = false;
  volume = 0.8;

  constructor(opts: MetronomeOptions) {
    this.opts = { ...opts, bpm: clampBpm(opts.bpm) };
  }

  update(patch: Partial<MetronomeOptions>) {
    this.opts = { ...this.opts, ...patch, bpm: clampBpm(patch.bpm ?? this.opts.bpm) };
  }

  /** Must be called from a user gesture (mobile autoplay policies). */
  async start() {
    if (this.running) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx ??= new Ctor();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    // iOS: play a silent buffer to unlock audio output.
    const silent = this.ctx.createBuffer(1, 1, 22050);
    const src = this.ctx.createBufferSource();
    src.buffer = silent;
    src.connect(this.ctx.destination);
    src.start(0);
    this.running = true;
    this.beat = 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.tick();
  }

  stop() {
    this.running = false;
    window.clearTimeout(this.timer);
  }

  async dispose() {
    this.stop();
    await this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  private tick = () => {
    if (!this.running || !this.ctx) return;
    while (this.nextTime < this.ctx.currentTime + this.scheduleAhead) {
      this.click(this.nextTime, this.beat % this.opts.beatsPerBar === 0);
      const beatInBar = this.beat % this.opts.beatsPerBar;
      const at = this.nextTime;
      const delay = Math.max(0, (at - this.ctx.currentTime) * 1000);
      window.setTimeout(() => this.opts.onBeat?.(beatInBar, at), delay);
      this.nextTime += secondsPerBeat(this.opts.bpm);
      this.beat++;
    }
    this.timer = window.setTimeout(this.tick, this.lookahead);
  };

  private click(time: number, accent: boolean) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1760 : 1100;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, this.volume), time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.06);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.07);
  }
}
