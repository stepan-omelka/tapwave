import { describe, expect, it } from 'vitest';
import { HitObject } from '../core/models';
import { SliderPath, sliderProgress } from './slider-path';

describe('SliderPath', () => {
  it('walks a straight line by arc length', () => {
    const path = new SliderPath(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ],
      'linear',
    );
    expect(path.length).toBe(100);
    expect(path.pointAt(0.25)).toEqual({ x: 25, y: 0 });
    expect(path.pointAt(2)).toEqual({ x: 100, y: 0 });
  });

  it('keeps a quadratic curve between its end points', () => {
    const path = new SliderPath(
      [
        { x: 0, y: 0 },
        { x: 50, y: 80 },
        { x: 100, y: 0 },
      ],
      'bezier',
    );
    expect(path.pointAt(0)).toEqual({ x: 0, y: 0 });
    const end = path.pointAt(1);
    expect(end.x).toBeCloseTo(100);
    expect(end.y).toBeCloseTo(0);
    expect(path.pointAt(0.5).y).toBeCloseTo(40, 0);
    expect(path.length).toBeGreaterThan(100);
  });
});

describe('sliderProgress', () => {
  const object: HitObject = {
    type: 'slider',
    time: 1000,
    x: 0,
    y: 0,
    newCombo: false,
    comboNumber: 1,
    colorIndex: 0,
    endTime: 3000,
    slider: { curve: 'linear', points: [], slides: 2, spanDuration: 1000, parts: [] },
  };

  it('goes forward on the first pass and back on the repeat', () => {
    expect(sliderProgress(object, 1500)).toEqual({ progress: 0.5, pass: 0 });
    expect(sliderProgress(object, 2250)).toEqual({ progress: 0.75, pass: 1 });
    expect(sliderProgress(object, 5000)).toEqual({ progress: 0, pass: 1 });
  });
});
