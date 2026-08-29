from __future__ import annotations

from array import array
from pathlib import Path
import hashlib
import json
import math
import random
import re
import struct
import wave

ROOT = Path("kmate-trainer")
SOUND_DIR = ROOT / "sounds" / "wood-v27"
RATE = 48_000
DURATION = 2.10
FRAME_COUNT = int(RATE * DURATION)

GROUPS = [
    "Desk knocks",
    "Hardwood character",
    "Board & table",
    "Dry & minimal",
    "Warm & distinctive",
]

# The names describe acoustic character. These are original synthesized sounds,
# not recordings or claims about a particular wood species.
PROFILES = [
    dict(key="desk-balanced", label="01 · Balanced desk", group=GROUPS[0], description="Neutral close wooden knock with a clean body.", brightness=1.00, body=0.96, tail=0.72, pitch=1.00, hardness=1.00, hollow=0.04, room=0.10, gap=0.082, lift=0.52, land=1.06, width=0.12),
    dict(key="desk-bright", label="02 · Bright desktop", group=GROUPS[0], description="Higher, snappier desktop attack with a short tail.", brightness=1.24, body=0.76, tail=0.58, pitch=1.06, hardness=1.12, hollow=0.02, room=0.05, gap=0.078, lift=0.50, land=1.04, width=0.13),
    dict(key="desk-deep", label="03 · Deep desktop", group=GROUPS[0], description="Lower, heavier desk resonance without a long boom.", brightness=0.82, body=1.34, tail=0.78, pitch=0.84, hardness=0.94, hollow=0.10, room=0.10, gap=0.090, lift=0.50, land=1.12, width=0.11),
    dict(key="desk-close", label="04 · Close-mic knock", group=GROUPS[0], description="Very close, dry microphone feel with almost no room reflection.", brightness=1.14, body=0.88, tail=0.43, pitch=1.02, hardness=1.14, hollow=0.00, room=0.00, gap=0.074, lift=0.50, land=1.07, width=0.06),
    dict(key="desk-hard", label="05 · Hard desk tap", group=GROUPS[0], description="Firm, hard-edged impact with a pronounced initial crack.", brightness=1.38, body=0.72, tail=0.50, pitch=1.08, hardness=1.28, hollow=0.01, room=0.03, gap=0.070, lift=0.48, land=1.10, width=0.11),

    dict(key="hardwood-solid", label="06 · Solid hardwood", group=GROUPS[1], description="Solid hardwood character with a firm midrange core.", brightness=0.98, body=1.22, tail=0.74, pitch=0.96, hardness=1.04, hollow=0.04, room=0.08, gap=0.086, lift=0.52, land=1.10, width=0.13),
    dict(key="hardwood-dense", label="07 · Dense hardwood", group=GROUPS[1], description="Dense, compact knock with strong low-mid weight.", brightness=0.88, body=1.42, tail=0.63, pitch=0.88, hardness=1.02, hollow=0.02, room=0.04, gap=0.092, lift=0.49, land=1.14, width=0.10),
    dict(key="maple-snap", label="08 · Maple-style snap", group=GROUPS[1], description="Bright hardwood-style snap with little lingering resonance.", brightness=1.30, body=0.90, tail=0.50, pitch=1.08, hardness=1.18, hollow=0.01, room=0.03, gap=0.074, lift=0.48, land=1.07, width=0.14),
    dict(key="oak-knock", label="09 · Oak-style knock", group=GROUPS[1], description="Solid mid-low knock with a restrained room response.", brightness=0.92, body=1.30, tail=0.82, pitch=0.91, hardness=1.00, hollow=0.12, room=0.11, gap=0.090, lift=0.50, land=1.12, width=0.15),
    dict(key="walnut-knock", label="10 · Walnut-style knock", group=GROUPS[1], description="Warm, darker hardwood character with rounded depth.", brightness=0.80, body=1.22, tail=0.70, pitch=0.89, hardness=0.92, hollow=0.06, room=0.07, gap=0.092, lift=0.51, land=1.10, width=0.12),

    dict(key="tournament-crisp", label="11 · Tournament board", group=GROUPS[2], description="Sharp tournament-board placement with clear captures.", brightness=1.18, body=1.04, tail=0.55, pitch=1.02, hardness=1.18, hollow=0.02, room=0.02, gap=0.076, lift=0.51, land=1.13, width=0.14),
    dict(key="thick-board", label="12 · Thick board", group=GROUPS[2], description="Heavy, thick-board landing with compact bass.", brightness=0.80, body=1.54, tail=0.75, pitch=0.79, hardness=0.96, hollow=0.05, room=0.06, gap=0.096, lift=0.48, land=1.18, width=0.10),
    dict(key="thin-board", label="13 · Thin board", group=GROUPS[2], description="Thin wooden board with a lively upper resonance.", brightness=1.34, body=0.66, tail=0.76, pitch=1.13, hardness=1.10, hollow=0.22, room=0.08, gap=0.073, lift=0.52, land=1.04, width=0.16),
    dict(key="butcher-block", label="14 · Butcher block", group=GROUPS[2], description="Dense block-style contact with a broad, weighty body.", brightness=0.90, body=1.62, tail=0.66, pitch=0.82, hardness=1.06, hollow=0.02, room=0.03, gap=0.098, lift=0.47, land=1.20, width=0.09),
    dict(key="hollow-board", label="15 · Hollow board", group=GROUPS[2], description="Crisp impact followed by a short hollow panel resonance.", brightness=1.05, body=0.96, tail=0.98, pitch=0.96, hardness=1.02, hollow=0.42, room=0.14, gap=0.087, lift=0.51, land=1.08, width=0.18),

    dict(key="dry-studio", label="16 · Dry studio knock", group=GROUPS[3], description="Studio-damped wooden contact: clean, short, and controlled.", brightness=1.10, body=0.74, tail=0.32, pitch=1.03, hardness=1.16, hollow=0.00, room=0.00, gap=0.071, lift=0.48, land=1.08, width=0.05),
    dict(key="ultra-dry", label="17 · Ultra-dry tap", group=GROUPS[3], description="Extremely short wooden tap with almost no body tail.", brightness=1.28, body=0.48, tail=0.20, pitch=1.10, hardness=1.24, hollow=0.00, room=0.00, gap=0.066, lift=0.46, land=1.03, width=0.04),
    dict(key="edge-knock", label="18 · Desk-edge knock", group=GROUPS[3], description="Bright edge-of-desk strike with a focused crack.", brightness=1.48, body=0.52, tail=0.27, pitch=1.16, hardness=1.34, hollow=0.00, room=0.01, gap=0.068, lift=0.47, land=1.08, width=0.08),
    dict(key="short-click", label="19 · Short wood click", group=GROUPS[3], description="Compact wooden click, useful when you want minimal distraction.", brightness=1.58, body=0.36, tail=0.16, pitch=1.20, hardness=1.38, hollow=0.00, room=0.00, gap=0.062, lift=0.44, land=1.00, width=0.03),
    dict(key="minimal-hardwood", label="20 · Minimal hardwood", group=GROUPS[3], description="Minimal contact sound with a faint hardwood body.", brightness=1.30, body=0.60, tail=0.24, pitch=1.08, hardness=1.22, hollow=0.00, room=0.00, gap=0.067, lift=0.46, land=1.04, width=0.05),

    dict(key="warm-desk", label="21 · Warm desk knock", group=GROUPS[4], description="Warm desk tone with gentle depth and a clean attack.", brightness=0.76, body=1.12, tail=0.68, pitch=0.91, hardness=0.90, hollow=0.05, room=0.08, gap=0.092, lift=0.52, land=1.08, width=0.13),
    dict(key="rounded-knock", label="22 · Rounded knock", group=GROUPS[4], description="Rounded wooden contact with less high-frequency bite.", brightness=0.86, body=1.06, tail=0.84, pitch=0.94, hardness=0.82, hollow=0.09, room=0.10, gap=0.094, lift=0.53, land=1.06, width=0.14),
    dict(key="soft-hardwood", label="23 · Soft hardwood", group=GROUPS[4], description="Softer attack while retaining a recognizable wooden core.", brightness=0.92, body=0.90, tail=0.62, pitch=0.98, hardness=0.74, hollow=0.04, room=0.06, gap=0.091, lift=0.54, land=1.02, width=0.12),
    dict(key="low-thud", label="24 · Low wooden thud", group=GROUPS[4], description="Low, weighty wooden thud with restrained high frequencies.", brightness=0.64, body=1.70, tail=0.70, pitch=0.70, hardness=0.82, hollow=0.12, room=0.06, gap=0.104, lift=0.47, land=1.20, width=0.08),
    dict(key="snappy-capture", label="25 · Snappy capture", group=GROUPS[4], description="Clean move knock with the strongest two-hit capture contrast.", brightness=1.20, body=0.90, tail=0.42, pitch=1.04, hardness=1.20, hollow=0.01, room=0.01, gap=0.112, lift=0.58, land=1.30, width=0.20),
]


