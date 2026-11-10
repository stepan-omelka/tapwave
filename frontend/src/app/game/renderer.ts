import { HitObject, PathPoint } from '../core/models';
import type { GameEngine, ObjectState } from './engine';
import { FOLLOW_RADIUS_FACTOR, Judgement, PLAYFIELD_HEIGHT, PLAYFIELD_WIDTH } from './rules';
import { sliderProgress } from './slider-path';

/** Tapwave's own palette: cyan, amber, violet, mint. */
export const COMBO_COLORS = ['#38e8ff', '#ffb347', '#a78bfa', '#4ade80'];
const JUDGEMENT_COLORS: Record<Judgement, string> = {
  300: '#7dd3fc',
  100: '#86efac',
  50: '#fcd34d',
  0: '#f87171',
};
const FONT = "'Inter', 'Segoe UI', system-ui, sans-serif";
const MONO = "'JetBrains Mono', 'SF Mono', ui-monospace, monospace";
const HIT_ANIMATION_MS = 180;
const POPUP_MS = 550;
const TRAIL_LENGTH = 14;

/** Draws one frame of the game onto a 2D canvas. Holds no game state of its own besides the cursor trail. */
export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private scale = 1;
  private originX = 0;
  private originY = 0;
  private width = 0;
  private height = 0;
  private readonly trail: PathPoint[] = [];
  private readonly reducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly engine: GameEngine,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // The 512x384 playfield sits in a 640x480 virtual screen, leaving room for the HUD.
    this.scale = Math.min(this.width / 640, this.height / 480);
    this.originX = (this.width - PLAYFIELD_WIDTH * this.scale) / 2;
    this.originY = (this.height - PLAYFIELD_HEIGHT * this.scale) / 2 + 8 * this.scale;
  }

  toPlayfield(clientX: number, clientY: number): PathPoint {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.originX) / this.scale,
      y: (clientY - rect.top - this.originY) / this.scale,
    };
  }

  draw(t: number): void {
    const ctx = this.ctx;
    this.drawBackground(t);

    ctx.save();
    ctx.translate(this.originX, this.originY);
    ctx.scale(this.scale, this.scale);
    const visible = this.visibleObjects(t);
    this.drawFollowLines(visible, t);
    // Earlier objects on top: draw back to front.
    for (let i = visible.length - 1; i >= 0; i--) this.drawObject(visible[i], t);
    this.drawPopups(t);
    this.drawCursor();
    ctx.restore();

    this.drawHud(t);
  }

  // ---------------------------------------------------------------- background

  private drawBackground(t: number): void {
    const ctx = this.ctx;
    const { width: w, height: h } = this;
    const beat = this.engine.beatLength;
    const offset = this.engine.detail.beatmap.offsetMs;
    const sinceBeat = t > offset ? (t - offset) % beat : beat;
    const pulse = this.reducedMotion ? 0 : Math.max(0, 1 - sinceBeat / (beat * 0.6));
    const sinceBar = t > offset ? (t - offset) % (beat * 4) : beat * 4;

    const gradient = ctx.createRadialGradient(
      w / 2,
      h * 0.55,
      0,
      w / 2,
      h * 0.55,
      Math.max(w, h) * 0.75,
    );
    gradient.addColorStop(0, `rgb(${22 + pulse * 10}, ${30 + pulse * 14}, ${62 + pulse * 22})`);
    gradient.addColorStop(1, '#05070f');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Slow diagonal grid.
    ctx.save();
    ctx.strokeStyle = `rgba(120, 160, 255, ${0.05 + pulse * 0.04})`;
    ctx.lineWidth = 1;
    const spacing = 48;
    const shift = this.reducedMotion ? 0 : (t / 40) % spacing;
    ctx.beginPath();
    for (let x = -h; x < w + h; x += spacing) {
      ctx.moveTo(x + shift, 0);
      ctx.lineTo(x + shift - h * 0.5, h);
    }
    ctx.stroke();

    // A ring expanding from the centre on every downbeat.
    const ringProgress = sinceBar / (beat * 2);
    if (ringProgress < 1 && !this.reducedMotion) {
      ctx.strokeStyle = `rgba(56, 232, 255, ${0.18 * (1 - ringProgress)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(
        w / 2,
        h / 2,
        Math.max(w, h) * 0.08 + ringProgress * Math.max(w, h) * 0.6,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    ctx.restore();

    const dim = this.engine.options.backgroundDim;
    if (dim > 0) {
      ctx.fillStyle = `rgba(0, 0, 0, ${dim * 0.8})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ---------------------------------------------------------------- objects

  private visibleObjects(t: number): ObjectState[] {
    const { states, preempt } = this.engine;
    const out: ObjectState[] = [];
    // Start a little before the first unfinished object so hit/fade-out animations can finish.
    let i = this.engine.firstUnfinished;
    while (i > 0 && t - states[i - 1].doneAt < POPUP_MS) i--;
    for (; i < states.length; i++) {
      const s = states[i];
      if (s.object.time - preempt > t) break;
      if (s.done && t - s.doneAt > HIT_ANIMATION_MS) continue;
      out.push(s);
    }
    return out;
  }

  private drawFollowLines(visible: ObjectState[], t: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 10]);
    for (let i = 0; i < visible.length - 1; i++) {
      const a = visible[i].object;
      const b = visible[i + 1].object;
      if (b.newCombo || a.type === 'spinner' || visible[i + 1].headDone) continue;
      const from = a.type === 'slider' ? endOf(visible[i]) : a;
      const appear = Math.min(1, (t - (b.time - this.engine.preempt)) / this.engine.fadeIn);
      const length = Math.hypot(b.x - from.x, b.y - from.y);
      if (length < this.engine.radius * 2.2) continue;
      const ux = (b.x - from.x) / length;
      const uy = (b.y - from.y) / length;
      const r = this.engine.radius * 1.1;
      ctx.strokeStyle = `rgba(200, 220, 255, ${0.35 * appear})`;
      ctx.beginPath();
      ctx.moveTo(from.x + ux * r, from.y + uy * r);
      ctx.lineTo(b.x - ux * r, b.y - uy * r);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawObject(s: ObjectState, t: number): void {
    switch (s.object.type) {
      case 'circle':
        this.drawCircleObject(s, t);
        break;
      case 'slider':
        this.drawSlider(s, t);
        break;
      case 'spinner':
        this.drawSpinner(s, t);
        break;
    }
  }

  private opacity(o: HitObject, t: number): number {
    return Math.min(1, Math.max(0, (t - (o.time - this.engine.preempt)) / this.engine.fadeIn));
  }

  private drawCircleObject(s: ObjectState, t: number): void {
    const o = s.object;
    const color = COMBO_COLORS[o.colorIndex % COMBO_COLORS.length];
    if (s.done) {
      if (s.judgement === 0) return;
      const p = (t - s.doneAt) / HIT_ANIMATION_MS;
      this.drawHitCircle(o.x, o.y, color, o.comboNumber, 1 - p, 1 + p * 0.45);
      return;
    }
    const alpha = this.opacity(o, t);
    const shake = t - s.shakeAt < 120 ? Math.sin((t - s.shakeAt) / 12) * 4 : 0;
    this.drawHitCircle(o.x + shake, o.y, color, o.comboNumber, alpha, 1);
    this.drawApproach(o, t, color, alpha);
  }

  private drawHitCircle(
    x: number,
    y: number,
    color: string,
    number: number,
    alpha: number,
    scale: number,
  ): void {
    const ctx = this.ctx;
    const r = this.engine.radius * scale;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    const fill = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    fill.addColorStop(0, shade(color, 0.35));
    fill.addColorStop(1, shade(color, -0.45));
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = r * 0.11;
    ctx.strokeStyle = '#f8fafc';
    ctx.stroke();
    ctx.lineWidth = r * 0.05;
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, r * 0.72, 0, Math.PI * 2);
    ctx.stroke();
    if (number > 0) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `700 ${Math.round(r * 0.78)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(number), x, y + r * 0.04);
    }
    ctx.restore();
  }

  private drawApproach(o: HitObject, t: number, color: string, alpha: number): void {
    const progress = (o.time - t) / this.engine.preempt;
    if (progress <= 0) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(o.x, o.y, this.engine.radius * (1 + 2.6 * progress), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  private drawSlider(s: ObjectState, t: number): void {
    const ctx = this.ctx;
    const o = s.object;
    const shape = o.slider!;
    const path = s.path!;
    const color = COMBO_COLORS[o.colorIndex % COMBO_COLORS.length];
    const r = this.engine.radius;
    const fadeOut = s.done ? 1 - (t - s.doneAt) / HIT_ANIMATION_MS : 1;
    const alpha = this.opacity(o, t) * fadeOut;
    if (alpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    this.strokePath(path.samples, r * 2, '#e2e8f0');
    this.strokePath(path.samples, r * 1.8, 'rgba(10, 16, 36, 0.92)');
    this.strokePath(path.samples, r * 1.1, hexToRgba(color, 0.22));

    // Ticks still to come.
    const { pass } = sliderProgress(o, t);
    ctx.fillStyle = '#f8fafc';
    for (let p = s.nextPart; p < shape.parts.length; p++) {
      const part = shape.parts[p];
      if (part.kind !== 'tick') continue;
      const point = path.pointAt(sliderProgress(o, part.time).progress);
      ctx.beginPath();
      ctx.arc(point.x, point.y, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }

    // Repeat arrow on the end the ball will turn around at.
    const repeatsLeft = shape.slides - 1 - pass;
    if (repeatsLeft > 0 && !s.done) {
      const atEnd = pass % 2 === 0;
      const point = path.pointAt(atEnd ? 1 : 0);
      const angle = path.angleAt(atEnd ? 1 : 0) + (atEnd ? Math.PI : 0);
      this.drawArrow(point, angle, r * 0.55);
    }

    if (t < o.time || s.offset === null) {
      // Head waiting to be hit (or already missed but still visible).
      if (!s.headDone) {
        this.drawHitCircle(o.x, o.y, color, o.comboNumber, 1, 1);
        this.drawApproach(o, t, color, 1);
      }
    }
    if (t >= o.time && !s.done) {
      const ball = path.pointAt(sliderProgress(o, t).progress);
      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, r * 0.82, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      if (s.tracking) {
        ctx.strokeStyle = hexToRgba(color, 0.75);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, r * FOLLOW_RADIUS_FACTOR, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private strokePath(points: PathPoint[], width: number, style: string): void {
    const ctx = this.ctx;
    ctx.lineWidth = width;
    ctx.strokeStyle = style;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
  }

  private drawArrow(at: PathPoint, angle: number, size: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(at.x, at.y);
    ctx.rotate(angle);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-size * 0.4, -size * 0.6);
    ctx.lineTo(size * 0.4, 0);
    ctx.lineTo(-size * 0.4, size * 0.6);
    ctx.stroke();
    ctx.restore();
  }

  private drawSpinner(s: ObjectState, t: number): void {
    const ctx = this.ctx;
    const o = s.object;
    const cx = PLAYFIELD_WIDTH / 2;
    const cy = PLAYFIELD_HEIGHT / 2;
    const fadeOut = s.done ? 1 - (t - s.doneAt) / HIT_ANIMATION_MS : 1;
    const alpha = this.opacity(o, t) * fadeOut;
    if (alpha <= 0) return;
    const duration = o.endTime! - o.time;
    const fill = Math.min(1, s.spins / s.required);
    const outer = 170;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(5, 8, 20, 0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, outer + 12, 0, Math.PI * 2);
    ctx.fill();

    // Progress towards a clear.
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(cx, cy, outer, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = fill >= 1 ? '#4ade80' : '#38e8ff';
    ctx.beginPath();
    ctx.arc(cx, cy, outer, -Math.PI / 2, -Math.PI / 2 + fill * Math.PI * 2);
    ctx.stroke();

    // Rotor following the player's rotation.
    ctx.translate(cx, cy);
    ctx.rotate(s.rotation);
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.85)';
    ctx.lineWidth = 6;
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.arc(0, 0, 110, -0.5, 0.5);
      ctx.stroke();
    }
    ctx.rotate(-s.rotation);

    // Time left, as a shrinking ring.
    if (t >= o.time) {
      const left = Math.max(0, 1 - (t - o.time) / duration);
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 20 + (outer - 20) * left, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `800 34px ${FONT}`;
    ctx.fillText(fill >= 1 ? 'CLEAR' : 'SPIN', 0, -8);
    ctx.font = `500 16px ${MONO}`;
    ctx.fillText(`${Math.round(s.rpm)} rpm`, 0, 22);
    if (s.bonusSpins > 0) {
      ctx.fillStyle = '#fcd34d';
      ctx.font = `700 20px ${MONO}`;
      ctx.fillText(`+${s.bonusSpins * 100}`, 0, 52);
    }
    ctx.restore();
  }

  private drawPopups(t: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const popup of this.engine.popups) {
      const age = t - popup.time;
      if (age < 0 || age > POPUP_MS) continue;
      const p = age / POPUP_MS;
      ctx.globalAlpha = 1 - p * p;
      ctx.fillStyle = JUDGEMENT_COLORS[popup.judgement];
      const size = popup.judgement === 300 ? 18 : 26;
      ctx.font = `800 ${size}px ${FONT}`;
      ctx.fillText(
        popup.judgement === 0 ? '✕' : String(popup.judgement),
        popup.x,
        popup.y - 6 - p * 18,
      );
    }
    ctx.restore();
  }

  private drawCursor(): void {
    const ctx = this.ctx;
    const { x, y } = this.engine.cursor;
    this.trail.push({ x, y });
    if (this.trail.length > TRAIL_LENGTH) this.trail.shift();
    ctx.save();
    for (let i = 0; i < this.trail.length - 1; i++) {
      const p = this.trail[i];
      const a = (i + 1) / this.trail.length;
      ctx.fillStyle = `rgba(56, 232, 255, ${a * 0.35})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3 + a * 5, 0, Math.PI * 2);
      ctx.fill();
    }
    const pressed = this.engine.keysDown.size > 0;
    ctx.shadowColor = '#38e8ff';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, pressed ? 7 : 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#38e8ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, pressed ? 11 : 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- HUD

  private drawHud(t: number): void {
    const ctx = this.ctx;
    const e = this.engine;
    const k = e.keeper;
    const { width: w, height: h } = this;
    const unit = Math.max(0.75, Math.min(1.4, this.scale));
    ctx.save();
    ctx.textBaseline = 'top';

    // Score + accuracy, top right.
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f8fafc';
    ctx.font = `700 ${Math.round(34 * unit)}px ${MONO}`;
    ctx.fillText(String(k.score).padStart(8, '0'), w - 20, 14);
    ctx.font = `600 ${Math.round(18 * unit)}px ${MONO}`;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`${k.liveAccuracy().toFixed(2)}%`, w - 20, 14 + 40 * unit);

    // HP bar, top left.
    const barWidth = Math.min(360, w * 0.35);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(20, 20, barWidth, 10);
    ctx.fillStyle = k.health > 0.3 ? '#38e8ff' : '#f87171';
    ctx.fillRect(20, 20, barWidth * k.health, 10);

    // Song progress, under the HP bar.
    const first = e.states[0]?.object.time ?? 0;
    const progress = Math.min(1, Math.max(0, (t - first) / (e.endTime - first)));
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(20, 36, barWidth, 4);
    ctx.fillStyle = '#a78bfa';
    ctx.fillRect(20, 36, barWidth * progress, 4);

    // Combo, bottom left.
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = '#f8fafc';
    ctx.font = `800 ${Math.round(44 * unit)}px ${MONO}`;
    ctx.fillText(`${k.combo}x`, 20, h - 14);

    this.drawHitErrorMeter(t, w, h);
    this.drawKeys(w, h, unit);

    if (e.options.autoplay) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = 'rgba(252, 211, 77, 0.9)';
      ctx.font = `700 ${Math.round(14 * unit)}px ${FONT}`;
      ctx.fillText('AUTOPLAY — not ranked', w / 2, 16);
    }

    // Title card during the lead-in.
    if (t < first) {
      const map = e.detail.beatmap;
      ctx.globalAlpha = Math.min(1, (first - t) / 600);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 ${Math.round(40 * unit)}px ${FONT}`;
      ctx.fillText(map.title, w / 2, h * 0.42);
      ctx.fillStyle = '#94a3b8';
      ctx.font = `500 ${Math.round(18 * unit)}px ${FONT}`;
      ctx.fillText(
        `${map.artist} · ${map.difficultyName} · ${map.bpm} BPM`,
        w / 2,
        h * 0.42 + 40 * unit,
      );
    }
    ctx.restore();
  }

  private drawHitErrorMeter(t: number, w: number, h: number): void {
    const ctx = this.ctx;
    const e = this.engine;
    const px = 1.2;
    const y = h - 24;
    const cx = w / 2;
    ctx.save();
    const bands: [number, string][] = [
      [e.window50, 'rgba(252, 211, 77, 0.55)'],
      [e.window100, 'rgba(134, 239, 172, 0.55)'],
      [e.window300, 'rgba(125, 211, 252, 0.7)'],
    ];
    for (const [width, color] of bands) {
      ctx.fillStyle = color;
      ctx.fillRect(cx - width * px, y - 2, width * 2 * px, 4);
    }
    for (const hit of e.hitErrors) {
      const age = t - hit.time;
      if (age > 4000) continue;
      ctx.fillStyle = `rgba(255,255,255,${1 - age / 4000})`;
      ctx.fillRect(cx + hit.offset * px - 1, y - 9, 2, 18);
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 1, y - 12, 2, 24);
    ctx.restore();
  }

  private drawKeys(w: number, h: number, unit: number): void {
    const ctx = this.ctx;
    const keys = ['K1', 'K2', 'M1', 'M2'] as const;
    const size = 34 * unit;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    keys.forEach((key, i) => {
      const x = w - 20 - size;
      const y = h / 2 - (size + 6) * 2 + i * (size + 6);
      const down = this.engine.keysDown.has(key);
      ctx.fillStyle = down ? 'rgba(56, 232, 255, 0.85)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = down ? '#05070f' : '#cbd5e1';
      ctx.font = `700 ${Math.round(11 * unit)}px ${MONO}`;
      ctx.fillText(String(this.engine.keyCounts[key] || key), x + size / 2, y + size / 2);
    });
    ctx.restore();
  }
}

function endOf(s: ObjectState): PathPoint {
  return s.path!.pointAt(s.object.slider!.slides % 2 === 1 ? 1 : 0);
}

function hexToRgba(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** Lightens (amount > 0) or darkens (amount < 0) a hex colour. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) =>
    Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return `rgb(${channel((n >> 16) & 255)}, ${channel((n >> 8) & 255)}, ${channel(n & 255)})`;
}
