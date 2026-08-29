from __future__ import annotations

from array import array
from pathlib import Path
import math
import random
import re
import struct
import wave

ROOT = Path("kmate-trainer")
RATE = 48_000
DURATION = 7.40
FRAME_COUNT = int(RATE * DURATION)


def read(path: Path) -> str:
    return path.read_text()


def write(path: Path, content: str) -> None:
    path.write_text(content)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing patch marker: {label}")
    return text.replace(old, new, 1)


def pan_gains(pan: float) -> tuple[float, float]:
    position = max(-1.0, min(1.0, pan))
    angle = (position + 1.0) * math.pi / 4.0
    return math.cos(angle), math.sin(angle)


def add_noise_burst(
    left: array,
    right: array,
    rng: random.Random,
    start: float,
    duration: float,
    amplitude: float,
    decay: float,
    pan: float = 0.0,
    colour: float = 0.72,
) -> None:
    start_index = max(0, int(start * RATE))
    count = min(FRAME_COUNT - start_index, max(1, int(duration * RATE)))
    lg, rg = pan_gains(pan)
    previous = 0.0
    for offset in range(count):
        t = offset / RATE
        raw = rng.uniform(-1.0, 1.0)
        # Differentiated noise produces a short, bright contact transient.
        high = raw - previous * colour
        previous = raw
        attack = min(1.0, t / 0.00065)
        envelope = attack * math.exp(-t / max(0.001, decay))
        value = high * envelope * amplitude
        index = start_index + offset
        left[index] += value * lg
        right[index] += value * rg


def add_damped_tone(
    left: array,
    right: array,
    start: float,
    duration: float,
    frequency_start: float,
    frequency_end: float,
    amplitude: float,
    decay: float,
    pan: float = 0.0,
    phase_offset: float = 0.0,
) -> None:
    start_index = max(0, int(start * RATE))
    count = min(FRAME_COUNT - start_index, max(1, int(duration * RATE)))
    lg, rg = pan_gains(pan)
    phase = phase_offset
    for offset in range(count):
        t = offset / RATE
        progress = offset / max(1, count - 1)
        frequency = frequency_start + (frequency_end - frequency_start) * progress
        phase += math.tau * frequency / RATE
        attack = min(1.0, t / 0.0012)
        envelope = attack * math.exp(-t / max(0.001, decay))
        value = math.sin(phase) * envelope * amplitude
        index = start_index + offset
        left[index] += value * lg
        right[index] += value * rg


def add_wood_hit(
    left: array,
    right: array,
    rng: random.Random,
    start: float,
    strength: float,
    brightness: float,
    body: float,
    tail: float,
    pan: float = 0.0,
    minimal: bool = False,
) -> None:
    add_noise_burst(
        left,
        right,
        rng,
        start,
        0.030 if not minimal else 0.020,
        0.48 * strength * brightness,
        0.0060 if not minimal else 0.0042,
        pan,
        0.68,
    )
    add_damped_tone(left, right, start, 0.075, 1850 * brightness, 860 * brightness, 0.19 * strength, 0.022, pan)
    add_damped_tone(left, right, start + 0.0015, 0.125, 720 * brightness, 430 * brightness, 0.16 * strength * body, 0.043, pan * 0.55)
    if not minimal:
        add_damped_tone(left, right, start + 0.004, 0.205, 285, 185, 0.13 * strength * body, 0.080 * tail, -pan * 0.30)
        # A very small early reflection gives dimension without a smeared reverb tail.
        add_noise_burst(left, right, rng, start + 0.018, 0.018, 0.065 * strength, 0.0045, -pan * 0.45, 0.74)


def add_clean_chime(
    left: array,
    right: array,
    start: float,
    notes: list[tuple[float, float]],
    amplitude: float,
    spacing: float,
) -> None:
    for index, (frequency, duration) in enumerate(notes):
        onset = start + index * spacing
        add_damped_tone(left, right, onset, duration, frequency, frequency * 0.997, amplitude, duration * 0.42, -0.16 if index % 2 == 0 else 0.16)
        add_damped_tone(left, right, onset, duration * 0.72, frequency * 2.01, frequency * 1.99, amplitude * 0.18, duration * 0.25, 0.16 if index % 2 == 0 else -0.16)


