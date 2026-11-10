import { HitObject, ObjectResult } from '../core/models';
import {
  EDGE_SCORE,
  grade,
  HP_TICK_GAIN,
  hpGain,
  hpMissPenalty,
  judgeOffset,
  judgementScore,
  judgeSlider,
  judgeSpinner,
  Judgement,
  requiredSpins,
  SPIN_BONUS_SCORE,
  TICK_SCORE,
} from './rules';

/**
 * Score, combo and HP bookkeeping. The engine feeds it live during play; {@link calculateScore}
 * replays a finished play through it exactly the way ScoreCalculator.java does on the server.
 */
export class ScoreKeeper {
  score = 0;
  combo = 0;
  maxCombo = 0;
  count300 = 0;
  count100 = 0;
  count50 = 0;
  countMiss = 0;
  health = 1;
  failed = false;

  constructor(private readonly hpSetting: number) {}

  /** Final judgement of an object. */
  judge(judgement: Exclude<Judgement, 0>, addsCombo: boolean): void {
    this.score += judgementScore(judgement, this.combo);
    if (addsCombo) this.bumpCombo();
    if (judgement === 300) this.count300++;
    else if (judgement === 100) this.count100++;
    else this.count50++;
    this.heal(hpGain(judgement, this.hpSetting));
  }

  /** Slider head, tick, repeat or tail hit. */
  edgeHit(points: number): void {
    this.score += points;
    this.bumpCombo();
    this.heal(HP_TICK_GAIN);
  }

  /** @param weight 1 for a missed object, 0.5 for a dropped slider part */
  miss(weight: number): void {
    this.combo = 0;
    if (weight >= 1) this.countMiss++;
    this.health -= hpMissPenalty(this.hpSetting) * weight;
    if (this.health <= 0) {
      this.health = 0;
      this.failed = true;
    }
  }

  spinBonus(spins: number, required: number): void {
    this.score += Math.floor(Math.max(0, spins - required)) * SPIN_BONUS_SCORE;
  }

  get judged(): number {
    return this.count300 + this.count100 + this.count50 + this.countMiss;
  }

  /** Accuracy over the objects judged so far (100 before the first judgement). */
  liveAccuracy(): number {
    return this.judged === 0 ? 100 : accuracyOf(this, this.judged);
  }

  private bumpCombo(): void {
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
  }

  private heal(amount: number): void {
    this.health = Math.min(1, this.health + amount);
  }
}

export interface PlaySummary {
  totalScore: number;
  maxCombo: number;
  accuracy: number;
  count300: number;
  count100: number;
  count50: number;
  countMiss: number;
  grade: string;
  failed: boolean;
}

function accuracyOf(
  k: Pick<ScoreKeeper, 'count300' | 'count100' | 'count50'>,
  total: number,
): number {
  return (100 * (300 * k.count300 + 100 * k.count100 + 50 * k.count50)) / (300 * total);
}

/** Pure re-computation of a play, identical to the server's. Used for autoplay and offline results. */
export function calculateScore(
  objects: HitObject[],
  results: ObjectResult[],
  od: number,
  hp: number,
): PlaySummary {
  const keeper = new ScoreKeeper(hp);
  for (let i = 0; i < objects.length && !keeper.failed; i++) {
    const object = objects[i];
    const result = results[i] ?? {};
    if (object.type === 'circle') {
      const j = result.offset == null ? 0 : judgeOffset(result.offset, od);
      if (j === 0) keeper.miss(1);
      else keeper.judge(j, true);
    } else if (object.type === 'slider') {
      applySlider(keeper, object, result, od);
    } else {
      const duration = (object.endTime ?? object.time) - object.time;
      const spins = result.spins ?? 0;
      const required = requiredSpins(duration, od);
      const j = judgeSpinner(spins, required);
      if (j === 0) {
        keeper.miss(1);
      } else {
        keeper.judge(j, true);
        keeper.spinBonus(spins, required);
      }
    }
  }
  const countMiss = keeper.countMiss + (objects.length - keeper.judged);
  const accuracy = objects.length === 0 ? 100 : accuracyOf(keeper, objects.length);
  return {
    totalScore: keeper.score,
    maxCombo: keeper.maxCombo,
    accuracy,
    count300: keeper.count300,
    count100: keeper.count100,
    count50: keeper.count50,
    countMiss,
    grade: grade(accuracy, countMiss),
    failed: keeper.failed,
  };
}

function applySlider(
  keeper: ScoreKeeper,
  object: HitObject,
  result: ObjectResult,
  od: number,
): void {
  const parts = object.slider!.parts;
  const flags = result.parts ?? [];
  let hit = 0;
  if (result.offset != null && judgeOffset(result.offset, od) !== 0) {
    keeper.edgeHit(EDGE_SCORE);
    hit++;
  } else {
    keeper.miss(0.5);
    if (keeper.failed) return;
  }
  for (let p = 0; p < parts.length; p++) {
    if (flags[p]) {
      keeper.edgeHit(parts[p].kind === 'tick' ? TICK_SCORE : EDGE_SCORE);
      hit++;
    } else if (parts[p].kind !== 'tail') {
      keeper.miss(0.5);
    }
    if (keeper.failed) return;
  }
  const j = judgeSlider(hit, parts.length + 1);
  if (j === 0) keeper.miss(1);
  else keeper.judge(j, false);
}
