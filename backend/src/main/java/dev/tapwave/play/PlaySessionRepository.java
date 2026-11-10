package dev.tapwave.play;

import java.time.Instant;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PlaySessionRepository extends JpaRepository<PlaySession, UUID> {

    /**
     * Atomically claims a session for submission.
     *
     * @return 1 if this call claimed it, 0 if it had already been submitted
     */
    @Modifying
    @Query("update PlaySession p set p.submittedAt = :now where p.id = :id and p.submittedAt is null")
    int markSubmitted(@Param("id") UUID id, @Param("now") Instant now);

    /** Deletes sessions older than {@code cutoff} that never produced a score. */
    @Modifying
    @Query("""
            delete from PlaySession p
            where p.startedAt < :cutoff
              and not exists (select 1 from Score s where s.playSessionId = p.id)
            """)
    int deleteUnscoredBefore(@Param("cutoff") Instant cutoff);
}
