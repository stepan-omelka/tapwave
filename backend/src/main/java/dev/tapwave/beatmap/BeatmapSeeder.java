package dev.tapwave.beatmap;

import dev.tapwave.beatmap.generator.MapSpec;
import dev.tapwave.config.TapwaveProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

/** Generates the maps listed under {@code tapwave.seed.maps} that are not in the database yet. */
@Component
class BeatmapSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(BeatmapSeeder.class);

    private final BeatmapService beatmapService;
    private final TapwaveProperties properties;

    BeatmapSeeder(BeatmapService beatmapService, TapwaveProperties properties) {
        this.beatmapService = beatmapService;
        this.properties = properties;
    }

    @Override
    public void run(ApplicationArguments args) {
        for (MapSpec spec : properties.seed().maps()) {
            if (beatmapService.createIfMissing(spec)) {
                log.info("Generated beatmap '{}' ({})", spec.title(), spec.difficultyName());
            }
        }
    }
}
