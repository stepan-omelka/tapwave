package dev.tapwave.beatmap.generator;

import static dev.tapwave.gameplay.Difficulty.PLAYFIELD_HEIGHT;
import static dev.tapwave.gameplay.Difficulty.PLAYFIELD_WIDTH;

import dev.tapwave.beatmap.HitObject;
import dev.tapwave.beatmap.HitObject.PathPoint;
import dev.tapwave.beatmap.HitObject.SliderPart;
import dev.tapwave.beatmap.HitObject.SliderShape;
import dev.tapwave.gameplay.Difficulty;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import org.springframework.stereotype.Component;

/**
 * Builds a playable map from a beat grid. Every bar gets a rhythm template that fits the difficulty level;
 * positions follow the rhythm (longer gaps = bigger jumps, 1/4 notes = tight streams). Deterministic per seed.
 */
@Component
public class BeatmapGenerator {

    public record GeneratedMap(List<HitObject> objects, int durationMs, int maxCombo, double starRating) {
    }

    /** Rhythm templates per level. {@code c1.5} = circle on beat 1.5, {@code s2:1x2} = slider on beat 2, 1 beat long, 2 passes. */
    private static final Map<Integer, List<String>> TEMPLATES = Map.of(
            1, List.of("c0 c2", "c0 c1 c2", "s0:2 c3", "c0 s1:2", "c0 c1 c2 c3", "s0:1 c2"),
            2, List.of("c0 c1 c2 c3", "s0:1 c2 c3", "c0 c1 s2:1", "s0:1x2 c3", "c0 c0.5 c1 s2:1",
                    "c0 c1.5 c2 c3", "s0:2 c3 c3.5"),
            3, List.of("c0 c0.5 c1 c1.5 c2 c3", "s0:0.5 c1 c1.5 s2:1", "c0 c1 c1.5 c2 c2.5 c3",
                    "s0:1 c1.5 c2 s2.5:0.5 c3.5", "c0 c0.25 c0.5 c1 c2 c2.5 c3", "s0:0.5x2 c1.5 c2 c3 c3.5"),
            4, List.of("c0 c0.25 c0.5 c0.75 c1 c1.5 c2 c2.5 c3 c3.5", "c0 c0.5 c1 c1.25 c1.5 c2 c2.5 c3 c3.25 c3.5",
                    "s0:0.5 c1 c1.5 c2 c2.25 c2.5 c2.75 c3 c3.5", "c0 c0.25 c0.5 c0.75 c1 c1.25 c1.5 c1.75 c2 s2.5:1",
                    "c0 c0.5 c1 c1.5 c2 c2.5 c3 c3.5", "s0:1 c1.5 c2 c2.5 s3:0.5"));

    private static final int BREAK_EVERY_BARS = 16;
    private static final int COMBO_COLORS = 4;

    /** A note within its bar: {@code beat} 0-3.75 from the bar line; sliders last {@code lengthBeats} per slide. */
    record Note(double beat, boolean slider, double lengthBeats, int slides) {
    }

    /** A map from the rhythm templates: for the synthesised tracks, whose drums play on the beat grid. */
    public GeneratedMap generate(MapSpec spec) {
        return generate(spec, null);
    }

    /**
     * @param rhythm the song's onset strengths ({@code tools/beatgrid.py --export}); with it, notes go where the
     *               music has onsets, without it they follow the fixed rhythm templates
     */
    public GeneratedMap generate(MapSpec spec, Rhythm rhythm) {
        var random = new Random(spec.seed());
        double beatLength = 60000.0 / spec.bpm();
        double radius = Difficulty.circleRadius(spec.circleSize());
        var placer = new Placer(random, radius + 6, spec.level());
        var objects = new ArrayList<HitObject>();
        Map<Integer, List<Note>> onsetNotes = rhythm == null
                ? null : OnsetPlacement.notesByBar(spec, rhythm, new Random(spec.seed() * 31 + 17));

        int comboNumber = 0;
        int colorIndex = -1;
        boolean forceNewCombo = true;
        double previousEndBeat = 0;

        int lastBar = spec.bars() - 1;
        Set<Integer> restBars = spec.breakBars();
        for (int bar = 1; bar < lastBar; bar++) {
            if (restBars.contains(bar)) {
                // A break chosen to fit the music (intro, breakdown): no notes, start fresh afterwards.
                forceNewCombo = true;
                placer.reset();
                continue;
            }
            List<Note> notes;
            if (onsetNotes != null) {
                notes = onsetNotes.getOrDefault(bar, List.of());
                if (notes.isEmpty()) {
                    forceNewCombo = true;
                    continue;
                }
            } else if (restBars.isEmpty() && bar % BREAK_EVERY_BARS == 0 && bar < lastBar - 1) {
                if (spec.level() >= 3) {
                    objects.add(spinner(spec, beatLength, bar * 4.0, bar * 4.0 + 3));
                    previousEndBeat = bar * 4.0 + 3;
                    placer.reset();
                }
                forceNewCombo = true;
                continue;
            } else {
                notes = parse(pickTemplate(random, spec.level()));
            }
            for (int n = 0; n < notes.size(); n++) {
                Note note = notes.get(n);
                double startBeat = bar * 4.0 + note.beat();
                // Templates start a combo every bar; onset maps can be sparse, so they wait for 4+ notes.
                boolean newCombo = forceNewCombo || n == 0 && (onsetNotes == null || comboNumber >= 4);
                if (newCombo) {
                    comboNumber = 0;
                    colorIndex = (colorIndex + 1) % COMBO_COLORS;
                    forceNewCombo = false;
                }
                comboNumber++;
                double gap = objects.isEmpty() ? 4 : startBeat - previousEndBeat;
                PathPoint start = placer.next(gap);
                int time = timeOf(spec, beatLength, startBeat);
                if (note.slider()) {
                    objects.add(slider(spec, beatLength, placer, start, time, note, newCombo, comboNumber, colorIndex));
                    previousEndBeat = startBeat + note.lengthBeats() * note.slides();
                } else {
                    objects.add(new HitObject(HitObject.CIRCLE, time, start.x(), start.y(), newCombo, comboNumber,
                            colorIndex, null, null));
                    previousEndBeat = startBeat;
                }
            }
        }
        objects.add(spinner(spec, beatLength, lastBar * 4.0, lastBar * 4.0 + 3));

        int durationMs = objects.getLast().finishTime();
        return new GeneratedMap(List.copyOf(objects), durationMs, maxCombo(objects), starRating(spec, objects));
    }

