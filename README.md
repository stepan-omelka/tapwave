# Tapwave

A browser rhythm game in the circle-clicking genre: hit circles as their approach ring closes, follow sliders, spin spinners — keep the combo, keep your HP up. Scores go to a server-verified leaderboard.

Tapwave is an original game. Its gameplay is inspired by the genre that osu! made popular, but it has its own name, visuals and generated maps, and it uses no assets from any other game. Its music is either synthesised live in the browser or openly licensed (CC0 / CC BY 4.0) — see [CREDITS.md](CREDITS.md).

**Stack:** Angular 22 (zoneless, signals, Canvas 2D, Web Audio) · Spring Boot 4.1 / Java 21 · PostgreSQL 17 · Flyway · Testcontainers · Vitest.

## Run it locally

Requirements: Java 21, Node 24, Docker.

```bash
docker compose up -d                     # PostgreSQL on localhost:5433
cd backend && ./mvnw spring-boot:run     # API on :8081, generates the maps on first start
cd frontend && npm install && npm start  # http://localhost:4201 (proxies /api to :8081)
```

Controls: move with the mouse, hit with **Z / X** (physical keys, so it works on QWERTZ too) or the mouse buttons, **Space** skips a long intro, **Esc** pauses, **R** retries. "Watch autoplay" shows a perfect run.

### Tracks

| Track | Artist | Difficulty | BPM | Music |
| --- | --- | --- | --- | --- |
| Morning Static | Tapwave synth | Warm-up | 104 | original, synthesised |
| Level 1 | Juhani Junkala | Easy | 181 | CC0 |
| Voxel Revolution | Kevin MacLeod | Normal | 122 | CC BY 4.0 |
| Neon Drift | Tapwave synth | Normal | 124 | original, synthesised |
| Brain Dance | Kevin MacLeod | Hard | 124 | CC BY 4.0 |
| Level 3 | Juhani Junkala | Hard | 211 | CC0 |
| Overclock | Tapwave synth | Hard | 148 | original, synthesised |
| Hyperlane | Tapwave synth | Insane | 172 | original, synthesised |

## How it works

```
Angular (song select, play page)
  └─ game/                      plain TypeScript, no Angular inside
       engine.ts                game loop: audio clock → input → judgement → renderer
       renderer.ts              Canvas 2D drawing + HUD
       audio.ts                 AudioContext clock, procedural synth track, hit sounds
       score-keeper.ts, rules.ts  scoring rules (mirrored in Java)
       autoplay.ts              demo player
        │  POST /api/beatmaps/{id}/plays   → play token
        │  POST /api/plays/{token}/score   → per-object results
Spring Boot
  beatmap/   generator + seeding (application.yml), JSONB hit objects; notes follow each song's onsets
  gameplay/  Difficulty, ScoreCalculator, HumanTimingCheck
  score/     submission, players, leaderboard (DISTINCT ON + window functions via JdbcClient)
PostgreSQL   beatmap · player · play_session · score   (Flyway V1__init.sql, V2__music_credits.sql)
tools/beatgrid.py   finds a song's exact BPM and first downbeat for its map spec (numpy)
```

### Gameplay rules

| Setting | Effect |
| --- | --- |
| CS (circle size) | radius = 54.4 − 4.48 × CS playfield units |
| AR (approach rate) | objects appear 1200 ms before their time at AR 5, ±150 ms per step above 5, +120 ms per step below |
| OD (timing) | hit windows ±(80 − 6·OD) ms → 300, ±(140 − 8·OD) → 100, ±(200 − 10·OD) → 50 |
| HP | how much a miss hurts; HP only changes on judgements, so the server can replay it exactly |

- **Sliders:** head + every tick / repeat / tail is a scoring point; the slider's judgement is 300 if all are hit, 100 for at least half, 50 for any. Dropping a tick or a repeat breaks the combo, a missed tail does not.
- **Spinners:** need `duration × (1 + 0.15·OD)` rotations; each extra full spin is +100. Speed is capped at 8 rotations/s on both sides.
- **Score per judgement:** `j + floor(j × combo / 25)` — integer maths, so Java and TypeScript agree to the point.
- **Accuracy:** weighted share of 300/100/50; **grades** SS (100 %), S (≥ 95 %, no miss), A ≥ 90, B ≥ 80, C ≥ 70, D.

The live HUD score and the server's score come from the same rules implemented twice. `shared/scoring-golden.json` holds golden cases that both test suites run, and `engine.spec.ts` drives the real game engine headless with sloppy scripted players and checks the live score against the recomputation.

### Anti-cheat, and its limits

The client never sends a score. It sends what happened to each object (hit offset in ms, slider part flags, spin count) and the server recomputes everything. A submission is rejected when:

