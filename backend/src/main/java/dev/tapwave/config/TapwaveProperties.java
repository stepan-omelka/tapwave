package dev.tapwave.config;

import dev.tapwave.beatmap.generator.MapSpec;
import java.time.Duration;
import java.util.List;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("tapwave")
public record TapwaveProperties(Play play, Seed seed) {

    public TapwaveProperties {
        if (play == null) {
            play = new Play(null, null);
        }
        if (seed == null) {
            seed = new Seed(List.of());
        }
    }

    /**
     * @param maxAge           how long a play token stays valid
     * @param minDurationRatio share of the map's playable length that must pass before a score is accepted
     */
    public record Play(Duration maxAge, Double minDurationRatio) {

        public Play {
            // Each default applies on its own, so setting only one key does not null out the other.
            if (maxAge == null) {
                maxAge = Duration.ofHours(2);
            }
            if (minDurationRatio == null) {
                minDurationRatio = 0.9;
            }
        }
    }

    public record Seed(List<MapSpec> maps) {

        public Seed {
            maps = maps == null ? List.of() : List.copyOf(maps);
        }
    }
}
