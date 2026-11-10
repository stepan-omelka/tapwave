package dev.tapwave.score;

import dev.tapwave.beatmap.Beatmap;
import dev.tapwave.beatmap.BeatmapService;
import dev.tapwave.beatmap.HitObject;
import dev.tapwave.config.TapwaveProperties;
import dev.tapwave.gameplay.CalculatedScore;
import dev.tapwave.gameplay.HumanTimingCheck;
import dev.tapwave.gameplay.InvalidPlayException;
import dev.tapwave.gameplay.ScoreCalculator;
import dev.tapwave.play.PlaySession;
import dev.tapwave.play.PlaySessionRepository;
import dev.tapwave.score.ScoreDtos.StartPlayResponse;
import dev.tapwave.score.ScoreDtos.SubmitScoreRequest;
import dev.tapwave.score.ScoreDtos.SubmitScoreResponse;
import dev.tapwave.web.ConflictException;
import dev.tapwave.web.NotFoundException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ScoreService {

    private final BeatmapService beatmapService;
    private final PlaySessionRepository sessions;
    private final PlayerRepository players;
    private final ScoreRepository scores;
    private final LeaderboardQueries leaderboardQueries;
    private final ScoreCalculator calculator;
    private final TapwaveProperties.Play playRules;
    private final Clock clock;

    public ScoreService(BeatmapService beatmapService, PlaySessionRepository sessions, PlayerRepository players,
                        ScoreRepository scores, LeaderboardQueries leaderboardQueries, ScoreCalculator calculator,
                        TapwaveProperties properties, Clock clock) {
        this.beatmapService = beatmapService;
        this.sessions = sessions;
        this.players = players;
        this.scores = scores;
        this.leaderboardQueries = leaderboardQueries;
        this.calculator = calculator;
        this.playRules = properties.play();
        this.clock = clock;
    }

    @Transactional
    public StartPlayResponse startPlay(long beatmapId) {
        Beatmap beatmap = beatmapService.get(beatmapId);
        PlaySession session = sessions.save(new PlaySession(beatmap, clock.instant()));
        return new StartPlayResponse(session.getId(), session.getStartedAt());
    }

    /**
     * Validates and stores a play. Rejections still commit: the token is claimed first, so one token cannot be
     * used to probe the validator with variations of the same play.
     */
    @Transactional(noRollbackFor = InvalidPlayException.class)
    public SubmitScoreResponse submit(UUID playId, SubmitScoreRequest request) {
        PlaySession session = sessions.findById(playId)
                .orElseThrow(() -> new NotFoundException("Unknown play " + playId));
        Instant now = clock.instant();
        if (session.getSubmittedAt() != null || sessions.markSubmitted(playId, now) == 0) {
            throw new ConflictException("This play has already been submitted");
        }
        Beatmap beatmap = session.getBeatmap();
        List<HitObject> objects = beatmapService.hitObjects(beatmap);
        checkTiming(session, objects, now);

        CalculatedScore result = calculator.calculate(objects, request.results(), beatmap.getOverallDifficulty(),
                beatmap.getHpDrain());
        if (result.failed()) {
            throw new InvalidPlayException("Failed plays are not ranked");
        }
        HumanTimingCheck.requirePlausible(request.results());

        Player player = findOrCreatePlayer(request.playerName().strip());
        long previousBest = scores.findBestTotal(beatmap.getId(), player.getId()).orElse(-1L);
        Score score = scores.save(new Score(beatmap, player, playId, result, now));

        int rank = leaderboardQueries.rankOf(beatmap.getId(), player.getId());
        return new SubmitScoreResponse(score.getId(), result.totalScore(), result.maxCombo(),
                score.getAccuracy().doubleValue(), result.count300(), result.count100(), result.count50(),
                result.countMiss(), result.grade(), rank, score.getTotalScore() > previousBest);
    }

    /** Rejects stale tokens and scores submitted faster than the map could have been played. */
    private void checkTiming(PlaySession session, List<HitObject> objects, Instant now) {
        Duration elapsed = Duration.between(session.getStartedAt(), now);
        if (elapsed.compareTo(playRules.maxAge()) > 0) {
            throw new InvalidPlayException("This play token has expired");
        }
        if (objects.isEmpty()) {
            return;
        }
        long playableMs = objects.getLast().finishTime() - objects.getFirst().time();
        if (elapsed.toMillis() < playableMs * playRules.minDurationRatio()) {
            throw new InvalidPlayException("Score submitted faster than the map can be played");
        }
    }

    private Player findOrCreatePlayer(String name) {
        players.insertIfMissing(name);
        return players.findByNameIgnoreCase(name)
                .orElseThrow(() -> new IllegalStateException("Player " + name + " vanished after insert"));
    }
}
