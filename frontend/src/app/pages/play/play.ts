import { DecimalPipe } from '@angular/common';
import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  isDevMode,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { formatScore } from '../../core/format';
import { BeatmapDetail } from '../../core/models';
import { SettingsService } from '../../core/settings.service';
import { AudioEngine } from '../../game/audio';
import { GameEngine, PlayOutcome } from '../../game/engine';
import { calculateScore, PlaySummary } from '../../game/score-keeper';

type PlayState =
  | 'loading'
  | 'ready'
  | 'starting'
  | 'playing'
  | 'paused'
  | 'failed'
  | 'submitting'
  | 'results'
  | 'error';

interface ResultView extends Omit<PlaySummary, 'failed'> {
  /** Numbers come from the server's own re-computation. */
  verified: boolean;
  rank: number | null;
  personalBest: boolean;
  note: string | null;
  meanError: number | null;
}

@Component({
  selector: 'app-play',
  imports: [DecimalPipe],
  templateUrl: './play.html',
  styleUrl: './play.scss',
  host: {
    '(window:keydown)': 'onKeydown($event)',
    '(document:visibilitychange)': 'onVisibilityChange()',
  },
})
export class Play {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly settings = inject(SettingsService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Route parameter. */
  readonly id = input.required<string>();
  /** Query parameter: ?auto=1 starts autoplay. */
  readonly auto = input<string>();

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  protected readonly state = signal<PlayState>('loading');
  protected readonly detail = signal<BeatmapDetail | null>(null);
  protected readonly result = signal<ResultView | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly canSkip = signal(false);
  protected readonly autoplay = computed(() => this.auto() === '1' || this.auto() === 'true');
  protected readonly formatScore = formatScore;

  private engine: GameEngine | null = null;
  private audio: AudioEngine | null = null;
  private playId: string | null = null;
  private generation = 0;

  constructor() {
    afterNextRender(() => void this.load());
    inject(DestroyRef).onDestroy(() => this.teardown());
    // Move focus to the main action of whichever overlay is showing.
    afterRenderEffect(() => {
      this.state();
      this.host.nativeElement.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    });
  }

  protected async begin(): Promise<void> {
    const detail = this.detail();
    const audio = this.audio;
    if (this.state() !== 'ready' || !detail || !audio) return;
    this.state.set('starting');
    // Resume inside the click/key handler: browsers only allow starting audio from a user gesture.
    void audio.ctx.resume();
    const generation = this.generation;
    this.playId = null;
    this.message.set(null);
    if (!this.autoplay()) {
      try {
        this.playId = (await firstValueFrom(this.api.startPlay(detail.beatmap.id))).playId;
      } catch {
        this.message.set('The server is unreachable — this play will not be ranked.');
      }
    }
    if (generation !== this.generation) return;
    this.engine = new GameEngine(
      this.canvas().nativeElement,
      detail,
      audio,
      {
        autoplay: this.autoplay(),
        offsetMs: this.settings.offsetMs(),
        backgroundDim: this.settings.backgroundDim(),
      },
      {
        finished: (outcome) => void this.onFinished(outcome, generation),
        failed: () => this.state.set('failed'),
        skippable: (available) => this.canSkip.set(available),
      },
    );
    if (isDevMode()) {
      // Handy for poking at a running game from the console.
      (window as unknown as { tapwave?: unknown }).tapwave = this.engine;
    }
    try {
      await this.engine.start();
    } catch (error) {
      if (generation !== this.generation) return;
      this.message.set(error instanceof Error ? error.message : 'Could not start the audio.');
      this.state.set('error');
      return;
    }
    if (generation !== this.generation) return;
    this.state.set('playing');
    if (document.hidden) void this.pause();
  }

  protected async pause(): Promise<void> {
    if (this.state() !== 'playing' || !this.engine) return;
    await this.engine.pause();
    // The song may have ended (and started submitting) while the audio was being suspended.
    if (this.state() === 'playing' && this.engine?.paused) this.state.set('paused');
  }

  protected async resume(): Promise<void> {
    if (this.state() !== 'paused' || !this.engine) return;
    this.state.set('playing');
    await this.engine.resume();
  }

  protected skip(): void {
    this.engine?.skipIntro();
  }

  protected retry(): void {
    this.teardown();
    void this.load();
  }

  protected quit(): void {
    void this.router.navigate(['/'], { queryParams: { map: this.id() } });
  }

  protected onKeydown(event: KeyboardEvent): void {
    const state = this.state();
    if (event.key === 'Escape') {
      event.preventDefault();
      if (state === 'playing') void this.pause();
      else if (state === 'paused') void this.resume();
      else if (state !== 'starting' && state !== 'submitting') this.quit();
      return;
    }
    // Enter/Space on the focused Start button already click it; every other key starts too.
    const buttonKey =
      event.target instanceof HTMLButtonElement && (event.key === 'Enter' || event.key === ' ');
    if (state === 'ready' && !event.repeat && event.key !== 'Tab' && !buttonKey) {
      event.preventDefault();
      void this.begin();
    } else if (state === 'playing' && event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) this.skip();
    } else if (
      (state === 'results' || state === 'failed' || state === 'paused') &&
      event.code === 'KeyR'
    ) {
      this.retry();
    }
  }