def read(path: Path) -> str:
    return path.read_text()


def write(path: Path, content: str) -> None:
    path.write_text(content)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing patch marker: {label}")
    return text.replace(old, new, 1)


def pan_gains(pan: float) -> tuple[float, float]:
    pan = max(-1.0, min(1.0, pan))
    angle = (pan + 1.0) * math.pi / 4.0
    return math.cos(angle), math.sin(angle)


def add_noise_burst(
    left: array,
    right: array,
    rng: random.Random,
    start: float,
    duration: float,
    amplitude: float,
    decay: float,
    brightness: float,
    pan: float,
) -> None:
    start_index = int(start * RATE)
    count = min(int(duration * RATE), FRAME_COUNT - start_index)
    if count <= 0:
        return
    lg, rg = pan_gains(pan)
    low = 0.0
    attack_time = 0.0010
    bright_mix = max(0.18, min(0.96, 0.42 + (brightness - 0.8) * 0.46))
    for offset in range(count):
        t = offset / RATE
        raw = rng.uniform(-1.0, 1.0)
        low += 0.16 * (raw - low)
        high = raw - low
        sample = high * bright_mix + raw * (1.0 - bright_mix)
        attack = min(1.0, t / attack_time)
        envelope = attack * math.exp(-t / max(0.001, decay))
        value = sample * amplitude * envelope
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
    pan: float,
    phase_offset: float = 0.0,
) -> None:
    start_index = int(start * RATE)
    count = min(int(duration * RATE), FRAME_COUNT - start_index)
    if count <= 0:
        return
    lg, rg = pan_gains(pan)
    phase = phase_offset
    for offset in range(count):
        t = offset / RATE
        progress = offset / max(1, count - 1)
        frequency = frequency_start + (frequency_end - frequency_start) * progress
        phase += math.tau * frequency / RATE
        attack = min(1.0, t / 0.0014)
        envelope = attack * math.exp(-t / max(0.001, decay))
        value = math.sin(phase) * amplitude * envelope
        index = start_index + offset
        left[index] += value * lg
        right[index] += value * rg


