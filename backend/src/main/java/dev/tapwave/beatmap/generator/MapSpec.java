package dev.tapwave.beatmap.generator;

import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;

/**
 * Input for {@link BeatmapGenerator}; bound from {@code tapwave.seed.maps} in application.yml.
 *
 * @param bars       song length in 4/4 bars; bar 0 is the lead-in, the last bar holds a spinner
 * @param level      pattern density 1 (easy) to 4 (insane)
 * @param offsetMs   time of the first downbeat in the audio
 * @param audioUrl   audio file served by the frontend; {@code null} = procedurally synthesised track
 * @param breaks     bars without notes, as {@code "12"} or {@code "56-61"} (inclusive), e.g. a quiet intro or a
 *                   breakdown; when empty (and there is no rhythm), the generator rests on every 16th bar instead
 * @param sourceUrl  where the song is published (required with an audio file)
 * @param license    the song's license, e.g. {@code CC BY 4.0} (required with an audio file)
 * @param licenseUrl link to the license text
 * @param rhythm     classpath resource with the song's onset strengths ({@code tools/beatgrid.py --export});
 *                   with it, notes follow the song's onsets instead of the fixed rhythm templates
 */
public record MapSpec(
        String slug,
        String title,
        String artist,
        String mapper,
        String difficultyName,
        double bpm,
        int offsetMs,
        int bars,
        int level,
        double circleSize,
        double approachRate,
        double overallDifficulty,
        double hpDrain,
        long seed,
        String audioUrl,
        List<String> breaks,
        String sourceUrl,
        String license,
        String licenseUrl,
        String rhythm) {

    private static final Pattern BAR_RANGE = Pattern.compile("(\\d+)(?:-(\\d+))?");

    public MapSpec {
        if (mapper == null || mapper.isBlank()) {
            mapper = "tapwave-generator";
        }
        breaks = breaks == null ? List.of() : List.copyOf(breaks);
        if (bpm <= 0) {
            throw new IllegalArgumentException("bpm must be positive for map " + slug);
        }
        if (bars < 4) {
            throw new IllegalArgumentException("a map needs at least 4 bars: " + slug);
        }
        if (level < 1 || level > 4) {
            throw new IllegalArgumentException("level must be 1-4 for map " + slug);
        }
        if (audioUrl != null && (isBlank(license) || isBlank(sourceUrl))) {
            throw new IllegalArgumentException("map " + slug + " uses an audio file, so it must name the song's "
                    + "license and source-url; only use music you are allowed to redistribute");
        }
        breakBars(breaks, bars, slug);
    }

    /** The bars listed in {@link #breaks()}, validated to lie between the lead-in bar and the final spinner. */
    public Set<Integer> breakBars() {
        return breakBars(breaks, bars, slug);
    }

    private static Set<Integer> breakBars(List<String> breaks, int bars, String slug) {
        var result = new TreeSet<Integer>();
        for (String range : breaks) {
            var matcher = BAR_RANGE.matcher(range.strip());
            if (!matcher.matches()) {
                throw new IllegalArgumentException("break '" + range + "' of map " + slug + " is not a bar or a range like 56-61");
            }
            int from = Integer.parseInt(matcher.group(1));
            int to = matcher.group(2) == null ? from : Integer.parseInt(matcher.group(2));
            if (from < 1 || to < from || to > bars - 2) {
                throw new IllegalArgumentException("break '" + range + "' of map " + slug + " must lie within bars 1-" + (bars - 2));
            }
            for (int bar = from; bar <= to; bar++) {
                result.add(bar);
            }
        }
        return result;
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
