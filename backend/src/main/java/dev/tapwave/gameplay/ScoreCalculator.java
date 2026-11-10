package dev.tapwave.gameplay;

import dev.tapwave.beatmap.HitObject;
import dev.tapwave.beatmap.HitObject.SliderPart;
import java.util.List;
import org.springframework.stereotype.Component;

/**
 * Re-computes a play from per-object results. The client never sends its score, combo or accuracy:
 * the server derives them from the raw inputs, so tampering with the totals has no effect and
 * impossible inputs (hits outside the timing window, too many spins, wrong shapes) are rejected.
 *
 * <p>Mirrors {@code ScoreKeeper} in {@code frontend/src/app/game/score-keeper.ts}.
 */
@Component
public class ScoreCalculator {

    public CalculatedScore calculate(List<HitObject> objects, List<ObjectResult> results, double od, double hp) {
        if (results.size() != objects.size()) {
            throw new InvalidPlayException(
                    "Expected " + objects.size() + " object results, got " + results.size());
        }
        var state = new State(hp);
        for (int i = 0; i < objects.size() && !state.failed; i++) {
            HitObject object = objects.get(i);
            ObjectResult result = results.get(i);
            if (result == null) {
                throw new InvalidPlayException("Result #" + i + " is missing");
            }
            switch (object.type()) {
                case HitObject.CIRCLE -> circle(state, i, result, od);
                case HitObject.SLIDER -> slider(state, i, object, result, od);
                case HitObject.SPINNER -> spinner(state, i, object, result, od);
                default -> throw new IllegalStateException("Unknown object type " + object.type());
            }
        }
        // A failed play stops counting; remaining objects are treated as misses so totals stay consistent.
        int judged = state.count300 + state.count100 + state.count50 + state.countMiss;
        state.countMiss += objects.size() - judged;

        double accuracy = objects.isEmpty() ? 100 : 100.0
                * (300.0 * state.count300 + 100.0 * state.count100 + 50.0 * state.count50)
                / (300.0 * objects.size());
        return new CalculatedScore(state.score, state.maxCombo, accuracy, state.count300, state.count100,
                state.count50, state.countMiss, Difficulty.grade(accuracy, state.countMiss), state.failed);
    }

    private void circle(State state, int index, ObjectResult result, double od) {
        if (result.offset() == null) {
            state.miss(1);
            return;
        }
        int judgement = Difficulty.judgeOffset(result.offset(), od);
        if (judgement == 0) {
            throw new InvalidPlayException("Circle #" + index + " was hit outside its timing window");
        }
        state.judge(judgement, true);
    }

    private void slider(State state, int index, HitObject object, ObjectResult result, double od) {
        List<SliderPart> parts = object.slider().parts();
        List<Boolean> flags = result.parts();
        if (flags == null || flags.size() != parts.size()) {
            throw new InvalidPlayException("Slider #" + index + " needs " + parts.size() + " part flags");
        }
        int hit = 0;
        if (result.offset() != null) {
            if (Difficulty.judgeOffset(result.offset(), od) == 0) {
                throw new InvalidPlayException("Slider #" + index + " head was hit outside its timing window");
            }
            state.edgeHit(Difficulty.EDGE_SCORE);
            hit++;
        } else {
            state.miss(0.5);
            if (state.failed) {
                return;
            }
        }
        for (int p = 0; p < parts.size(); p++) {
            SliderPart part = parts.get(p);
            if (Boolean.TRUE.equals(flags.get(p))) {
                state.edgeHit(part.isTick() ? Difficulty.TICK_SCORE : Difficulty.EDGE_SCORE);
                hit++;
            } else if (!part.isTail()) {
                // Dropping a tick or a repeat breaks the combo; a missed tail is forgiven.
                state.miss(0.5);
            }
            if (state.failed) {
                return;
            }
        }
        int judgement = Difficulty.judgeSlider(hit, parts.size() + 1);
        if (judgement == 0) {
            state.miss(1);
        } else {
            state.judge(judgement, false);
        }
    }

    private void spinner(State state, int index, HitObject object, ObjectResult result, double od) {
        double spins = result.spins() == null ? 0 : result.spins();
        int duration = object.finishTime() - object.time();
        if (spins < 0 || Double.isNaN(spins) || spins > Difficulty.maxSpins(duration) + 0.01) {
            throw new InvalidPlayException("Spinner #" + index + " has an impossible number of spins");
        }
        double required = Difficulty.requiredSpins(duration, od);
        int judgement = Difficulty.judgeSpinner(spins, required);
        if (judgement == 0) {
            state.miss(1);
            return;
        }
        state.judge(judgement, true);
        state.score += (long) Math.floor(Math.max(0, spins - required)) * Difficulty.SPIN_BONUS_SCORE;
    }

    private static final class State {
        private final double hpSetting;
        private double health = 1;
        private long score;
        private int combo;
        private int maxCombo;
        private int count300;
        private int count100;
        private int count50;
        private int countMiss;
        private boolean failed;

        State(double hpSetting) {
            this.hpSetting = hpSetting;
        }

        /** Final judgement of an object. */
        void judge(int judgement, boolean addsCombo) {
            score += Difficulty.judgementScore(judgement, combo);
            if (addsCombo) {
                bumpCombo();
            }
            switch (judgement) {
                case 300 -> count300++;
                case 100 -> count100++;
                default -> count50++;
            }
            heal(Difficulty.hpGain(judgement, hpSetting));
        }

        /** Slider head, tick, repeat or tail hit. */
        void edgeHit(int points) {
            score += points;
            bumpCombo();
            heal(Difficulty.HP_TICK_GAIN);
        }

        /** @param weight 1 for a missed object, 0.5 for a dropped slider part */
        void miss(double weight) {
            combo = 0;
            if (weight >= 1) {
                countMiss++;
            }
            health -= Difficulty.hpMissPenalty(hpSetting) * weight;
            if (health <= 0) {
                health = 0;
                failed = true;
            }
        }

        private void bumpCombo() {
            combo++;
            maxCombo = Math.max(maxCombo, combo);
        }

        private void heal(double amount) {
            health = Math.min(1, health + amount);
        }
    }
}
