package dev.tapwave.config;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.boot.EnvironmentPostProcessor;
import org.springframework.boot.SpringApplication;
import org.springframework.core.env.ConfigurableEnvironment;
import org.springframework.core.env.MapPropertySource;

/**
 * Hosts such as Neon and Render hand out {@code DATABASE_URL=postgresql://user:password@host/db}; Spring needs a
 * JDBC URL plus separate credentials. When {@code DATABASE_URL_UNPOOLED} or {@code DATABASE_URL} is set, it wins
 * over {@code DB_URL}, {@code DB_USER} and {@code DB_PASSWORD}.
 */
public class DatabaseUrlEnvironmentPostProcessor implements EnvironmentPostProcessor {

    @Override
    public void postProcessEnvironment(ConfigurableEnvironment environment, SpringApplication application) {
        String databaseUrl = environment.getProperty("DATABASE_URL_UNPOOLED", environment.getProperty("DATABASE_URL", ""));
        if (!databaseUrl.isBlank()) {
            environment.getPropertySources().addFirst(new MapPropertySource("databaseUrl", toDataSourceProperties(databaseUrl)));
        }
    }

    /** {@code postgresql://user:password@host/db?sslmode=require} to spring.datasource.url, username and password. */
    static Map<String, Object> toDataSourceProperties(String databaseUrl) {
        URI uri;
        try {
            uri = URI.create(databaseUrl.strip());
        } catch (IllegalArgumentException e) {
            // The message would contain the URL, password included.
            throw new IllegalArgumentException("DATABASE_URL is not a valid URL");
        }
        if (!"postgresql".equals(uri.getScheme()) && !"postgres".equals(uri.getScheme())) {
            throw new IllegalArgumentException("DATABASE_URL must start with postgresql://");
        }
        String userInfo = uri.getRawUserInfo();
        if (userInfo == null || !userInfo.contains(":")) {
            throw new IllegalArgumentException("DATABASE_URL must contain a user and a password");
        }
        int separator = userInfo.indexOf(':');
        String port = uri.getPort() == -1 ? "" : ":" + uri.getPort();
        String query = uri.getRawQuery() == null ? "" : "?" + uri.getRawQuery();
        return Map.of(
                "spring.datasource.url", "jdbc:postgresql://" + uri.getHost() + port + uri.getRawPath() + query,
                "spring.datasource.username", decode(userInfo.substring(0, separator)),
                "spring.datasource.password", decode(userInfo.substring(separator + 1)));
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }
}
