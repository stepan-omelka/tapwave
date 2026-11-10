package dev.tapwave.config;

import java.time.Duration;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.mvc.WebContentInterceptor;

/**
 * Browser caching for the bundled frontend. The host's outbound bandwidth is limited (Render's free workspace has
 * 5 GB a month), and the songs are most of it, so a returning player should not download them again.
 */
@Configuration(proxyBeanMethods = false)
class WebCacheConfig implements WebMvcConfigurer {

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        var caching = new WebContentInterceptor();
        // Angular's bundles have a content hash in their names, so a new build never reuses a URL.
        caching.addCacheMapping(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable(),
                "/*.js", "/*.css", "/media/**");
        // Song files keep their names; replace a song under a new file name.
        caching.addCacheMapping(CacheControl.maxAge(Duration.ofDays(30)).cachePublic(), "/audio/**");
        // index.html names the current bundles: always revalidate it (a 304 costs almost nothing).
        caching.addCacheMapping(CacheControl.noCache(), "/", "/index.html", "/play/*");
        registry.addInterceptor(caching);
    }
}
