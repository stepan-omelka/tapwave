package dev.tapwave.gameplay;

import java.util.List;
import java.util.Objects;

/**
 * Cheap plausibility check against scripted submissions: people never hit dozens of objects with
 * (almost) zero spread in their timing. This does not make forging impossible — a forger can add noise —
 * but it rejects naive bots and replayed autoplay output. The real fix would be server-side replay simulation.
 */
public final class HumanTimingCheck {

    /** Below this many timed hits the statistics are meaningless. */
    static final int MIN_SAMPLES = 20;
    static final double MIN_STANDARD_DEVIATION_MS = 2.0;

    private HumanTimingCheck() {
    }

    public static void requirePlausible(List<ObjectResult> results) {
        List<Integer> offsets = results.stream()
                .filter(Objects::nonNull)
                .map(ObjectResult::offset)
                .filter(Objects::nonNull)
                .toList();
        if (offsets.size() < MIN_SAMPLES) {
            return;
        }
        long exact = offsets.stream().filter(o -> o == 0).count();
        double mean = offsets.stream().mapToDouble(Integer::doubleValue).average().orElse(0);
        double variance = offsets.stream().mapToDouble(o -> (o - mean) * (o - mean)).sum() / offsets.size();
        if (Math.sqrt(variance) < MIN_STANDARD_DEVIATION_MS || exact * 2 > offsets.size()) {
            throw new InvalidPlayException("Hit timing is too consistent to come from a person");
        }
    }
}
