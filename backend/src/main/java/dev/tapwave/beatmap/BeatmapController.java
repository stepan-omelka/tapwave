package dev.tapwave.beatmap;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/beatmaps")
class BeatmapController {

    private final BeatmapService beatmapService;

    BeatmapController(BeatmapService beatmapService) {
        this.beatmapService = beatmapService;
    }

    @GetMapping
    List<BeatmapSummary> list() {
        return beatmapService.list();
    }

    @GetMapping("/{id}")
    BeatmapDetail detail(@PathVariable long id) {
        return beatmapService.detail(id);
    }
}
