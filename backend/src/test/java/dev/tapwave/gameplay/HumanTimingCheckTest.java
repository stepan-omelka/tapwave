package dev.tapwave.gameplay;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;

class HumanTimingCheckTest {

    private static List<ObjectResult> offsets(int count, java.util.function.IntUnaryOperator offset) {
        var results = new ArrayList<ObjectResult>();
        for (int i = 0; i < count; i++) {
            results.add(new ObjectResult(offset.applyAsInt(i), null, null));
        }
        return results;
    }

    @Test
    void acceptsHumanSpread() {
        var random = new Random(1);
        assertThatCode(() -> HumanTimingCheck.requirePlausible(offsets(80, i -> (int) (random.nextGaussian() * 9))))
                .doesNotThrowAnyException();
    }

    @Test
    void rejectsPerfectlyTimedHits() {
        assertThatThrownBy(() -> HumanTimingCheck.requirePlausible(offsets(80, i -> 0)))
                .isInstanceOf(InvalidPlayException.class);
    }

    @Test
    void rejectsConstantOffset() {
        assertThatThrownBy(() -> HumanTimingCheck.requirePlausible(offsets(80, i -> 7)))
                .isInstanceOf(InvalidPlayException.class);
    }

    @Test
    void ignoresShortPlays() {
        assertThatCode(() -> HumanTimingCheck.requirePlausible(offsets(5, i -> 0))).doesNotThrowAnyException();
    }
}
