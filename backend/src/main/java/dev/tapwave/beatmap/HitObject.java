package dev.tapwave.beatmap;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

/**
 * One object on the playfield (512 x 384 units). Times are in ms from the start of the song.
 *
 * @param type        {@link #CIRCLE}, {@link #SLIDER} or {@link #SPINNER}
 * @param endTime     end of a slider or spinner, {@code null} for circles
 * @param slider      shape and scoring parts of a slider, {@code null} otherwise
 * @param comboNumber number drawn inside the circle (0 for spinners)
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record HitObject(
        String type,
        int time,
        int x,
        int y,
        boolean newCombo,
        int comboNumber,
        int colorIndex,
        Integer endTime,
        SliderShape slider) {

    public static final String CIRCLE = "circle";
    public static final String SLIDER = "slider";
    public static final String SPINNER = "spinner";

    /** Not named {@code isSlider()} etc. on purpose: Jackson would treat such a getter as the {@code slider} property. */
    public boolean is(String objectType) {
        return type.equals(objectType);
    }

    /** Time at which the object is fully finished. */
    @JsonIgnore
    public int finishTime() {
        return endTime != null ? endTime : time;
    }

    /**
     * @param curve        {@code "linear"} (2 points) or {@code "bezier"} (quadratic, 3 points)
     * @param slides       number of passes along the path (2 = one repeat)
     * @param spanDuration duration of one pass in ms
     * @param parts        everything after the head that has to be tracked: ticks, repeats and the tail, in time order
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record SliderShape(String curve, List<PathPoint> points, int slides, int spanDuration, List<SliderPart> parts) {
    }

    public record PathPoint(int x, int y) {
    }

    /** @param kind {@code "tick"}, {@code "repeat"} or {@code "tail"} */
    public record SliderPart(int time, String kind) {

        public static final String TICK = "tick";
        public static final String REPEAT = "repeat";
        public static final String TAIL = "tail";

        @JsonIgnore
        public boolean isTick() {
            return TICK.equals(kind);
        }

        @JsonIgnore
        public boolean isTail() {
            return TAIL.equals(kind);
        }
    }
}
