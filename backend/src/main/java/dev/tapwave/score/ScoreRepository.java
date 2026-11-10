package dev.tapwave.score;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ScoreRepository extends JpaRepository<Score, Long> {

    @Query("select max(s.totalScore) from Score s where s.beatmap.id = :beatmapId and s.player.id = :playerId")
    Optional<Long> findBestTotal(@Param("beatmapId") long beatmapId, @Param("playerId") long playerId);
}
