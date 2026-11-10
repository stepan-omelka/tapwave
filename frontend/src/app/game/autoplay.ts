import { PathPoint } from '../core/models';
import type { GameEngine, ObjectState } from './engine';
import { PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from './rules';
import { sliderProgress } from './slider-path';

const CENTER: PathPoint = { x: PLAYFIELD_WIDTH / 2, y: PLAYFIELD_HEIGHT / 2 };
const SPIN_RADIUS = 56;
/** Comfortably below the spin speed cap. */
const SPINS_PER_SECOND = 6;

/**
 * Demo player. It only moves the cursor and holds a key; hits go through the engine's normal judgement path
 * (the engine calls tryHit at each object's exact time while autoplay is on).
 */
export class Autoplay {
  constructor(private readonly engine: GameEngine) {}

  steer(t: number): void {
    const states = this.engine.states;
    const index = states.findIndex(
      (s, i) => i >= this.engine.firstUnfinished && finishTime(s) >= t,
    );
    const keys = this.engine.keysDown;
    if (index < 0) {
      keys.clear();
      return;
    }
    const current = states[index];
    const o = current.object;
    if (t >= o.time) {
      if (o.type === 'slider') {
        this.moveTo(current.path!.pointAt(sliderProgress(o, t).progress));
        keys.add('K1');
      } else if (o.type === 'spinner') {
        const angle = ((t - o.time) / 1000) * SPINS_PER_SECOND * Math.PI * 2;
        this.moveTo({
          x: CENTER.x + Math.cos(angle) * SPIN_RADIUS,
          y: CENTER.y + Math.sin(angle) * SPIN_RADIUS,
        });
        keys.add('K1');
      } else {
        this.moveTo(o);
      }
      return;
    }
    keys.clear();
    const previous = index > 0 ? states[index - 1] : null;
    const from = previous ? endPosition(previous) : CENTER;
    const fromTime = previous ? finishTime(previous) : o.time - 1000;
    const span = Math.max(1, o.time - fromTime);
    const progress = Math.min(1, Math.max(0, (t - fromTime) / span));
    const eased = progress * progress * (3 - 2 * progress);
    this.moveTo({ x: from.x + (o.x - from.x) * eased, y: from.y + (o.y - from.y) * eased });
  }

  private moveTo(p: PathPoint): void {
    this.engine.cursor.x = p.x;
    this.engine.cursor.y = p.y;
  }
}

function finishTime(s: ObjectState): number {
  return s.object.endTime ?? s.object.time;
}

function endPosition(s: ObjectState): PathPoint {
  const o = s.object;
  if (o.type === 'slider') return s.path!.pointAt(o.slider!.slides % 2 === 1 ? 1 : 0);
  if (o.type === 'spinner') return CENTER;
  return o;
}
