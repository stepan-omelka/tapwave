# 🎵 Adding a song

Only use music that may be redistributed inside a game: your own, CC0, or CC BY with the credit.
The backend refuses to start when a map with an audio file does not name its license and source.

1. Put the audio file in `frontend/public/audio/`, e.g. `my-song.mp3`. Browsers cache songs for 30
   days by URL, so a changed song needs a new file name.
2. Measure its beat grid. `tools/beatgrid.py` needs Python 3 with numpy:

   ```sh
   afconvert -f WAVE -d LEI16@44100 -c 1 my-song.mp3 /tmp/my-song.wav   # macOS; elsewhere: ffmpeg -i my-song.mp3 -ac 1 -ar 44100 /tmp/my-song.wav
   python3 tools/beatgrid.py /tmp/my-song.wav --bpm 128 \
       --export backend/src/main/resources/rhythm/my-song.txt           # --bpm is an optional hint
   ```

   It prints the exact BPM and the first downbeat (`offset-ms`), how tightly the song's onsets sit on
   that grid (a good fit is a median of a few ms), and a table of every bar with its loudness and
   number of onsets. Check the cross-checks it prints: the bar line can be a beat off on songs with a
   pick-up. If it is, rerun with `--bar-slot 0`–`3` to choose which beat starts a bar; never move
   `offset-ms` by hand, because the rhythm file's bar 0 starts at the tool's downbeat. The BPM, the
   offset and the rhythm file must all come from the same run. `--export` writes the [rhythm file](./glossary.md#-rhythm-and-map-generation).

   The times refer to the decoded WAV. Browsers do not all decode an MP3's first samples the same
   way: for MP3s without gapless info, Chrome keeps the 529-sample (12 ms at 44.1 kHz) decoder delay
   that macOS trims, so the Kevin MacLeod maps add 12 ms to the measured offset. Players can correct
   the rest with the audio offset setting.

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

4. Restart the backend: maps whose slug is not in the database yet are generated on startup. Play
   the map, and watch autoplay, before pushing.
5. Add a row to [`CREDITS.md`](../CREDITS.md) and to the track table in the [README](../README.md).

## How the notes are placed

With a rhythm file, notes go on the strongest onsets, preferring downbeats and beats, on the grid
the level allows, until the level's density is reached; quiet passages become rests by themselves.
Without one, the generator uses fixed rhythm templates per bar. Either way the map follows the
rhythm, not the melody. The rules are in `OnsetPlacement` and `BeatmapGenerator`.

## Synthesised tracks

A map without `audio-url` gets music generated in the browser from its `seed`, `bpm`, `offset-ms` and length.
That music breaks down on every 16th bar whatever the spec says, so do not give such a map `breaks`;
see [rules implemented twice](../ARCHITECTURE.md#️-rules-implemented-twice).

## Changing an existing map

Editing a spec, a rhythm file or the generator does not change a map that is already stored; see
[Maps](../backend/README.md#️-maps) in the backend README for how to regenerate one.
