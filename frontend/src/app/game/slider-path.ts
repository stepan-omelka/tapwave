import { HitObject, PathPoint } from '../core/models';

const BEZIER_SEGMENTS = 48;

/** A slider's curve sampled into a polyline, addressable by arc length. */
export class SliderPath {
  readonly samples: PathPoint[];
  readonly length: number;
  private readonly cumulative: number[];

  constructor(controlPoints: PathPoint[], curve: 'linear' | 'bezier') {
    this.samples =
      curve === 'linear' || controlPoints.length < 3
        ? [...controlPoints]
        : sampleBezier(controlPoints);
    this.cumulative = [0];
    for (let i = 1; i < this.samples.length; i++) {
      const a = this.samples[i - 1];
      const b = this.samples[i];
      this.cumulative.push(this.cumulative[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    this.length = this.cumulative[this.cumulative.length - 1];
  }

  /** Point at {@code progress} (0..1) of the way along the curve. */
  pointAt(progress: number): PathPoint {
    const target = Math.min(1, Math.max(0, progress)) * this.length;
    let lo = 0;
    let hi = this.cumulative.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (this.cumulative[mid] < target) lo = mid;
      else hi = mid;
    }
    const segment = this.cumulative[hi] - this.cumulative[lo];
    const t = segment === 0 ? 0 : (target - this.cumulative[lo]) / segment;
    const a = this.samples[lo];
    const b = this.samples[hi];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  /** Direction (radians) of the curve at {@code progress}. */
  angleAt(progress: number): number {
    const a = this.pointAt(Math.max(0, progress - 0.01));
    const b = this.pointAt(Math.min(1, progress + 0.01));
    return Math.atan2(b.y - a.y, b.x - a.x);
  }
}

function sampleBezier(points: PathPoint[]): PathPoint[] {
  const out: PathPoint[] = [];
  for (let s = 0; s <= BEZIER_SEGMENTS; s++) {
    out.push(deCasteljau(points, s / BEZIER_SEGMENTS));
  }
  return out;
}

function deCasteljau(points: PathPoint[], t: number): PathPoint {
  let current = points.map((p) => ({ x: p.x, y: p.y }));
  while (current.length > 1) {
    const next: PathPoint[] = [];
    for (let i = 0; i < current.length - 1; i++) {
      next.push({
        x: current[i].x + (current[i + 1].x - current[i].x) * t,
        y: current[i].y + (current[i + 1].y - current[i].y) * t,
      });
    }
    current = next;
  }
  return current[0];
}

/**
 * Where the slider ball is at {@code time}: progress along the path (0..1, already
 * reversed on repeat passes) and the index of the current pass.
 */
export function sliderProgress(
  object: HitObject,
  time: number,
): { progress: number; pass: number } {
  const shape = object.slider!;
  const elapsed = Math.max(0, time - object.time);
  const pass = Math.min(shape.slides - 1, Math.floor(elapsed / shape.spanDuration));
  const local = Math.min(1, (elapsed - pass * shape.spanDuration) / shape.spanDuration);
  return { progress: pass % 2 === 0 ? local : 1 - local, pass };
}
