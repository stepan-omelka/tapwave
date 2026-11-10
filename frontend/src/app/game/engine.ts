import { BeatmapDetail, HitObject, ObjectResult, PathPoint } from '../core/models';
import { AudioEngine } from './audio';
import { Autoplay } from './autoplay';
import { Renderer } from './renderer';
import {
  circleRadius,
  EDGE_SCORE,
  fadeIn,
  FOLLOW_RADIUS_FACTOR,
  judgeOffset,
  judgeSlider,
  judgeSpinner,
  Judgement,
  MAX_SPINS_PER_SECOND,
  PLAYFIELD_HEIGHT,
  PLAYFIELD_WIDTH,
  preempt,
  requiredSpins,
  TAIL_LENIENCY_MS,
  TICK_SCORE,
  window100,
  window300,
  window50,
} from './rules';
import { ScoreKeeper } from './score-keeper';
import { SliderPath, sliderProgress } from './slider-path';

export type KeyName = 'K1' | 'K2' | 'M1' | 'M2';

export interface EngineOptions {
  autoplay: boolean;
  /** Audio latency compensation; positive = the game runs this many ms behind the music. */
  offsetMs: number;
  backgroundDim: number;
}

export interface PlayOutcome {
  results: ObjectResult[];
  /** Every timed hit of the play (the HUD meter only keeps the recent ones). */
  hitErrors: number[];
  /** What the HUD showed, for a dev-mode comparison with the recomputed score. */
  live: { score: number; maxCombo: number };
}

export interface EngineCallbacks {
  finished(outcome: PlayOutcome): void;
  failed(): void;
  /** Skipping the intro became possible, or stopped being possible. */
  skippable?(available: boolean): void;
}

export interface ObjectState {
  readonly object: HitObject;
  readonly index: number;
  /** Circle judged / slider head judged (always true for spinners). */
  headDone: boolean;
  done: boolean;
  doneAt: number;
  judgement: Judgement | null;
  offset: number | null;
  /** Time of the last too-early click, for a small shake animation. */
  shakeAt: number;
  readonly path: SliderPath | null;
  /** Tracking result of every part that came due, in order. */
  readonly partsHit: boolean[];
  /** Parts are recorded when due, but scored only once the head is resolved (keeps the server's order). */
  scoredParts: number;
  nextPart: number;
  tracking: boolean;
  rotation: number;
  spins: number;
  readonly required: number;
  lastAngle: number | null;
  rpm: number;
  bonusSpins: number;
}

export interface Popup {
  x: number;
  y: number;
  judgement: Judgement;
  time: number;
}

const TWO_PI = Math.PI * 2;
const CENTER: PathPoint = { x: PLAYFIELD_WIDTH / 2, y: PLAYFIELD_HEIGHT / 2 };
/** Lead-in before the first object becomes visible. */
const LEAD_IN_MS = 1200;
const OUTRO_MS = 900;
/** The intro can be skipped while at least this much empty time is left before the first object appears. */
const MIN_SKIP_MS = 3000;

/**
 * The gameplay loop: reads the audio clock, applies input, judges objects and hands the frame to the renderer.
 * Judgement order is strict (an object cannot be hit before every earlier one is resolved) so the live score
 * always equals what the server computes from the submitted results.
 */
export class GameEngine {
  readonly states: ObjectState[];
  readonly keeper: ScoreKeeper;
  readonly radius: number;
  readonly preempt: number;
  readonly fadeIn: number;
  readonly window300: number;
  readonly window100: number;
  readonly window50: number;
  readonly startTime: number;
  readonly endTime: number;
  /** Song time a skipped intro jumps to: one lead-in before the first object appears. */
  readonly skipTarget: number;

