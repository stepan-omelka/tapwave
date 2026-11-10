package dev.tapwave.beatmap.generator;

import java.util.Arrays;

/**
 * A song's onset strength (0-1) at every quarter beat, counted from its first downbeat, as written by
 * {@code tools/beatgrid.py --export}: one bar of 16 hex digits per line, {@code #} starts a comment.
 */
public final class Rhythm {

    public static final int SLOTS_PER_BEAT = 4;
    public static final int SLOTS_PER_BAR = 16;

    private final double[] strength;

    private Rhythm(double[] strength) {
        this.strength = strength;
    }

    public static Rhythm parse(String text) {
        var lines = text.lines().map(String::strip).filter(l -> !l.isEmpty() && !l.startsWith("#")).toList();
        double[] strength = new double[lines.size() * SLOTS_PER_BAR];
        for (int bar = 0; bar < lines.size(); bar++) {
            String line = lines.get(bar);
            if (line.length() != SLOTS_PER_BAR) {
                throw new IllegalArgumentException("rhythm bar " + bar + " must have 16 hex digits: '" + line + "'");
            }
            for (int i = 0; i < SLOTS_PER_BAR; i++) {
                int digit = Character.digit(line.charAt(i), 16);
                if (digit < 0) {
                    throw new IllegalArgumentException("rhythm bar " + bar + " has a non-hex digit: '" + line + "'");
                }
                strength[bar * SLOTS_PER_BAR + i] = digit / 15.0;
            }
        }
        return new Rhythm(strength);
    }

    /** Strength at a quarter-beat slot; 0 beyond the end of the song. */
    public double at(int slot) {
        return slot >= 0 && slot < strength.length ? strength[slot] : 0;
    }

    public int bars() {
        return strength.length / SLOTS_PER_BAR;
    }

    @Override
    public String toString() {
        return "Rhythm[" + bars() + " bars, mean " + Arrays.stream(strength).average().orElse(0) + "]";
    }
}