def render_profile(name: str, gain: float, brightness: float, body: float, tail: float, minimal: bool) -> None:
    rng = random.Random({"soft": 2601, "tournament": 2602, "minimal": 2603}[name])
    left = array("f", [0.0]) * FRAME_COUNT
    right = array("f", [0.0]) * FRAME_COUNT

    # Move: one dry, fast wooden contact.
    add_wood_hit(left, right, rng, 0.098, 0.96, brightness, body, tail, -0.05, minimal)

    # Capture: a light lift followed by a firmer landing, making it unmistakably different.
    add_wood_hit(left, right, rng, 0.722, 0.54, brightness * 1.05, body * 0.75, tail * 0.70, -0.22, True)
    add_wood_hit(left, right, rng, 0.802, 1.08, brightness * 1.04, body * 1.08, tail * 0.92, 0.18, minimal)

    # Check: crisp placement plus a restrained two-note alert.
    add_wood_hit(left, right, rng, 1.502, 0.88, brightness, body, tail, -0.04, minimal)
    add_clean_chime(left, right, 1.596, [(704, 0.18), (880, 0.20)], 0.080 if not minimal else 0.052, 0.105)

    # Result cues preserve the same sprite timings while using the cleaner contact sound.
    add_wood_hit(left, right, rng, 2.505, 0.70, brightness, body, tail, -0.10, minimal)
    add_clean_chime(left, right, 2.590, [(523.25, 0.24), (659.25, 0.25), (783.99, 0.28)], 0.090 if not minimal else 0.060, 0.125)

    add_wood_hit(left, right, rng, 3.772, 0.78, brightness * 0.92, body, tail, 0.08, minimal)
    add_clean_chime(left, right, 3.858, [(329.63, 0.25), (246.94, 0.30)], 0.074 if not minimal else 0.052, 0.155)

    add_wood_hit(left, right, rng, 4.972, 0.63, brightness, body * 0.85, tail, 0.0, minimal)
    add_clean_chime(left, right, 5.060, [(392.00, 0.23), (369.99, 0.24)], 0.063 if not minimal else 0.045, 0.130)

    # Timeout: three dry clock strikes, followed by a low final contact.
    for index, onset in enumerate((5.975, 6.145, 6.315)):
        add_wood_hit(left, right, rng, onset, 0.56 + index * 0.06, brightness * 1.08, body * 0.72, tail * 0.55, -0.16 + index * 0.16, True)
    add_damped_tone(left, right, 6.480, 0.42, 220, 130, 0.105, 0.17, 0.0)

    peak = max(max(abs(value) for value in left), max(abs(value) for value in right), 1e-9)
    target_peak = {"soft": 0.82, "tournament": 0.94, "minimal": 0.76}[name]
    scale = gain * target_peak / peak

    output = bytearray()
    for l_value, r_value in zip(left, right):
        l_sample = int(max(-1.0, min(1.0, l_value * scale)) * 32767)
        r_sample = int(max(-1.0, min(1.0, r_value * scale)) * 32767)
        output.extend(struct.pack("<hh", l_sample, r_sample))

    sounds_dir = ROOT / "sounds"
    sounds_dir.mkdir(parents=True, exist_ok=True)
    destination = sounds_dir / f"kmate-{name}-v26.wav"
    with wave.open(str(destination), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(output)


for profile in (
    ("soft", 1.0, 1.00, 0.92, 0.90, False),
    ("tournament", 1.0, 1.18, 1.08, 0.82, False),
    ("minimal", 1.0, 1.30, 0.56, 0.45, True),
):
    render_profile(*profile)


# Update sound URLs, fallback synthesis, labels, and cache versions.
app_path = ROOT / "app-v7-part1.txt"
app = read(app_path)
old_urls = """const SOUND_SPRITE_URLS = {
  soft: new URL('./sounds/kmate-soft-v23.wav?v=23.0.0', document.baseURI).href,
  tournament: new URL('./sounds/kmate-tournament-v23.wav?v=23.0.0', document.baseURI).href,
  minimal: new URL('./sounds/kmate-minimal-v23.wav?v=23.0.0', document.baseURI).href,
};"""
new_urls = """const SOUND_SPRITE_URLS = {
  soft: new URL('./sounds/kmate-soft-v26.wav?v=26.0.0', document.baseURI).href,
  tournament: new URL('./sounds/kmate-tournament-v26.wav?v=26.0.0', document.baseURI).href,
  minimal: new URL('./sounds/kmate-minimal-v26.wav?v=26.0.0', document.baseURI).href,
};"""
app = replace_once(app, old_urls, new_urls, "v26 sound sprite URLs")

app = replace_once(
    app,
    """const SOUND_THEME_LABELS = {
  soft: 'Soft wood',
  tournament: 'Tournament wood',
  minimal: 'Minimal click',
};""",
    """const SOUND_THEME_LABELS = {
  soft: 'Crisp soft wood',
  tournament: 'Crisp tournament wood',
  minimal: 'Dry click',
};""",
    "v26 sound labels",
)

app = replace_once(
    app,
    """  move: { start: 0.08, duration: 0.46, volume: 0.88 },
  capture: { start: 0.70, duration: 0.62, volume: 0.92 },""",
    """  move: { start: 0.08, duration: 0.46, volume: 0.97 },
  capture: { start: 0.70, duration: 0.62, volume: 1.00 },""",
    "v26 move and capture volume",
)

app = replace_once(
    app,
    """  if (kind === 'capture') {
    scheduleChessKnock(ctx, now, 0.17, 0.082, 850);
    scheduleChessTone(ctx, now, 215, 105, 0.105, 0.105, 'triangle');
    scheduleChessTone(ctx, now + 0.018, 145, 82, 0.075, 0.095, 'sine');
    return;
  }""",
    """  if (kind === 'capture') {
    scheduleChessKnock(ctx, now, 0.14, 0.026, 2850);
    scheduleChessTone(ctx, now, 980, 430, 0.095, 0.052, 'triangle');
    scheduleChessKnock(ctx, now + 0.067, 0.22, 0.038, 2050);
    scheduleChessTone(ctx, now + 0.067, 410, 165, 0.120, 0.085, 'triangle');
    return;
  }""",
    "crisper capture fallback",
)

app = replace_once(
    app,
    """  // A short wooden-board click for ordinary moves.
  scheduleChessKnock(ctx, now, 0.125, 0.055, 1250);
  scheduleChessTone(ctx, now, 310, 185, 0.075, 0.072, 'triangle');""",
    """  // A dry, fast wooden-board contact for ordinary moves.
  scheduleChessKnock(ctx, now, 0.18, 0.030, 2950);
  scheduleChessTone(ctx, now, 1020, 460, 0.095, 0.050, 'triangle');
  scheduleChessTone(ctx, now + 0.003, 340, 185, 0.060, 0.075, 'sine');""",
    "crisper move fallback",
)

app = re.sub(r"url\.search = '\?v=[^']+';", "url.search = '?v=20260829-26';", app, count=1)
write(app_path, app)


# Add final CSS overrides so they win over all older responsive piece rules.
styles_path = ROOT / "styles-v7.css"
styles = read(styles_path)
start_marker = "/* K-Mate v26 — larger high-contrast pieces and crisp board presentation */"
end_marker = "/* End K-Mate v26 */"
if start_marker in styles and end_marker in styles:
    pattern = re.escape(start_marker) + r".*?" + re.escape(end_marker) + r"\n?"
    styles = re.sub(pattern, "", styles, flags=re.S)

v26_css = r'''

/* K-Mate v26 — larger high-contrast pieces and crisp board presentation */
#board .piece.staunton-piece{width:88%;height:88%}
.replay-board .piece.staunton-piece{width:74%;height:74%}
.staunton-piece .piece-art>*:not(.piece-ground){stroke-width:3.05}
.piece.staunton-piece.white svg{filter:drop-shadow(0 0 1.35px #17120c) drop-shadow(0 3px 2px #0009) drop-shadow(0 7px 7px #0005)}
.piece.staunton-piece.black svg{filter:drop-shadow(0 0 1.55px #f4faf4) drop-shadow(0 3px 2px #000b) drop-shadow(0 7px 7px #0007)}
.staunton-piece.white{--piece-edge:#272117;--piece-glint:#ffffff;--piece-detail:#6f5739;--piece-cut:#2f261b;--piece-eye:#11100d}
.staunton-piece.white .piece-grad-body-hi{stop-color:#fffefb}.staunton-piece.white .piece-grad-body-mid{stop-color:#f2e4ca}.staunton-piece.white .piece-grad-body-low{stop-color:#c19f6e}
.staunton-piece.white .piece-grad-base-hi{stop-color:#fff7e7}.staunton-piece.white .piece-grad-base-low{stop-color:#a98250}.staunton-piece.white .piece-grad-band-hi{stop-color:#fffdf4}.staunton-piece.white .piece-grad-band-low{stop-color:#bd9967}
.staunton-piece.black .piece-grad-body-hi{stop-color:#526257}.staunton-piece.black .piece-grad-body-mid{stop-color:#17221b}.staunton-piece.black .piece-grad-body-low{stop-color:#020403}
.staunton-piece.black .piece-grad-base-hi{stop-color:#34423a}.staunton-piece.black .piece-grad-base-low{stop-color:#010201}.staunton-piece.black .piece-grad-band-hi{stop-color:#526359}.staunton-piece.black .piece-grad-band-low{stop-color:#0a110d}
#board .sq.light,.replay-board .sq.light{background:radial-gradient(circle at 32% 22%,#e4d4ae 0 13%,transparent 48%),linear-gradient(145deg,#d2bc8e,#a98e5d)}
#board .sq.dark,.replay-board .sq.dark{background:radial-gradient(circle at 33% 22%,#77906b 0 10%,transparent 47%),linear-gradient(145deg,#627c59,#3d563f)}
#board .sq.light .coord,.replay-board .sq.light .coord{color:#303a2b;opacity:.86}
#board .sq.dark .coord,.replay-board .sq.dark .coord{color:#f1f7ed;opacity:.88}
#board{box-shadow:0 0 0 1px #e7eadc2e,0 25px 68px #000b}
@media(max-width:760px){
  #board .piece.staunton-piece{width:86%;height:86%}
  .replay-board .piece.staunton-piece{width:71%;height:71%}
  .piece.staunton-piece.white svg{filter:drop-shadow(0 0 1.15px #17120c) drop-shadow(0 2px 1px #0009) drop-shadow(0 4px 4px #0005)}
  .piece.staunton-piece.black svg{filter:drop-shadow(0 0 1.35px #f4faf4) drop-shadow(0 2px 1px #000b) drop-shadow(0 4px 4px #0007)}
}
@media(max-width:430px){
  #board .piece.staunton-piece{width:85%;height:85%}
  .replay-board .piece.staunton-piece{width:69%;height:69%}
}
/* End K-Mate v26 */
'''
styles = styles.rstrip() + v26_css
write(styles_path, styles)


# Update setup labels and all public cache-busting versions.
index_path = ROOT / "index.html"
index = read(index_path)
index = index.replace('<option value="soft">Soft wood</option>', '<option value="soft">Crisp soft wood</option>')
index = index.replace('<option value="tournament">Tournament wood</option>', '<option value="tournament">Crisp tournament wood</option>')
index = index.replace('<option value="minimal">Minimal click</option>', '<option value="minimal">Dry click</option>')
index = index.replace(
    'Choose a quieter wooden piece sound, a sharper tournament-board sound, or a very restrained click. The speaker button can still mute everything.',
    'All three profiles now use a faster attack and less reverberation: crisp soft wood, a firmer tournament-board impact, or a very dry click. The speaker button can still mute everything.',
)
index = re.sub(r"styles-v7\.css\?v=[^\"']+", "styles-v7.css?v=26.0.0", index)
index = re.sub(r"app-v7\.js\?v=[^\"']+", "app-v7.js?v=26.0.0", index)
write(index_path, index)

loader_path = ROOT / "app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=[^'\"]+", "positions-v7.js?v=26.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=[^`]+", "app-v7-part${number}.txt?v=26.0.0", loader)
write(loader_path, loader)

part6_path = ROOT / "app-v7-part6.txt"
part6 = read(part6_path)
part6 = re.sub(r"version: '[^']+-commercial-beta'", "version: '26.0-commercial-beta'", part6, count=1)
write(part6_path, part6)
