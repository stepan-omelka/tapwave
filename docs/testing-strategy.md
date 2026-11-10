# 🧪 Testing strategy

## Principles

- **Test coverage over code coverage.** A percentage says how much code ran, not how much behaviour
  is pinned down. Ask which scenario is untested, not which line is unvisited.
- **Black-box over white-box.** Test through a unit's public interface, so that a refactor which
  keeps the contract keeps the tests green.
- **A test reads as documentation.** The name states the expected behaviour; the body shows how the
  unit is meant to be used.
- **DAMP over DRY.** Repetition inside a test is cheaper than indirection the reader has to unpack.
- **Flaky means failing.** A test that passes intermittently carries no signal; fix it or delete it.
- **Rules that exist twice are tested against the same data.** See [golden cases](#golden-cases).

## Layers

|          | Backend unit                                    | Backend web slice      | Backend integration                         | Frontend unit                                  |
| :------- | :---------------------------------------------- | :--------------------- | :------------------------------------------ | :--------------------------------------------- |
| Scope    | gameplay rules, map generator, config parsing   | one controller         | the whole app over HTTP, real PostgreSQL    | game logic, slider paths, the engine headless  |
| Tools    | JUnit Jupiter, AssertJ                          | `@WebMvcTest`, MockMvc | `@SpringBootTest`, MockMvc, Testcontainers  | Vitest with jsdom (`@angular/build:unit-test`) |
| Files    | `backend/src/test/java/…/*Test.java`            | `*Test.java`           | `ScoreApiIntegrationTest`, `TapwaveApplicationTests` | `frontend/src/**/*.spec.ts`, beside the source |
| Command  | `cd backend && ./mvnw test`                     | same                   | same, needs Docker                          | `cd frontend && npx ng test --watch=false`     |

- Backend tests sit in the same package as the code they cover, so package-private classes stay
  package-private.
- **Integration tests start their own PostgreSQL 18 container** (`TestcontainersConfiguration`)
  and never touch the local development database. They delete players, plays and scores before
  each test; the maps are generated once, from `application.yml`, when the context starts.
- A score submitted right after its play started is rejected as too fast, so integration tests
  back-date `play_session.started_at` with SQL instead of waiting.
- **There are no browser tests.** Rendering, audio and input are checked by hand in a browser
  (`npm start`, then play a map and watch autoplay), with the dev-mode score checks described in the
  [frontend README](../frontend/README.md#-the-game-engine).

## Golden cases

The scoring rules are implemented twice, in Java and TypeScript (see
[`ARCHITECTURE.md`](../ARCHITECTURE.md#️-rules-implemented-twice)). `shared/scoring-golden.json`
holds one small map and a list of plays with their expected totals, combo, accuracy, grade and
counts. Both sides run every case:

| Test                         | Runs                                                                   |
| :--------------------------- | :--------------------------------------------------------------------- |
| `ScoreCalculatorGoldenTest`  | every case through the server's `ScoreCalculator`                      |
| `score-keeper.spec.ts`       | every case through the client's `calculateScore`                       |
| `engine.spec.ts`             | the real `GameEngine` with a fake canvas and audio clock: autoplay and scripted sloppy players, checking that the live HUD score equals the recomputed one |

A scoring change without a new or updated golden case is untested on one of the two sides. The map
`engine.spec.ts` generates for itself has no slider ticks, so the golden map is the only place the
live engine meets one.

## Test data

| Data              | Where it comes from                                                    |
| :---------------- | :--------------------------------------------------------------------- |
| Maps              | generated from `tapwave.seed.maps` in `application.yml` on startup, deterministic per seed |
| Golden map        | hand-written in `shared/scoring-golden.json`                           |
| Generator inputs  | built in the test (`OnsetPlacementTest` writes its own rhythm text)    |
| Players and scores | created by the test through the API                                   |
