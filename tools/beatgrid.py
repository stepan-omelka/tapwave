#!/usr/bin/env python3
"""Find the beat grid of a song (exact BPM and first downbeat) for a Tapwave map spec.

    afconvert -f WAVE -d LEI16@44100 -c 1 song.mp3 /tmp/song.wav     # macOS
    ffmpeg -i song.mp3 -ac 1 -ar 44100 /tmp/song.wav                  # anywhere else
    python3 tools/beatgrid.py /tmp/song.wav [--bpm 122] [--export backend/src/main/resources/rhythm/song.txt]

It prints the BPM and offset that line the beat grid up with the song's note onsets, how tightly the
onsets sit on that grid, and how loud every bar is, so you can choose where the map starts and ends.
With --export it also writes the song's rhythm: the onset strength at every quarter beat from the first
downbeat, which the map generator uses to put notes where the music has them.

How: a spectral-flux onset envelope is folded modulo the beat length for many candidate tempos; the
tempo whose fold has the sharpest peak wins, the peak position is the beat phase. The bar line is the
beat phase (of four) with the most low-frequency onsets (kick drums). The detector's own latency is
measured on a synthetic click track with known beat times and subtracted. Needs only numpy.
"""
import argparse
import wave

import numpy as np

N_FFT = 1024
HOP = 128


def load(path):
    with wave.open(path, "rb") as w:
        if w.getsampwidth() != 2:
            raise SystemExit("expected 16-bit PCM wav")
        sr, channels = w.getframerate(), w.getnchannels()
        data = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float32) / 32768
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    return data, sr


