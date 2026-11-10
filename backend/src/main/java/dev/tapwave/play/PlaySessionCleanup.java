package dev.tapwave.play;

import dev.tapwave.config.TapwaveProperties;
import java.time.Clock;
import java.time.Duration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Play tokens are created on every song start; expired ones without a score are useless and get removed. */
@Component
class PlaySessionCleanup {

    private static final Logger log = LoggerFactory.getLogger(PlaySessionCleanup.class);

    private final PlaySessionRepository sessions;
    private final Duration maxAge;
    private final Clock clock;

    PlaySessionCleanup(PlaySessionRepository sessions, TapwaveProperties properties, Clock clock) {
        this.sessions = sessions;
        this.maxAge = properties.play().maxAge();
        this.clock = clock;
    }

    @Scheduled(initialDelayString = "PT1M", fixedDelayString = "PT10M")
    @Transactional
    void purgeExpired() {
        int deleted = sessions.deleteUnscoredBefore(clock.instant().minus(maxAge));
        if (deleted > 0) {
            log.info("Removed {} expired play sessions", deleted);
        }
    }
}
