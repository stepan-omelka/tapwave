# 📙 Glossary

The game's terms as Tapwave uses them. Most come from the circle-clicking rhythm genre. The exact
formulas live in [`Difficulty.java`](../backend/src/main/java/dev/tapwave/gameplay/Difficulty.java)
and [`rules.ts`](../frontend/src/app/game/rules.ts); the player-facing summary is in the
[README](../README.md#gameplay-rules).

> [!WARNING]
> **"Offset" means three different things.** A map's `offset-ms` is when its first downbeat is heard
> in the audio file. A hit's `offset` is how many ms early (negative) or late (positive) the player
> hit an object. The player's audio offset setting (`offsetMs` in the settings) shifts the game
> against the music to make up for audio latency. Always say which one you mean.
>
> **"Lead-in" means two things too.** The generator keeps bar 0 of every map empty, and the engine
> adds `LEAD_IN_MS` (1.2 s) before the first object appears.

## 🗺️ Maps and songs

| Term               | Meaning                                                                                                          | In code                               |
| :----------------- | :--------------------------------------------------------------------------------------------------------------- | :------------------------------------ |
| map, beatmap       | One playable chart: a song at one difficulty, with its hit objects.                                             | `Beatmap`, table `beatmap`             |
| slug               | A map's stable key, e.g. `brain-dance-hard`. Startup generates every map whose slug is not in the database yet. | `MapSpec.slug`, `beatmap.slug`        |
| map spec           | A map's entry under `tapwave.seed.maps` in `application.yml`: song, grid, difficulty settings, seed.           | `MapSpec`                             |
| difficulty name    | The label players see, e.g. Easy or Hard.                                                                       | `difficultyName`                      |
| level              | How dense the generated patterns are, 1 to 4. Separate from the difficulty settings below.                      | `MapSpec.level`                       |
| star rating        | A difficulty estimate computed when a map is generated; the song list is sorted by it.                         | `starRating`                          |
| synth track        | Music generated live in the browser from the map's seed, instead of an audio file. Cannot seek.                 | `audioUrl == null`, `synthSeed`       |
| mapper             | Who made the map; always the generator here.                                                                    | `mapper = "tapwave-generator"`        |

## 🥁 Rhythm and map generation

| Term          | Meaning                                                                                                              | In code                         |
| :------------ | :------------------------------------------------------------------------------------------------------------------- | :------------------------------ |
| BPM           | Beats per minute, measured to a few decimals by `tools/beatgrid.py`.                                                 | `bpm`                           |
| bar           | Four beats. Bar 0 is kept empty and the last bar holds the closing spinner.                                         | `MapSpec.bars`                  |
| slot          | A quarter beat (a sixteenth note), the finest grid a note can sit on; 16 per bar.                                   | `Rhythm.SLOTS_PER_BAR`          |
| onset         | The moment a sound starts in the song, e.g. a drum hit, with a strength from 0 to 1.                                 | `Rhythm.at(slot)`               |
| rhythm file   | A song's onset strength at every slot, one bar of 16 hex digits per line, written by `beatgrid.py --export`.        | `rhythm/*.txt`, `Rhythm`        |
| rhythm template | A fixed per-bar note pattern, used for maps without a rhythm file (the synth tracks).                             | `BeatmapGenerator.TEMPLATES`    |
| break         | A bar with no notes, listed in a spec's `breaks`. A map with neither `breaks` nor a rhythm file rests on every 16th bar instead, or spins there at level 3–4. | `MapSpec.breakBars()`, `BREAK_EVERY_BARS` |
| lead-in       | Empty time before the first object (see the warning above). A long intro on an audio-file song can be skipped with Space. | `LEAD_IN_MS` in `engine.ts`     |

## ⭕ Hit objects

| Term            | Meaning                                                                                                    | In code                          |
| :-------------- | :--------------------------------------------------------------------------------------------------------- | :------------------------------- |
| hit object      | Anything to hit: a circle, a slider or a spinner. Times are ms from the start of the song.                 | `HitObject`                      |
| playfield       | The 512 × 384 unit area objects are placed in, drawn inside a 640 × 480 virtual screen.                   | `PLAYFIELD_WIDTH`, `_HEIGHT`     |
| circle          | Click it when its approach circle closes.                                                                  | type `circle`                    |
| approach circle | The ring that shrinks onto an object; how early it appears is set by AR.                                  | `preempt(ar)`                    |
| slider          | A circle whose ball then travels along a path; the player hits the head and follows the ball.             | type `slider`, `SliderShape`    |
| head            | A slider's first circle, judged like a circle.                                                             |                                  |
| tick, repeat, tail | The scoring parts after the head: ticks along the path, a repeat where the ball turns back, the tail at the end. | `SliderPart.kind`        |
| slide           | One pass of the ball along the path; two slides means one repeat.                                          | `SliderShape.slides`             |
| follow circle   | The area around the ball the cursor must stay in while a key is held.                                     | `FOLLOW_RADIUS_FACTOR`           |
| spinner         | Spin the cursor around the centre; needs a number of full rotations in its time.                          | type `spinner`, `requiredSpins`  |
| new combo, combo number | Objects are numbered within a combo colour; a new combo restarts the numbering.                    | `newCombo`, `comboNumber`, `colorIndex` |

## 🎚️ Difficulty settings

Each runs from 0 to 10.

| Term | Meaning                                                                       | In code              |
| :--- | :---------------------------------------------------------------------------- | :------------------- |
| CS   | Circle size: higher means smaller circles.                                    | `circleSize`         |
| AR   | Approach rate: higher means objects appear later, so there is less time to read them. | `approachRate`, `preempt` |
| OD   | Overall difficulty: higher means narrower hit windows and more spins required. | `overallDifficulty`  |
| HP   | HP drain: higher means a miss costs more health.                              | `hpDrain`            |

## 🎯 Judgement and scoring

| Term           | Meaning                                                                                                  | In code                         |
| :------------- | :------------------------------------------------------------------------------------------------------- | :------------------------------ |
| judgement      | What an object is worth: 300, 100, 50 or a miss (0).                                                    | `judgeOffset`, `judgeSlider`, `judgeSpinner` |
| hit window     | How far off a hit may be for each judgement, set by OD.                                                 | `window300/100/50(od)`          |
| combo          | Hits in a row. Every circle, spinner, slider head, tick, repeat and tail adds one; a miss or a dropped tick or repeat breaks it, a missed tail does not. A map's max combo is therefore its objects plus its slider parts. | `combo`, `maxCombo` |
| score          | Points per judgement, growing with the combo; the formula is in the [README](../README.md#gameplay-rules). | `judgementScore`                |
| accuracy       | The weighted share of 300s, 100s and 50s over every object.                                              | `accuracy`                      |
| grade          | SS, S, A, B, C or D, from accuracy and misses.                                                          | `grade(accuracy, misses)`       |
| HP, failed     | Health from 0 to 1. There is no drain over time: hits heal and misses hurt. A play that reaches 0 has failed and is not ranked. | `failed`                        |

## 🎮 Plays and scores

| Term               | Meaning                                                                                              | In code                            |
| :----------------- | :--------------------------------------------------------------------------------------------------- | :--------------------------------- |
| play, play session | One attempt at a map, from pressing Start to the results.                                           | `PlaySession`, table `play_session` |
| play token         | The play session's id, issued when the song starts; a score can be submitted once per token.       | `playId`                           |
| result             | What happened to one object: the hit offset, which slider parts were held, or the spin count. A submission holds one per object. | `ObjectResult`, `models.ts` |
| autoplay           | A perfect demo run (`?auto=1`); it goes through the normal judgement but is never submitted.        | `autoplay.ts`                      |
| leaderboard        | Each player's best score on a map; ties go to whoever set it first.                                 | `LeaderboardQueries`               |
| personal best      | A score higher than the player's previous best on that map.                                          | `personalBest`                     |
| player             | Just a name, unique regardless of case; there are no accounts.                                      | `Player`, table `player`           |