  protected onVisibilityChange(): void {
    if (document.hidden) void this.pause();
  }

  private async load(): Promise<void> {
    const generation = ++this.generation;
    this.state.set('loading');
    this.result.set(null);
    this.message.set(null);
    let audio: AudioEngine | null = null;
    try {
      const id = Number(this.id());
      const cached = this.detail();
      const detail =
        cached?.beatmap.id === id ? cached : await firstValueFrom(this.api.beatmap(id));
      audio = new AudioEngine(this.settings.volume());
      await audio.load(detail.beatmap);
      if (generation !== this.generation) {
        void audio.destroy();
        return;
      }
      this.detail.set(detail);
      this.audio = audio;
      this.state.set('ready');
    } catch (error) {
      void audio?.destroy();
      if (generation !== this.generation) return;
      this.message.set(error instanceof Error ? error.message : 'Could not load this track.');
      this.state.set('error');
    }
  }

  private async onFinished(outcome: PlayOutcome, generation: number): Promise<void> {
    const detail = this.detail()!;
    const map = detail.beatmap;
    const local = calculateScore(
      detail.hitObjects,
      outcome.results,
      map.overallDifficulty,
      map.hpDrain,
    );
    if (
      isDevMode() &&
      (outcome.live.score !== local.totalScore || outcome.live.maxCombo !== local.maxCombo)
    ) {
      console.warn('Live score differs from the recomputed one', outcome.live, local);
    }
    const meanError = outcome.hitErrors.length
      ? outcome.hitErrors.reduce((sum, e) => sum + e, 0) / outcome.hitErrors.length
      : null;
    const base: ResultView = {
      ...local,
      verified: false,
      rank: null,
      personalBest: false,
      note: this.autoplay() ? 'Autoplay — not ranked.' : this.message(),
      meanError,
    };
    if (this.autoplay() || !this.playId) {
      this.result.set(base);
      this.state.set('results');
      return;
    }
    this.state.set('submitting');
    try {
      const server = await firstValueFrom(
        this.api.submitScore(this.playId, {
          playerName: this.settings.playerName().trim(),
          results: outcome.results,
        }),
      );
      if (generation !== this.generation) return;
      if (isDevMode() && server.totalScore !== local.totalScore) {
        console.warn('Server score differs from the client one', server, local);
      }
      this.result.set({ ...base, ...server, verified: true, note: null });
    } catch (error) {
      if (generation !== this.generation) return;
      const detailText = (error as { error?: { detail?: string } })?.error?.detail;
      this.result.set({
        ...base,
        note: `Score not saved: ${detailText ?? 'the server did not respond.'}`,
      });
    }
    this.state.set('results');
  }

  private teardown(): void {
    this.generation++;
    const devWindow = window as unknown as { tapwave?: unknown };
    if (devWindow.tapwave === this.engine) delete devWindow.tapwave;
    this.engine?.destroy();
    this.engine = null;
    this.canSkip.set(false);
    void this.audio?.destroy();
    this.audio = null;
  }
}
