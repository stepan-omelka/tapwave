/**
 * Gameplay formulas. Mirrors backend/src/main/java/dev/tapwave/gameplay/Difficulty.java —
 * change both or the server will re-score (or reject) honest plays.
 */

export const PLAYFIELD_WIDTH = 512;
export const PLAYFIELD_HEIGHT = 384;

export const EDGE_SCORE = 30;
export const TICK_SCORE = 10;
export const SPIN_BONUS_SCORE = 100;
export const MAX_SPINS_PER_SECOND = 8;
export const HP_TICK_GAIN = 0.01;

/** Follow circle radius as a multiple of the circle radius. */
export const FOLLOW_RADIUS_FACTOR = 2.4;
/** The tail is checked slightly before the slider ends, like in most games of the genre. */
export const TAIL_LENIENCY_MS = 36;

export type Judgement = 300 | 100 | 50 | 0;

export function circleRadius(cs: number): number {
  return 54.4 - 4.48 * cs;
}

export function preempt(ar: number): number {
  return ar < 5 ? 1200 + 120 * (5 - ar) : 1200 - 150 * (ar - 5);
}

export function fadeIn(ar: number): number {
  return Math.min(400, (preempt(ar) * 2) / 3);
}

export function window300(od: number): number {
  return 80 - 6 * od;
}

export function window100(od: number): number {
  return 140 - 8 * od;
}

export function window50(od: number): number {
  return 200 - 10 * od;
}

export function judgeOffset(offset: number, od: number): Judgement {
  const abs = Math.abs(offset);
  if (abs <= window300(od)) return 300;
  if (abs <= window100(od)) return 100;
  if (abs <= window50(od)) return 50;
  return 0;
}

export function requiredSpins(durationMs: number, od: number): number {
  return (durationMs / 1000) * (1 + 0.15 * od);
}

export function judgeSpinner(spins: number, required: number): Judgement {
  const ratio = spins / required;
  if (ratio >= 1) return 300;
  if (ratio >= 0.9) return 100;
  if (ratio >= 0.75) return 50;
  return 0;
}

export function judgeSlider(hit: number, total: number): Judgement {
  if (hit === total) return 300;
  if (hit * 2 >= total) return 100;
  if (hit > 0) return 50;
  return 0;
}

export function hpMissPenalty(hp: number): number {
  return 0.03 + 0.017 * hp;
}

export function hpGain(judgement: Judgement, hp: number): number {
  const full = 0.035 - 0.0015 * hp;
  switch (judgement) {
    case 300:
      return full;
    case 100:
      return full * 0.5;
    case 50:
      return full * 0.1;
    default:
      return 0;
  }
}

/** Same integer maths as Java: judgement + floor(judgement * combo / 25). */
export function judgementScore(judgement: Judgement, comboBefore: number): number {
  return judgement + Math.floor((judgement * comboBefore) / 25);
}

export function grade(accuracy: number, misses: number): string {
  if (accuracy >= 100) return 'SS';
  if (accuracy >= 95 && misses === 0) return 'S';
  if (accuracy >= 90) return 'A';
  if (accuracy >= 80) return 'B';
  if (accuracy >= 70) return 'C';
  return 'D';
}
