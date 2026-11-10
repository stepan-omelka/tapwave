package dev.tapwave.score;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

/** Read-side queries that are easier to express in plain PostgreSQL than in JPQL. */
@Repository
public class LeaderboardQueries {

    public record LeaderboardEntry(
            int rank,
            long scoreId,
            String playerName,
            long totalScore,
            int maxCombo,
            BigDecimal accuracy,
            String grade,
            int count300,
            int count100,
            int count50,
            int countMiss,
            OffsetDateTime createdAt) {
    }

    public record RecentScore(
            long scoreId,
            String playerName,
            long beatmapId,
            String beatmapTitle,
            String difficultyName,
            long totalScore,
            BigDecimal accuracy,
            String grade,
            OffsetDateTime createdAt) {
    }

    private final JdbcClient jdbc;

    public LeaderboardQueries(JdbcClient jdbc) {
        this.jdbc = jdbc;
    }

    /** Each player's best score on the map; ties go to whoever set it first. */
    public List<LeaderboardEntry> leaderboard(long beatmapId, int limit) {
        return jdbc.sql("""
                        select row_number() over (order by best.total_score desc, best.created_at) as rank,
                               best.id as score_id, best.player_name, best.total_score, best.max_combo,
                               best.accuracy, best.grade, best.count300, best.count100, best.count50,
                               best.count_miss, best.created_at
                        from (select distinct on (s.player_id) s.*, p.name as player_name
                              from score s
                              join player p on p.id = s.player_id
                              where s.beatmap_id = :beatmapId
                              order by s.player_id, s.total_score desc, s.created_at) best
                        order by best.total_score desc, best.created_at
                        limit :limit
                        """)
                .param("beatmapId", beatmapId)
                .param("limit", limit)
                .query(LeaderboardEntry.class)
                .list();
    }

    /**
     * 1-based position of a player's best score, ranked exactly like {@link #leaderboard} (ties go to whoever
     * set the score first), so the results screen and the leaderboard never disagree.
     */
    public int rankOf(long beatmapId, long playerId) {
        return jdbc.sql("""
                        select ranked.rank
                        from (select best.player_id,
                                     row_number() over (order by best.total_score desc, best.created_at) as rank
                              from (select distinct on (s.player_id) s.player_id, s.total_score, s.created_at
                                    from score s
                                    where s.beatmap_id = :beatmapId
                                    order by s.player_id, s.total_score desc, s.created_at) best) ranked
                        where ranked.player_id = :playerId
                        """)
                .param("beatmapId", beatmapId)
                .param("playerId", playerId)
                .query(Integer.class)
                .single();
    }

    public List<RecentScore> recent(int limit) {
        return jdbc.sql("""
                        select s.id as score_id, p.name as player_name, b.id as beatmap_id,
                               b.title as beatmap_title, b.difficulty_name, s.total_score, s.accuracy,
                               s.grade, s.created_at
                        from score s
                        join player p on p.id = s.player_id
                        join beatmap b on b.id = s.beatmap_id
                        order by s.created_at desc
                        limit :limit
                        """)
                .param("limit", limit)
                .query(RecentScore.class)
                .list();
    }
}
