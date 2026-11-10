package dev.tapwave.play;

import dev.tapwave.beatmap.Beatmap;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.domain.Persistable;

/** A started play. Its id is the token the client needs to submit a score. */
@Entity
@Table(name = "play_session")
public class PlaySession implements Persistable<UUID> {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "beatmap_id")
    private Beatmap beatmap;

    @Column(nullable = false, updatable = false)
    private Instant startedAt;

    private Instant submittedAt;

    /** The id is assigned up front, so Spring Data needs to be told this is an insert (otherwise it merges). */
    @Transient
    private boolean isNew = true;

    protected PlaySession() {
    }

    public PlaySession(Beatmap beatmap, Instant startedAt) {
        this.id = UUID.randomUUID();
        this.beatmap = beatmap;
        this.startedAt = startedAt;
    }

    @Override
    public UUID getId() {
        return id;
    }

    @Override
    public boolean isNew() {
        return isNew;
    }

    @PostLoad
    @PostPersist
    void markNotNew() {
        isNew = false;
    }

    public Beatmap getBeatmap() {
        return beatmap;
    }

    public Instant getStartedAt() {
        return startedAt;
    }

    public Instant getSubmittedAt() {
        return submittedAt;
    }
}