  readonly cursor: PathPoint = { ...CENTER };
  readonly keysDown = new Set<KeyName>();
  readonly keyCounts: Record<KeyName, number> = { K1: 0, K2: 0, M1: 0, M2: 0 };
  readonly popups: Popup[] = [];
  /** Recent hits for the HUD's hit error meter. */
  readonly hitErrors: { offset: number; time: number }[] = [];
  private readonly allHitErrors: number[] = [];
  private readonly mousePointers = new Set<number>();

  time = -Infinity;
  paused = false;
  firstUnfinished = 0;

  private readonly renderer: Renderer;
  private readonly autoplay: Autoplay | null;
  private readonly listeners = new AbortController();
  private lastUpdate = -Infinity;
  private skipped = false;
  private skipAvailable = false;
  private rafId = 0;
  private over = false;

  constructor(
    canvas: HTMLCanvasElement,
    readonly detail: BeatmapDetail,
    private readonly audio: AudioEngine,
    readonly options: EngineOptions,
    private readonly callbacks: EngineCallbacks,
  ) {
    const map = detail.beatmap;
    this.keeper = new ScoreKeeper(map.hpDrain);
    this.radius = circleRadius(map.circleSize);
    this.preempt = preempt(map.approachRate);
    this.fadeIn = fadeIn(map.approachRate);
    this.window300 = window300(map.overallDifficulty);
    this.window100 = window100(map.overallDifficulty);
    this.window50 = window50(map.overallDifficulty);
    this.states = detail.hitObjects.map((object, index) =>
      createState(object, index, map.overallDifficulty),
    );

    const first = detail.hitObjects[0];
    const last = detail.hitObjects[detail.hitObjects.length - 1];
    this.startTime = Math.min(0, (first?.time ?? 0) - this.preempt - LEAD_IN_MS);
    this.endTime = (last?.endTime ?? last?.time ?? 0) + OUTRO_MS;
    this.skipTarget = (first?.time ?? 0) - this.preempt - LEAD_IN_MS;

    this.renderer = new Renderer(canvas, this);
    this.autoplay = options.autoplay ? new Autoplay(this) : null;
    window.addEventListener('resize', () => this.renderer.resize(), {
      signal: this.listeners.signal,
    });
    if (!options.autoplay) this.bindInput(canvas);
  }

  get beatLength(): number {
    return 60000 / this.detail.beatmap.bpm;
  }

  async start(): Promise<void> {
    this.renderer.resize();
    await this.audio.start(this.startTime);
    this.rafId = requestAnimationFrame(this.frame);
  }

  async pause(): Promise<void> {
    if (this.paused || this.over) return;
    this.paused = true;
    this.releaseAll();
    await this.audio.pause();
  }

  async resume(): Promise<void> {
    if (!this.paused || this.over) return;
    await this.audio.resume();
    this.paused = false;
  }

  /** True while a long, empty intro lies ahead. Only songs from audio files can skip (the synth cannot seek). */
  get canSkip(): boolean {
    return (
      !this.skipped &&
      !this.paused &&
      !this.over &&
      this.audio.canSeek &&
      this.time > -Infinity &&
      this.time < this.skipTarget - MIN_SKIP_MS
    );
  }

  /** Jumps the song to shortly before the first object appears. Nothing can be judged before that point. */
  skipIntro(): void {
    if (!this.canSkip) return;
    this.skipped = true;
    this.audio.seek(this.skipTarget + this.options.offsetMs);
    this.notifySkippable();
  }

  destroy(): void {
    this.over = true;
    cancelAnimationFrame(this.rafId);
    this.listeners.abort();
  }

  resize(): void {
    this.renderer.resize();
  }

  /** Results in the shape the server expects, one entry per object. */
  results(): ObjectResult[] {
    return this.states.map((s) => {
      switch (s.object.type) {
        case 'circle':
          return { offset: s.offset };
        case 'slider':
          return { offset: s.offset, parts: [...s.partsHit] };
        default:
          return { spins: s.spins };
      }
    });
  }

  // ---------------------------------------------------------------- loop

