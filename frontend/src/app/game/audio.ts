import { BeatmapSummary } from '../core/models';

export type HitSound = 'hit' | 'tick' | 'break' | 'bonus';

/**
 * Owns the AudioContext, the music (an audio file or the built-in synth track) and hit sounds.
 * The AudioContext clock is the single source of truth for song time; pausing suspends the context,
 * which freezes both the music and the clock.
 */
export class AudioEngine {
  readonly ctx = new AudioContext({ latencyHint: 'interactive' });
  private readonly master = this.ctx.createGain();
  private readonly musicBus = this.ctx.createGain();
  private readonly sfxBus = this.ctx.createGain();
  private readonly noise: AudioBuffer;

  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private synth: SynthTrack | null = null;
  /** AudioContext time at which song time 0 is heard. */
  private songZero = 0;
  private lastTime = -Infinity;
  private started = false;

  constructor(volume: number) {
    this.master.gain.value = volume;
    this.musicBus.gain.value = 0.8;
    this.sfxBus.gain.value = 0.55;
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(this.ctx.destination);
    this.noise = createNoise(this.ctx);
  }

  async load(beatmap: BeatmapSummary): Promise<void> {
    if (beatmap.audioUrl) {
      const response = await fetch(beatmap.audioUrl);
      if (!response.ok) throw new Error(`Could not load ${beatmap.audioUrl} (${response.status})`);
      this.buffer = await this.ctx.decodeAudioData(await response.arrayBuffer());
    } else {
      this.synth = new SynthTrack(this.ctx, this.musicBus, this.noise, beatmap);
    }
  }

  /** Starts playback so that song time {@code fromMs} (may be negative = lead-in) is heard in ~100 ms. */
  async start(fromMs: number): Promise<void> {
    await this.ctx.resume();
    const startAt = this.ctx.currentTime + 0.1;
    this.songZero = startAt - fromMs / 1000;
    if (this.buffer) {
      const source = this.ctx.createBufferSource();
      source.buffer = this.buffer;
      source.connect(this.musicBus);
      const offset = Math.max(0, fromMs / 1000);
      source.start(Math.max(startAt, this.songZero), offset);
      this.source = source;
    }
    this.synth?.start(this.songZero);
    this.started = true;
  }

  /** Only songs from audio files can jump; the synth track is scheduled bar by bar from the start. */
  get canSeek(): boolean {
    return this.buffer !== null && this.source !== null;
  }

  /** Jumps the music forward to song time {@code toMs} (used to skip a long intro). */
  seek(toMs: number): void {
    if (!this.buffer || !this.source || this.ctx.state !== 'running') return;
    const startAt = this.ctx.currentTime + 0.05;
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.musicBus);
    source.start(startAt, Math.max(0, toMs / 1000));
    this.source.stop(startAt);
    this.source = source;
    this.songZero = startAt - toMs / 1000;
  }

  /** Current song time in ms, as heard through the speakers. Frozen while paused, never goes backwards. */
  timeMs(): number {
    if (!this.started) return -Infinity;
    // Suspended: the clock is frozen, keep returning the last value instead of switching to another clock source.
    if (this.ctx.state !== 'running') return this.lastTime;
    const time = (this.heardContextTime() - this.songZero) * 1000;
    this.lastTime = Math.max(this.lastTime, time);
    return this.lastTime;
  }

  /** AudioContext time of the sample reaching the speakers right now. */
  private heardContextTime(): number {
    const now = performance.now();
    if (typeof this.ctx.getOutputTimestamp === 'function') {
      const stamp = this.ctx.getOutputTimestamp();
      const age = stamp.performanceTime === undefined ? Infinity : now - stamp.performanceTime;
      // Right after start/resume the stamp can still be from before the pause; only trust fresh ones.
      if (stamp.contextTime !== undefined && stamp.performanceTime && age >= 0 && age < 100) {
        return stamp.contextTime + age / 1000;
      }
    }
    return this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0);
  }

  pause(): Promise<void> {
    return this.ctx.suspend();
  }

  resume(): Promise<void> {
    return this.ctx.resume();
  }

  setVolume(volume: number): void {
    this.master.gain.value = volume;
  }

  play(sound: HitSound): void {
    const t = this.ctx.currentTime;
    switch (sound) {
      case 'hit':
        this.blip(t, 1320, 0.05, 0.55);
        this.noiseBurst(t, 5000, 0.035, 0.35);
        break;
      case 'tick':
        this.blip(t, 2100, 0.03, 0.18);
        break;
      case 'break':
        this.blip(t, 140, 0.25, 0.5, 60);
        break;
      case 'bonus':
        this.blip(t, 1760, 0.12, 0.25);
        this.blip(t + 0.05, 2640, 0.12, 0.18);
        break;
    }
  }

  async destroy(): Promise<void> {
    this.synth?.stop();
    try {
      this.source?.stop();
    } catch {
      // never started
    }
    if (this.ctx.state !== 'closed') await this.ctx.close();
  }

  private blip(t: number, freq: number, length: number, gain: number, endFreq?: number): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + length);
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + length);
    osc.connect(env).connect(this.sfxBus);
    osc.start(t);
    osc.stop(t + length + 0.02);
  }

  private noiseBurst(t: number, highpass: number, length: number, gain: number): void {
    playNoise(this.ctx, this.noise, this.sfxBus, t, highpass, length, gain);
  }
}

