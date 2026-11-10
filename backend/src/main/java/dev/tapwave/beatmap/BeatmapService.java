package dev.tapwave.beatmap;

import dev.tapwave.beatmap.generator.BeatmapGenerator;
import dev.tapwave.beatmap.generator.MapSpec;
import dev.tapwave.beatmap.generator.Rhythm;
import dev.tapwave.web.NotFoundException;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

@Service
public class BeatmapService {

    private static final TypeReference<List<HitObject>> HIT_OBJECTS = new TypeReference<>() {
    };

    private final BeatmapRepository repository;
    private final BeatmapGenerator generator;
    private final JsonMapper jsonMapper;
    private final ResourceLoader resources;
    /** Maps never change once stored, so their parsed objects can be cached for the lifetime of the app. */
    private final Map<Long, List<HitObject>> objectCache = new ConcurrentHashMap<>();

    public BeatmapService(BeatmapRepository repository, BeatmapGenerator generator, JsonMapper jsonMapper,
                          ResourceLoader resources) {
        this.repository = repository;
        this.generator = generator;
        this.jsonMapper = jsonMapper;
        this.resources = resources;
    }

    @Transactional(readOnly = true)
    public List<BeatmapSummary> list() {
        return repository.findAllByOrderByStarRatingAsc().stream().map(BeatmapSummary::of).toList();
    }

    @Transactional(readOnly = true)
    public BeatmapDetail detail(long id) {
        Beatmap beatmap = get(id);
        return new BeatmapDetail(BeatmapSummary.of(beatmap), hitObjects(beatmap));
    }

    @Transactional(readOnly = true)
    public Beatmap get(long id) {
        return repository.findById(id).orElseThrow(() -> new NotFoundException("Beatmap " + id + " does not exist"));
    }

    public List<HitObject> hitObjects(Beatmap beatmap) {
        return objectCache.computeIfAbsent(beatmap.getId(),
                id -> List.copyOf(jsonMapper.readValue(beatmap.getHitObjectsJson(), HIT_OBJECTS)));
    }

    /** @return {@code true} if the map was created, {@code false} if a map with that slug already exists */
    @Transactional
    public boolean createIfMissing(MapSpec spec) {
        if (repository.existsBySlug(spec.slug())) {
            return false;
        }
        BeatmapGenerator.GeneratedMap map = generator.generate(spec, rhythm(spec));
        repository.save(new Beatmap(spec.slug(), spec.title(), spec.artist(), spec.mapper(), spec.difficultyName(),
                spec.bpm(), spec.offsetMs(), spec.circleSize(), spec.approachRate(), spec.overallDifficulty(),
                spec.hpDrain(), map.durationMs(), spec.audioUrl(), spec.sourceUrl(), spec.license(), spec.licenseUrl(),
                spec.audioUrl() == null ? spec.seed() : null,
                map.starRating(), map.objects().size(), map.maxCombo(), jsonMapper.writeValueAsString(map.objects())));
        return true;
    }

    private Rhythm rhythm(MapSpec spec) {
        if (spec.rhythm() == null) {
            return null;
        }
        Resource resource = resources.getResource("classpath:" + spec.rhythm());
        if (!resource.exists()) {
            throw new IllegalStateException("rhythm file " + spec.rhythm() + " of map " + spec.slug() + " not found");
        }
        try {
            return Rhythm.parse(resource.getContentAsString(StandardCharsets.UTF_8));
        } catch (IOException e) {
            throw new UncheckedIOException("could not read rhythm file " + spec.rhythm(), e);
        }
    }
}
