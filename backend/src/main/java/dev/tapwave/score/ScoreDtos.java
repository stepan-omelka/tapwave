package dev.tapwave.score;

import dev.tapwave.gameplay.ObjectResult;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ScoreDtos {

    private ScoreDtos() {
    }

    public record StartPlayResponse(UUID playId, Instant startedAt) {
    }

    public record SubmitScoreRequest(
            @NotBlank
            @Size(max = 24)
            @Pattern(regexp = "[\\p{L}\\p{N} _.\\-]+", message = "may only contain letters, digits, spaces and _ . -")
            String playerName,
            @NotNull
            @Size(max = 10_000)
            List<ObjectResult> results) {
    }

    /** What the server made of the play; the client shows these numbers, not its own. */
    public record SubmitScoreResponse(
            long scoreId,
            long totalScore,
            int maxCombo,
            double accuracy,
            int count300,
            int count100,
            int count50,
            int countMiss,
            String grade,
            int rank,
            boolean personalBest) {
    }
}
