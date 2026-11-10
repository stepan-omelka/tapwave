package dev.tapwave.beatmap;

public record BeatmapSummary(
        long id,
        String slug,
        String title,
        String artist,
        String mapper,
        String difficultyName,
        double bpm,
        int offsetMs,
        double circleSize,
        double approachRate,
        double overallDifficulty,
        double hpDrain,
        int durationMs,
        double starRating,
        int objectCount,
        int maxCombo,
        String audioUrl,
        String audioSourceUrl,
        String audioLicense,
        String audioLicenseUrl,
        Long synthSeed) {

    static BeatmapSummary of(Beatmap b) {
        return new BeatmapSummary(b.getId(), b.getSlug(), b.getTitle(), b.getArtist(), b.getMapper(),
                b.getDifficultyName(), b.getBpm(), b.getOffsetMs(), b.getCircleSize(), b.getApproachRate(),
                b.getOverallDifficulty(), b.getHpDrain(), b.getDurationMs(), b.getStarRating(), b.getObjectCount(),
                b.getMaxCombo(), b.getAudioUrl(), b.getAudioSourceUrl(), b.getAudioLicense(), b.getAudioLicenseUrl(),
                b.getSynthSeed());
    }
}