  private readonly frame = () => {
    if (this.over) return;
    this.rafId = requestAnimationFrame(this.frame);
    this.tick(this.audio.timeMs() - this.options.offsetMs);
  };

  /** Advances the game to song time {@code t} and draws it. Driven by requestAnimationFrame (and by tests). */
  tick(t: number): void {
    if (this.over) return;
    if (!this.paused) {
      this.time = t;
      this.autoplay?.steer(t);
      this.update(t);
    }
    this.renderer.draw(this.time);
    this.notifySkippable();

    if (this.keeper.failed) {
      this.over = true;
      void this.audio.pause();
      this.callbacks.failed();
    } else if (this.firstUnfinished >= this.states.length && t >= this.endTime) {
      this.over = true;
      this.callbacks.finished({
        results: this.results(),
        hitErrors: [...this.allHitErrors],
        live: { score: this.keeper.score, maxCombo: this.keeper.maxCombo },
      });
    }
  }

  private notifySkippable(): void {
    const available = this.canSkip;
    if (available !== this.skipAvailable) {
      this.skipAvailable = available;
      this.callbacks.skippable?.(available);
    }
  }

  private update(t: number): void {
    for (let i = this.firstUnfinished; i < this.states.length; i++) {
      const s = this.states[i];
      if (s.object.time - this.preempt > t) break;
      if (s.done) continue;
      if (this.autoplay && !s.headDone && t >= s.object.time) {
        this.cursor.x = s.object.x;
        this.cursor.y = s.object.y;
        this.tryHit(s.object.time);
      }
      switch (s.object.type) {
        case 'circle':
          if (!s.headDone && t > s.object.time + this.window50) this.missCircle(s, t);
          break;
        case 'slider':
          this.updateSlider(s, t);
          break;
        case 'spinner':
          this.updateSpinner(s, t);
          break;
      }
      if (this.keeper.failed) return;
    }
    while (this.firstUnfinished < this.states.length && this.states[this.firstUnfinished].done) {
      this.firstUnfinished++;
    }
    this.lastUpdate = t;
    const cutoff = t - 1000;
    while (this.popups.length && this.popups[0].time < cutoff) this.popups.shift();
    while (this.hitErrors.length > 40) this.hitErrors.shift();
  }

  // ---------------------------------------------------------------- input

