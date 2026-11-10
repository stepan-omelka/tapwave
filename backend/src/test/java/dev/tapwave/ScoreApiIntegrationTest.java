package dev.tapwave;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import dev.tapwave.beatmap.BeatmapService;
import dev.tapwave.beatmap.BeatmapSummary;
import dev.tapwave.beatmap.HitObject;
import dev.tapwave.gameplay.Difficulty;
import dev.tapwave.gameplay.ObjectResult;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.json.JsonMapper;

/** Full round trip against a real PostgreSQL (Testcontainers): start a play, submit, read the leaderboard. */
@Import(TestcontainersConfiguration.class)
@SpringBootTest
@AutoConfigureMockMvc
class ScoreApiIntegrationTest {

    @Autowired
    MockMvc mvc;
    @Autowired
    JsonMapper json;
    @Autowired
    JdbcClient jdbc;
    @Autowired
    BeatmapService beatmapService;

    private BeatmapSummary map;
    private List<HitObject> objects;

    @BeforeEach
    void cleanScoresAndPickMap() {
        jdbc.sql("delete from score").update();
        jdbc.sql("delete from play_session").update();
        jdbc.sql("delete from player").update();
        map = beatmapService.list().getFirst();
        objects = beatmapService.detail(map.id()).hitObjects();
    }

    @Test
    void perfectPlayIsVerifiedAndRanked() throws Exception {
        UUID playId = startPlay();
        backdate(playId);

        mvc.perform(post("/api/plays/{id}/score", playId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("playerName", "Tester", "results", perfectResults()))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.accuracy").value(100.0))
                .andExpect(jsonPath("$.grade").value("SS"))
                .andExpect(jsonPath("$.maxCombo").value(map.maxCombo()))
                .andExpect(jsonPath("$.rank").value(1))
                .andExpect(jsonPath("$.personalBest").value(true));

        mvc.perform(get("/api/beatmaps/{id}/leaderboard", map.id()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].playerName").value("Tester"))
                .andExpect(jsonPath("$[0].grade").value("SS"));
    }

    @Test
    void samePlayCannotBeSubmittedTwice() throws Exception {
        UUID playId = startPlay();
        backdate(playId);
        String body = json.writeValueAsString(Map.of("playerName", "Twice", "results", perfectResults()));

        mvc.perform(post("/api/plays/{id}/score", playId).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isCreated());
        mvc.perform(post("/api/plays/{id}/score", playId).contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().isConflict());
    }

    @Test
    void submittingFasterThanTheSongIsRejected() throws Exception {
        UUID playId = startPlay();

        mvc.perform(post("/api/plays/{id}/score", playId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("playerName", "Speedy", "results", perfectResults()))))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.detail").value("Score submitted faster than the map can be played"));
    }

    @Test
    void roboticTimingIsRejectedAndBurnsTheToken() throws Exception {
        UUID playId = startPlay();
        backdate(playId);

        mvc.perform(post("/api/plays/{id}/score", playId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("playerName", "Bot", "results", roboticResults()))))
                .andExpect(status().isUnprocessableContent())
                .andExpect(jsonPath("$.detail").value("Hit timing is too consistent to come from a person"));
        // The rejected attempt used the token up, so it cannot be retried with tweaked data.
        mvc.perform(post("/api/plays/{id}/score", playId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("playerName", "Bot", "results", perfectResults()))))
                .andExpect(status().isConflict());
    }

    @Test
    void invalidPlayerNameIsRejected() throws Exception {
        UUID playId = startPlay();
        backdate(playId);

        mvc.perform(post("/api/plays/{id}/score", playId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("playerName", "<script>", "results", perfectResults()))))
                .andExpect(status().isBadRequest());
    }

    private UUID startPlay() throws Exception {
        String response = mvc.perform(post("/api/beatmaps/{id}/plays", map.id()))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return UUID.fromString(json.readTree(response).get("playId").asString());
    }

    /** Pretends the play started long enough ago for the whole map to have been played. */
    private void backdate(UUID playId) {
        int updated = jdbc.sql("update play_session set started_at = now() - interval '10 minutes' where id = :id")
                .param("id", playId)
                .update();
        assertThat(updated).isEqualTo(1);
    }

    /** Every object hit within the 300 window, with human-like spread in the timing. */
    private List<ObjectResult> perfectResults() {
        var random = new Random(7);
        int spread = (int) Difficulty.window300(map.overallDifficulty()) - 5;
        return objects.stream().map(o -> {
            int offset = (int) Math.round(Math.clamp(random.nextGaussian() * 12, -spread, spread));
            return switch (o.type()) {
                case HitObject.SLIDER -> new ObjectResult(offset, o.slider().parts().stream().map(p -> true).toList(), null);
                case HitObject.SPINNER -> new ObjectResult(null, null,
                        Difficulty.requiredSpins(o.finishTime() - o.time(), map.overallDifficulty()));
                default -> new ObjectResult(offset, null, null);
            };
        }).toList();
    }

    /** What a naive bot (or replayed autoplay) would send: every hit exactly on time. */
    private List<ObjectResult> roboticResults() {
        return perfectResults().stream()
                .map(r -> r.offset() == null ? r : new ObjectResult(0, r.parts(), r.spins()))
                .toList();
    }
}
