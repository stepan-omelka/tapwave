import { DecimalPipe } from '@angular/common';
import { httpResource } from '@angular/common/http';
import { Component, computed, ElementRef, inject, input, linkedSignal, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { BeatmapSummary, LeaderboardEntry, RecentScore } from '../../core/models';
import { SettingsService } from '../../core/settings.service';
import { formatDuration } from '../../core/format';

@Component({
  selector: 'app-song-select',
  imports: [DecimalPipe],
  templateUrl: './song-select.html',
  styleUrl: './song-select.scss',
  host: { '(window:keydown)': 'onKeydown($event)' },
})
export class SongSelect {
  private readonly router = inject(Router);
  protected readonly settings = inject(SettingsService);

  /** Pre-selected map, e.g. when coming back from a play (?map=3). */
  readonly map = input<string>();

  protected readonly beatmaps = httpResource<BeatmapSummary[]>(() => '/api/beatmaps', { defaultValue: [] });
  protected readonly recent = httpResource<RecentScore[]>(() => '/api/scores/recent?limit=8', { defaultValue: [] });

  protected readonly selectedId = linkedSignal(() => Number(this.map()) || null);
  protected readonly selected = computed(() => {
    const maps = this.beatmaps.value();
    return maps.find((m) => m.id === this.selectedId()) ?? maps[0] ?? null;
  });
  protected readonly leaderboard = httpResource<LeaderboardEntry[]>(
    () => {
      const map = this.selected();
      return map ? `/api/beatmaps/${map.id}/leaderboard?limit=20` : undefined;
    },
    { defaultValue: [] },
  );

  protected readonly settingsOpen = signal(false);
  protected readonly nameTouched = signal(false);
  protected readonly showNameError = computed(() => this.nameTouched() && !this.settings.playerNameValid());

  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');

  protected readonly formatDuration = formatDuration;
  protected readonly accents = ['var(--cyan)', 'var(--mint)', 'var(--amber)', 'var(--violet)'];

  protected readonly stats = computed(() => {
    const map = this.selected();
    if (!map) return [];
    return [
      { key: 'CS', label: 'Circle size', value: map.circleSize },
      { key: 'AR', label: 'Approach rate', value: map.approachRate },
      { key: 'OD', label: 'Timing strictness', value: map.overallDifficulty },
      { key: 'HP', label: 'HP drain', value: map.hpDrain },
    ];
  });

  protected select(map: BeatmapSummary): void {
    this.selectedId.set(map.id);
  }

  protected play(autoplay: boolean): void {
    const map = this.selected();
    if (!map) return;
    if (!autoplay && !this.settings.playerNameValid()) {
      this.nameTouched.set(true);
      this.nameInput().nativeElement.focus();
      return;
    }
    void this.router.navigate(['/play', map.id], { queryParams: autoplay ? { auto: 1 } : {} });
  }

  protected onNameInput(event: Event): void {
    this.settings.playerName.set((event.target as HTMLInputElement).value);
  }

  protected onRange(setting: 'volume' | 'offsetMs' | 'backgroundDim', event: Event): void {
    this.settings[setting].set(Number((event.target as HTMLInputElement).value));
  }

  protected onKeydown(event: KeyboardEvent): void {
    const tag = (event.target as HTMLElement | null)?.tagName ?? '';
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    const maps = this.beatmaps.value();
    const current = this.selected();
    if (!current || maps.length === 0) return;
    const index = maps.indexOf(current);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = maps[(index + (event.key === 'ArrowDown' ? 1 : maps.length - 1)) % maps.length];
      this.selectedId.set(next.id);
    } else if (event.key === 'Enter' && tag !== 'BUTTON') {
      this.play(false);
    }
  }

  protected stars(rating: number): number[] {
    return Array.from({ length: Math.min(10, Math.ceil(rating)) }, (_, i) => Math.min(1, rating - i));
  }
}
