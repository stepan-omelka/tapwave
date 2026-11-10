import { describe, expect, it } from 'vitest';
import { BeatmapDetail, HitObject } from '../core/models';
import { AudioEngine } from './audio';
import { GameEngine, PlayOutcome } from './engine';
import { calculateScore } from './score-keeper';
import { sliderProgress, SliderPath } from './slider-path';
import { window100 } from './rules';
import golden from '../../../../shared/scoring-golden.json';

/** Canvas whose 2D context swallows every call, so the real renderer can run headless. */
function fakeCanvas(): HTMLCanvasElement {
  const noop: unknown = new Proxy(function () {}, {
    get: (_target, prop) => (prop === Symbol.toPrimitive ? () => 0 : noop),
    apply: () => noop,
    set: () => true,
  });
  const canvas = document.createElement('canvas');
  Object.defineProperty(canvas, 'getContext', { value: () => noop });
  Object.defineProperty(canvas, 'clientWidth', { value: 1280 });
  Object.defineProperty(canvas, 'clientHeight', { value: 720 });
  return canvas;
}

class FakeAudio {
  readonly canSeek: boolean = false;
  now = -Infinity;
  timeMs = () => this.now;
  start = async () => undefined;
  pause = async () => undefined;
  resume = async () => undefined;
  play = () => undefined;
}

/** An audio file can jump forward; the synth track (plain FakeAudio) cannot. */
class SeekableAudio extends FakeAudio {
  override readonly canSeek = true;
  readonly seeks: number[] = [];
  seek = (ms: number) => {
    this.seeks.push(ms);
    this.now = ms;
  };
}

/** Tiny seeded PRNG so the scripted player is reproducible. */
function random(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) % 4294967296;
    return a / 4294967296;
  };
}

interface Run {
  engine: GameEngine;
  outcome: PlayOutcome | null;
  failed: boolean;
}

/**
 * Plays a map frame by frame (4 ms steps). The scripted player hits with sloppy timing, sometimes skips an
 * object, lets go of some sliders early and spins at a steady speed.
 */
function play(detail: BeatmapDetail, options: { autoplay: boolean; seed: number }): Run {
  const audio = new FakeAudio();
  const run: Run = { engine: null!, outcome: null, failed: false };
  const engine = new GameEngine(fakeCanvas(), detail, audio as unknown as AudioEngine,
    { autoplay: options.autoplay, offsetMs: 0, backgroundDim: 0 },
    { finished: (o) => (run.outcome = o), failed: () => (run.failed = true) });
  run.engine = engine;

  const rnd = random(options.seed);
  const od = detail.beatmap.overallDifficulty;
  const plans = detail.hitObjects.map((o) => ({
    skip: rnd() < 0.12,
    offset: Math.round((rnd() - 0.5) * 2 * (window100(od) + 10)),
    letGoAt: o.type === 'slider' && rnd() < 0.3 ? o.time + (o.endTime! - o.time) * rnd() : Infinity,
  }));
  const paths = detail.hitObjects.map((o) => (o.slider ? new SliderPath(o.slider.points, o.slider.curve) : null));

  for (let t = engine.startTime; t <= engine.endTime + 50 && !run.outcome && !run.failed; t += 4) {
    audio.now = t;
    if (!options.autoplay) steer(engine, detail.hitObjects, plans, paths, t);
    engine.tick(t);
  }
  return run;
}

function steer(
  engine: GameEngine,
  objects: HitObject[],
  plans: { skip: boolean; offset: number; letGoAt: number }[],
  paths: (SliderPath | null)[],
  t: number,
): void {
  const i = objects.findIndex((o, index) => index >= engine.firstUnfinished && (o.endTime ?? o.time) + 200 >= t);
  if (i < 0) return;
  const o = objects[i];
  const plan = plans[i];
  const hitAt = o.time + plan.offset;
  if (plan.skip) {
    engine.release('K1');
    return;
  }
  if (o.type === 'spinner') {
    const angle = ((t - o.time) / 1000) * Math.PI * 2 * 4;
    engine.cursor.x = 256 + Math.cos(angle) * 60;
    engine.cursor.y = 192 + Math.sin(angle) * 60;
    if (t >= o.time && t < o.endTime!) engine.press('K1');
    else engine.release('K1');
    return;
  }
  if (t < hitAt) {
    engine.release('K1');
    engine.cursor.x = o.x;
    engine.cursor.y = o.y;
    return;
  }
  if (o.type === 'circle') {
    if (t < hitAt + 30) engine.press('K1');
    else engine.release('K1');
    return;
  }
  const ball = paths[i]!.pointAt(sliderProgress(o, t).progress);
  engine.cursor.x = ball.x;
  engine.cursor.y = ball.y;
  if (t < plan.letGoAt && t <= o.endTime!) engine.press('K1');
  else engine.release('K1');
}