    private static String pickTemplate(Random random, int level) {
        int source = level > 1 && random.nextDouble() < 0.25 ? level - 1 : level;
        List<String> templates = TEMPLATES.get(source);
        return templates.get(random.nextInt(templates.size()));
    }

    private static List<Note> parse(String template) {
        var notes = new ArrayList<Note>();
        for (String token : template.split(" ")) {
            boolean slider = token.charAt(0) == 's';
            String rest = token.substring(1);
            int slides = 1;
            double length = 0;
            int repeatAt = rest.indexOf('x');
            if (repeatAt >= 0) {
                slides = Integer.parseInt(rest.substring(repeatAt + 1));
                rest = rest.substring(0, repeatAt);
            }
            int lengthAt = rest.indexOf(':');
            if (lengthAt >= 0) {
                length = Double.parseDouble(rest.substring(lengthAt + 1));
                rest = rest.substring(0, lengthAt);
            }
            notes.add(new Note(Double.parseDouble(rest), slider, length, slides));
        }
        return notes;
    }

    private static int timeOf(MapSpec spec, double beatLength, double beat) {
        return spec.offsetMs() + (int) Math.round(beat * beatLength);
    }

    private static HitObject spinner(MapSpec spec, double beatLength, double startBeat, double endBeat) {
        return new HitObject(HitObject.SPINNER, timeOf(spec, beatLength, startBeat), PLAYFIELD_WIDTH / 2,
                PLAYFIELD_HEIGHT / 2, true, 0, 0, timeOf(spec, beatLength, endBeat), null);
    }

    private static HitObject slider(MapSpec spec, double beatLength, Placer placer, PathPoint start, int time,
                                    Note note, boolean newCombo, int comboNumber, int colorIndex) {
        double length = sliderVelocity(spec.level()) * note.lengthBeats();
        List<PathPoint> points = placer.sliderPath(start, length);
        int span = (int) Math.round(note.lengthBeats() * beatLength);

        var parts = new ArrayList<SliderPart>();
        for (int pass = 0; pass < note.slides(); pass++) {
            int passStart = time + pass * span;
            for (int k = 1; k * beatLength < span - 10; k++) {
                parts.add(new SliderPart(passStart + (int) Math.round(k * beatLength), SliderPart.TICK));
            }
            boolean last = pass == note.slides() - 1;
            parts.add(new SliderPart(passStart + span, last ? SliderPart.TAIL : SliderPart.REPEAT));
        }
        // The cursor continues from wherever the ball finished.
        PathPoint finish = note.slides() % 2 == 1 ? points.getLast() : points.getFirst();
        PathPoint before = note.slides() % 2 == 1 ? points.get(points.size() - 2) : points.get(1);
        placer.moveTo(finish, Math.atan2(finish.y() - before.y(), finish.x() - before.x()));

        String curve = points.size() == 2 ? "linear" : "bezier";
        return new HitObject(HitObject.SLIDER, time, start.x(), start.y(), newCombo, comboNumber, colorIndex,
                time + note.slides() * span, new SliderShape(curve, points, note.slides(), span, List.copyOf(parts)));
    }

    /** Slider speed in playfield units per beat. */
    private static double sliderVelocity(int level) {
        return switch (level) {
            case 1 -> 90;
            case 2 -> 110;
            case 3 -> 140;
            default -> 165;
        };
    }

    private static int maxCombo(List<HitObject> objects) {
        int combo = 0;
        for (HitObject object : objects) {
            combo += object.is(HitObject.SLIDER) ? 1 + object.slider().parts().size() : 1;
        }
        return combo;
    }