def onset_envelopes(signal, sr):
    """Full-band and low-band (< 180 Hz) spectral flux, plus a coarse log spectrum per frame (48 bands);
    frame i is centred on sample i * HOP."""
    padded = np.concatenate([np.zeros(N_FFT // 2, np.float32), signal, np.zeros(N_FFT, np.float32)])
    frames = (len(padded) - N_FFT) // HOP
    window = np.hanning(N_FFT).astype(np.float32)
    low_bins = max(2, int(180 / (sr / N_FFT)) + 1)
    edges = np.unique(np.geomspace(2, N_FFT // 2, 49).astype(int))
    full, low = np.zeros(frames, np.float32), np.zeros(frames, np.float32)
    bands = np.zeros((frames, len(edges) - 1), np.float32)
    previous = None
    for start in range(0, frames, 4096):
        count = min(4096, frames - start)
        index = (start + np.arange(count))[:, None] * HOP + np.arange(N_FFT)[None, :]
        spectrum = np.log1p(10 * np.abs(np.fft.rfft(padded[index] * window, axis=1)))
        if previous is not None:
            spectrum_prev = np.vstack([previous[None, :], spectrum[:-1]])
        else:
            spectrum_prev = np.vstack([spectrum[:1], spectrum[:-1]])
        rise = np.maximum(0, spectrum - spectrum_prev)
        full[start:start + count] = rise.sum(axis=1)
        low[start:start + count] = rise[:, 1:low_bins].sum(axis=1)
        bands[start:start + count] = np.add.reduceat(spectrum, edges[:-1], axis=1)[:, : len(edges) - 1]
        previous = spectrum[-1]
    return normalise(full, sr), normalise(low, sr), bands


def normalise(envelope, sr):
    """Subtract a 0.4 s moving average and keep the rises, so loud and quiet passages count alike."""
    width = max(1, int(0.4 * sr / HOP))
    local = np.convolve(envelope, np.ones(width) / width, mode="same")
    out = np.maximum(0, envelope - local)
    return out / (out.max() or 1)


def fold(envelope, sr, period_s, bin_ms=0.5):
    """Folds the envelope modulo one beat; returns (peak sharpness, phase in seconds)."""
    bins = int(round(period_s * 1000 / bin_ms))
    times = np.arange(len(envelope)) * HOP / sr
    position = np.mod(times, period_s) / period_s * bins
    hist = np.bincount(position.astype(int) % bins, weights=envelope ** 2, minlength=bins)
    kernel = np.exp(-0.5 * (np.arange(-12, 13) / 4.0) ** 2)
    smooth = np.real(np.fft.ifft(np.fft.fft(hist) * np.fft.fft(np.roll(np.pad(kernel, (0, bins - 25)), -12))))
    peak = int(np.argmax(smooth))
    left, mid, right = smooth[peak - 1], smooth[peak], smooth[(peak + 1) % bins]
    shift = 0.5 * (left - right) / (left - 2 * mid + right) if (left - 2 * mid + right) != 0 else 0
    return mid / (smooth.mean() or 1), ((peak + shift) % bins) * bin_ms / 1000


def estimate_bpm(envelope, sr):
    """Autocorrelation tempo guess in 70-200 BPM, weighted towards ~120 BPM."""
    x = envelope - envelope.mean()
    spectrum = np.fft.rfft(x, n=2 * len(x))
    ac = np.fft.irfft(spectrum * np.conj(spectrum))[: len(x)]
    frame_s = HOP / sr
    best, best_bpm = -np.inf, 120.0
    for bpm in np.arange(70, 200, 0.25):
        lag = 60 / bpm / frame_s
        value = np.interp(lag, np.arange(len(ac)), ac) * np.exp(-0.5 * (np.log2(bpm / 120) / 0.9) ** 2)
        if value > best:
            best, best_bpm = value, bpm
    return best_bpm


def refine(envelope, sr, bpm_guess):
    """Coarse (+-3 %, 0.01 BPM steps) then fine (+-0.04 %, 0.0005 BPM steps) search for the sharpest fold."""
    best = (-np.inf, bpm_guess, 0.0)
    for span, step in ((0.03, 0.01), (0.0004, 0.0005)):
        centre = best[1]
        for bpm in np.arange(centre * (1 - span), centre * (1 + span), step):
            sharpness, phase = fold(envelope, sr, 60 / bpm)
            if sharpness > best[0]:
                best = (sharpness, bpm, phase)
    return best


def detector_latency(sr):
    """Runs the detector on kicks + hats at known times and returns how late it reports them (s)."""
    rng = np.random.default_rng(1)
    period, first = 60 / 128, 0.5
    signal = rng.normal(0, 0.003, int(sr * 40)).astype(np.float32)
    t = np.arange(int(0.25 * sr)) / sr
    kick = (np.sin(2 * np.pi * (45 * t + 60 * 0.03 * (1 - np.exp(-t / 0.03)))) * np.exp(-t / 0.12)).astype(np.float32)
    hat = (rng.normal(0, 1, len(t)) * np.exp(-t / 0.01) * 0.3).astype(np.float32)
    beat = first
    while beat + 0.3 < 40:
        i = int(round(beat * sr))
        signal[i:i + len(t)] += kick + hat
        beat += period
    full, _, _ = onset_envelopes(signal, sr)
    _, phase = fold(full, sr, period)
    return (phase - first + period / 2) % period - period / 2


def onset_peaks(envelope, sr):
    return peak_frames(envelope, sr) * HOP / sr


def peak_frames(envelope, sr):
    """Local maxima above mean + 2 standard deviations, at least 50 ms apart (frame indices)."""
    threshold = envelope.mean() + 2 * envelope.std()
    gap = int(0.05 * sr / HOP)
    peaks = []
    for i in range(1, len(envelope) - 1):
        if envelope[i] >= threshold and envelope[i] >= envelope[i - 1] and envelope[i] > envelope[i + 1]:
            if not peaks or i - peaks[-1] >= gap:
                peaks.append(i)
            elif envelope[i] > envelope[peaks[-1]]:
                peaks[-1] = i
    return np.array(peaks, dtype=int)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("wav")
    parser.add_argument("--bpm", type=float, help="tempo hint, e.g. from the publisher's metadata")
    parser.add_argument("--bar-slot", type=int, choices=range(4), help="override which beat (0-3 after the beat "
                        "phase) starts a bar, when the cross-checks disagree with the automatic choice")
    parser.add_argument("--export", metavar="FILE", help="write the onset strength per quarter beat (rhythm file)")
    args = parser.parse_args()

    signal, sr = load(args.wav)
    duration = len(signal) / sr
    full, low, bands = onset_envelopes(signal, sr)
    latency = detector_latency(sr)

    guess = args.bpm or estimate_bpm(full, sr)
    sharpness, bpm, phase = refine(full, sr, guess)
    beat = 60 / bpm
    frame_times = np.arange(len(low)) * HOP / sr

    def low_strength(at):
        return np.interp(np.arange(at, duration - 0.1, beat) + latency, frame_times, low).mean()

    # Off-beat hi-hats and snares often out-weigh the kick in a full-band onset sum, so the fold can lock
    # on half a beat late. Songs (and every game loop) start on a beat, so the half that the first onset
    # falls on wins; without a clear first onset, the half with more low-frequency onsets (kicks) wins.
    phase = (phase - latency) % beat
    peaks = onset_peaks(full, sr) - latency
    first_onset = peaks[0] if len(peaks) else None
    halves = (low_strength(phase), low_strength((phase + beat / 2) % beat))

    def distance_to_grid(t, at):
        return abs((t - at + beat / 2) % beat - beat / 2)

    if first_onset is not None and min(distance_to_grid(first_onset, phase),
                                       distance_to_grid(first_onset, phase + beat / 2)) < beat / 8:
        half_rule = "first onset"
        if distance_to_grid(first_onset, phase + beat / 2) < distance_to_grid(first_onset, phase):
            phase = (phase + beat / 2) % beat
    else:
        half_rule = "low-band onsets"
        if halves[1] > halves[0]:
            phase = (phase + beat / 2) % beat

    # Bar line: song sections change on bar lines. Novelty = how different the 4 (and 8) beats after a
    # beat sound from the ones before it; the strongest peaks vote for their beat slot (of four).
    beats = np.arange(phase, duration, beat)
    frame_beat = np.floor((frame_times - latency - phase) / beat).astype(int)
    valid = (frame_beat >= 0) & (frame_beat < len(beats))
    per_beat = np.zeros((len(beats), bands.shape[1]))
    np.add.at(per_beat, frame_beat[valid], bands[valid])
    per_beat /= np.maximum(1, np.bincount(frame_beat[valid], minlength=len(beats)))[:, None]
    votes = np.zeros(4)
    for width in (4, 8):
        novelty = np.zeros(len(beats))
        for k in range(width, len(beats) - width):
            novelty[k] = np.linalg.norm(per_beat[k:k + width].mean(0) - per_beat[k - width:k].mean(0))
        chosen = []
        for k in sorted(range(1, len(beats) - 1), key=lambda i: -novelty[i]):
            if novelty[k] >= novelty[k - 1] and novelty[k] >= novelty[k + 1] and all(abs(k - c) >= width for c in chosen):
                chosen.append(k)
            if len(chosen) == 10:
                break
        for k in chosen:
            votes[k % 4] += novelty[k] / novelty[chosen[0]]
    kick = np.interp(beats + latency, frame_times, low)
    kick_by_slot = np.array([kick[slot::4].sum() for slot in range(4)])
    if args.bar_slot is not None:
        slot_rule, slot = "--bar-slot", args.bar_slot
    elif half_rule == "first onset":
        slot_rule, first_beat = "first onset", int(round((first_onset - phase) / beat))
        slot = first_beat % 4
    else:
        slot_rule, slot = "section votes", int(np.argmax(votes))
    first_downbeat = phase + slot * beat
    bar = 4 * beat

    grid = beat / 4
    deviation = np.abs((peaks - phase + grid / 2) % grid - grid / 2) * 1000

    print(f"file            {args.wav}")
    print(f"duration        {duration:.3f} s")
    print(f"bpm guess       {guess:.2f}")
    print(f"bpm             {bpm:.4f}   (fold sharpness {sharpness:.2f})")
    print(f"beat phase      {phase * 1000:.1f} ms   (half-beat chosen by {half_rule}; detector latency "
          f"{latency * 1000:+.1f} ms removed)")
    print(f"first onset     {first_onset * 1000:.1f} ms" if first_onset is not None else "first onset     none")
    print(f"cross-checks    low-band onsets on the fold phase {halves[0]:.3f} vs half a beat later {halves[1]:.3f}; "
          f"section votes by slot {', '.join(f'{v:.2f}' for v in votes)}; kicks by slot "
          f"{', '.join(f'{v:.1f}' for v in kick_by_slot)}")
    print(f"first downbeat  {first_downbeat * 1000:.1f} ms   (beat slot {slot} by {slot_rule}; a song with a pick-up "
          f"before its first bar needs a later slot)")
    print(f"onsets on 1/16 grid: {len(peaks)} peaks, median |dev| {np.median(deviation):.1f} ms, "
          f"within 10 ms {np.mean(deviation <= 10) * 100:.0f}%, within 20 ms {np.mean(deviation <= 20) * 100:.0f}% "
          f"(random would be ~{grid * 250:.0f} ms median)")
    print("\nbar  start_ms   rms_db  onsets  kick")
    m = 0
    while first_downbeat + m * bar < duration:
        a, b = first_downbeat + m * bar, min(duration, first_downbeat + (m + 1) * bar)
        chunk = signal[int(a * sr):int(b * sr)]
        rms = 20 * np.log10(np.sqrt(np.mean(chunk ** 2)) + 1e-9)
        in_bar = (peaks >= a) & (peaks < b)
        k = kick[(slot + 4 * m):(slot + 4 * m + 4)].sum()
        print(f"{m:3d}  {a * 1000:8.0f}  {rms:7.1f}  {in_bar.sum():6d}  {k:5.2f}")
        m += 1

    if args.export:
        export_rhythm(args.export, args.wav, full, low, sr, latency, bpm, first_downbeat, duration)


def export_rhythm(path, source, full, low, sr, latency, bpm, first_downbeat, duration):
    """One line per bar, 16 hex digits: onset strength (0-f) at each quarter beat from the first downbeat.

    Only detected onset peaks count (as in the bar table), so sustained pads and breakdowns stay at 0.
    A slot gets the height of the strongest peak within +-12 ms, from the full band or the low band
    (kicks, bass), each scaled to the 98th percentile of its peak heights, so kicks count even where
    hi-hats dominate the full band.
    """
    quarter = 60 / bpm / 4
    slots = int((duration - first_downbeat) / quarter)
    slots -= slots % 16
    grid = first_downbeat + np.arange(slots) * quarter

    def strongest(envelope):
        frames = peak_frames(envelope, sr)
        times = frames * HOP / sr - latency
        heights = envelope[frames] / (np.percentile(envelope[frames], 98) if len(frames) else 1)
        values = np.zeros(slots)
        for t, h in zip(times, heights):
            k = int(round((t - first_downbeat) / quarter))
            if 0 <= k < slots and abs(t - grid[k]) <= 0.012:
                values[k] = max(values[k], h)
        return np.clip(values, 0, 1)

    strength = np.maximum(strongest(full), strongest(low))
    digits = np.rint(strength * 15).astype(int)
    with open(path, "w") as out:
        out.write("# Tapwave rhythm v1: onset strength 0-f at every quarter beat, one bar (16 slots) per line\n")
        out.write(f"# source {source.split('/')[-1]}, bpm {bpm:.4f}, first downbeat {first_downbeat * 1000:.1f} ms "
                  f"(written by tools/beatgrid.py)\n")
        for bar in range(slots // 16):
            out.write("".join(f"{d:x}" for d in digits[bar * 16:(bar + 1) * 16]) + "\n")
    print(f"\nwrote {slots // 16} bars of rhythm to {path}")


if __name__ == "__main__":
    main()
