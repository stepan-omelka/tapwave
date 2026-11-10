package dev.tapwave.score;

import dev.tapwave.beatmap.Beatmap;
import dev.tapwave.gameplay.CalculatedScore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "score")
public class Score {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "beatmap_id")
    private Beatmap beatmap;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "player_id")
    private Player player;

    @Column(name = "play_session_id", nullable = false, unique = true, updatable = false)
    private UUID playSessionId;

    private long totalScore;
    private int maxCombo;

    @Column(precision = 5, scale = 2, nullable = false)
    private BigDecimal accuracy;

    @Column(name = "count300")
    private int count300;

    @Column(name = "count100")
    private int count100;

    @Column(name = "count50")
    private int count50;

    @Column(name = "count_miss")
    private int countMiss;

    @Column(nullable = false, length = 2)
    private String grade;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    protected Score() {
    }

    public Score(Beatmap beatmap, Player player, UUID playSessionId, CalculatedScore result, Instant createdAt) {
        this.beatmap = beatmap;
        this.player = player;
        this.playSessionId = playSessionId;
        this.totalScore = result.totalScore();
        this.maxCombo = result.maxCombo();
        this.accuracy = BigDecimal.valueOf(result.accuracy()).setScale(2, RoundingMode.HALF_UP);
        this.count300 = result.count300();
        this.count100 = result.count100();
        this.count50 = result.count50();
        this.countMiss = result.countMiss();
        this.grade = result.grade();
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public Beatmap getBeatmap() {
        return beatmap;
    }

    public Player getPlayer() {
        return player;
    }

    public UUID getPlaySessionId() {
        return playSessionId;
    }

    public long getTotalScore() {
        return totalScore;
    }

    public int getMaxCombo() {
        return maxCombo;
    }

    public BigDecimal getAccuracy() {
        return accuracy;
    }

    public int getCount300() {
        return count300;
    }

    public int getCount100() {
        return count100;
    }

    public int getCount50() {
        return count50;
    }

    public int getCountMiss() {
        return countMiss;
    }

    public String getGrade() {
        return grade;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
