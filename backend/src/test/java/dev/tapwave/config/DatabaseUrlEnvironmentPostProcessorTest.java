package dev.tapwave.config;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class DatabaseUrlEnvironmentPostProcessorTest {

    @Test
    void convertsNeonConnectionString() {
        var properties = DatabaseUrlEnvironmentPostProcessor.toDataSourceProperties(
                "postgresql://neondb_owner:npg_s3cr%40t@ep-cool-name-123.eu-central-1.aws.neon.tech/neondb?sslmode=require");

        assertThat(properties)
                .containsEntry("spring.datasource.url",
                        "jdbc:postgresql://ep-cool-name-123.eu-central-1.aws.neon.tech/neondb?sslmode=require")
                .containsEntry("spring.datasource.username", "neondb_owner")
                .containsEntry("spring.datasource.password", "npg_s3cr@t");
    }

    @Test
    void keepsExplicitPort() {
        var properties = DatabaseUrlEnvironmentPostProcessor.toDataSourceProperties("postgres://app:pw@localhost:5433/game");

        assertThat(properties).containsEntry("spring.datasource.url", "jdbc:postgresql://localhost:5433/game");
    }

    @Test
    void rejectsUrlWithoutCredentials() {
        assertThatThrownBy(() -> DatabaseUrlEnvironmentPostProcessor.toDataSourceProperties("postgresql://host/db"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void neverPutsTheUrlIntoAnErrorMessage() {
        assertThatThrownBy(() -> DatabaseUrlEnvironmentPostProcessor.toDataSourceProperties("postgresql://u:p w@host/db"))
                .hasMessageNotContaining("p w");
    }

    @Test
    void unpooledUrlWinsAndOverridesDbUrl() {
        var environment = new MockEnvironment()
                .withProperty("DATABASE_URL", "postgresql://pooled:a@pooler.example/db")
                .withProperty("DATABASE_URL_UNPOOLED", "postgresql://direct:b@direct.example/db")
                .withProperty("spring.datasource.url", "jdbc:postgresql://localhost:5433/tapwave");

        new DatabaseUrlEnvironmentPostProcessor().postProcessEnvironment(environment, null);

        assertThat(environment.getProperty("spring.datasource.url")).isEqualTo("jdbc:postgresql://direct.example/db");
        assertThat(environment.getProperty("spring.datasource.username")).isEqualTo("direct");
    }

    @Test
    void withoutDatabaseUrlTheLocalSettingsStay() {
        var environment = new MockEnvironment().withProperty("spring.datasource.url", "jdbc:postgresql://localhost:5433/tapwave");

        new DatabaseUrlEnvironmentPostProcessor().postProcessEnvironment(environment, null);

        assertThat(environment.getProperty("spring.datasource.url")).isEqualTo("jdbc:postgresql://localhost:5433/tapwave");
    }
}
