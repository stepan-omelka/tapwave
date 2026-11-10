package dev.tapwave.score;

import dev.tapwave.beatmap.BeatmapService;
import dev.tapwave.score.LeaderboardQueries.LeaderboardEntry;
import dev.tapwave.score.LeaderboardQueries.RecentScore;
import dev.tapwave.score.ScoreDtos.StartPlayResponse;
import dev.tapwave.score.ScoreDtos.SubmitScoreRequest;
import dev.tapwave.score.ScoreDtos.SubmitScoreResponse;
import jakarta.validation.Valid;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
class PlayController {

    private static final int MAX_LIMIT = 100;

    private final ScoreService scoreService;
    private final BeatmapService beatmapService;
    private final LeaderboardQueries leaderboardQueries;

    PlayController(ScoreService scoreService, BeatmapService beatmapService, LeaderboardQueries leaderboardQueries) {
        this.scoreService = scoreService;
        this.beatmapService = beatmapService;
        this.leaderboardQueries = leaderboardQueries;
    }

    /** Issues the token a score must be submitted with. Called when the song starts. */
    @PostMapping("/beatmaps/{beatmapId}/plays")
    @ResponseStatus(HttpStatus.CREATED)
    StartPlayResponse startPlay(@PathVariable long beatmapId) {
        return scoreService.startPlay(beatmapId);
    }

    @PostMapping("/plays/{playId}/score")
    @ResponseStatus(HttpStatus.CREATED)
    SubmitScoreResponse submit(@PathVariable UUID playId, @Valid @RequestBody SubmitScoreRequest request) {
        return scoreService.submit(playId, request);
    }

    @GetMapping("/beatmaps/{beatmapId}/leaderboard")
    List<LeaderboardEntry> leaderboard(@PathVariable long beatmapId, @RequestParam(defaultValue = "50") int limit) {
        beatmapService.get(beatmapId);
        return leaderboardQueries.leaderboard(beatmapId, Math.clamp(limit, 1, MAX_LIMIT));
    }

    @GetMapping("/scores/recent")
    List<RecentScore> recent(@RequestParam(defaultValue = "10") int limit) {
        return leaderboardQueries.recent(Math.clamp(limit, 1, MAX_LIMIT));
    }
}