    private static double starRating(MapSpec spec, List<HitObject> objects) {
        double drainSeconds = (objects.getLast().finishTime() - objects.getFirst().time()) / 1000.0;
        double notesPerSecond = objects.size() / Math.max(1, drainSeconds);
        double stars = 0.3
                + notesPerSecond * 0.6
                + Math.max(0, spec.approachRate() - 5) * 0.18
                + Math.max(0, spec.overallDifficulty() - 5) * 0.12
                + Math.max(0, spec.circleSize() - 3) * 0.15
                + spec.level() * 0.35;
        return Math.round(Math.min(9.99, stars) * 100) / 100.0;
    }

    /** Walks the cursor around the playfield, keeping every object inside it. */
    private static final class Placer {
        private final Random random;
        private final double margin;
        private final int level;
        private double x = PLAYFIELD_WIDTH / 2.0;
        private double y = PLAYFIELD_HEIGHT / 2.0;
        private double angle;

        Placer(Random random, double margin, int level) {
            this.random = random;
            this.margin = margin;
            this.level = level;
            this.angle = random.nextDouble() * Math.PI * 2;
        }

        void reset() {
            x = PLAYFIELD_WIDTH / 2.0;
            y = PLAYFIELD_HEIGHT / 2.0;
        }

        void moveTo(PathPoint point, double newAngle) {
            x = point.x();
            y = point.y();
            angle = newAngle;
        }

        PathPoint next(double gapBeats) {
            boolean stream = gapBeats < 0.3;
            double distance = spacing(gapBeats) * (stream ? 0.95 + random.nextDouble() * 0.1 : 0.85 + random.nextDouble() * 0.3);
            double turn = stream
                    ? (random.nextDouble() - 0.5) * 0.7
                    : (0.6 + random.nextDouble() * 2.0) * (random.nextBoolean() ? 1 : -1);
            double base = angle + turn;
            for (int attempt = 0; attempt < 48; attempt++) {
                double a = base + (attempt / 2) * 0.45 * (attempt % 2 == 0 ? 1 : -1);
                double d = distance * Math.pow(0.85, attempt / 12);
                double nx = x + Math.cos(a) * d;
                double ny = y + Math.sin(a) * d;
                if (inside(nx, ny)) {
                    return place(nx, ny, a);
                }
            }
            // Cornered: head back towards the middle.
            double a = Math.atan2(PLAYFIELD_HEIGHT / 2.0 - y, PLAYFIELD_WIDTH / 2.0 - x);
            return place(x + Math.cos(a) * distance * 0.5, y + Math.sin(a) * distance * 0.5, a);
        }

        List<PathPoint> sliderPath(PathPoint start, double length) {
            double base = angle + (random.nextDouble() - 0.5) * 2.4;
            double ex = start.x();
            double ey = start.y();
            double direction = base;
            for (int attempt = 0; attempt < 32; attempt++) {
                direction = base + (attempt / 2) * 0.4 * (attempt % 2 == 0 ? 1 : -1);
                double l = length * Math.pow(0.85, attempt / 10);
                ex = start.x() + Math.cos(direction) * l;
                ey = start.y() + Math.sin(direction) * l;
                if (inside(ex, ey)) {
                    break;
                }
            }
            ex = clampX(ex);
            ey = clampY(ey);
            var end = new PathPoint((int) Math.round(ex), (int) Math.round(ey));
            if (random.nextDouble() < 0.3) {
                return List.of(start, end);
            }
            double bend = (random.nextDouble() * 0.7 - 0.35) * length;
            double cx = clampX((start.x() + ex) / 2 - Math.sin(direction) * bend);
            double cy = clampY((start.y() + ey) / 2 + Math.cos(direction) * bend);
            return List.of(start, new PathPoint((int) Math.round(cx), (int) Math.round(cy)), end);
        }

        private PathPoint place(double nx, double ny, double a) {
            x = clampX(nx);
            y = clampY(ny);
            angle = a;
            return new PathPoint((int) Math.round(x), (int) Math.round(y));
        }

        private double spacing(double gapBeats) {
            if (gapBeats < 0.3) {
                return level >= 4 ? 44 : 38;
            }
            if (gapBeats < 0.6) {
                return switch (level) {
                    case 1 -> 70;
                    case 2 -> 85;
                    case 3 -> 125;
                    default -> 175;
                };
            }
            double base = switch (level) {
                case 1 -> 110;
                case 2 -> 140;
                case 3 -> 165;
                default -> 200;
            };
            return base * (1 + 0.15 * (Math.min(gapBeats, 2) - 1));
        }

        private boolean inside(double px, double py) {
            return px >= margin && px <= PLAYFIELD_WIDTH - margin && py >= margin && py <= PLAYFIELD_HEIGHT - margin;
        }

        private double clampX(double value) {
            return Math.clamp(value, margin, PLAYFIELD_WIDTH - margin);
        }

        private double clampY(double value) {
            return Math.clamp(value, margin, PLAYFIELD_HEIGHT - margin);
        }
    }
}