def add_wood_hit(
    left: array,
    right: array,
    rng: random.Random,
    start: float,
    profile: dict,
    strength: float,
    pan: float,
) -> None:
    brightness = profile["brightness"]
    body = profile["body"]
    tail = profile["tail"]
    pitch = profile["pitch"]
    hardness = profile["hardness"]
    hollow = profile["hollow"]
    room = profile["room"]

    add_noise_burst(
        left,
        right,
        rng,
        start,
        0.034,
        0.42 * strength * hardness,
        0.0042 + 0.0025 * tail,
        brightness,
        pan,
    )
    add_damped_tone(left, right, start, 0.090, 2050 * brightness * pitch, 960 * brightness * pitch, 0.155 * strength * hardness, 0.017 * max(0.45, tail), pan)
    add_damped_tone(left, right, start + 0.0015, 0.145, 760 * math.sqrt(brightness) * pitch, 430 * pitch, 0.145 * strength * (0.76 + 0.24 * body), 0.040 * max(0.45, tail), pan * 0.55)
    add_damped_tone(left, right, start + 0.0035, 0.245, 270 * pitch, 172 * pitch, 0.118 * strength * body, 0.078 * max(0.42, tail), -pan * 0.28)
    if hollow > 0.005:
        add_damped_tone(left, right, start + 0.006, 0.340, 142 * pitch, 108 * pitch, 0.105 * strength * hollow, 0.145 * max(0.55, tail), -pan * 0.40)
    if room > 0.005:
        reflection = start + 0.013 + room * 0.014
        add_noise_burst(left, right, rng, reflection, 0.020, 0.064 * strength * room, 0.0048, brightness * 0.90, -pan * 0.62)
        add_damped_tone(left, right, reflection, 0.105, 610 * pitch, 390 * pitch, 0.045 * strength * room, 0.037 * max(0.55, tail), -pan * 0.45)


