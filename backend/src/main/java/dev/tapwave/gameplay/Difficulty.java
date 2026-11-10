package dev.tapwave.gameplay;

/**
 * Gameplay formulas shared with the client ({@code frontend/src/app/game/rules.ts}).
 * Both sides must stay in sync, otherwise the server rejects or re-scores honest plays.
 */
public final class Difficulty {

    public static final int PLAYFIELD_WIDTH = 512;
    public static final int PLAYFIELD_HEIGHT = 384;

    public static final int EDGE_SCORE = 30;
    public static final int TICK_SCORE = 10;
    public static final int SPIN_BONUS_SCORE = 100;
    public static final double MAX_SPINS_PER_SECOND = 8.0;
    public static final double HP_TICK_GAIN = 0.01;

    private Difficulty() {
    }

    /** Hit circle radius in playfield units. */
    public static double circleRadius(double cs) {
        return 54.4 - 4.48 * cs;
    }

    /** How long before its hit time an object appears, in ms. */
    public static double preempt(double ar) {
        if (ar < 5) {
            return 1200 + 120 * (5 - ar);
        }
        return 1200 - 150 * (ar - 5);
    }

    public static double window300(double od) {
        return 80 - 6 * od;
    }

    public static double window100(double od) {
        return 140 - 8 * od;
    }

    public static double window50(double od) {
        return 200 - 10 * od;
    }

    /** Judgement of a circle (or slider head) hit {@code offset} ms off; 0 = outside every window. */
    public static int judgeOffset(int offset, double od) {
        long abs = Math.abs((long) offset); // (long): Math.abs(Integer.MIN_VALUE) is negative
        if (abs <= window300(od)) {
            return 300;
        }
        if (abs <= window100(od)) {
            return 100;
        }
        if (abs <= window50(od)) {
            return 50;
        }
        return 0;
    }

    public static double requiredSpins(int durationMs, double od) {
        return durationMs / 1000.0 * (1.0 + 0.15 * od);
    }

    public static double maxSpins(int durationMs) {
        return durationMs / 1000.0 * MAX_SPINS_PER_SECOND;
    }

    public static int judgeSpinner(double spins, double required) {
        double ratio = spins / required;
        if (ratio >= 1) {
            return 300;
        }
        if (ratio >= 0.9) {
            return 100;
        }
        if (ratio >= 0.75) {
            return 50;
        }
        return 0;
    }

    /** Slider judgement from how many of its scoring points (head + parts) were hit. */
    public static int judgeSlider(int hit, int total) {
        if (hit == total) {
            return 300;
        }
        if (hit * 2 >= total) {
            return 100;
        }
        if (hit > 0) {
            return 50;
        }
        return 0;
    }

    public static double hpMissPenalty(double hp) {
        return 0.03 + 0.017 * hp;
    }

    public static double hpGain(int judgement, double hp) {
        double full = 0.035 - 0.0015 * hp;
        return switch (judgement) {
            case 300 -> full;
            case 100 -> full * 0.5;
            case 50 -> full * 0.1;
            default -> 0;
        };
    }

    /** Points for a judgement, growing with the combo held before the hit. Integer maths on purpose. */
    public static int judgementScore(int judgement, int comboBefore) {
        return judgement + (judgement * comboBefore) / 25;
    }

    public static String grade(double accuracy, int misses) {
        if (accuracy >= 100) {
            return "SS";
        }
        if (accuracy >= 95 && misses == 0) {
            return "S";
        }
        if (accuracy >= 90) {
            return "A";
        }
        if (accuracy >= 80) {
            return "B";
        }
        if (accuracy >= 70) {
            return "C";
        }
        return "D";
    }
}