function createNoise(ctx: BaseAudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function playNoise(
  ctx: BaseAudioContext,
  noise: AudioBuffer,
  destination: AudioNode,
  t: number,
  highpass: number,
  length: number,
  gain: number,
): void {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = highpass;
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + length);
  src.connect(filter).connect(env).connect(destination);
  src.start(t, Math.random() * 0.5);
  src.stop(t + length + 0.02);
}

/** Small deterministic PRNG so every map always gets the same song. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];
const PROGRESSIONS = [
  [0, 5, 2, 6],
  [0, 3, 5, 4],
  [0, 6, 5, 6],
  [5, 6, 0, 0],
];

const midiToHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/**
 * A procedurally generated electronic track on the map's beat grid: four-on-the-floor drums, bass,
 * pads and an arpeggio. Every 16th bar is a breakdown, matching the generator's break bars.
 * Notes are scheduled a little ahead of time from a timer, the usual Web Audio pattern.
 */
class SynthTrack {
  private readonly stepLength: number;
  private readonly totalSteps: number;
  private readonly root: number;
  private readonly progression: number[];
  private readonly arpPattern: number[];
  private readonly bassPattern: boolean[];
  private readonly bus: GainNode;
  private readonly delay: DelayNode;
  private timer: ReturnType<typeof setInterval> | null = null;
  private songZero = 0;
  private nextStep = 0;

  constructor(
    private readonly ctx: AudioContext,
    destination: AudioNode,
    private readonly noise: AudioBuffer,
    private readonly beatmap: BeatmapSummary,
  ) {
    const random = mulberry32(beatmap.synthSeed ?? beatmap.id);
    const beatLength = 60 / beatmap.bpm;
    this.stepLength = beatLength / 4;
    // Song runs one bar past the last object, then a final hit.
    this.totalSteps =
      Math.ceil((beatmap.durationMs / 1000 - beatmap.offsetMs / 1000) / this.stepLength) + 16;
    this.root = 45 + Math.floor(random() * 7);
    this.progression = PROGRESSIONS[Math.floor(random() * PROGRESSIONS.length)];
    this.arpPattern = Array.from({ length: 16 }, () => Math.floor(random() * 6));
    this.bassPattern = Array.from({ length: 8 }, (_, i) => i % 2 === 0 || random() < 0.45);

    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(destination);
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = beatLength * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.32;
    const delayOut = ctx.createGain();
    delayOut.gain.value = 0.35;
    this.delay.connect(feedback).connect(this.delay);
    this.delay.connect(delayOut).connect(this.bus);
  }

  start(songZero: number): void {
    this.songZero = songZero + this.beatmap.offsetMs / 1000;
    const now = this.ctx.currentTime;
    this.nextStep = Math.max(0, Math.ceil((now - this.songZero) / this.stepLength));
    this.schedule();
    this.timer = setInterval(() => this.schedule(), 25);
  }

  /** Silences the track immediately (leaving the game). */
  stop(): void {
    this.stopScheduling();
    this.bus.disconnect();
  }