- the play token is unknown, expired (2 h) or already used — tokens are claimed atomically and a rejected attempt burns the token;
- it arrives faster than the map can be played;
- any hit lies outside its timing window, a slider has the wrong number of parts, or a spinner was spun faster than possible;
- HP would have run out (failed plays are not ranked);
- the timing is too consistent to be human (spread < 2 ms or more than half of the hits at exactly 0 ms).

What it **cannot** stop: someone who reads the API and forges a plausible-looking result with noise added. A browser game cannot fully prevent that; the real fix would be to submit the raw input (key and cursor events) and re-simulate the play on the server. Other open items: no rate limiting on token creation, and player names are not tied to accounts.

## Adding your own song

Only use music you are allowed to redistribute: your own, CC0, or CC BY (with the credit). The backend refuses to start if a map with an audio file does not name its license and source.

1. Put the audio file in `frontend/public/audio/`, e.g. `my-song.mp3`.
2. Measure its beat grid. `tools/beatgrid.py` needs Python 3 with numpy:

   ```bash
   afconvert -f WAVE -d LEI16@44100 -c 1 my-song.mp3 /tmp/my-song.wav   # macOS; elsewhere: ffmpeg -i my-song.mp3 -ac 1 -ar 44100 /tmp/my-song.wav
   python3 tools/beatgrid.py /tmp/my-song.wav --bpm 128 \
       --export backend/src/main/resources/rhythm/my-song.txt           # --bpm is an optional hint
   ```

   It prints the exact BPM and the first downbeat (`offset-ms`), how tightly the song's onsets sit on that grid (a good fit is a median of a few ms), and a table of every bar with its loudness and number of onsets. Check the cross-checks it prints; the bar line can be a beat off on songs with a pick-up. `--export` writes the song's rhythm: the onset strength at every quarter beat, one bar per line.

   The times refer to the decoded WAV. Browsers do not all decode an MP3's first samples the same way: for MP3s without gapless info Chrome keeps the 529-sample (12 ms at 44.1 kHz) decoder delay that macOS trims, so the Kevin MacLeod maps add 12 ms to the measured offset. Players can correct the rest with the audio offset setting.

3. Add an entry under `tapwave.seed.maps` in `backend/src/main/resources/application.yml`:

   ```yaml
   - slug: my-song-normal
     title: My Song
     artist: My Band
     difficulty-name: Normal
     audio-url: /audio/my-song.mp3
     source-url: https://my-band.example/my-song   # where the song is published
     license: CC BY 4.0
     license-url: https://creativecommons.org/licenses/by/4.0/
     bpm: 128.002        # from beatgrid.py
     offset-ms: 230      # first downbeat, from beatgrid.py
     rhythm: rhythm/my-song.txt  # from beatgrid.py --export
     bars: 48            # map length in 4/4 bars from the offset (bar 0 is lead-in, the last bar a spinner)
     breaks: [30-31]     # optional: bars without notes even though the song has onsets there
     level: 2            # pattern density 1–4
     circle-size: 4
     approach-rate: 7
     overall-difficulty: 5
     hp-drain: 4
     seed: 1
   ```

4. Restart the backend — maps whose slug is not in the database yet are generated on startup. Add a line to [CREDITS.md](CREDITS.md).

With a rhythm file, the generator puts notes where the song has onsets. Every grid slot the level allows (beats for level 1, eighths for 2, sixteenths for 3–4) gets a score: onset strength × metrical weight (downbeat > beat > eighth > sixteenth). The strongest are taken first, keeping the level's minimum gap, at most a few notes in a row at that gap and a per-bar cap, until the level's density is reached. Slots below a strength floor never get a note, so quiet passages turn into rests by themselves, and longer gaps become sliders. Without a rhythm file (the synthesised tracks, whose drums play exactly on the grid), it uses fixed rhythm templates per bar. Either way the map follows the rhythm, not the melody or the pitch; a long intro can be skipped with Space.

## Deployment

