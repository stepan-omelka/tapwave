# `frontend/`: the Angular app and the game

An Angular SPA with two lazy-loaded pages: the song select (`/`) and the play page (`/play/:id`).
The game itself is plain TypeScript in `src/app/game/`, with no Angular inside, so it can run headless
in tests. It talks to the [backend](../backend/README.md) under `/api`; in production the backend also
serves this build.

## 🧱 Structure

| Path                        | Holds                                                                                                     |
| :-------------------------- | :-------------------------------------------------------------------------------------------------------- |
| `src/app/core/`             | `ApiService` (calls that change state), `models.ts` (the API's types), `SettingsService`, formatting helpers |
| `src/app/pages/song-select/` | the map list, leaderboard, recent scores and settings                                                    |
| `src/app/pages/play/`       | the play page: a state machine (`PlayState`) around the engine, its overlays and the score submission |
| `src/app/game/`             | the game: `engine.ts`, `renderer.ts`, `audio.ts`, `rules.ts`, `score-keeper.ts`, `slider-path.ts`, `autoplay.ts` |

- Angular conventions here: standalone components, no zone.js, signals for state, `@Service()` for
  services, and `httpResource` for read-only lists in the pages. Component inputs are bound from route
  and query parameters (`withComponentInputBinding`).
- **`core/models.ts` is written by hand** from the backend's records, with no code generation; the
  full list is in [rules implemented twice](../ARCHITECTURE.md#️-rules-implemented-twice).
- **A new route needs the backend too.** In production the backend's `SpaController` forwards only
  `/play/{id}` to `index.html`, and `WebCacheConfig` marks only `/`, `/index.html` and `/play/*` as
  no-cache. Without both, a reload or a shared link to the new route is a 404 in production, while
  `ng serve` works fine.
- Player settings (name, volume, audio offset, background dim) live in `localStorage` under
  `tapwave.settings`.

## 🎮 The game engine

- **The `AudioContext` clock is the only clock.** Song time comes from `AudioEngine.timeMs()`, which
  corrects for output latency; pausing suspends the context, which freezes the music and the clock
  together. Never derive song time from `performance.now()` or frame counts.
- **Objects are judged strictly in order**: an object cannot be hit before every earlier one is
  resolved, and slider parts are scored only after their head. That is how the live score stays equal
  to the server's recomputation, which processes results in the same order.
- **A hit is back-dated to its event's `timeStamp`**, so time spent waiting for the handler does not
  count as lateness.
- **Keys are matched by physical position** (`KeyZ`, `KeyX`), so QWERTZ and other layouts work.
- **Audio may only start from a user gesture**: the play page starts or resumes it inside the click or
  key handler, not after an `await`.
- **The synth tracks cannot seek**: they are scheduled bar by bar from the start, so only songs from
  audio files offer the intro skip.
- The playfield is 512 × 384 units inside a 640 × 480 virtual screen; the renderer scales that to the
  canvas and holds no game state besides the cursor trail.

The scoring rules in `rules.ts` and `score-keeper.ts`, and the live judgement in `engine.ts`, mirror
the backend's; see
[rules implemented twice](../ARCHITECTURE.md#️-rules-implemented-twice) before changing them. In dev
mode the play page logs a console warning when the live, recomputed and server scores differ, and
exposes the running engine as `window.tapwave`.

## 💻 Development

| Command                          | What it does                                                                                 |
| :------------------------------- | :------------------------------------------------------------------------------------------- |
| `npm install`                    | install dependencies (npm 11, Node 24)                                                       |
| `npm start`                      | dev server on <http://localhost:4201>, proxying `/api` to the backend on `:8081` (`proxy.conf.json`) |
| `npx ng build`                   | production build into `dist/frontend/browser/`, with type checks and bundle budgets         |
| `npx prettier --write src`       | format; `npx prettier --check src` must pass                                                  |

Open `/play/<id>?auto=1` to watch autoplay on a map. Everything else follows
[`CONTRIBUTING.md`](../CONTRIBUTING.md).

## 🧪 Testing

| Spec                    | Covers                                                                                                      |
| :---------------------- | :---------------------------------------------------------------------------------------------------------- |
| `score-keeper.spec.ts`  | the scoring rules and every golden case shared with the backend                                            |
| `engine.spec.ts`        | the real engine with a fake canvas and audio clock: autoplay and sloppy scripted players score the same live and recomputed; the intro skip |
| `slider-path.spec.ts`   | slider curves and the ball's position along them                                                            |
| `link-preview.spec.ts`  | the link-preview tags in `index.html` and the 1200 × 630 image they point at on the live domain              |

- Run them once with `npx ng test --watch=false`.
- Rendering, audio and input have no automated tests; check them by playing in a browser.

The layers and the golden cases are described in
[`docs/testing-strategy.md`](../docs/testing-strategy.md).
