package dev.tapwave.beatmap.generator;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.tapwave.beatmap.HitObject;
import java.util.List;
import java.util.function.IntUnaryOperator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class OnsetPlacementTest {

    /** 120 BPM from 0 ms: a quarter-beat slot is exactly 125 ms. */
    private static final double SLOT_MS = 125;
    private static final int BARS = 40;

    private final BeatmapGenerator generator = new BeatmapGenerator();

    private static MapSpec spec(int level, List<String> breaks) {
        return new MapSpec("onsets-" + level, "Song", "Band", null, "Lvl " + level, 120, 0, BARS, level,
                4, 8, 7, 5, 7L, "/audio/song.mp3", breaks, "https://example.org/song", "CC0 1.0", null,
                "rhythm/song.txt");
    }

    /** One line of 16 hex digits per bar; {@code strength} maps a slot (from bar 0) to a digit 0-15. */
    private static Rhythm rhythm(IntUnaryOperator strength) {
        var text = new StringBuilder("# test rhythm\n");
        for (int bar = 0; bar < BARS; bar++) {
            for (int i = 0; i < 16; i++) {
                text.append(Integer.toHexString(strength.applyAsInt(bar * 16 + i)));
            }
            text.append('\n');
        }
        return Rhythm.parse(text.toString());
    }

    /** Kicks on the beats, weaker off-beats, a silent stretch in bars 12-19, faint noise (below the floor) everywhere. */
    private static final Rhythm SONG = rhythm(slot -> {
        int bar = slot / 16;
        if (bar >= 12 && bar <= 19) {
            return 2;
        }
        if (slot % 4 == 0) {
            return 15;
        }
        if (slot % 2 == 0) {
            return 9;
        }
        return bar % 3 == 0 ? 7 : 3;
    });

    private static int slotOf(int timeMs) {
        double slot = timeMs / SLOT_MS;
        assertThat(slot).as("object at %d ms is on the quarter-beat grid", timeMs).isCloseTo(Math.rint(slot),
                org.assertj.core.data.Offset.offset(0.01));
        return (int) Math.rint(slot);
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2, 3, 4})
    void notesOnlyGoWhereTheSongHasOnsetsAndQuietBarsStayEmpty(int level) {
        var map = generator.generate(spec(level, List.of()), SONG);
        var notes = map.objects().subList(0, map.objects().size() - 1);

        assertThat(notes).isNotEmpty();
        for (HitObject object : notes) {
            int slot = slotOf(object.time());
            assertThat(SONG.at(slot)).as("strength at slot %d", slot).isGreaterThanOrEqualTo(OnsetPlacement.MIN_STRENGTH);
            assertThat(slot / 16).as("bar of the object at %d ms", object.time()).isNotIn(0, 12, 13, 14, 15, 16, 17, 18, 19);
        }
        assertThat(map.objects().getLast().is(HitObject.SPINNER)).isTrue();
    }

    @ParameterizedTest
    @ValueSource(ints = {1, 2, 3, 4})
    void respectsTheLevelsGridGapsAndBursts(int level) {
        int grid = new int[] {4, 2, 1, 1}[level - 1];
        int minGap = new int[] {4, 2, 2, 1}[level - 1];
        int maxRun = new int[] {4, 4, 6, 5}[level - 1];
        int maxPerBar = new int[] {4, 6, 8, 12}[level - 1];
        var notes = generator.generate(spec(level, List.of()), SONG).objects();

        int[] perBar = new int[BARS];
        notes.subList(0, notes.size() - 1).forEach(o -> perBar[slotOf(o.time()) / 16]++);
        assertThat(java.util.Arrays.stream(perBar).max().orElse(0)).as("most notes in a bar").isLessThanOrEqualTo(maxPerBar);
        int run = 1;
        for (int i = 0; i + 1 < notes.size(); i++) {
            HitObject object = notes.get(i);
            HitObject next = notes.get(i + 1);
            int slot = slotOf(object.time());
            assertThat(slot % grid).as("slot %d on the level's grid", slot).isZero();
            assertThat(slotOf(next.time()) - slot).isGreaterThanOrEqualTo(minGap);
            assertThat(next.time()).as("objects never overlap").isGreaterThan(object.finishTime());
            if (object.is(HitObject.SLIDER)) {
                // A slider ends inside its own bar, by beat 3.5.
                assertThat(slotOf(object.endTime()) - slot / 16 * 16).isLessThanOrEqualTo(14);
            }
            // The closing spinner always follows on the next bar line; it is not part of a run of notes.
            boolean closingSpinner = i + 1 == notes.size() - 1;
            run = !closingSpinner && slotOf(next.time()) - slot == minGap ? run + 1 : 1;
            assertThat(run).as("notes in a row at the minimum gap").isLessThanOrEqualTo(maxRun);
        }
    }

    @Test
    void denserLevelsPlaceMoreNotesAndPreferTheBeat() {
        int[] counts = new int[4];
        for (int level = 1; level <= 4; level++) {
            var objects = generator.generate(spec(level, List.of()), SONG).objects();
            counts[level - 1] = objects.size();
            if (level == 1) {
                assertThat(objects.subList(0, objects.size() - 1))
                        .allSatisfy(o -> assertThat(slotOf(o.time()) % 4).isZero());
            }
        }
        assertThat(counts).isSorted();
        assertThat(counts[0]).isLessThan(counts[3]);
    }

    @Test
    void explicitBreaksStillApply() {
        var objects = generator.generate(spec(3, List.of("2-5")), SONG).objects();
        assertThat(objects).noneMatch(o -> slotOf(o.time()) / 16 >= 2 && slotOf(o.time()) / 16 <= 5);
    }

    @Test
    void sameSpecAndRhythmGiveTheSameMap() {
        assertThat(generator.generate(spec(2, List.of()), SONG)).isEqualTo(generator.generate(spec(2, List.of()), SONG));
    }

    @Test
    void rhythmFilesAreValidated() {
        assertThat(Rhythm.parse("# comment\n\n0123456789abcdef\nFEDCBA9876543210\n").bars()).isEqualTo(2);
        assertThat(Rhythm.parse("f000000000000000").at(0)).isEqualTo(1.0);
        assertThat(Rhythm.parse("f000000000000000").at(99)).isZero();
        assertThatThrownBy(() -> Rhythm.parse("0123")).hasMessageContaining("16 hex digits");
        assertThatThrownBy(() -> Rhythm.parse("0123456789abcdeg")).hasMessageContaining("non-hex");
    }
}
