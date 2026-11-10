package dev.tapwave.beatmap;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BeatmapRepository extends JpaRepository<Beatmap, Long> {

    boolean existsBySlug(String slug);

    List<Beatmap> findAllByOrderByStarRatingAsc();
}