  private stopScheduling(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private schedule(): void {
    if (this.ctx.state !== 'running') return;
    const horizon = this.ctx.currentTime + 0.15;
    while (this.nextStep <= this.totalSteps) {
      const time = this.songZero + this.nextStep * this.stepLength;
      if (time > horizon) break;
      if (time >= this.ctx.currentTime - 0.01) this.playStep(this.nextStep, time);
      this.nextStep++;
    }
    // Everything is queued; let the last notes ring out instead of disconnecting the bus.
    if (this.nextStep > this.totalSteps) this.stopScheduling();
  }

  private playStep(step: number, t: number): void {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    if (step === this.totalSteps) {
      this.kick(t, 1);
      this.crash(t);
      return;
    }
    const breakdown = bar > 0 && bar % 16 === 0;
    const chordDegree = this.progression[bar % this.progression.length];
    const chordRoot = this.root + MINOR_SCALE[chordDegree % 7];

    if (s === 0) this.pad(t, chordDegree, this.stepLength * 16);
    if (s === 0 && bar % 8 === 1) this.crash(t);

    if (!breakdown) {
      if (s % 4 === 0) this.kick(t, s === 0 ? 1 : 0.85);
      if (bar >= 1 && (s === 4 || s === 12)) this.snare(t);
      if (bar >= 1 && s % 2 === 0)
        this.hat(t, s % 4 === 2 ? 0.16 : 0.07, s % 4 === 2 ? 0.09 : 0.035);
      if (bar >= 1 && s % 2 === 0 && this.bassPattern[s / 2]) {
        this.bass(t, chordRoot - 12 + (s % 8 === 6 ? 12 : 0));
      }
    } else if (s % 4 === 0) {
      this.hat(t, 0.05, 0.03);
    }
    if (bar >= 2) {
      const degree = chordDegree + [0, 2, 4, 7, 9, 11][this.arpPattern[s]];
      const note = this.root + 24 + MINOR_SCALE[degree % 7] + 12 * Math.floor(degree / 7);
      this.arp(t, note, breakdown ? 0.05 : 0.07);
    }
  }

  private kick(t: number, velocity: number): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    env.gain.setValueAtTime(0.9 * velocity, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
    osc.connect(env).connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  private snare(t: number): void {
    playNoise(this.ctx, this.noise, this.bus, t, 1400, 0.18, 0.35);
    const body = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    body.type = 'triangle';
    body.frequency.setValueAtTime(190, t);
    env.gain.setValueAtTime(0.25, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    body.connect(env).connect(this.bus);
    body.start(t);
    body.stop(t + 0.1);
  }

  private hat(t: number, gain: number, length: number): void {
    playNoise(this.ctx, this.noise, this.bus, t, 8000, length, gain);
  }

  private crash(t: number): void {
    playNoise(this.ctx, this.noise, this.bus, t, 4500, 1.2, 0.12);
  }

  private bass(t: number, note: number): void {
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const env = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = midiToHz(note);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(180, t + this.stepLength * 1.8);
    env.gain.setValueAtTime(0.32, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + this.stepLength * 1.9);
    osc.connect(filter).connect(env).connect(this.bus);
    osc.start(t);
    osc.stop(t + this.stepLength * 2);
  }

  private arp(t: number, note: number, gain: number): void {
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = midiToHz(note);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2600;
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.001, t + this.stepLength * 0.9);
    osc.connect(filter).connect(env);
    env.connect(this.bus);
    env.connect(this.delay);
    osc.start(t);
    osc.stop(t + this.stepLength);
  }

  private pad(t: number, chordDegree: number, length: number): void {
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1100;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.06, t + 0.25);
    env.gain.setValueAtTime(0.06, t + length - 0.2);
    env.gain.exponentialRampToValueAtTime(0.0001, t + length);
    filter.connect(env).connect(this.bus);
    for (const offset of [0, 2, 4]) {
      const degree = chordDegree + offset;
      const note = this.root + 12 + MINOR_SCALE[degree % 7] + 12 * Math.floor(degree / 7);
      for (const detune of [-7, 7]) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = midiToHz(note);
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(t);
        osc.stop(t + length + 0.05);
      }
    }
  }
}
