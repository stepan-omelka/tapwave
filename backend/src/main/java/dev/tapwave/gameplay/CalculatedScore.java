package dev.tapwave.gameplay;

/**
 * @param accuracy percentage 0-100, not rounded
 * @param failed   HP dropped to zero at some point; such plays are not ranked
 */
public record CalculatedScore(
        long totalScore,
        int maxCombo,
        double accuracy,
        int count300,
        int count100,
        int count50,
        int countMiss,
        String grade,
        boolean failed) {
}