def render_profile(profile: dict, index: int) -> Path:
    rng = random.Random(27_000 + index * 997)
    left = array("f", [0.0]) * FRAME_COUNT
    right = array("f", [0.0]) * FRAME_COUNT
    width = profile["width"]

    # Normal move: one clean desk knock.
    add_wood_hit(left, right, rng, 0.095, profile, 1.00, -width * 0.18)

    # Capture: a lighter pickup followed by a firmer landing.
    capture_start = 0.640
    add_wood_hit(left, right, rng, capture_start, profile, profile["lift"], -width)
    add_wood_hit(left, right, rng, capture_start + profile["gap"], profile, profile["land"], width)

    # Check: selected desk knock plus two tiny wooden alert ticks.
    check_start = 1.405
    add_wood_hit(left, right, rng, check_start, profile, 0.92, -width * 0.20)
    add_damped_tone(left, right, check_start + 0.105, 0.105, 940 * profile["brightness"], 710 * profile["brightness"], 0.050, 0.032, -0.12)
    add_damped_tone(left, right, check_start + 0.185, 0.120, 1180 * profile["brightness"], 870 * profile["brightness"], 0.046, 0.038, 0.12)

    # Gentle saturation followed by peak normalization gives a crisp but safe attack.
    saturated_left = array("f")
    saturated_right = array("f")
    for l_value, r_value in zip(left, right):
        saturated_left.append(math.tanh(l_value * 1.13))
        saturated_right.append(math.tanh(r_value * 1.13))
    peak = max(max(abs(value) for value in saturated_left), max(abs(value) for value in saturated_right), 1e-9)
    target_peak = 0.92 if profile["key"] not in {"short-click", "ultra-dry"} else 0.86
    scale = target_peak / peak

    output = bytearray()
    for l_value, r_value in zip(saturated_left, saturated_right):
        l_sample = int(max(-1.0, min(1.0, l_value * scale)) * 32767)
        r_sample = int(max(-1.0, min(1.0, r_value * scale)) * 32767)
        output.extend(struct.pack("<hh", l_sample, r_sample))

    SOUND_DIR.mkdir(parents=True, exist_ok=True)
    destination = SOUND_DIR / f"kmate-{profile['key']}-v27.wav"
    with wave.open(str(destination), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(output)
    return destination


SOUND_DIR.mkdir(parents=True, exist_ok=True)
for old_file in SOUND_DIR.glob("*.wav"):
    old_file.unlink()
rendered_files = [render_profile(profile, index) for index, profile in enumerate(PROFILES, start=1)]
assert len(rendered_files) == 25
assert len({hashlib.sha256(path.read_bytes()).hexdigest() for path in rendered_files}) == 25


# Patch the K-Mate application.
app_path = ROOT / "app-v7-part1.txt"
app = read(app_path)
app = replace_once(app, "soundTheme: 'soft',", "soundTheme: 'desk-balanced',", "default sound profile")

migration_marker = """if (!store.settings.coachVoiceURI || store.settings.coachVoiceURI === 'auto') {
  store.settings.coachVoiceURI = 'british-woman';
}
"""
migration = migration_marker + """
const legacySoundProfileMap = { soft: 'desk-balanced', tournament: 'tournament-crisp', minimal: 'short-click' };
if (legacySoundProfileMap[store.settings.soundTheme]) {
  store.settings.soundTheme = legacySoundProfileMap[store.settings.soundTheme];
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch {}
}
"""
app = replace_once(app, migration_marker, migration, "legacy sound migration")

start = app.find("const SOUND_SPRITE_SEGMENTS = {")
end = app.find("function ensureHtmlMoveAudio() {", start)
if start < 0 or end < 0:
    raise SystemExit("Unable to locate sound profile block")

profile_lines = []
for profile in PROFILES:
    key = json.dumps(profile["key"])
    label = json.dumps(profile["label"])
    group = json.dumps(profile["group"])
    description = json.dumps(profile["description"])
    relative = f"./sounds/wood-v27/kmate-{profile['key']}-v27.wav?v=27.0.0"
    profile_lines.append(
        f"  {key}: Object.freeze({{ label: {label}, group: {group}, description: {description}, url: new URL({json.dumps(relative)}, document.baseURI).href }}),"
    )

sound_block = """const SOUND_SPRITE_SEGMENTS = Object.freeze({
  move: Object.freeze({ start: 0.06, duration: 0.42, volume: 0.98 }),
  capture: Object.freeze({ start: 0.56, duration: 0.72, volume: 1.00 }),
  check: Object.freeze({ start: 1.34, duration: 0.66, volume: 0.94 }),
});
const SOUND_PROFILE_GROUPS = Object.freeze(""" + json.dumps(GROUPS) + """);
const SOUND_PROFILES = Object.freeze({
""" + "\n".join(profile_lines) + """
});
const SOUND_THEME_LABELS = Object.freeze(Object.fromEntries(
  Object.entries(SOUND_PROFILES).map(([key, profile]) => [key, profile.label]),
));
const LEGACY_SOUND_THEME_MAP = Object.freeze({ soft: 'desk-balanced', tournament: 'tournament-crisp', minimal: 'short-click' });
let soundAudiblyConfirmed = false;

function normalizeSoundTheme(theme) {
  const normalized = LEGACY_SOUND_THEME_MAP[theme] || theme;
  return SOUND_PROFILES[normalized] ? normalized : 'desk-balanced';
}

function selectedSoundTheme() {
  const normalized = normalizeSoundTheme(settings.soundTheme);
  if (settings.soundTheme !== normalized) settings.soundTheme = normalized;
  return normalized;
}

function populateSoundProfiles() {
  const select = $('#soundStyleSelect');
  if (!select) return;
  select.innerHTML = '';
  for (const group of SOUND_PROFILE_GROUPS) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = group;
    for (const [key, profile] of Object.entries(SOUND_PROFILES)) {
      if (profile.group !== group) continue;
      const option = document.createElement('option');
      option.value = key;
      option.textContent = profile.label;
      optgroup.append(option);
    }
    select.append(optgroup);
  }
  select.value = selectedSoundTheme();
  updateSoundProfileDescription();
}

function updateSoundProfileDescription() {
  const profile = SOUND_PROFILES[selectedSoundTheme()] || SOUND_PROFILES['desk-balanced'];
  const description = $('#soundStyleDescription');
  if (description) description.textContent = `${profile.description} Each option has a matching two-hit capture and wooden check cue.`;
}

"""
app = app[:start] + sound_block + app[end:]

app = replace_once(
    app,
    "audio.src = SOUND_SPRITE_URLS[theme];",
    "audio.src = SOUND_PROFILES[theme].url;",
    "selected sound URL",
)

app = replace_once(
    app,
    """  if (kind === 'draw') {
    scheduleChessTone(ctx, now, 330, 330, 0.055, 0.11, 'sine');
    scheduleChessTone(ctx, now + 0.1, 294, 294, 0.05, 0.13, 'sine');
    return;
  }

  // A dry, fast wooden-board contact for ordinary moves.""",
    """  if (kind === 'draw') {
    scheduleChessTone(ctx, now, 330, 330, 0.055, 0.11, 'sine');
    scheduleChessTone(ctx, now + 0.1, 294, 294, 0.05, 0.13, 'sine');
    return;
  }
  if (kind === 'timeout') {
    scheduleChessKnock(ctx, now, 0.15, 0.026, 2450);
    scheduleChessKnock(ctx, now + 0.12, 0.17, 0.028, 2250);
    scheduleChessKnock(ctx, now + 0.24, 0.20, 0.032, 1900);
    scheduleChessTone(ctx, now + 0.30, 220, 125, 0.075, 0.20, 'triangle');
    return;
  }

  // A dry, fast wooden-board contact for ordinary moves.""",
    "timeout fallback sound",
)

app = replace_once(
    app,
    """function playHtmlMoveSound(kind) {
  const audio = ensureHtmlMoveAudio();
  const segment = SOUND_SPRITE_SEGMENTS[kind] || SOUND_SPRITE_SEGMENTS.move;""",
    """function playHtmlMoveSound(kind) {
  const segment = SOUND_SPRITE_SEGMENTS[kind];
  if (!segment) {
    playSynthMoveSound(kind);
    return;
  }
  const audio = ensureHtmlMoveAudio();""",
    "sampled sound event guard",
)

app = replace_once(
    app,
    """function playMoveSound(kind = 'move') {
  if (!soundEnabled()) return;
  lastSoundKind = kind;
  if (htmlAudioUnlocked) {""",
    """function playMoveSound(kind = 'move') {
  if (!soundEnabled()) return;
  lastSoundKind = kind;
  if (!SOUND_SPRITE_SEGMENTS[kind]) {
    playSynthMoveSound(kind);
    return;
  }
  if (htmlAudioUnlocked) {""",
    "sampled event routing",
)

set_start = app.find("async function setSoundTheme(theme, preview = false) {")
set_end = app.find("function canonicalShareUrl() {", set_start)
if set_start < 0 or set_end < 0:
    raise SystemExit("Unable to locate sound selection handlers")
new_handlers = """async function setSoundTheme(theme, previewKind = null) {
  const nextTheme = normalizeSoundTheme(theme);
  const changed = nextTheme !== selectedSoundTheme();
  settings.soundTheme = nextTheme;
  const select = $('#soundStyleSelect');
  if (select) select.value = settings.soundTheme;
  updateSoundProfileDescription();
  if (changed) {
    try { htmlMoveAudio?.pause(); } catch {}
    htmlMoveAudio = null;
    htmlMoveAudioTheme = null;
    htmlAudioUnlocked = false;
    soundAudiblyConfirmed = false;
    soundPlaybackBackend = 'not-unlocked';
  }
  saveStore();
  updateSoundToggle();
  if (previewKind && !soundEnabled()) {
    toast('Turn sound on to preview this wooden knock');
    return;
  }
  if (previewKind) {
    const unlocked = await unlockMoveAudio(false);
    if (unlocked) {
      lastSoundKind = previewKind;
      playHtmlMoveSound(previewKind);
      const kindLabel = previewKind === 'capture' ? 'capture' : 'move';
      toast(`${SOUND_THEME_LABELS[settings.soundTheme]} · ${kindLabel}`);
    }
  }
}

function handleSoundThemeChange(event) {
  setSoundTheme(event?.target?.value || 'desk-balanced', 'move');
}

function previewSoundTheme() {
  setSoundTheme($('#soundStyleSelect')?.value || selectedSoundTheme(), 'move');
}

function previewCaptureSoundTheme() {
  setSoundTheme($('#soundStyleSelect')?.value || selectedSoundTheme(), 'capture');
}

"""
app = app[:set_start] + new_handlers + app[set_end:]

app = app.replace("url.search = '?v=20260829-26';", "url.search = '?v=20260829-27';")

app = app.replace(
    "if ($('#soundStyleSelect')) $('#soundStyleSelect').value = selectedSoundTheme();",
    "if ($('#soundStyleSelect')) $('#soundStyleSelect').value = selectedSoundTheme();\n  updateSoundProfileDescription();",
    1,
)
app = app.replace(
    "settings.soundTheme = $('#soundStyleSelect')?.value || settings.soundTheme || 'soft';",
    "settings.soundTheme = normalizeSoundTheme($('#soundStyleSelect')?.value || settings.soundTheme || 'desk-balanced');\n  updateSoundProfileDescription();",
    1,
)
write(app_path, app)


# Setup-screen controls.
index_path = ROOT / "index.html"
index = read(index_path)
old_field = """          <div class="field sound-style-field" id="soundStyleField">
            <div class="fieldhead sound-style-head">
              <label for="soundStyleSelect">Move sound</label>
              <button class="sound-preview" id="previewSoundButton" type="button">Preview</button>
            </div>
            <select class="select" id="soundStyleSelect" aria-label="Move sound style">
              <option value="soft">Crisp soft wood</option>
              <option value="tournament">Crisp tournament wood</option>
              <option value="minimal">Dry click</option>
            </select>
            <small class="sub">All three profiles now use a faster attack and less reverberation: crisp soft wood, a firmer tournament-board impact, or a very dry click. The speaker button can still mute everything.</small>
          </div>"""
new_field = """          <div class="field sound-style-field" id="soundStyleField">
            <div class="fieldhead sound-style-head">
              <label for="soundStyleSelect">Wood sound library</label>
              <div class="sound-preview-actions" aria-label="Preview selected wooden sound">
                <button class="sound-preview" id="previewSoundButton" type="button" aria-label="Preview move sound">Move</button>
                <button class="sound-preview" id="previewCaptureButton" type="button" aria-label="Preview capture sound">Capture</button>
              </div>
            </div>
            <select class="select" id="soundStyleSelect" aria-label="Wooden move sound style">
              <option value="desk-balanced">01 · Balanced desk</option>
            </select>
            <small class="sub" id="soundStyleDescription">Choose from 25 original crisp wooden desk-knock profiles. Only the selected sound is loaded.</small>
          </div>"""
index = replace_once(index, old_field, new_field, "sound library setup field")
index = re.sub(r"styles-v7\.css\?v=\d+\.\d+\.\d+", "styles-v7.css?v=27.0.0", index)
index = re.sub(r"app-v7\.js\?v=\d+\.\d+\.\d+", "app-v7.js?v=27.0.0", index)
write(index_path, index)


# Presentation for the two preview buttons and long grouped selector.
styles_path = ROOT / "styles-v7.css"
styles = read(styles_path)
styles += """

/* K-Mate v27 — 25-option crisp wooden desk-knock library */
.sound-preview-actions{display:flex;align-items:center;gap:6px}
.sound-preview-actions .sound-preview{min-width:72px}
.sound-style-field .select{font-weight:760}
#soundStyleDescription{min-height:35px}
@media(max-width:560px){
  .sound-style-head{align-items:flex-start}
  .sound-preview-actions{gap:4px}
  .sound-preview-actions .sound-preview{min-width:61px;padding:0 8px;font-size:10px}
}
/* End K-Mate v27 */
"""
write(styles_path, styles)


# Loader and runtime bindings/version.
loader_path = ROOT / "app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=27.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=27.0.0", loader)
write(loader_path, loader)

part6_path = ROOT / "app-v7-part6.txt"
part6 = read(part6_path)
part6 = replace_once(
    part6,
    "$('#previewSoundButton')?.addEventListener('click', previewSoundTheme);",
    "$('#previewSoundButton')?.addEventListener('click', previewSoundTheme);\n  $('#previewCaptureButton')?.addEventListener('click', previewCaptureSoundTheme);",
    "capture preview binding",
)
part6 = replace_once(
    part6,
    "populateOpenings();\napplySettingsToControls();",
    "populateOpenings();\npopulateSoundProfiles();\napplySettingsToControls();",
    "sound profile population",
)
part6 = part6.replace("version: '26.0-commercial-beta'", "version: '27.0-commercial-beta'")
write(part6_path, part6)
