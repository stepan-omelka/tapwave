package dev.tapwave.beatmap;

import java.util.List;

public record BeatmapDetail(BeatmapSummary beatmap, List<HitObject> hitObjects) {
}
