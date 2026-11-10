package dev.tapwave.beatmap;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import org.hibernate.annotations.ColumnTransformer;

@Entity
@Table(name = "beatmap")
public class Beatmap {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String slug;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String artist;

    @Column(nullable = false)
    private String mapper;

    @Column(nullable = false)
    private String difficultyName;

    private double bpm;
    private int offsetMs;
    private double circleSize;
    private double approachRate;
    private double overallDifficulty;
    private double hpDrain;
    private int durationMs;
    private String audioUrl;
    private String audioSourceUrl;
    @Column(length = 60)
    private String audioLicense;
    private String audioLicenseUrl;
    private Long synthSeed;
    private double starRating;
    private int objectCount;
    private int maxCombo;

    /** Hit objects as JSON, see {@link HitObject}. Kept as text so the entity does not depend on a JSON mapper. */
    @Column(name = "hit_objects", columnDefinition = "jsonb", nullable = false)
    @ColumnTransformer(write = "?::jsonb")
    private String hitObjectsJson;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    protected Beatmap() {
    }

    public Beatmap(String slug, String title, String artist, String mapper, String difficultyName, double bpm,
                   int offsetMs, double circleSize, double approachRate, double overallDifficulty, double hpDrain,
                   int durationMs, String audioUrl, String audioSourceUrl, String audioLicense,
                   String audioLicenseUrl, Long synthSeed, double starRating, int objectCount, int maxCombo,
                   String hitObjectsJson) {
        this.slug = slug;
        this.title = title;
        this.artist = artist;
        this.mapper = mapper;
        this.difficultyName = difficultyName;
        this.bpm = bpm;
        this.offsetMs = offsetMs;
        this.circleSize = circleSize;
        this.approachRate = approachRate;
        this.overallDifficulty = overallDifficulty;
        this.hpDrain = hpDrain;
        this.durationMs = durationMs;
        this.audioUrl = audioUrl;
        this.audioSourceUrl = audioSourceUrl;
        this.audioLicense = audioLicense;
        this.audioLicenseUrl = audioLicenseUrl;
        this.synthSeed = synthSeed;
        this.starRating = starRating;
        this.objectCount = objectCount;
        this.maxCombo = maxCombo;
        this.hitObjectsJson = hitObjectsJson;
        this.createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public String getSlug() {
        return slug;
    }

    public String getTitle() {
        return title;
    }

    public String getArtist() {
        return artist;
    }

    public String getMapper() {
        return mapper;
    }

    public String getDifficultyName() {
        return difficultyName;
    }

    public double getBpm() {
        return bpm;
    }

    public int getOffsetMs() {
        return offsetMs;
    }

    public double getCircleSize() {
        return circleSize;
    }

    public double getApproachRate() {
        return approachRate;
    }

    public double getOverallDifficulty() {
        return overallDifficulty;
    }

    public double getHpDrain() {
        return hpDrain;
    }

    public int getDurationMs() {
        return durationMs;
    }

    public String getAudioUrl() {
        return audioUrl;
    }

    public String getAudioSourceUrl() {
        return audioSourceUrl;
    }

    public String getAudioLicense() {
        return audioLicense;
    }

    public String getAudioLicenseUrl() {
        return audioLicenseUrl;
    }

    public Long getSynthSeed() {
        return synthSeed;
    }

    public double getStarRating() {
        return starRating;
    }

    public int getObjectCount() {
        return objectCount;
    }

    public int getMaxCombo() {
        return maxCombo;
    }

    public String getHitObjectsJson() {
        return hitObjectsJson;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
