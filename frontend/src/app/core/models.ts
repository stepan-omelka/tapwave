export interface BeatmapSummary {
  id: number;
  slug: string;
  title: string;
  artist: string;
  mapper: string;
  difficultyName: string;
  bpm: number;
  offsetMs: number;
  circleSize: number;
  approachRate: number;
  overallDifficulty: number;
  hpDrain: number;
  durationMs: number;
  starRating: number;
  objectCount: number;
  maxCombo: number;
  audioUrl: string | null;
  /** Where the song is published; set for songs from audio files. */
  audioSourceUrl: string | null;
  audioLicense: string | null;
  audioLicenseUrl: string | null;
  synthSeed: number | null;
}

export interface PathPoint {
  x: number;
  y: number;
}

export type SliderPartKind = 'tick' | 'repeat' | 'tail';

export interface SliderPart {
  time: number;
  kind: SliderPartKind;
}

export interface SliderShape {
  curve: 'linear' | 'bezier';
  points: PathPoint[];
  slides: number;
  spanDuration: number;
  parts: SliderPart[];
}

export type HitObjectType = 'circle' | 'slider' | 'spinner';

export interface HitObject {
  type: HitObjectType;
  time: number;
  x: number;
  y: number;
  newCombo: boolean;
  comboNumber: number;
  colorIndex: number;
  endTime?: number;
  slider?: SliderShape;
}

export interface BeatmapDetail {
  beatmap: BeatmapSummary;
  hitObjects: HitObject[];
}

/** What the player did with one object; see ObjectResult.java. */
export interface ObjectResult {
  offset?: number | null;
  parts?: boolean[];
  spins?: number;
}

export interface StartPlayResponse {
  playId: string;
  startedAt: string;
}

export interface SubmitScoreRequest {
  playerName: string;
  results: ObjectResult[];
}

export interface SubmitScoreResponse {
  scoreId: number;
  totalScore: number;
  maxCombo: number;
  accuracy: number;
  count300: number;
  count100: number;
  count50: number;
  countMiss: number;
  grade: string;
  rank: number;
  personalBest: boolean;
}

export interface LeaderboardEntry {
  rank: number;
  scoreId: number;
  playerName: string;
  totalScore: number;
  maxCombo: number;
  accuracy: number;
  grade: string;
  count300: number;
  count100: number;
  count50: number;
  countMiss: number;
  createdAt: string;
}

export interface RecentScore {
  scoreId: number;
  playerName: string;
  beatmapId: number;
  beatmapTitle: string;
  difficultyName: string;
  totalScore: number;
  accuracy: number;
  grade: string;
  createdAt: string;
}
