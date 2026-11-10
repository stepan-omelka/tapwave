import { computed, effect, Service, signal } from '@angular/core';

const STORAGE_KEY = 'tapwave.settings';
export const PLAYER_NAME_PATTERN = /^[\p{L}\p{N} _.-]{1,24}$/u;

interface StoredSettings {
  playerName: string;
  volume: number;
  offsetMs: number;
  backgroundDim: number;
}

const DEFAULTS: StoredSettings = { playerName: '', volume: 0.7, offsetMs: 0, backgroundDim: 0.3 };

/** Player preferences, persisted to localStorage. */
@Service()
export class SettingsService {
  readonly playerName = signal(DEFAULTS.playerName);
  readonly volume = signal(DEFAULTS.volume);
  readonly offsetMs = signal(DEFAULTS.offsetMs);
  readonly backgroundDim = signal(DEFAULTS.backgroundDim);

  readonly playerNameValid = computed(() => PLAYER_NAME_PATTERN.test(this.playerName().trim()));

  constructor() {
    const stored = readStored();
    this.playerName.set(stored.playerName);
    this.volume.set(stored.volume);
    this.offsetMs.set(stored.offsetMs);
    this.backgroundDim.set(stored.backgroundDim);

    effect(() => {
      const value: StoredSettings = {
        playerName: this.playerName(),
        volume: this.volume(),
        offsetMs: this.offsetMs(),
        backgroundDim: this.backgroundDim(),
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        // Storage can be unavailable (private mode); settings then last for the session only.
      }
    });
  }
}

function readStored(): StoredSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<StoredSettings>;
    return {
      playerName:
        typeof parsed.playerName === 'string'
          ? parsed.playerName.slice(0, 24)
          : DEFAULTS.playerName,
      volume: clampNumber(parsed.volume, 0, 1, DEFAULTS.volume),
      offsetMs: clampNumber(parsed.offsetMs, -300, 300, DEFAULTS.offsetMs),
      backgroundDim: clampNumber(parsed.backgroundDim, 0, 1, DEFAULTS.backgroundDim),
    };
  } catch {
    return DEFAULTS;
  }
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;
}
