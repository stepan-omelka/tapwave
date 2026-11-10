package dev.tapwave.score;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PlayerRepository extends JpaRepository<Player, Long> {

    /** Race-free "create if missing": two parallel first submissions under the same name cannot both insert. */
    @Modifying
    @Query(value = "insert into player (name) values (:name) on conflict ((lower(name))) do nothing", nativeQuery = true)
    void insertIfMissing(@Param("name") String name);

    @Query("select p from Player p where lower(p.name) = lower(:name)")
    Optional<Player> findByNameIgnoreCase(@Param("name") String name);
}