  private bindInput(canvas: HTMLCanvasElement): void {
    const signal = this.listeners.signal;
    const move = (e: PointerEvent) => {
      const p = this.renderer.toPlayfield(e.clientX, e.clientY);
      this.cursor.x = p.x;
      this.cursor.y = p.y;
    };
    canvas.addEventListener('pointermove', move, { signal });
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        move(e);
        canvas.setPointerCapture(e.pointerId);
        if (e.button === 2) {
          this.press('M2', e.timeStamp);
        } else {
          // Several fingers can be down at once; M1 is held while any of them is.
          if (this.mousePointers.size === 0) this.press('M1', e.timeStamp);
          this.mousePointers.add(e.pointerId);
        }
      },
      { signal },
    );
    const lift = (e: PointerEvent) => {
      if (e.button === 2) {
        this.release('M2');
        return;
      }
      this.mousePointers.delete(e.pointerId);
      if (this.mousePointers.size === 0) this.release('M1');
    };
    canvas.addEventListener('pointerup', lift, { signal });
    canvas.addEventListener('pointercancel', lift, { signal });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    // Physical key positions, so Z/X work on QWERTZ layouts too.
    window.addEventListener(
      'keydown',
      (e) => {
        const key = e.code === 'KeyZ' ? 'K1' : e.code === 'KeyX' ? 'K2' : null;
        if (!key || e.repeat) return;
        e.preventDefault();
        this.press(key, e.timeStamp);
      },
      { signal },
    );
    window.addEventListener(
      'keyup',
      (e) => {
        if (e.code === 'KeyZ') this.release('K1');
        if (e.code === 'KeyX') this.release('K2');
      },
      { signal },
    );
    // Keys released while the window had no focus never send keyup.
    window.addEventListener('blur', () => this.releaseAll(), { signal });
  }

  /**
   * @param eventTimeStamp {@code Event.timeStamp} of the input; the hit is back-dated to it so that
   *                       time spent waiting for the handler does not count as lateness
   */
  press(key: KeyName, eventTimeStamp?: number): void {
    if (this.paused || this.over || this.keysDown.has(key)) return;
    this.keysDown.add(key);
    this.keyCounts[key]++;
    const delay =
      eventTimeStamp === undefined
        ? 0
        : Math.min(100, Math.max(0, performance.now() - eventTimeStamp));
    this.tryHit(this.audio.timeMs() - this.options.offsetMs - delay);
  }

  release(key: KeyName): void {
    this.keysDown.delete(key);
  }

  private releaseAll(): void {
    this.keysDown.clear();
    this.mousePointers.clear();
  }

  // ---------------------------------------------------------------- judgement

  private tryHit(time: number): void {
    let target: ObjectState | undefined;
    for (let i = this.firstUnfinished; i < this.states.length; i++) {
      const s = this.states[i];
      if (s.object.type === 'spinner') {
        if (!s.done) return;
        continue;
      }
      if (!s.headDone) {
        target = s;
        break;
      }
      // A slider still in progress locks everything after it.
      if (!s.done) return;
    }
    if (!target) return;
    const o = target.object;
    if (time < o.time - this.preempt) return;
    if (Math.hypot(this.cursor.x - o.x, this.cursor.y - o.y) > this.radius) return;
    const offset = Math.round(time - o.time);
    if (offset < -this.window50) {
      target.shakeAt = time;
      return;
    }
    if (offset > this.window50) return;

    target.headDone = true;
    target.offset = offset;
    this.hitErrors.push({ offset, time });
    this.allHitErrors.push(offset);
    this.audio.play('hit');
    if (o.type === 'circle') {
      const judgement = judgeOffset(offset, this.detail.beatmap.overallDifficulty) as Exclude<
        Judgement,
        0
      >;
      this.keeper.judge(judgement, true);
      this.finish(target, judgement, time, o);
    } else {
      this.keeper.edgeHit(EDGE_SCORE);
    }
  }

  private missCircle(s: ObjectState, t: number): void {
    s.headDone = true;
    s.offset = null;
    this.comboBreak(() => this.keeper.miss(1));
    this.finish(s, 0, t, s.object);
  }

  private updateSlider(s: ObjectState, t: number): void {
    const o = s.object;
    const shape = o.slider!;
    if (!s.headDone && t > o.time + this.window50) this.missSliderHead(s);

    if (t >= o.time) {
      const ball = s.path!.pointAt(sliderProgress(o, t).progress);
      const holding = this.keysDown.size > 0;
      s.tracking =
        holding &&
        Math.hypot(this.cursor.x - ball.x, this.cursor.y - ball.y) <=
          this.radius * FOLLOW_RADIUS_FACTOR;
    }

    // Record each part when it comes due...
    while (s.nextPart < shape.parts.length) {
      const part = shape.parts[s.nextPart];
      const checkAt =
        part.kind === 'tail' ? Math.max(o.time, part.time - TAIL_LENIENCY_MS) : part.time;
      if (t < checkAt) break;
      s.partsHit.push(s.tracking);
      s.nextPart++;
    }
    // ...but score them only after the head is resolved, so the order matches the server (head, then parts)
    // and a very short slider cannot force a head miss while the head's window is still open.
    if (!s.headDone) return;
    while (s.scoredParts < s.partsHit.length) {
      const part = shape.parts[s.scoredParts];
      const hit = s.partsHit[s.scoredParts];
      s.scoredParts++;
      if (hit) {
        this.keeper.edgeHit(part.kind === 'tick' ? TICK_SCORE : EDGE_SCORE);
        this.audio.play(part.kind === 'tick' ? 'tick' : 'hit');
      } else if (part.kind !== 'tail') {
        this.comboBreak(() => this.keeper.miss(0.5));
      }
      if (this.keeper.failed) return;
    }

    if (s.scoredParts === shape.parts.length && t >= o.endTime!) {
      const hits = (s.offset !== null ? 1 : 0) + s.partsHit.filter(Boolean).length;
      const judgement = judgeSlider(hits, shape.parts.length + 1);
      if (judgement === 0) this.keeper.miss(1);
      else this.keeper.judge(judgement, false);
      const end = s.path!.pointAt(shape.slides % 2 === 1 ? 1 : 0);
      this.finish(s, judgement, t, end);
    }
  }

  private missSliderHead(s: ObjectState): void {
    s.headDone = true;
    s.offset = null;
    this.comboBreak(() => this.keeper.miss(0.5));
  }

  private updateSpinner(s: ObjectState, t: number): void {
    const o = s.object;
    const end = o.endTime!;
    if (t < o.time) return;
    if (t < end) {
      const holding = this.keysDown.size > 0;
      const angle = Math.atan2(this.cursor.y - CENTER.y, this.cursor.x - CENTER.x);
      if (holding && s.lastAngle !== null) {
        let delta = angle - s.lastAngle;
        if (delta > Math.PI) delta -= TWO_PI;
        if (delta < -Math.PI) delta += TWO_PI;
        // Only the part of the frame that overlaps the spinner counts towards the speed cap.
        const dt = Math.max(0, t - Math.max(this.lastUpdate, o.time));
        const maxDelta = (MAX_SPINS_PER_SECOND * TWO_PI * dt) / 1000;
        delta = Math.max(-maxDelta, Math.min(maxDelta, delta));
        s.rotation += delta;
        s.spins = Math.abs(s.rotation) / TWO_PI;
        if (dt > 0) s.rpm = s.rpm * 0.85 + (Math.abs(delta) / TWO_PI) * (60000 / dt) * 0.15;
        const bonus = Math.floor(Math.max(0, s.spins - s.required));
        if (bonus > s.bonusSpins) {
          s.bonusSpins = bonus;
          this.audio.play('bonus');
        }
      }
      s.lastAngle = holding ? angle : null;
      return;
    }
    const judgement = judgeSpinner(s.spins, s.required);
    if (judgement === 0) {
      this.comboBreak(() => this.keeper.miss(1));
    } else {
      this.keeper.judge(judgement, true);
      this.keeper.spinBonus(s.spins, s.required);
    }
    this.finish(s, judgement, t, CENTER);
  }

  private finish(s: ObjectState, judgement: Judgement, t: number, at: PathPoint): void {
    s.done = true;
    s.doneAt = t;
    s.judgement = judgement;
    this.popups.push({ x: at.x, y: at.y, judgement, time: t });
  }

  private comboBreak(apply: () => void): void {
    const combo = this.keeper.combo;
    apply();
    if (combo >= 10) this.audio.play('break');
  }
}

function createState(object: HitObject, index: number, od: number): ObjectState {
  const duration = (object.endTime ?? object.time) - object.time;
  return {
    object,
    index,
    headDone: object.type === 'spinner',
    done: false,
    doneAt: 0,
    judgement: null,
    offset: null,
    shakeAt: -Infinity,
    path: object.slider ? new SliderPath(object.slider.points, object.slider.curve) : null,
    partsHit: [],
    scoredParts: 0,
    nextPart: 0,
    tracking: false,
    rotation: 0,
    spins: 0,
    required: object.type === 'spinner' ? requiredSpins(duration, od) : 0,
    lastAngle: null,
    rpm: 0,
    bonusSpins: 0,
  };
}
