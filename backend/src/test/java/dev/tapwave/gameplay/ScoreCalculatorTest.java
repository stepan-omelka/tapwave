package dev.tapwave.gameplay;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import dev.tapwave.beatmap.HitObject;
import dev.tapwave.beatmap.HitObject.PathPoint;
import dev.tapwave.beatmap.HitObject.SliderPart;
import dev.tapwave.beatmap.HitObject.SliderShape;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/** Same fixture and numbers as frontend/src/app/game/score-keeper.spec.ts — keep them in sync. */
class ScoreCalculatorTest {

    private static final double OD = 5;
    private static final double HP = 5;

    private final ScoreCalculator calculator = new ScoreCalculator();

    private static HitObject circle(int time) {
        return new HitObject(HitObject.CIRCLE, time, 100, 100, false, 1, 0, null, null);
    }

    private static HitObject slider(int time) {
        var shape = new SliderShape("linear", List.of(new PathPoint(100, 100), new PathPoint(200, 100)), 1, 1000,
                List.of(new SliderPart(time + 500, SliderPart.TICK), new SliderPart(time + 1000, SliderPart.TAIL)));
        return new HitObject(HitObject.SLIDER, time, 100, 100, false, 1, 0, time + 1000, shape);
    }

    private static HitObject spinner(int time) {
        return new HitObject(HitObject.SPINNER, time, 256, 192, true, 0, 0, time + 2000, null);
    }

    private static final List<HitObject> MAP = List.of(circle(1000), slider(2000), circle(3500), spinner(4000));

    @Test
    void perfectPlay() {
        var results = List.of(
                new ObjectResult(0, null, null),
                new ObjectResult(0, List.of(true, true), null),
                new ObjectResult(0, null, null),
                new ObjectResult(null, null, Difficulty.requiredSpins(2000, OD)));

        CalculatedScore score = calculator.calculate(MAP, results, OD, HP);

        assertThat(score.accuracy()).isEqualTo(100);
        assertThat(score.grade()).isEqualTo("SS");
        assertThat(score.maxCombo()).isEqualTo(6);
        assertThat(score.countMiss()).isZero();
        assertThat(score.totalScore()).isEqualTo(1426);
    }

    @Test
    void mixedPlay() {
        var results = List.of(
                new ObjectResult(70, null, null),
                new ObjectResult(null, List.of(true, false), null),
                new ObjectResult(-10, null, null),
                new ObjectResult(null, null, 0.5));

        CalculatedScore score = calculator.calculate(MAP, results, OD, HP);

        assertThat(List.of(score.count300(), score.count100(), score.count50(), score.countMiss()))
                .containsExactly(1, 1, 1, 1);
        assertThat(score.totalScore()).isEqualTo(474);
        assertThat(score.maxCombo()).isEqualTo(2);
        assertThat(score.accuracy()).isCloseTo(37.5, org.assertj.core.data.Offset.offset(1e-9));
        assertThat(score.grade()).isEqualTo("D");
    }

    @Test
    void failsWhenHpRunsOut() {
        var many = new ArrayList<HitObject>();
        var results = new ArrayList<ObjectResult>();
        for (int i = 0; i < 30; i++) {
            many.add(circle(1000 + i * 300));
            results.add(new ObjectResult(null, null, null));
        }

        CalculatedScore score = calculator.calculate(many, results, OD, 10);

        assertThat(score.failed()).isTrue();
        assertThat(score.countMiss()).isEqualTo(30);
    }

    @Test
    void rejectsWrongNumberOfResults() {
        assertThatThrownBy(() -> calculator.calculate(MAP, List.of(new ObjectResult(0, null, null)), OD, HP))
                .isInstanceOf(InvalidPlayException.class)
                .hasMessageContaining("Expected 4");
    }

    @Test
    void rejectsHitsOutsideTheTimingWindow() {
        var results = Arrays.asList(
                new ObjectResult((int) Difficulty.window50(OD) + 1, null, null),
                new ObjectResult(0, List.of(true, true), null),
                new ObjectResult(0, null, null),
                new ObjectResult(null, null, 4.0));

        assertThatThrownBy(() -> calculator.calculate(MAP, results, OD, HP))
                .isInstanceOf(InvalidPlayException.class)
                .hasMessageContaining("timing window");
    }

    @Test
    void rejectsImpossibleSpinSpeed() {
        var results = List.of(
                new ObjectResult(0, null, null),
                new ObjectResult(0, List.of(true, true), null),
                new ObjectResult(0, null, null),
                new ObjectResult(null, null, 100.0));

        assertThatThrownBy(() -> calculator.calculate(MAP, results, OD, HP))
                .isInstanceOf(InvalidPlayException.class)
                .hasMessageContaining("spins");
    }

    @Test
    void rejectsSliderWithWrongPartCount() {
        var results = List.of(
                new ObjectResult(0, null, null),
                new ObjectResult(0, List.of(true), null),
                new ObjectResult(0, null, null),
                new ObjectResult(null, null, 4.0));

        assertThatThrownBy(() -> calculator.calculate(MAP, results, OD, HP))
                .isInstanceOf(InvalidPlayException.class)
                .hasMessageContaining("part flags");
    }
}
