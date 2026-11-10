package dev.tapwave.beatmap.generator;

import static dev.tapwave.beatmap.generator.Rhythm.SLOTS_PER_BAR;
import static dev.tapwave.beatmap.generator.Rhythm.SLOTS_PER_BEAT;

import dev.tapwave.beatmap.generator.BeatmapGenerator.Note;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

/**
 * Chooses a map's notes from its song's onsets: the strongest onsets on the strongest beats first, on the
 * grid the level allows, keeping a minimum gap, until the level's density is reached. Where the song has no
 * onsets there are no notes, so quiet passages become rests on their own.
 */
final class OnsetPlacement {

    /** A note only goes on an onset at least this strong (the export scales a song's strong onsets to about 1). */
    static final double MIN_STRENGTH = 0.3;

    /**
     * @param grid          finest note grid in quarter-beat slots (4 = beats, 2 = eighths, 1 = sixteenths)
     * @param minGap        minimum distance between two notes, in slots
     * @param notesPerBar   target density over the playable bars
     * @param sliderMinGap  a slider needs at least this many slots to the next note
     * @param sliderRest    slots between a slider's end and the next note
     * @param maxRunNotes   longest run of notes exactly {@code minGap} apart
     * @param maxPerBar     most notes in one bar, so loud sections do not turn into walls of notes
     */
    private record Style(int grid, int minGap, double notesPerBar, int sliderMinGap, double sliderChance,
                         int sliderRest, int maxRunNotes, int maxPerBar) {
    }

    private static final List<Style> STYLES = List.of(
            new Style(4, 4, 2.6, 8, 0.45, 4, 4, 4),    // 1: on the beat, at least a beat apart
            new Style(2, 2, 4.4, 4, 0.40, 2, 4, 6),    // 2: eighths, at most four in a row
            new Style(1, 2, 6.2, 4, 0.35, 2, 6, 8),    // 3: sixteenths for syncopation, never two in a row
            new Style(1, 1, 8.5, 4, 0.30, 1, 5, 12));  // 4: sixteenth bursts of up to five notes

    private record Candidate(int slot, double score) {
    }

    private OnsetPlacement() {
    }

    static Map<Integer, List<Note>> notesByBar(MapSpec spec, Rhythm rhythm, Random random) {
        Style style = STYLES.get(spec.level() - 1);
        int lastBar = spec.bars() - 1;
        Set<Integer> rests = spec.breakBars();

        var candidates = new ArrayList<Candidate>();
        int playableBars = 0;
        for (int bar = 1; bar < lastBar; bar++) {
            if (rests.contains(bar)) {
                continue;
            }
            playableBars++;
            for (int i = 0; i < SLOTS_PER_BAR; i += style.grid()) {
                int slot = bar * SLOTS_PER_BAR + i;
                double strength = rhythm.at(slot);
                if (strength >= MIN_STRENGTH) {
                    candidates.add(new Candidate(slot, strength * metricalWeight(i)));
                }
            }
        }
        candidates.sort(Comparator.comparingDouble(Candidate::score).reversed()
                .thenComparingInt(Candidate::slot));

        int target = (int) Math.round(style.notesPerBar() * playableBars);
        var chosen = new TreeSet<Integer>();
        int[] perBar = new int[spec.bars()];
        for (Candidate candidate : candidates) {
            if (chosen.size() >= target) {
                break;
            }
            int bar = candidate.slot() / SLOTS_PER_BAR;
            if (perBar[bar] < style.maxPerBar() && fits(chosen, candidate.slot(), style)) {
                chosen.add(candidate.slot());
                perBar[bar]++;
            }
        }
        return toNotes(chosen, lastBar, style, random);
    }

    /** Downbeats matter most, then beats, eighths, sixteenths. */
    static double metricalWeight(int slotInBar) {
        if (slotInBar == 0) {
            return 1.0;
        }
        if (slotInBar % SLOTS_PER_BEAT == 0) {
            return 0.9;
        }
        return slotInBar % 2 == 0 ? 0.65 : 0.45;
    }

    private static boolean fits(TreeSet<Integer> chosen, int slot, Style style) {
        Integer before = chosen.floor(slot);
        Integer after = chosen.ceiling(slot);
        if (before != null && slot - before < style.minGap() || after != null && after - slot < style.minGap()) {
            return false;
        }
        int run = 1;
        for (int s = slot - style.minGap(); chosen.contains(s); s -= style.minGap()) {
            run++;
        }
        for (int s = slot + style.minGap(); chosen.contains(s); s += style.minGap()) {
            run++;
        }
        return run <= style.maxRunNotes();
    }

    /** Circles, or a slider when there is room before the next note; a slider always ends inside its bar. */
    private static Map<Integer, List<Note>> toNotes(TreeSet<Integer> chosen, int lastBar, Style style, Random random) {
        var byBar = new TreeMap<Integer, List<Note>>();
        List<Integer> slots = List.copyOf(chosen);
        for (int k = 0; k < slots.size(); k++) {
            int slot = slots.get(k);
            int inBar = slot % SLOTS_PER_BAR;
            int next = k + 1 < slots.size() ? slots.get(k + 1) : lastBar * SLOTS_PER_BAR;
            // End by beat 3.5 of the bar, like the rhythm templates, and leave a rest before the next note.
            int room = Math.min(next - slot - style.sliderRest(), SLOTS_PER_BAR - 2 - inBar);
            Note note;
            if (next - slot >= style.sliderMinGap() && room >= 2 && random.nextDouble() < style.sliderChance()) {
                int length = Math.min(room - room % 2, 2 * SLOTS_PER_BEAT);
                int slides = length % 4 == 0 && random.nextDouble() < 0.3 ? 2 : 1;
                note = new Note(inBar / (double) SLOTS_PER_BEAT, true,
                        length / slides / (double) SLOTS_PER_BEAT, slides);
            } else {
                note = new Note(inBar / (double) SLOTS_PER_BEAT, false, 0, 1);
            }
            byBar.computeIfAbsent(slot / SLOTS_PER_BAR, bar -> new ArrayList<>()).add(note);
        }
        return byBar;
    }
}
