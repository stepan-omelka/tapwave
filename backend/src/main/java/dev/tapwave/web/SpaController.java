package dev.tapwave.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * The Angular app is served from {@code static/}; its client-side routes have no file behind them, so a reload or a
 * shared link to one gets the app's index.html, and Angular's router takes over. "/" is Spring's welcome page.
 */
@Controller
class SpaController {

    @GetMapping("/play/{id}")
    String app() {
        return "forward:/index.html";
    }
}