function generatedMap(): BeatmapDetail {
  // A dense hand-made map: streams, a repeating slider and a spinner.
  const objects: HitObject[] = [];
  let time = 2000;
  for (let i = 0; i < 40; i++) {
    const x = 120 + (i % 8) * 38;
    const y = 120 + (i % 5) * 30;
    if (i % 7 === 3) {
      objects.push({
        type: 'slider', time, x, y, newCombo: i % 4 === 0, comboNumber: 1, colorIndex: 0, endTime: time + 600,
        slider: {
          curve: 'bezier', points: [{ x, y }, { x: x + 40, y: y + 60 }, { x: x + 90, y }], slides: 2, spanDuration: 300,
          parts: [{ time: time + 300, kind: 'repeat' }, { time: time + 600, kind: 'tail' }],
        },
      });
      time += 900;
    } else {
      objects.push({ type: 'circle', time, x, y, newCombo: i % 4 === 0, comboNumber: 1, colorIndex: 0 });
      time += i % 3 === 0 ? 150 : 320;
    }
  }
  objects.push({ type: 'spinner', time, x: 256, y: 192, newCombo: true, comboNumber: 0, colorIndex: 0, endTime: time + 2500 });
  return {
    beatmap: {
      id: 1, slug: 't', title: 'T', artist: 'A', mapper: 'M', difficultyName: 'D', bpm: 120, offsetMs: 0,
      circleSize: 4, approachRate: 8, overallDifficulty: 6, hpDrain: 2, durationMs: time + 2500, starRating: 3,
      objectCount: objects.length, maxCombo: 0, audioUrl: null, audioSourceUrl: null, audioLicense: null,
      audioLicenseUrl: null, synthSeed: 1,
    },
    hitObjects: objects,
  };
}

describe('GameEngine live score vs. server-equivalent recomputation', () => {
  it('autoplay gets a perfect score that recomputes identically', () => {
    const detail = generatedMap();
    const run = play(detail, { autoplay: true, seed: 1 });
    expect(run.outcome).not.toBeNull();
    const summary = calculateScore(detail.hitObjects, run.outcome!.results, 6, 2);
    expect(summary.accuracy).toBe(100);
    expect(run.engine.keeper.score).toBe(summary.totalScore);
    expect(run.engine.keeper.maxCombo).toBe(summary.maxCombo);
  });

  for (const seed of [3, 17, 42, 99]) {
    it(`a sloppy scripted player (seed ${seed}) scores the same live and recomputed`, () => {
      const detail = generatedMap();
      const run = play(detail, { autoplay: false, seed });
      expect(run.failed).toBe(false);
      expect(run.outcome).not.toBeNull();
      const k = run.engine.keeper;
      const summary = calculateScore(detail.hitObjects, run.outcome!.results, 6, 2);
      expect({ score: k.score, maxCombo: k.maxCombo, c300: k.count300, c100: k.count100, c50: k.count50, miss: k.countMiss })
        .toEqual({ score: summary.totalScore, maxCombo: summary.maxCombo, c300: summary.count300, c100: summary.count100,
          c50: summary.count50, miss: summary.countMiss });
      // The script really is sloppy, so this is not just comparing two perfect runs.
      expect(summary.accuracy).toBeLessThan(100);
    });
  }

  it('plays the golden map with autoplay', () => {
    const detail: BeatmapDetail = {
      beatmap: { ...generatedMap().beatmap, overallDifficulty: golden.overallDifficulty, hpDrain: golden.hpDrain },
      hitObjects: golden.hitObjects as HitObject[],
    };
    const run = play(detail, { autoplay: true, seed: 1 });
    const summary = calculateScore(detail.hitObjects, run.outcome!.results, golden.overallDifficulty, golden.hpDrain);
    expect(summary.grade).toBe('SS');
    expect(run.engine.keeper.score).toBe(summary.totalScore);
  });
});

describe('GameEngine intro skip', () => {
  /** generatedMap() moved so that its first object comes at {@code firstAt} ms. */
  function mapStartingAt(firstAt: number): BeatmapDetail {
    const base = generatedMap();
    const shift = firstAt - base.hitObjects[0].time;
    const hitObjects = base.hitObjects.map((o) => ({
      ...o,
      time: o.time + shift,
      ...(o.endTime === undefined ? {} : { endTime: o.endTime + shift }),
      ...(o.slider ? { slider: { ...o.slider, parts: o.slider.parts.map((p) => ({ ...p, time: p.time + shift })) } } : {}),
    }));
    return { ...base, hitObjects };
  }

  function start(detail: BeatmapDetail, audio: FakeAudio) {
    const run = { outcome: null as PlayOutcome | null, offers: [] as boolean[] };
    const engine = new GameEngine(fakeCanvas(), detail, audio as unknown as AudioEngine,
      { autoplay: true, offsetMs: 0, backgroundDim: 0 },
      { finished: (o) => (run.outcome = o), failed: () => undefined, skippable: (a) => run.offers.push(a) });
    audio.now = engine.startTime;
    engine.tick(audio.now);
    return { engine, run };
  }

  it('jumps a long intro to one lead-in before the first object, and the play still scores perfectly', () => {
    const detail = mapStartingAt(20000);
    const audio = new SeekableAudio();
    const { engine, run } = start(detail, audio);
    expect(engine.canSkip).toBe(true);

    engine.skipIntro();
    engine.skipIntro();
    expect(audio.seeks).toEqual([engine.skipTarget]);
    expect(engine.skipTarget).toBe(20000 - 750 - 1200);
    expect(engine.canSkip).toBe(false);

    for (let t = audio.now; t <= engine.endTime + 50 && !run.outcome; t += 4) {
      audio.now = t;
      engine.tick(t);
    }
    expect(run.offers).toEqual([true, false]);
    expect(calculateScore(detail.hitObjects, run.outcome!.results, 6, 2).accuracy).toBe(100);
  });

  it('offers no skip for a short intro or for the synth track', () => {
    expect(start(mapStartingAt(4000), new SeekableAudio()).engine.canSkip).toBe(false);
    const synth = start(mapStartingAt(20000), new FakeAudio());
    expect(synth.engine.canSkip).toBe(false);
    expect(synth.run.offers).toEqual([]);
  });
});
