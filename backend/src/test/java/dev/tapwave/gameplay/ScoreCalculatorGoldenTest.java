package dev.tapwave.gameplay;

import static org.assertj.core.api.Assertions.assertThat;

import dev.tapwave.beatmap.HitObject;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import tools.jackson.databind.json.JsonMapper;

/**
 * Runs the golden cases in {@code shared/scoring-golden.json}. The frontend's score-keeper.spec.ts runs the same
 * file, so the TypeScript and Java scoring cannot drift apart without one of the two suites failing.
 */
class ScoreCalculatorGoldenTest {

    record Expected(long totalScore, int maxCombo, int count300, int count100, int count50, int countMiss,
                    double accuracy, String grade, boolean failed) {
    }

    record Case(String name, List<ObjectResult> results, Expected expected) {
        @Override
        public String toString() {
            return name;
        }
    }

    record Golden(String description, double overallDifficulty, double hpDrain, List<HitObject> hitObjects,
                  List<Case> cases) {
    }

    private static final Golden GOLDEN = load();

    private static Golden load() {
        // Maven runs tests from backend/, the shared folder sits next to it.
        Path file = Path.of("..", "shared", "scoring-golden.json");
        try {
            return JsonMapper.builder().build().readValue(Files.readString(file), Golden.class);
        } catch (java.io.IOException e) {
            throw new IllegalStateException("Cannot read " + file.toAbsolutePath(), e);
        }
    }

    static Stream<Case> cases() {
        return GOLDEN.cases().stream();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("cases")
    void matchesGoldenNumbers(Case testCase) {
        CalculatedScore score = new ScoreCalculator().calculate(GOLDEN.hitObjects(), testCase.results(),
                GOLDEN.overallDifficulty(), GOLDEN.hpDrain());
        Expected e = testCase.expected();

        assertThat(score).isEqualTo(new CalculatedScore(e.totalScore(), e.maxCombo(), e.accuracy(), e.count300(),
                e.count100(), e.count50(), e.countMiss(), e.grade(), e.failed()));
    }
}
