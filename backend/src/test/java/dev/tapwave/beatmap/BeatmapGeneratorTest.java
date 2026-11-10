package dev.tapwave.beatmap;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.tapwave.beatmap.generator.BeatmapGenerator;
import dev.tapwave.beatmap.generator.MapSpec;
import dev.tapwave.gameplay.Difficulty;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class BeatmapGeneratorTest {

    private final BeatmapGenerator generator = new BeatmapGenerator();

    private static MapSpec spec(int level) {
        return new MapSpec("test-" + level, "Test", "Tester", null, "Lvl " + level, 100 + level * 20, 0, 40, level,
                4, 8, 7, 5, 42L, null, null, null, null, null, null);
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2, 3, 4})
    void objectsNeverOverlapInTimeAndStayOnThePlayfield(int level) {
        var map = generator.generate(spec(level));
        double radius = Difficulty.circleRadius(4);

        int previousEnd = -1;
        for (HitObject object : map.objects()) {
            assertThat(object.time()).isGreaterThan(previousEnd);
            previousEnd = object.finishTime();
            assertThat(object.x()).isBetween((int) radius, Difficulty.PLAYFIELD_WIDTH - (int) radius);
            assertThat(object.y()).isBetween((int) radius, Difficulty.PLAYFIELD_HEIGHT - (int) radius);
            if (object.is(HitObject.SLIDER)) {
                assertThat(object.slider().parts()).isNotEmpty();
                assertThat(object.slider().parts().getLast().time()).isEqualTo(object.endTime());
                object.slider().points().forEach(p -> {
                    assertThat(p.x()).isBetween(0, Difficulty.PLAYFIELD_WIDTH);
                    assertThat(p.y()).isBetween(0, Difficulty.PLAYFIELD_HEIGHT);
                });
            }
        }
        assertThat(map.objects().getLast().is(HitObject.SPINNER)).isTrue();
        assertThat(map.durationMs()).isEqualTo(map.objects().getLast().finishTime());
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 4})
    void sameSeedGivesTheSameMap(int level) {
        assertThat(generator.generate(spec(level))).isEqualTo(generator.generate(spec(level)));
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2, 3, 4})
    void harderLevelsAreDenser(int level) {
        if (level == 1) {
            return;
        }
        var easier = generator.generate(spec(level - 1));
        var harder = generator.generate(spec(level));
        assertThat(harder.objects().size()).isGreaterThan(easier.objects().size());
        assertThat(harder.starRating()).isGreaterThan(easier.starRating());
    }

    private static MapSpec songSpec(List<String> breaks, String license) {
        return new MapSpec("song", "Song", "Band", null, "Hard", 120, 250, 40, 3, 4, 8, 7, 5, 42L,
                "/audio/song.mp3", breaks, "https://example.org/song", license, null, null);
    }

    @Test
    void explicitBreaksStayEmptyAndReplaceTheEvery16thBarRest() {
        double barLength = 4 * 60000.0 / 120;
        var map = generator.generate(songSpec(List.of("1-3", "20"), "CC0 1.0"));

        for (HitObject object : map.objects()) {
            int startBar = (int) Math.floor((object.time() - 250) / barLength);
            // Sliders and spinners must not reach into a break either (circles have no length).
            int endBar = object.finishTime() == object.time()
                    ? startBar : (int) Math.floor((object.finishTime() - 1 - 250) / barLength);
            assertThat(startBar).as("object at %d ms", object.time()).isNotIn(0, 1, 2, 3, 20);
            assertThat(endBar).as("object ending at %d ms", object.finishTime()).isNotIn(0, 1, 2, 3, 20);
        }
        assertThat(map.objects().getFirst().time()).isEqualTo(250 + (int) Math.round(4 * barLength));
        // No automatic rest (a spinner at this level) in bar 16 or 32: only the closing spinner remains.
        assertThat(map.objects().stream().filter(o -> o.is(HitObject.SPINNER))).hasSize(1);
        assertThat(map.objects().getLast().is(HitObject.SPINNER)).isTrue();
    }

    @Test
    void songsFromAudioFilesMustNameTheirLicense() {
        assertThatThrownBy(() -> songSpec(List.of(), null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("license");
        assertThatThrownBy(() -> new MapSpec("song", "Song", "Band", null, "Hard", 120, 0, 40, 3, 4, 8, 7, 5, 42L,
                "/audio/song.mp3", null, " ", "CC0 1.0", null, null))
                .hasMessageContaining("source-url");
    }

    @ParameterizedTest
    @ValueSource(strings = {"0-2", "39", "12-10", "verse"})
    void rejectsBreaksOutsideTheMapOrMalformed(String range) {
        assertThatThrownBy(() -> songSpec(List.of(range), "CC0 1.0"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining(range);
    }
}
