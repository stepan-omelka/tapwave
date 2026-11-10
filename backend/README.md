# `backend/`: the Spring Boot service

One Spring Boot app (Java 21, package `dev.tapwave`) that serves the REST API under `/api`, verifies
and stores scores, generates the maps at startup and, in production, serves the
[frontend](../frontend/README.md) build from `static/`. The `Dockerfile` copies that build in; locally
`ng serve` serves the frontend instead and proxies `/api` here.

## 📦 Packages

| Package             | Holds                                                                                           | Rule                                                                                             |
| :------------------ | :---------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| `beatmap`           | the `Beatmap` entity, its read API, `BeatmapService`, `BeatmapSeeder`                            | a stored map never changes, see [Maps](#️-maps)                                                  |
| `beatmap.generator` | `MapSpec`, `Rhythm`, `BeatmapGenerator`, `OnsetPlacement`                                        | deterministic: the same spec, seed and rhythm file always give the same map                     |
| `gameplay`          | `Difficulty`, `ScoreCalculator`, `HumanTimingCheck`, `ObjectResult`                              | pure Java with no database; mirrored in the frontend, see [rules implemented twice](../ARCHITECTURE.md#️-rules-implemented-twice) |
| `play`              | `PlaySession` (the play token), its repository, `PlaySessionCleanup`                             | the cleanup deletes expired tokens without a score every 10 minutes                             |
| `score`             | `PlayController` (plays, scores, leaderboards), `ScoreService`, `Player`, `Score`, `LeaderboardQueries` | leaderboard SQL is plain PostgreSQL through `JdbcClient`, not JPQL                    |
| `web`               | `SpaController`, `ApiExceptionHandler`, the domain exceptions                                    | errors are RFC 9457 problem responses                                                            |
| `config`            | `DatabaseUrlEnvironmentPostProcessor`, `TapwaveProperties`, `WebCacheConfig`, `ClockConfig`      | see [Configuration](#️-configuration)                                                            |

- **Time that a rule depends on comes from the injected `Clock`**, never `Instant.now()`, so tests can
  control it.
- **Jackson is version 3**: `JsonMapper` and friends are in `tools.jackson.*`, while the annotations
  stay in `com.fasterxml.jackson.annotation`.
- **A record method named `isX()` or `getX()` becomes a JSON property.** On `HitObject` that silently
  overwrote the real `slider` field, which is why its helper is `is(type)`.

## 🔌 API

| Method | Path                                    | Does                                                                     |
| :----- | :-------------------------------------- | :----------------------------------------------------------------------- |
| GET    | `/api/beatmaps`                         | every map, without hit objects, sorted by star rating                    |
| GET    | `/api/beatmaps/{id}`                    | one map with its hit objects                                             |
| POST   | `/api/beatmaps/{id}/plays`              | starts a play and returns its token, `playId`                            |
| POST   | `/api/plays/{playId}/score`             | submits a play's per-object results; answers with the server's numbers  |
| GET    | `/api/beatmaps/{id}/leaderboard?limit=` | each player's best score on the map                                      |
| GET    | `/api/scores/recent?limit=`             | the latest scores on any map                                             |
| GET    | `/play/{id}`                            | forwards to `index.html`, so a reload or shared link opens the game      |
| GET    | `/actuator/health/liveness`             | the host's health check; never touches the database                     |

A rejected play answers 422, a second submission with the same token 409, an unknown map or token
404, and invalid input 400. The frontend copies every request and response shape by hand into `core/models.ts`; the full list
of records is in [rules implemented twice](../ARCHITECTURE.md#️-rules-implemented-twice).

## 🗺️ Maps

- Every map is described by an entry under `tapwave.seed.maps` in `application.yml`, bound to
  `MapSpec`. A spec is validated at startup: a map with an audio file must name its license and
  source, and breaks must lie inside the map. An invalid spec stops the app.
- **A stored map never changes.** `BeatmapSeeder` generates only maps whose slug is not in the
  database, and `BeatmapService` caches each map's parsed objects for the life of the app. A change
  to the generator, a spec or a rhythm file therefore reaches only new slugs, locally and in
  production. To regenerate a map, give it a new slug, or delete its `beatmap` row and restart,
  which deletes its scores too.
- Scores are verified against the stored objects, so a stored map must stay exactly as it was.
- A map's `max_combo`, `star_rating` and `duration_ms` are computed once, at generation. A change to
  what adds combo, or to the star rating formula, leaves every stored map's values as they were.
- Adding a song is described in [`docs/adding-a-song.md`](../docs/adding-a-song.md).

## 🛡️ Submitting a score

`ScoreService.submit` checks a play in this order, and the order matters:

1. **Claim the token first**, atomically (`PlaySessionRepository.markSubmitted`). The transaction
   does not roll back on `InvalidPlayException`, so a rejected play still uses up its token and one
   token cannot be used to probe the validator.
2. Check the time: no later than `tapwave.play.max-age` after the token was issued, and no sooner
   than `min-duration-ratio` × the map's playable length.
3. Recompute everything with `ScoreCalculator` from the per-object results. A failed play is
   rejected; so is input that is impossible (outside a hit window, the wrong number of slider parts,
   spinning too fast) or too regular to be human (`HumanTimingCheck`).
4. Find or create the player, store the score, and rank it with `LeaderboardQueries.rankOf`, which
   orders exactly like the leaderboard, so the results screen and the leaderboard agree.

The client never sends a total, a combo or an accuracy. What the anti-cheat cannot stop is in the
[README](../README.md#anti-cheat-and-its-limits).

## 🗄️ Database

- The schema is Flyway's: `src/main/resources/db/migration/V<n>__<what>.sql`. **Never edit a
  migration that has been pushed**, since production has already applied it; add the next `V<n>`.
- Hibernate only validates (`ddl-auto: validate`), so an entity must match the schema exactly.
- `beatmap.hit_objects` is JSONB, held in the entity as a string and parsed by `BeatmapService`.
- Player names are unique regardless of letter case (a unique index on `lower(name)`), and
  `PlayerRepository.insertIfMissing` keeps two parallel first submissions from colliding.
- **A new `beatmap` column needs a backfill** in its migration: existing maps are never regenerated,
  so a value only the generator can compute cannot be filled in later without deleting maps and
  their scores. A new field travels from the `Beatmap` constructor through
  `BeatmapService.createIfMissing` and `BeatmapSummary.of` to `models.ts`.
- Leaderboard and recent-score fields come from the SQL column aliases in `LeaderboardQueries`.
- PostgreSQL 18 everywhere: `docker-compose.yml`, the Testcontainers image and Neon. Keep them on the
  same major version.

## ⚙️ Configuration

| Variable                                | Default                                   | What it is                                                                                 |
| :-------------------------------------- | :---------------------------------------- | :----------------------------------------------------------------------------------------- |
| `DATABASE_URL_UNPOOLED`, `DATABASE_URL` | unset                                     | A `postgresql://user:password@host/db` URL, as Neon and Render hand it out. The first one set wins over the three below. |
| `DB_URL`                                | `jdbc:postgresql://localhost:5433/tapwave` | JDBC URL for local development                                                            |
| `DB_USER`, `DB_PASSWORD`                | `tapwave`                                 | credentials for local development                                                          |
| `PORT`                                  | `8081`                                    | HTTP port; Render sets it                                                                  |

- `DatabaseUrlEnvironmentPostProcessor` turns the URL into Spring's datasource settings. It renames
  libpq's `channel_binding` to pgJDBC's `channelBinding` and keeps a `+` in the password; without
  that, Neon's `channel_binding=require` would be silently ignored. It is registered in
  `META-INF/spring.factories`, not as a bean, because it runs before the context exists.
- The Hikari settings in `application.yml` (`minimum-idle: 0`, `idle-timeout: 60000`) close idle
  connections so Neon can scale to zero. Keep them.
- `tapwave.play.*` in `application.yml` holds the play token's lifetime and the minimum play time.
- `WebCacheConfig` sets the browser cache headers that keep the hosting's bandwidth down.
- How production is set up is in [`docs/deployment.md`](../docs/deployment.md).

## 💻 Development

| Command                                           | What it does                                                                |
| :------------------------------------------------ | :-------------------------------------------------------------------------- |
| `docker compose up -d` (repo root)                | the local PostgreSQL on `localhost:5433`                                   |
| `./mvnw spring-boot:run`                          | the API on <http://localhost:8081>; generates missing maps on startup     |
| `./mvnw test`                                     | every test; needs Docker                                                    |
| `./mvnw test -Dtest=ScoreCalculatorTest`          | one test class                                                              |

`TestTapwaveApplication` (in the tests) starts the app on a throwaway Testcontainers database
instead of the compose one; run it from the IDE. Everything else follows
[`CONTRIBUTING.md`](../CONTRIBUTING.md).

## 🧪 Testing

| Layer       | Covers                                                                                         |
| :---------- | :--------------------------------------------------------------------------------------------- |
| unit        | gameplay rules and the golden cases, the timing check, the map generator, `DATABASE_URL` parsing |
| web slice   | `SpaController`'s forward and cache header                                                     |
| integration | the API over MockMvc against PostgreSQL 18 in a container: submissions, rejections, leaderboard |

- Run tests from `backend/`: `ScoreCalculatorGoldenTest` reads `../shared/scoring-golden.json`.
- `ScoreApiIntegrationTest` plays the map with the lowest star rating, and its robotic-timing test
  needs at least 20 timed hits on it. A new, easier map with fewer would break that test.
- A new table that references `player` or `play_session` must be added to the deletes in
  `ScoreApiIntegrationTest`'s `@BeforeEach`.

The layers, the golden cases and the test data are described in
[`docs/testing-strategy.md`](../docs/testing-strategy.md).