Runs for free on [Render](https://render.com) (game and API) and [Neon](https://neon.tech) (PostgreSQL). Neither has a card on file: a free service that hits a limit is suspended until the next month instead of being billed.

The root `Dockerfile` builds the Angular app into the Spring Boot jar, so one service serves the game, its audio and the API from one origin (no CORS). `render.yaml` describes that service as a Render Blueprint.

1. **Neon:** create a project in AWS Europe Central (Frankfurt) and take the **direct** connection string (pooling off): Flyway needs a session, and Neon's pooler runs in transaction mode. With the CLI:
   ```bash
   neon projects create --name tapwave --region-id aws-eu-central-1 -o json | jq -r .project.id
   { printf 'DATABASE_URL_UNPOOLED='; neon connection-string --project-id <id>; } >> .env.local   # git-ignored
   ```
2. **Render:** give the Render GitHub app access to this repository first (otherwise pushes don't redeploy), then *New → Blueprint* and pick it. Render reads `render.yaml` and asks for `DATABASE_URL`: paste the direct Neon connection string, `postgresql://user:password@host/db?sslmode=require`. `DatabaseUrlEnvironmentPostProcessor` turns it into Spring's JDBC URL, user and password (locally `DB_URL`, `DB_USER` and `DB_PASSWORD` still apply).
3. On its first start the app runs the Flyway migrations and generates the maps. Every push to `main` redeploys.

How it stays within the free tiers:

- **Render** stops the service after 15 minutes without traffic; the next visit waits about a minute while it starts. There is no keep-awake ping: the workspace's 750 free instance hours a month are shared with another always-on service.
- Render's health check uses `/actuator/health/liveness`, which never touches the database (`/actuator/health` does, and hangs for 30 s when the database is asleep or down).
- **Bandwidth** is the tightest limit: the free workspace includes 5 GB of outbound traffic a month for all its services, and the songs are 1.5–6.6 MB each. Hashed bundles are cached for a year, songs for 30 days, and text responses are gzipped, so a returning player downloads almost nothing.
- **Neon** scales to zero after 5 idle minutes. Hikari closes idle connections after a minute (`minimum-idle: 0`), so the database sleeps whenever nobody plays and stays far below the free plan's 100 CU-hours per project a month (about 400 hours at the smallest size). Free storage is 1 GB per project; the eight maps and their scores use a few MB.
- The JVM is tuned for Render's 512 MB instance (`-XX:MaxRAMPercentage=75 -XX:+UseSerialGC -XX:TieredStopAtLevel=1`); the image starts with about 370 MB in use.

To check the production image locally: `docker buildx build --platform linux/amd64 -t tapwave .` and run it with `--memory 512m -e PORT=10000 -e DATABASE_URL=postgresql://…`.

## Tests

```bash
cd backend && ./mvnw test        # 55 tests: scoring, golden cases, generator (templates and onset placement), breaks and licensing rules, timing check, API round trip (Testcontainers), DATABASE_URL parsing, deep links
cd frontend && npm test          # 17 tests: golden cases, headless engine parity, intro skip, slider paths
```

## Built with AI — and where it went wrong

The project was built with Claude Code (Opus 5.5), including research, code, tests, a separate review agent and browser verification. Things the AI got wrong along the way, kept here on purpose:

1. **Wrong Spring Boot version string.** It copied `4.1.2.RELEASE` from start.spring.io's metadata into the generated pom; Maven Central only has `4.1.2`, so the first build failed.
2. **Jackson ate the slider data, twice.** Helper methods `isSlider()` on the `HitObject` record were serialised as a boolean property `slider`, overwriting the real slider shape. The first fix (`@JsonIgnore` on the helper) made Jackson drop the real `slider` field as well, because it treats both as one property. Fixed by renaming the helper to `is(type)`. Both bugs only showed up when the API was actually called — the code compiled fine.
3. **Shared test database.** Two integration tests both posted perfect scores; the leaderboard order then depended on test order. Fixed by cleaning tables before each test.
4. **A broken template from a scripted edit.** An automated HTML edit dropped a closing `</ul>`; the Angular compiler caught it.
5. **Bugs only the review agent found** (all fixed): the game clock jumped forward after every pause (two different audio clocks were mixed), "press any key to start" ignored every key because the Start button had focus, a rejected submission left its token reusable for probing the validator, the results screen and the leaderboard could disagree on rank for tied scores, an `AudioContext` leaked when audio failed to load, and very short sliders could force a head miss while the head's timing window was still open.
6. **The beat finder locked onto the off-beats.** The first version of `tools/beatgrid.py` found the right tempo for all four licensed songs but put the beat half a beat late on three of them: hi-hats and snares outweigh the kick drum in a full-band onset sum. Nothing in its own output looked wrong (onsets fitted the grid within 1–2 ms, because off-beats are on the grid too). It was caught by noticing that the reported phases were exactly half a beat after each song's first sound, and fixed by taking the half-beat that the song's first onset lands on. It also labelled the two chiptunes as 90.5 and 105.5 BPM; the kick/snare pattern shows they are 181 and 211.
7. **Two first drafts of onset mapping that looked fine in code.** The rhythm export first reused the beat tracker's envelope, which measures rises relative to the local average, so sustained pads in a breakdown scored like drum hits; looking at the exported digits for a bar known to be silent showed it, and only real onset peaks count now. The first note picker took the strongest onsets song-wide, which filled loud sections of the Normal map with whole bars of eighths; a preview of notes per bar showed it, and a per-bar cap and a limit on notes in a row fixed it.
8. **Limits it can't code away:** the anti-cheat section above is honest about what a browser game can and cannot guarantee.
