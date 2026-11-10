import { describe, expect, it } from 'vitest';
import { HitObject, ObjectResult } from '../core/models';
import { calculateScore } from './score-keeper';
import { judgementScore, requiredSpins } from './rules';
import golden from '../../../../shared/scoring-golden.json';

const circle = (time: number): HitObject => ({
  type: 'circle',
  time,
  x: 100,
  y: 100,
  newCombo: false,
  comboNumber: 1,
  colorIndex: 0,
});

const slider = (time: number): HitObject => ({
  type: 'slider',
  time,
  x: 100,
  y: 100,
  newCombo: false,
  comboNumber: 1,
  colorIndex: 0,
  endTime: time + 1000,
  slider: {
    curve: 'linear',
    points: [
      { x: 100, y: 100 },
      { x: 200, y: 100 },
    ],
    slides: 1,
    spanDuration: 1000,
    parts: [
      { time: time + 500, kind: 'tick' },
      { time: time + 1000, kind: 'tail' },
    ],
  },
});

const spinner = (time: number): HitObject => ({
  type: 'spinner',
  time,
  x: 256,
  y: 192,
  newCombo: true,
  comboNumber: 0,
  colorIndex: 0,
  endTime: time + 2000,
});

// The same fixture and expected numbers as ScoreCalculatorTest.java — keep them in sync.
const MAP = [circle(1000), slider(2000), circle(3500), spinner(4000)];
const OD = 5;
const HP = 5;

describe('golden cases shared with the backend', () => {
  for (const testCase of golden.cases) {
    it(testCase.name, () => {
      const summary = calculateScore(
        golden.hitObjects as HitObject[],
        testCase.results as ObjectResult[],
        golden.overallDifficulty,
        golden.hpDrain,
      );
      expect(summary).toEqual(testCase.expected);
    });
  }
});

describe('calculateScore', () => {
  it('scores a perfect play', () => {
    const results: ObjectResult[] = [
      { offset: 0 },
      { offset: 0, parts: [true, true] },
      { offset: 0 },
      { spins: requiredSpins(2000, OD) },
    ];
    const summary = calculateScore(MAP, results, OD, HP);
    expect(summary.accuracy).toBe(100);
    expect(summary.grade).toBe('SS');
    expect(summary.maxCombo).toBe(6);
    expect(summary.countMiss).toBe(0);
    // circle 300 @0 combo, head + tick + tail (30 + 10 + 30), slider 300 @4, circle 300 @4, spinner 300 @5
    const expected =
      judgementScore(300, 0) +
      30 +
      10 +
      30 +
      judgementScore(300, 4) +
      judgementScore(300, 4) +
      judgementScore(300, 5);
    expect(summary.totalScore).toBe(expected);
    expect(summary.totalScore).toBe(1426);
  });

  it('matches the server on a mixed play', () => {
    const results: ObjectResult[] = [
      { offset: 70 }, // 100 at OD 5
      { offset: null, parts: [true, false] }, // head miss, tick hit, tail dropped -> 1/3 -> 50
      { offset: -10 }, // 300
      { spins: 0.5 }, // miss
    ];
    const summary = calculateScore(MAP, results, OD, HP);
    expect([summary.count300, summary.count100, summary.count50, summary.countMiss]).toEqual([
      1, 1, 1, 1,
    ]);
    expect(summary.totalScore).toBe(474);
    expect(summary.maxCombo).toBe(2);
    expect(summary.accuracy).toBeCloseTo((100 * (300 + 100 + 50)) / 1200, 10);
    expect(summary.grade).toBe('D');
  });

  it('fails when HP runs out', () => {
    const many = Array.from({ length: 30 }, (_, i) => circle(1000 + i * 300));
    const summary = calculateScore(
      many,
      many.map(() => ({ offset: null })),
      OD,
      10,
    );
    expect(summary.failed).toBe(true);
    expect(summary.countMiss).toBe(30);
  });
});
