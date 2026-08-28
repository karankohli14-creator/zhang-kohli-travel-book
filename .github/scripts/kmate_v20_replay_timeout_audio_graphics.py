from pathlib import Path
import math
import random
import re
import struct
import wave


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing marker: {label}")
    return text.replace(old, new, 1)


def sub_once(pattern: str, replacement: str, text: str, label: str, flags: int = 0) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"Expected one replacement for {label}, found {count}")
    return updated


# -----------------------------------------------------------------------------
# Produce a sampled-style, high-resolution audio sprite. It remains original,
# local, and license-clean while sounding more like wood, felt, and a real clock.
# -----------------------------------------------------------------------------
SAMPLE_RATE = 44100
TOTAL_SECONDS = 5.90
samples = [0.0] * int(SAMPLE_RATE * TOTAL_SECONDS)
rng = random.Random(20260828)


def add_sample(index: int, value: float) -> None:
    if 0 <= index < len(samples):
        samples[index] += value


def add_modal_hit(start: float, amplitude: float, body: float = 1.0, brightness: float = 1.0) -> None:
    duration = 0.34
    first = int(start * SAMPLE_RATE)
    count = int(duration * SAMPLE_RATE)
    modes = [
        (126 * body, 18.0, 1.00),
        (205 * body, 24.0, 0.62),
        (331 * body, 31.0, 0.40),
        (515 * body, 42.0, 0.25 * brightness),
        (812 * body, 58.0, 0.13 * brightness),
    ]
    phases = [rng.random() * math.tau for _ in modes]
    filtered_noise = 0.0
    for offset in range(count):
        t = offset / SAMPLE_RATE
        value = 0.0
        for (frequency, decay, weight), phase in zip(modes, phases):
            value += math.sin(math.tau * frequency * t + phase) * math.exp(-decay * t) * weight
        noise = rng.uniform(-1.0, 1.0)
        filtered_noise += (noise - filtered_noise) * min(0.48, 0.14 * brightness)
        value += filtered_noise * math.exp(-72.0 * t) * 0.55 * brightness
        attack = min(1.0, t / 0.0018)
        add_sample(first + offset, amplitude * value * attack)
    # Small room reflections keep the hit from sounding like a pure synthesizer.
    for delay, gain in ((0.011, 0.22), (0.019, 0.12)):
        source_start = first
        destination_start = first + int(delay * SAMPLE_RATE)
        length = min(int(0.17 * SAMPLE_RATE), len(samples) - destination_start)
        for offset in range(max(0, length)):
            samples[destination_start + offset] += samples[source_start + offset] * gain


def add_tone(start: float, duration: float, frequency: float, amplitude: float,
             end_frequency: float | None = None, decay: float = 4.2,
             harmonic: float = 0.18) -> None:
    first = int(start * SAMPLE_RATE)
    count = int(duration * SAMPLE_RATE)
    phase = 0.0
    second_phase = 0.0
    target = end_frequency if end_frequency is not None else frequency
    for offset in range(count):
        progress = offset / max(1, count - 1)
        current = frequency + (target - frequency) * progress
        phase += math.tau * current / SAMPLE_RATE
        second_phase += math.tau * current * 2.01 / SAMPLE_RATE
        attack = min(1.0, progress / 0.035)
        release = min(1.0, (1.0 - progress) / 0.18)
        envelope = attack * release * math.exp(-decay * progress)
        value = math.sin(phase) + harmonic * math.sin(second_phase)
        add_sample(first + offset, amplitude * value * envelope)


def add_tick(start: float, amplitude: float = 0.28) -> None:
    first = int(start * SAMPLE_RATE)
    count = int(0.055 * SAMPLE_RATE)
    filtered = 0.0
    for offset in range(count):
        t = offset / SAMPLE_RATE
        noise = rng.uniform(-1.0, 1.0)
        filtered += (noise - filtered) * 0.37
        value = filtered * math.exp(-95 * t) + math.sin(math.tau * 1750 * t) * math.exp(-110 * t) * 0.33
        add_sample(first + offset, amplitude * value)


# MOVE: two tactile wooden contacts: lift and placement.
add_modal_hit(0.10, 0.34, body=1.08, brightness=0.85)
add_modal_hit(0.175, 0.58, body=0.96, brightness=1.03)

# CAPTURE: a firmer landing plus a lower displaced-piece knock.
add_modal_hit(0.55, 0.48, body=0.88, brightness=0.82)
add_modal_hit(0.645, 0.78, body=0.76, brightness=0.92)
add_tick(0.735, 0.12)

# CHECK: wooden contact followed by a compact, non-intrusive two-note signal.
add_modal_hit(1.15, 0.52, body=1.00, brightness=1.12)
add_tone(1.255, 0.20, 698.46, 0.23, end_frequency=783.99, decay=2.9)
add_tone(1.415, 0.20, 987.77, 0.19, end_frequency=1046.50, decay=3.3)

# WIN: short, warm major arpeggio.
add_modal_hit(1.95, 0.30, body=1.04, brightness=0.72)
for offset, note, amp in ((0.05, 523.25, 0.18), (0.19, 659.25, 0.19), (0.33, 783.99, 0.20), (0.49, 1046.50, 0.18)):
    add_tone(1.95 + offset, 0.25, note, amp, decay=2.4, harmonic=0.12)

# LOSS: restrained descending cadence.
add_modal_hit(3.00, 0.25, body=0.82, brightness=0.55)
add_tone(3.07, 0.28, 392.00, 0.18, end_frequency=349.23, decay=2.8)
add_tone(3.29, 0.30, 293.66, 0.18, end_frequency=246.94, decay=2.6)
add_tone(3.50, 0.25, 196.00, 0.13, end_frequency=174.61, decay=3.2)

# DRAW: balanced paired tones.
add_modal_hit(4.00, 0.23, body=1.00, brightness=0.62)
add_tone(4.09, 0.26, 440.00, 0.16, decay=2.8)
add_tone(4.29, 0.27, 440.00, 0.14, end_frequency=415.30, decay=2.8)

# TIMEOUT: clock ticks followed by a decisive flag-fall sound.
for offset in (0.00, 0.10, 0.20):
    add_tick(4.90 + offset, 0.30)
add_modal_hit(5.205, 0.62, body=0.70, brightness=0.62)
add_tone(5.22, 0.34, 330.00, 0.22, end_frequency=155.56, decay=2.0, harmonic=0.24)

peak = max(abs(value) for value in samples) or 1.0
scale = 0.91 / peak
pcm = bytearray()
for value in samples:
    limited = max(-1.0, min(1.0, value * scale))
    pcm += struct.pack('<h', int(limited * 32767))

sound_dir = Path('kmate-trainer/sounds')
sound_dir.mkdir(parents=True, exist_ok=True)
sound_path = sound_dir / 'kmate-sounds-v20.wav'
with wave.open(str(sound_path), 'wb') as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(SAMPLE_RATE)
    wav.writeframes(bytes(pcm))


# -----------------------------------------------------------------------------
# HTML: coached replay workspace and a direct action from the result review.
# -----------------------------------------------------------------------------
index_path = 'kmate-trainer/index.html'
index = read(index_path)
index = replace_once(
    index,
    '      <div class="dialogactions">\n        <button class="btn" type="button" id="resultInsights">View insights</button>',
    '      <div class="dialogactions result-actions">\n        <button class="btn replay-primary" type="button" id="resultReplay">Coach replay</button>\n        <button class="btn" type="button" id="resultInsights">View insights</button>',
    'result replay action',
)

replay_dialog = r'''

  <dialog id="replayDialog" class="modal replay-modal">
    <div class="replay-shell">
      <header class="replay-header">
        <div>
          <div class="eyebrow">Coach replay</div>
          <h2 id="replayTitle">Move-by-move review</h2>
          <p id="replaySubtitle">Starting position</p>
        </div>
        <div class="replay-header-actions">
          <button class="btn" id="replayBackToReview" type="button">Back to review</button>
          <button class="roundbtn" type="button" data-close="replayDialog" aria-label="Close replay">×</button>
        </div>
      </header>

      <div class="replay-layout">
        <section class="replay-board-column">
          <div class="replay-position-bar">
            <span id="replayPlyLabel">Starting position</span>
            <b id="replayEval">Evaluation pending</b>
          </div>
          <div class="boardwrap replay-boardwrap"><div class="board replay-board" id="replayBoard" aria-label="Coach replay chessboard"></div></div>
          <input class="replay-slider" id="replaySlider" type="range" min="0" max="0" step="1" value="0" aria-label="Replay position">
          <div class="replay-controls">
            <button type="button" id="replayFirst" aria-label="First position">⏮</button>
            <button type="button" id="replayPrevious" aria-label="Previous move">◀</button>
            <button type="button" class="replay-auto" id="replayAuto">▶ Auto</button>
            <button type="button" id="replayNext" aria-label="Next move">▶</button>
            <button type="button" id="replayLast" aria-label="Last position">⏭</button>
          </div>
        </section>

        <aside class="replay-coach-card">
          <div class="replay-rating-row">
            <span class="move-quality-badge quality-pending" id="replayRating">Position</span>
            <span id="replayDecisionCount">0 / 0</span>
          </div>
          <h2 id="replayCoachTitle">Start with the original position</h2>
          <p id="replayCoachText">The coach will explain each move, then compare your decisions with Stockfish’s preferred continuation.</p>

          <div class="replay-comparison" id="replayComparison" hidden>
            <article><small>Your move</small><b id="replayYourMove">—</b><span id="replayYourOutcome">—</span></article>
            <article><small>Best move</small><b id="replayBestMove">—</b><span id="replayBestOutcome">—</span></article>
          </div>

          <div class="replay-line" id="replayLine" hidden>
            <small>Illustrative best line</small>
            <b id="replayLineMoves">—</b>
          </div>

          <button class="btn replay-best-button" id="replayBestButton" type="button" hidden>Show best move on board</button>
          <p class="replay-footnote" id="replayFootnote">Engine explanations are local training guidance, not a substitute for a human coach’s full positional judgment.</p>
        </aside>
      </div>
    </div>
  </dialog>
'''
index = replace_once(index, '\n  <div class="toast" id="toast" role="status" aria-live="polite"></div>', replay_dialog + '\n  <div class="toast" id="toast" role="status" aria-live="polite"></div>', 'replay dialog insertion')
index = re.sub(r'\./styles-v7\.css\?v=\d+(?:\.\d+){2}', './styles-v7.css?v=20.0.0', index)
index = re.sub(r'\./app-v7\.js\?v=\d+(?:\.\d+){2}', './app-v7.js?v=20.0.0', index)
write(index_path, index)


# -----------------------------------------------------------------------------
# Application logic.
# -----------------------------------------------------------------------------
app_path = 'kmate-trainer/app-v7-part1.txt'
app = read(app_path)

piece_code = r'''const PIECES = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
let pieceGraphicSerial = 0;
const STAUNTON_PIECES = {
  p: `<ellipse class="piece-ground" cx="50" cy="90" rx="29" ry="4"/><circle class="piece-body" cx="50" cy="21" r="11.5"/><path class="piece-body" d="M39 36Q50 30 61 36L59 43Q65 51 62 62H38Q35 51 41 43Z"/><path class="piece-band" d="M34 61H66L72 73H28Z"/><path class="piece-base" d="M24 72H76L82 84H18Z"/><path class="piece-base" d="M17 83H83V91H17Z"/><path class="piece-glint" d="M43 39Q48 35 53 36M33 75H67"/>`,
  r: `<ellipse class="piece-ground" cx="50" cy="91" rx="31" ry="4"/><path class="piece-body" d="M22 15H36V27H44V15H56V27H64V15H78V37L69 45H31L22 37Z"/><path class="piece-band" d="M31 44H69L65 54H35Z"/><path class="piece-body" d="M35 53H65L62 71H38Z"/><path class="piece-band" d="M30 69H70L76 81H24Z"/><path class="piece-base" d="M20 80H80L84 91H16Z"/><path class="piece-glint" d="M38 49H62M40 58H57M31 84H69"/>`,
  n: `<ellipse class="piece-ground" cx="50" cy="91" rx="31" ry="4"/><path class="piece-body" d="M23 81C27 68 34 57 44 48C37 43 34 35 36 24C44 24 51 20 58 13C72 23 79 36 75 50C72 61 63 68 57 74H72L79 82Z"/><path class="piece-shadow" d="M37 26C47 27 57 33 62 43C55 40 48 42 43 49C38 43 35 35 37 26Z"/><path class="piece-mane" d="M57 14C67 28 67 42 59 56C68 50 75 43 75 34C72 26 66 19 57 14Z"/><circle class="piece-eye" cx="57" cy="31" r="2.5"/><path class="piece-detail" d="M45 48Q54 51 61 45M36 70Q45 55 56 48"/><path class="piece-base" d="M21 80H79L84 91H16Z"/>`,
  b: `<ellipse class="piece-ground" cx="50" cy="91" rx="30" ry="4"/><path class="piece-body" d="M50 12C39 21 34 30 36 39C37 45 42 50 47 53C39 59 36 65 35 71H65C64 65 61 59 53 53C58 50 63 45 64 39C66 30 61 21 50 12Z"/><path class="piece-cut" d="M43 24L57 43"/><path class="piece-band" d="M31 69H69L75 81H25Z"/><path class="piece-base" d="M19 80H81L84 91H16Z"/><path class="piece-glint" d="M43 55Q39 61 39 67M32 84H68"/>`,
  q: `<ellipse class="piece-ground" cx="50" cy="92" rx="32" ry="4"/><circle class="piece-jewel" cx="20" cy="21" r="5"/><circle class="piece-jewel" cx="35" cy="14" r="5"/><circle class="piece-jewel" cx="50" cy="11" r="5"/><circle class="piece-jewel" cx="65" cy="14" r="5"/><circle class="piece-jewel" cx="80" cy="21" r="5"/><path class="piece-body" d="M20 27L31 58H69L80 27L64 45L58 22L50 45L42 22L36 45Z"/><path class="piece-band" d="M31 56H69L73 68H27Z"/><path class="piece-body" d="M30 67H70L76 81H24Z"/><path class="piece-base" d="M18 80H82L85 92H15Z"/><path class="piece-glint" d="M34 52H66M34 71H66M29 84H71"/>`,
  k: `<ellipse class="piece-ground" cx="50" cy="92" rx="32" ry="4"/><path class="piece-cross" d="M46 8H54V19H65V27H54V39H46V27H35V19H46Z"/><path class="piece-body" d="M50 36C38 36 31 43 32 53C33 60 39 65 45 68H34L29 80H71L66 68H55C61 65 67 60 68 53C69 43 62 36 50 36Z"/><path class="piece-band" d="M29 70H71L77 82H23Z"/><path class="piece-base" d="M18 81H82L85 92H15Z"/><path class="piece-glint" d="M41 47Q38 55 44 62M32 74H68M28 85H72"/>`,
};

function renderPieceGraphic(element, type, color) {
  const markup = STAUNTON_PIECES[type];
  if (!markup) {
    element.textContent = PIECES[type] || '';
    return;
  }
  const uid = `km-piece-${++pieceGraphicSerial}`;
  element.classList.add('vector-piece', 'staunton-piece');
  element.dataset.pieceType = type;
  element.dataset.pieceColor = color;
  const painted = markup
    .replaceAll('class="piece-body"', `class="piece-body" fill="url(#${uid}-body)"`)
    .replaceAll('class="piece-base"', `class="piece-base" fill="url(#${uid}-base)"`)
    .replaceAll('class="piece-band"', `class="piece-band" fill="url(#${uid}-band)"`)
    .replaceAll('class="piece-shadow"', `class="piece-shadow" fill="url(#${uid}-shadow-fill)"`)
    .replaceAll('class="piece-mane"', `class="piece-mane" fill="url(#${uid}-mane)"`)
    .replaceAll('class="piece-cross"', `class="piece-cross" fill="url(#${uid}-body)"`)
    .replaceAll('class="piece-jewel"', `class="piece-jewel" fill="url(#${uid}-jewel)"`);
  element.innerHTML = `<svg viewBox="0 0 100 100" focusable="false" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}-body" x1="18%" y1="8%" x2="82%" y2="94%"><stop offset="0" class="piece-grad-body-hi"/><stop offset="0.48" class="piece-grad-body-mid"/><stop offset="1" class="piece-grad-body-low"/></linearGradient>
      <linearGradient id="${uid}-base" x1="20%" y1="0" x2="78%" y2="100%"><stop offset="0" class="piece-grad-base-hi"/><stop offset="1" class="piece-grad-base-low"/></linearGradient>
      <linearGradient id="${uid}-band" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="piece-grad-band-hi"/><stop offset="1" class="piece-grad-band-low"/></linearGradient>
      <linearGradient id="${uid}-shadow-fill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="piece-grad-shadow-hi"/><stop offset="1" class="piece-grad-shadow-low"/></linearGradient>
      <linearGradient id="${uid}-mane" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="piece-grad-mane-hi"/><stop offset="1" class="piece-grad-mane-low"/></linearGradient>
      <radialGradient id="${uid}-jewel" cx="35%" cy="28%" r="70%"><stop offset="0" class="piece-grad-jewel-hi"/><stop offset="1" class="piece-grad-jewel-low"/></radialGradient>
      <filter id="${uid}-depth" x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="2.5" stdDeviation="1.4" flood-opacity=".52"/><feDropShadow dx="0" dy="6" stdDeviation="4" flood-opacity=".28"/></filter>
    </defs>
    <g class="piece-art" filter="url(#${uid}-depth)">${painted}</g>
  </svg>`;
}

'''
piece_pattern = re.compile(r"const PIECES = \{.*?\n\};\n\nfunction renderPieceGraphic\(element, type, color\) \{.*?\n\}\n\n(?=const PHASE_LABELS)", re.S)
app, count = piece_pattern.subn(piece_code, app, count=1)
if count != 1:
    raise SystemExit(f'Piece graphics block replacement failed: {count}')

sound_code = r'''const SOUND_SPRITE_SEGMENTS = {
  move: { start: 0.10, duration: 0.30, volume: 0.94 },
  capture: { start: 0.55, duration: 0.43, volume: 1.00 },
  check: { start: 1.15, duration: 0.55, volume: 0.96 },
  win: { start: 1.95, duration: 0.82, volume: 0.94 },
  loss: { start: 3.00, duration: 0.72, volume: 0.94 },
  draw: { start: 4.00, duration: 0.62, volume: 0.92 },
  timeout: { start: 4.90, duration: 0.78, volume: 1.00 },
};
const SOUND_SPRITE_URL = new URL('./sounds/kmate-sounds-v20.wav?v=20.0.0', document.baseURI).href;
let soundAudiblyConfirmed = false;

function ensureHtmlMoveAudio() {
  if (htmlMoveAudio) return htmlMoveAudio;
  const audio = new Audio();
  audio.preload = 'auto';
  audio.playsInline = true;
  audio.src = SOUND_SPRITE_URL;
  audio.volume = 0.94;
  htmlMoveAudio = audio;
  try { audio.load(); } catch {}
  return audio;
}

async function unlockMoveAudio(audible = false) {
  if (!soundEnabled()) return false;
  const audio = ensureHtmlMoveAudio();
  if (htmlAudioUnlocked && (!audible || soundAudiblyConfirmed)) return true;
  const segment = SOUND_SPRITE_SEGMENTS.move;
  try {
    if (htmlMoveAudioStopTimer) window.clearTimeout(htmlMoveAudioStopTimer);
    audio.pause();
    audio.currentTime = segment.start;
    audio.muted = false;
    audio.volume = audible ? segment.volume : 0.01;
    const promise = audio.play();
    if (promise?.then) await promise;
    htmlAudioUnlocked = true;
    soundPlaybackBackend = 'sampled-wav-sprite';
    soundBlockedNoticeShown = false;
    if (audible) soundAudiblyConfirmed = true;
    const listenMs = audible ? 235 : 55;
    htmlMoveAudioStopTimer = window.setTimeout(() => {
      audio.pause();
      audio.currentTime = segment.start;
      audio.volume = 0.94;
    }, listenMs);
    updateSoundToggle();
    return true;
  } catch (error) {
    console.warn('Sampled K-Mate audio could not unlock.', error);
    soundPlaybackBackend = 'web-audio-fallback';
    ensureAudioContext();
    if (!soundBlockedNoticeShown) {
      soundBlockedNoticeShown = true;
      toast('Tap the speaker once, and make sure media volume is up');
    }
    return false;
  }
}

function playHtmlMoveSound(kind) {
  const audio = ensureHtmlMoveAudio();
  const segment = SOUND_SPRITE_SEGMENTS[kind] || SOUND_SPRITE_SEGMENTS.move;
  if (htmlMoveAudioStopTimer) window.clearTimeout(htmlMoveAudioStopTimer);
  audio.pause();
  audio.currentTime = segment.start;
  audio.volume = segment.volume;
  const promise = audio.play();
  if (promise?.then) {
    promise.then(() => {
      htmlAudioUnlocked = true;
      soundAudiblyConfirmed = true;
      soundPlaybackBackend = 'sampled-wav-sprite';
      updateSoundToggle();
    }).catch((error) => {
      console.warn('Sampled move sound was blocked; using synthesizer fallback.', error);
      soundPlaybackBackend = 'web-audio-fallback';
      playSynthMoveSound(kind);
    });
  }
  htmlMoveAudioStopTimer = window.setTimeout(() => {
    audio.pause();
    audio.currentTime = segment.start;
  }, Math.ceil(segment.duration * 1000));
}

function playMoveSound(kind = 'move') {
  if (!soundEnabled()) return;
  lastSoundKind = kind;
  if (htmlAudioUnlocked) {
    playHtmlMoveSound(kind);
    return;
  }
  unlockMoveAudio(false).then((unlocked) => {
    if (unlocked) playHtmlMoveSound(kind);
    else playSynthMoveSound(kind);
  });
}

const primeSoundFromGesture = (event) => {
  if (event?.target?.closest?.('#soundToggle')) return;
  unlockMoveAudio(false);
};
document.addEventListener('pointerdown', primeSoundFromGesture, { capture: true, once: true });
document.addEventListener('touchstart', primeSoundFromGesture, { capture: true, once: true, passive: true });
document.addEventListener('keydown', primeSoundFromGesture, { capture: true, once: true });

function updateSoundToggle() {
  const button = $('#soundToggle');
  if (!button) return;
  button.textContent = soundEnabled() ? '🔊' : '🔇';
  button.classList.toggle('audio-ready', soundEnabled() && soundAudiblyConfirmed);
  button.classList.toggle('audio-needs-tap', soundEnabled() && !soundAudiblyConfirmed);
  button.setAttribute('aria-label', soundEnabled() ? 'Mute move sounds' : 'Turn on move sounds');
  button.title = soundEnabled()
    ? (soundAudiblyConfirmed ? 'Move sounds on' : 'Tap once to enable and test move sounds')
    : 'Move sounds off';
}

async function toggleSound() {
  // A silent browser unlock must not make the next speaker tap mute the app.
  if (soundEnabled() && !soundAudiblyConfirmed) {
    const unlocked = await unlockMoveAudio(true);
    updateSoundToggle();
    if (unlocked) toast('Sound ready — test click played');
    return;
  }

  settings.sound = !soundEnabled();
  saveStore();
  updateSoundToggle();
  if (settings.sound) {
    const unlocked = await unlockMoveAudio(true);
    if (unlocked) toast('Move sounds on');
  } else {
    htmlMoveAudio?.pause();
    toast('Move sounds muted');
  }
}

'''
sound_pattern = re.compile(r"const SOUND_SPRITE_SEGMENTS = \{.*?\n\}\n\n\n(?=function canonicalShareUrl)", re.S)
app, count = sound_pattern.subn(sound_code, app, count=1)
if count != 1:
    raise SystemExit(f'Sound block replacement failed: {count}')

app = re.sub(r"url\.search = '\?v=[^']+';", "url.search = '?v=20260828-20';", app, count=1)

state_marker = "let hintState = { fen: null, status: 'idle', level: 0, strategicText: '', exactText: '', candidate: null, requestedReveal: false, counted: false, revealCounted: false };\n"
state_addition = state_marker + "let timeoutHandling = false;\nlet replayState = { session: null, frames: [], index: 0, timer: null, auto: false, showBest: false };\n"
app = replace_once(app, state_marker, state_addition, 'replay state')

handle_timeout = r'''function handleTimeout(loser) {
  if (finalized || timeoutHandling) return;
  timeoutHandling = true;
  requestId += 1;
  thinking = false;
  stockfishEngine?.stop();
  stopClock();
  clocks[loser] = 0;
  const winner = loser === 'w' ? 'b' : 'w';
  const draw = !hasMatingMaterial(winner);
  if (draw) {
    finalizeSession('draw', 'timeout with insufficient mating material', true);
    setStatus('Time expired. The result is a draw because mating material was insufficient.', 'bad');
    showResult('Draw on time', 'The flag fell, but the opponent did not have sufficient mating material.', '½');
  } else {
    const outcome = loser === userColor ? 'loss' : 'win';
    finalizeSession(outcome, 'timeout', true);
    setStatus(outcome === 'win' ? 'Opponent flagged. Open the review or coach replay.' : 'Time expired. Open the review or coach replay.', 'bad');
    showResult(
      outcome === 'win' ? 'You won on time' : 'Time expired',
      outcome === 'win'
        ? `K-Mate ${opponentRatingForSession()} ran out of time.`
        : `Your ${timeControl().label} clock reached zero. The position is now finished and saved for review.`,
      outcome === 'win' ? '1' : '0',
    );
  }
  renderAll();
  timeoutHandling = false;
}

'''
app = sub_once(r"function handleTimeout\(loser\) \{.*?\n\}\n\n(?=function startPosition)", handle_timeout, app, 'timeout handler', re.S)

move_fields_old = "    uci: uciFromMove(move),\n    from: move.from,\n    to: move.to,\n    hintLevel: hintLevelAtMove,"
move_fields_new = "    uci: uciFromMove(move),\n    from: move.from,\n    to: move.to,\n    color: move.color,\n    ply: game.history().length,\n    fenBefore,\n    hintLevel: hintLevelAtMove,"
app = replace_once(app, move_fields_old, move_fields_new, 'move replay fields')

analysis_function = r'''async function analyzeMoveWithStockfish(fenBefore, moveUci) {
  const engine = getStockfishReviewEngine();
  const before = await engine.evaluate({ fen: fenBefore, movetime: 700 });
  const g = new Chess(fenBefore);
  const selected = g.move({ from: moveUci.slice(0, 2), to: moveUci.slice(2, 4), promotion: moveUci[4] || 'q' });
  if (!selected) throw new Error('Unable to reproduce move for review');
  const after = await engine.evaluate({ fen: g.fen(), movetime: 480 });
  const bestScore = before.scoreCp;
  const selectedScore = -after.scoreCp;
  return {
    cpLoss: Math.min(1000, Math.max(0, Math.round(bestScore - selectedScore))),
    bestMove: before.move,
    bestLine: Array.isArray(before.pv) && before.pv.length ? before.pv.slice(0, 10) : (before.move ? [before.move] : []),
    bestScore,
    selectedScore,
    depth: Math.max(before.depth || 0, after.depth || 0),
    source: 'Stockfish 18',
  };
}

'''
app = sub_once(r"async function analyzeMoveWithStockfish\(fenBefore, moveUci\) \{.*?\n\}\n\n(?=function applyMoveAnalysisResult)", analysis_function, app, 'enhanced move analysis', re.S)

analysis_store_old = "  targetMove.analysisSource = data.source || 'Local fallback';\n  targetMove.quality = qualityForLoss(data.cpLoss).key;"
analysis_store_new = "  targetMove.analysisSource = data.source || 'Local fallback';\n  targetMove.bestLine = Array.isArray(data.bestLine) ? data.bestLine.slice(0, 10) : (data.bestMove ? [data.bestMove] : []);\n  targetMove.quality = qualityForLoss(data.cpLoss).key;"
app = replace_once(app, analysis_store_old, analysis_store_new, 'best line storage')

replay_refresh_old = "    if (finalized) renderPostGameReview(currentSession);\n  } else {"
replay_refresh_new = "    if (finalized) renderPostGameReview(currentSession);\n    if (replayState.session?.id === sessionId) {\n      replayState.session = targetSession;\n      renderCoachReplay();\n    }\n  } else {"
app = replace_once(app, replay_refresh_old, replay_refresh_new, 'live replay analysis refresh')

pv_old = "        const mate = line.match(/\\bscore\\s+mate\\s+(-?\\d+)/)?.[1];\n        if (depth) this.lastInfo.depth = Number(depth);"
pv_new = "        const mate = line.match(/\\bscore\\s+mate\\s+(-?\\d+)/)?.[1];\n        const pv = line.match(/\\bpv\\s+(.+)$/)?.[1];\n        if (depth) this.lastInfo.depth = Number(depth);"
app = replace_once(app, pv_old, pv_new, 'Stockfish PV parser declaration')
pv_store_old = "        if (mate) this.lastInfo.mate = Number(mate);\n      }"
pv_store_new = "        if (mate) this.lastInfo.mate = Number(mate);\n        if (pv) this.lastInfo.pv = pv.trim().split(/\\s+/).filter(Boolean).slice(0, 16);\n      }"
app = replace_once(app, pv_store_old, pv_store_new, 'Stockfish PV parser storage')

finalize_code = r'''function serializeMoveSequence() {
  if (!game) return [];
  return game.history({ verbose: true }).map((move, index) => ({
    ply: index + 1,
    color: move.color,
    from: move.from,
    to: move.to,
    san: move.san,
    uci: uciFromMove(move),
    piece: move.piece,
    captured: move.captured || null,
    promotion: move.promotion || null,
    flags: move.flags || '',
  }));
}

function finalizeSession(outcome, reason, completed) {
  if (!currentSession || finalized) return;
  const timeoutReason = String(reason || '').startsWith('timeout');
  if (!timeoutReason) syncClock();
  // syncClock can itself finish the session when the flag falls between taps.
  if (finalized) return;
  finalized = true;
  thinking = false;
  requestId += 1;
  stockfishEngine?.stop();
  stopClock();
  currentSession.outcome = outcome;
  currentSession.reason = reason;
  currentSession.completed = completed;
  currentSession.endedAt = new Date().toISOString();
  currentSession.remainingMs = clockRunning ? Math.max(0, clocks[userColor]) : null;
  currentSession.clockSnapshot = { w: Math.max(0, clocks.w || 0), b: Math.max(0, clocks.b || 0) };
  currentSession.moveSequence = serializeMoveSequence();
  currentSession.finalFen = game?.fen() || null;
  Object.assign(currentSession, summarizeSession(currentSession));
  if (completed || currentSession.userMoves.length > 0) {
    store.sessions.unshift(clone(currentSession));
    saveStore();
  }
  renderTurns();
  renderClocks();
}

'''
app = sub_once(r"function finalizeSession\(outcome, reason, completed\) \{.*?\n\}\n\n(?=function updateStoredCurrentSession)", finalize_code, app, 'safe session finalization', re.S)

show_sound_old = "  window.setTimeout(() => playMoveSound(symbol === '1' ? 'win' : symbol === '0' ? 'loss' : 'draw'), 90);"
show_sound_new = "  const resultSound = String(session.reason || '').startsWith('timeout') ? 'timeout' : symbol === '1' ? 'win' : symbol === '0' ? 'loss' : 'draw';\n  window.setTimeout(() => playMoveSound(resultSound), 90);"
app = replace_once(app, show_sound_old, show_sound_new, 'timeout result sound')

show_replay_old = "  renderPostGameReview(session);\n  renderCalibrationPanel(session);\n  openDialog('resultDialog');"
show_replay_new = "  renderPostGameReview(session);\n  renderCalibrationPanel(session);\n  const replayButton = $('#resultReplay');\n  if (replayButton) {\n    replayButton.disabled = !session.startFen || !(session.moveSequence?.length);\n    replayButton.textContent = session.moveSequence?.length ? 'Coach replay' : 'Replay unavailable';\n  }\n  openDialog('resultDialog');"
app = replace_once(app, show_replay_old, show_replay_new, 'result replay availability')

replay_code = r'''function materialForPerspective(g, color) {
  const values = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  let score = 0;
  g.board().forEach((row) => row.forEach((piece) => {
    if (!piece) return;
    score += (piece.color === color ? 1 : -1) * (values[piece.type] || 0);
  }));
  return score;
}

function moveObjectFromUci(uci) {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' };
}

function describeMoveFromFen(fen, uci) {
  if (!fen || !uci) return { san: readableEngineMove(uci), text: 'No concrete move description is available.', move: null };
  const g = new Chess(fen);
  const object = moveObjectFromUci(uci);
  const piece = object ? g.get(object.from) : null;
  const beforeMaterial = materialForPerspective(g, piece?.color || g.turn());
  let move = null;
  try { move = object ? g.move(object) : null; } catch {}
  if (!move) return { san: readableEngineMove(uci), text: 'The move could not be reconstructed from this stored position.', move: null };
  const afterMaterial = materialForPerspective(g, move.color);
  const features = [];
  if (move.san.includes('#')) features.push('delivers checkmate');
  else if (move.san.includes('+')) features.push('forces the opponent to answer a check');
  if (move.captured) features.push(`captures a ${pieceName(move.captured)}`);
  if (move.promotion) features.push(`promotes to a ${pieceName(move.promotion)}`);
  if (move.san.startsWith('O-O')) features.push('secures the king and connects the rooks');
  if (['n', 'b'].includes(move.piece) && ((move.color === 'w' && move.from[1] === '1') || (move.color === 'b' && move.from[1] === '8'))) features.push(`develops the ${pieceName(move.piece)}`);
  if (move.piece === 'p' && ['c', 'd', 'e', 'f'].includes(move.to[0])) features.push('changes the central pawn structure');
  if (['d4', 'e4', 'd5', 'e5'].includes(move.to)) features.push('claims an important central square');
  if (afterMaterial > beforeMaterial && !move.captured) features.push('improves the immediate material balance');
  const text = features.length ? `${move.san} ${features.join(', and ')}.` : `${move.san} repositions the ${pieceName(move.piece)} to ${move.to}.`;
  return { san: move.san, text, move, materialDelta: afterMaterial - beforeMaterial };
}

function evaluationText(cp) {
  if (!Number.isFinite(cp)) return 'an unknown evaluation';
  if (Math.abs(cp) > 90000) return cp > 0 ? 'a forced mating advantage for you' : 'a forced mate against you';
  const pawns = Math.abs(cp / 100).toFixed(1);
  if (cp >= 300) return `a winning +${pawns} advantage`;
  if (cp >= 120) return `a clear +${pawns} advantage`;
  if (cp >= 40) return `a small +${pawns} edge`;
  if (cp > -40) return 'an approximately balanced position';
  if (cp > -120) return `a small −${pawns} disadvantage`;
  if (cp > -300) return `a clear −${pawns} disadvantage`;
  return `a difficult −${pawns} position`;
}

function evaluationBadge(cp) {
  if (!Number.isFinite(cp)) return 'Eval —';
  if (Math.abs(cp) > 90000) return cp > 0 ? 'Mate for you' : 'Mate against you';
  const value = cp / 100;
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
}

function sanLineFromPv(fen, pv, limit = 8) {
  if (!fen || !Array.isArray(pv) || !pv.length) return [];
  const g = new Chess(fen);
  const san = [];
  for (const uci of pv.slice(0, limit)) {
    const object = moveObjectFromUci(uci);
    if (!object) break;
    try {
      const move = g.move(object);
      if (!move) break;
      san.push(move.san);
    } catch { break; }
  }
  return san;
}

function strongestAlternativeAchievement(record, session) {
  const best = describeMoveFromFen(record.fenBefore, record.bestMove);
  const selected = describeMoveFromFen(record.fenBefore, record.uci);
  const bestEval = record.bestScore;
  const selectedEval = record.selectedScore;
  let achievement;
  if (best.move?.san.includes('#')) achievement = 'finished the game with a forced mate';
  else if (best.move?.san.includes('+') && !selected.move?.san.includes('+')) achievement = 'seized the initiative with a forcing check';
  else if (best.move?.captured && !selected.move?.captured) achievement = `used a tactical capture of the ${pieceName(best.move.captured)}`;
  else if (best.move?.san.startsWith('O-O')) achievement = 'secured the king before beginning another plan';
  else if (Number.isFinite(bestEval) && Number.isFinite(selectedEval) && bestEval >= 120 && selectedEval < 40) achievement = 'preserved a clear advantage instead of letting the position return toward equality';
  else if (Number.isFinite(bestEval) && Number.isFinite(selectedEval) && bestEval >= -35 && selectedEval <= -120) achievement = 'kept the game defensible instead of conceding a clear disadvantage';
  else if (Number.isFinite(bestEval) && bestEval < -100) achievement = 'offered the strongest practical resistance in a difficult position';
  else if ((session.tags || []).includes('king safety')) achievement = 'kept king safety and forcing play as the priority';
  else if ((session.tags || []).some((tag) => ['conversion', 'endgame transition'].includes(tag))) achievement = 'kept the cleanest route to converting the position';
  else if ((session.tags || []).some((tag) => ['pawn structure', 'pawn breaks'].includes(tag))) achievement = 'handled the pawn structure without creating a lasting weakness';
  else achievement = 'kept the pieces coordinated and preserved the position’s best practical chances';
  return { best, selected, achievement };
}

function coachNarrationForRecord(record, session, decisionNumber) {
  if (!record) return { title: `Decision ${decisionNumber}`, text: 'This move was not linked to a stored analysis record.', bestSan: '—', yourSan: '—', bestOutcome: '—', yourOutcome: '—', line: [], band: { key: 'pending', label: 'Pending' } };
  const band = Number.isFinite(record.cpLoss) ? qualityForLoss(record.cpLoss) : { key: 'pending', label: 'Analyzing' };
  const comparison = strongestAlternativeAchievement(record, session);
  const bestSan = comparison.best.san || readableEngineMove(record.bestMove);
  const line = sanLineFromPv(record.fenBefore, record.bestLine, 8);
  const assisted = record.hintLevel ? ` You used ${record.hintLevel >= 2 ? 'the exact candidate reveal' : 'a strategic hint'} before moving.` : '';
  let text;
  if (!Number.isFinite(record.cpLoss)) {
    text = `Stockfish is still finishing the review of ${record.san}. The replay will refresh automatically when the evaluation arrives.${assisted}`;
  } else if (['best', 'excellent'].includes(band.key)) {
    text = `${comparison.selected.text} This was ${band.label.toLowerCase()} and maintained ${evaluationText(record.selectedScore)}.${record.bestMove && record.bestMove !== record.uci ? ` Stockfish slightly preferred ${bestSan}, but the difference was only ${Math.round(record.cpLoss)} centipawns.` : ' It matched the engine’s principal choice.'}${assisted}`;
  } else if (band.key === 'good') {
    text = `${comparison.selected.text} It was a good practical decision, but ${bestSan} was more precise because it would have ${comparison.achievement}. The estimated difference was ${Math.round(record.cpLoss)} centipawns.${assisted}`;
  } else {
    const transition = `The evaluation moved from ${evaluationText(record.bestScore)} with best play to ${evaluationText(record.selectedScore)} after your move.`;
    text = `${comparison.selected.text} The main problem was not merely the destination square: ${transition} ${bestSan} was stronger because it would have ${comparison.achievement}.${assisted}`;
  }
  return {
    title: `Decision ${decisionNumber} · ${band.label}`,
    text,
    bestSan,
    yourSan: record.san,
    bestOutcome: evaluationText(record.bestScore),
    yourOutcome: evaluationText(record.selectedScore),
    line,
    band,
  };
}

function sessionSequence(session) {
  if (Array.isArray(session?.moveSequence) && session.moveSequence.length) return session.moveSequence;
  if (currentSession?.id === session?.id && game) return serializeMoveSequence();
  return [];
}

function buildReplayFrames(session) {
  const sequence = sessionSequence(session);
  if (!session?.startFen || !sequence.length) return [];
  const replayGame = new Chess(session.startFen);
  const frames = [{ index: 0, ply: 0, fen: replayGame.fen(), fenBefore: replayGame.fen(), move: null, isUser: false, userRecord: null, decisionNumber: 0 }];
  let userRecordIndex = 0;
  for (let index = 0; index < sequence.length; index += 1) {
    const stored = sequence[index];
    const fenBefore = replayGame.fen();
    let applied = null;
    try { applied = replayGame.move({ from: stored.from, to: stored.to, promotion: stored.promotion || stored.uci?.[4] || 'q' }); } catch {}
    if (!applied) break;
    const isUser = applied.color === session.userColor;
    let userRecord = null;
    let decisionNumber = 0;
    if (isUser) {
      decisionNumber = userRecordIndex + 1;
      userRecord = (session.userMoves || []).find((record) => Number(record.ply) === index + 1) || (session.userMoves || [])[userRecordIndex] || null;
      userRecordIndex += 1;
    }
    frames.push({
      index: index + 1,
      ply: index + 1,
      fen: replayGame.fen(),
      fenBefore,
      move: { ...stored, san: applied.san, color: applied.color, piece: applied.piece, captured: applied.captured || stored.captured || null },
      isUser,
      userRecord,
      decisionNumber,
    });
  }
  return frames;
}

function replayOrderedSquares(orientationColor) {
  const files = orientationColor === 'w' ? FILES : [...FILES].reverse().join('');
  const ranks = orientationColor === 'w' ? '87654321' : '12345678';
  return [...ranks].flatMap((rank) => [...files].map((file) => `${file}${rank}`));
}

function replayDisplayPosition(frame) {
  if (replayState.showBest && frame?.userRecord?.bestMove) {
    const preview = new Chess(frame.fenBefore);
    const object = moveObjectFromUci(frame.userRecord.bestMove);
    let applied = null;
    try { applied = object ? preview.move(object) : null; } catch {}
    if (applied) return { game: preview, last: { from: applied.from, to: applied.to }, bestPreview: true };
  }
  const replayGame = new Chess(frame.fen);
  return { game: replayGame, last: frame.move ? { from: frame.move.from, to: frame.move.to } : null, bestPreview: false };
}

function renderReplayBoard(frame) {
  const board = $('#replayBoard');
  if (!board || !frame) return;
  board.innerHTML = '';
  const display = replayDisplayPosition(frame);
  const orientationColor = replayState.session?.userColor || 'w';
  const rated = frame.userRecord ? qualityForLoss(frame.userRecord.cpLoss) : null;
  replayOrderedSquares(orientationColor).forEach((square, index) => {
    const piece = display.game.get(square);
    const cell = document.createElement('div');
    cell.className = `sq ${((FILES.indexOf(square[0]) + Number(square[1])) % 2) ? 'light' : 'dark'}`;
    cell.dataset.square = square;
    if (display.last && (display.last.from === square || display.last.to === square)) cell.classList.add('last');
    if (display.bestPreview && display.last?.to === square) cell.classList.add('best-preview-square');
    else if (frame.userRecord && frame.move?.to === square) cell.classList.add('move-quality-square', `quality-${rated?.key || 'pending'}`);
    if (piece) {
      const glyph = document.createElement('span');
      glyph.className = `piece ${piece.color === 'w' ? 'white' : 'black'}`;
      renderPieceGraphic(glyph, piece.type, piece.color);
      cell.append(glyph);
    }
    if (index % 8 === 0) {
      const rank = document.createElement('span'); rank.className = 'coord rank'; rank.textContent = square[1]; cell.append(rank);
    }
    if (index >= 56) {
      const file = document.createElement('span'); file.className = 'coord file'; file.textContent = square[0]; cell.append(file);
    }
    board.append(cell);
  });
}

function nextUserFrameAfter(index) {
  return replayState.frames.slice(index + 1).find((frame) => frame.isUser) || null;
}

function renderCoachReplay() {
  const session = replayState.session;
  const frames = replayState.frames;
  const frame = frames[replayState.index];
  if (!session || !frame) return;
  renderReplayBoard(frame);
  $('#replaySlider').max = Math.max(0, frames.length - 1);
  $('#replaySlider').value = replayState.index;
  $('#replayDecisionCount').textContent = `${replayState.index} / ${Math.max(0, frames.length - 1)}`;
  $('#replayFirst').disabled = replayState.index <= 0;
  $('#replayPrevious').disabled = replayState.index <= 0;
  $('#replayNext').disabled = replayState.index >= frames.length - 1;
  $('#replayLast').disabled = replayState.index >= frames.length - 1;
  $('#replayAuto').textContent = replayState.auto ? '❚❚ Pause' : '▶ Auto';
  $('#replaySubtitle').textContent = `${session.opening === 'Various' ? phaseLabel(session.phase) : session.opening} · ${phaseLabel(session.phase)} · ${TIME_CONTROLS[session.timeControl]?.label || session.timeControl}`;

  const rating = $('#replayRating');
  rating.className = 'move-quality-badge';
  const comparison = $('#replayComparison');
  const lineBox = $('#replayLine');
  const bestButton = $('#replayBestButton');

  if (frame.index === 0) {
    rating.textContent = 'Start'; rating.classList.add('quality-pending');
    $('#replayPlyLabel').textContent = 'Starting position';
    $('#replayEval').textContent = 'Before the first played move';
    $('#replayCoachTitle').textContent = 'Orient yourself before replaying';
    $('#replayCoachText').textContent = `This ${phaseLabel(session.phase).toLowerCase()} began from “${session.opening}.” First identify material, king safety, pawn breaks, and the least active piece.`;
    comparison.hidden = true; lineBox.hidden = true; bestButton.hidden = true;
    return;
  }

  const moveNumber = Math.floor((Number(session.startFen?.split(/\s+/)[5]) || 1) + (frame.ply - 1) / 2);
  $('#replayPlyLabel').textContent = `${moveNumber}${frame.move.color === 'w' ? '.' : '…'} ${frame.move.san}`;

  if (frame.isUser) {
    const narration = coachNarrationForRecord(frame.userRecord, session, frame.decisionNumber);
    rating.textContent = narration.band.label;
    rating.classList.add(`quality-${narration.band.key}`);
    $('#replayEval').textContent = evaluationBadge(frame.userRecord?.selectedScore);
    $('#replayCoachTitle').textContent = narration.title;
    $('#replayCoachText').textContent = narration.text;
    comparison.hidden = false;
    $('#replayYourMove').textContent = narration.yourSan;
    $('#replayYourOutcome').textContent = narration.yourOutcome;
    $('#replayBestMove').textContent = narration.bestSan;
    $('#replayBestOutcome').textContent = narration.bestOutcome;
    lineBox.hidden = !narration.line.length;
    $('#replayLineMoves').textContent = narration.line.length ? narration.line.join(' ') : 'No principal variation stored';
    bestButton.hidden = !frame.userRecord?.bestMove;
    bestButton.textContent = replayState.showBest ? 'Return to played move' : 'Show best move on board';
  } else {
    const description = describeMoveFromFen(frame.fenBefore, frame.move.uci || `${frame.move.from}${frame.move.to}${frame.move.promotion || ''}`);
    const nextDecision = nextUserFrameAfter(replayState.index);
    rating.textContent = 'Opponent'; rating.classList.add('quality-pending');
    $('#replayEval').textContent = 'Your next decision';
    $('#replayCoachTitle').textContent = `Opponent played ${frame.move.san}`;
    $('#replayCoachText').textContent = `${description.text} This is the moment to ask what changed and what the opponent is threatening.${nextDecision?.userRecord?.bestMove ? ` In the resulting position, Stockfish’s leading response was ${describeMoveFromFen(nextDecision.userRecord.fenBefore, nextDecision.userRecord.bestMove).san}.` : ''}`;
    comparison.hidden = true; lineBox.hidden = true; bestButton.hidden = true;
  }
}

function replayMoveSound(frame) {
  if (!frame?.move) return;
  const kind = frame.move.san?.includes('+') || frame.move.san?.includes('#') ? 'check' : frame.move.captured ? 'capture' : 'move';
  playMoveSound(kind);
}

function setReplayIndex(index, playSound = true) {
  if (!replayState.frames.length) return;
  const previous = replayState.index;
  replayState.index = Math.max(0, Math.min(replayState.frames.length - 1, Number(index) || 0));
  replayState.showBest = false;
  if (playSound && replayState.index === previous + 1) replayMoveSound(replayState.frames[replayState.index]);
  renderCoachReplay();
}

function stopReplayAuto() {
  if (replayState.timer) window.clearTimeout(replayState.timer);
  replayState.timer = null;
  replayState.auto = false;
  const button = $('#replayAuto');
  if (button) button.textContent = '▶ Auto';
}

function scheduleReplayStep() {
  if (!replayState.auto) return;
  if (replayState.index >= replayState.frames.length - 1) {
    stopReplayAuto();
    return;
  }
  setReplayIndex(replayState.index + 1, true);
  const frame = replayState.frames[replayState.index];
  const delay = frame?.isUser ? 4300 : 2400;
  replayState.timer = window.setTimeout(scheduleReplayStep, delay);
}

function toggleReplayAuto() {
  if (replayState.auto) {
    stopReplayAuto();
    return;
  }
  if (replayState.index >= replayState.frames.length - 1) setReplayIndex(0, false);
  replayState.auto = true;
  renderCoachReplay();
  replayState.timer = window.setTimeout(scheduleReplayStep, 700);
}

function openCoachReplay(session = currentSession) {
  if (!session?.startFen) {
    toast('This older session does not contain a replayable starting position');
    return;
  }
  const frames = buildReplayFrames(session);
  if (!frames.length) {
    toast('No played moves are available for this replay');
    return;
  }
  stopReplayAuto();
  replayState = { session, frames, index: 0, timer: null, auto: false, showBest: false };
  $('#replayTitle').textContent = `${session.opening === 'Various' ? phaseLabel(session.phase) : session.opening} coach replay`;
  renderCoachReplay();
  openDialog('replayDialog');
}

function toggleReplayBestMove() {
  const frame = replayState.frames[replayState.index];
  if (!frame?.userRecord?.bestMove) return;
  replayState.showBest = !replayState.showBest;
  renderCoachReplay();
}

'''
app = replace_once(app, 'function sessionCoach(session) {', replay_code + 'function sessionCoach(session) {', 'coach replay functions')

close_dialog_old = "function closeDialog(id) {\n  const dialog = $(`#${id}`);\n  if (typeof dialog.close === 'function') dialog.close();\n  else dialog.removeAttribute('open');\n}"
close_dialog_new = "function closeDialog(id) {\n  if (id === 'replayDialog') stopReplayAuto();\n  const dialog = $(`#${id}`);\n  if (typeof dialog.close === 'function') dialog.close();\n  else dialog.removeAttribute('open');\n}"
app = replace_once(app, close_dialog_old, close_dialog_new, 'replay close cleanup')

recent_function = r'''function renderRecentSessions(sessions) {
  const list = $('#recentList');
  if (!sessions.length) {
    list.innerHTML = '<div class="empty-cell">Your recent games will appear here.</div>';
    return;
  }
  list.innerHTML = sessions.slice(0, 12).map((session) => {
    const outcome = session.outcome === 'abandoned' ? 'partial' : session.outcome;
    const resultClass = outcome === 'win' ? 'win' : outcome === 'draw' ? 'draw' : 'loss';
    const resultText = outcome === 'win' ? 'WIN' : outcome === 'draw' ? 'DRAW' : outcome === 'partial' ? 'PART' : 'LOSS';
    const replayable = Boolean(session.startFen && session.moveSequence?.length);
    return `<div class="recent-row">
      <span class="result-pill ${resultClass}">${resultText}</span>
      <span><b>${escapeHtml(session.opening === 'Various' ? phaseLabel(session.phase) : session.opening)}</b><small>${escapeHtml(phaseLabel(session.phase))} · ${escapeHtml(session.theme)}</small></span>
      <span class="hide-small"><b>${session.opponentRating}</b><small>opponent</small></span>
      <span class="hide-small"><b>${escapeHtml(TIME_CONTROLS[session.timeControl]?.label || session.timeControl)}</b><small>clock</small></span>
      <span><b>${Number.isFinite(session.avgCpLoss) ? `${Math.round(session.avgCpLoss)} cp` : '—'}</b><small>${session.userMoves?.length || 0} moves</small></span>
      ${replayable ? `<button class="recent-replay" type="button" data-replay-session="${escapeHtml(session.id)}">Replay</button>` : '<span class="recent-no-replay">—</span>'}
    </div>`;
  }).join('');
}

'''
app = sub_once(r"function renderRecentSessions\(sessions\) \{.*?\n\}\n\n(?=function inferImportedPhase)", recent_function, app, 'recent replay controls', re.S)

app = app.replace("session.reason === 'timeout'", "String(session.reason || '').startsWith('timeout')")
app = app.replace("app: 'K-Mate commercial beta v16'", "app: 'K-Mate commercial beta v20'")
write(app_path, app)


# Tail bindings and test state.
part6_path = 'kmate-trainer/app-v7-part6.txt'
part6 = read(part6_path)
binding_marker = "  $('#showHintButton')?.addEventListener('click', handleHintButton);\n"
binding_addition = binding_marker + r'''  $('#resultReplay')?.addEventListener('click', () => {
    closeDialog('resultDialog');
    openCoachReplay(currentSession);
  });
  $('#replayBackToReview')?.addEventListener('click', () => {
    closeDialog('replayDialog');
    renderPostGameReview(currentSession);
    openDialog('resultDialog');
  });
  $('#replayFirst')?.addEventListener('click', () => setReplayIndex(0));
  $('#replayPrevious')?.addEventListener('click', () => setReplayIndex(replayState.index - 1));
  $('#replayNext')?.addEventListener('click', () => setReplayIndex(replayState.index + 1));
  $('#replayLast')?.addEventListener('click', () => setReplayIndex(replayState.frames.length - 1));
  $('#replayAuto')?.addEventListener('click', toggleReplayAuto);
  $('#replaySlider')?.addEventListener('input', (event) => setReplayIndex(Number(event.target.value), false));
  $('#replayBestButton')?.addEventListener('click', toggleReplayBestMove);
  $('#recentList')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-replay-session]');
    if (!button) return;
    const session = store.sessions.find((item) => item.id === button.dataset.replaySession);
    if (session) openCoachReplay(session);
  });
'''
part6 = replace_once(part6, binding_marker, binding_addition, 'replay bindings')
part6 = part6.replace("version: '19.1-commercial-beta'", "version: '20.0-commercial-beta'")
state_clock_marker = "    clocks: { ...clocks },\n"
state_clock_addition = state_clock_marker + "    finalized,\n    reason: currentSession?.reason || null,\n    replay: { open: Boolean($('#replayDialog')?.open), index: replayState.index, frames: replayState.frames.length, showBest: replayState.showBest },\n"
part6 = replace_once(part6, state_clock_marker, state_clock_addition, 'state timeout and replay')
part6 = part6.replace(
    "    sound: { enabled: soundEnabled(), unlocked: htmlAudioUnlocked, backend: soundPlaybackBackend, lastKind: lastSoundKind },",
    "    sound: { enabled: soundEnabled(), unlocked: htmlAudioUnlocked, audibleConfirmed: soundAudiblyConfirmed, backend: soundPlaybackBackend, lastKind: lastSoundKind },",
)

test_hook = r'''

if (['localhost', '127.0.0.1'].includes(window.location.hostname)) {
  window.__KMATE__.test = {
    forceTimeout: (color = userColor) => {
      if (!game || finalized) return false;
      clocks[color] = 0;
      handleTimeout(color);
      return true;
    },
    openReplay: () => openCoachReplay(currentSession),
  };
}
'''
part6 = replace_once(part6, "};\n\n(async () => {", "};" + test_hook + "\n(async () => {", 'local test hooks')
write(part6_path, part6)


# Cache bust the loader.
loader_path = 'kmate-trainer/app-v7.js'
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+(?:\.\d+){2}", 'positions-v7.js?v=20.0.0', loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+(?:\.\d+){2}", 'app-v7-part${number}.txt?v=20.0.0', loader)
write(loader_path, loader)


# -----------------------------------------------------------------------------
# Presentation: new Staunton graphics and responsive replay workspace.
# -----------------------------------------------------------------------------
css_path = 'kmate-trainer/styles-v7.css'
css = read(css_path)
css += r'''

/* K-Mate v20 — polished Staunton pieces, coached replay, and timeout review */
.piece.staunton-piece{display:grid;place-items:center;width:77%;height:77%;font-size:0;line-height:1;transform:none;filter:none;color:inherit}
.piece.staunton-piece svg{display:block;width:100%;height:100%;overflow:visible}
.staunton-piece .piece-art>*:not(.piece-ground){stroke:var(--piece-edge);stroke-width:2.6;stroke-linejoin:round;stroke-linecap:round;paint-order:stroke fill}
.staunton-piece .piece-ground{fill:#000;opacity:.22;filter:blur(1.2px);stroke:none}
.staunton-piece .piece-glint{fill:none;stroke:var(--piece-glint)!important;stroke-width:2.05!important;opacity:.72}
.staunton-piece .piece-detail{fill:none;stroke:var(--piece-detail)!important;stroke-width:2.5!important}
.staunton-piece .piece-cut{fill:none;stroke:var(--piece-cut)!important;stroke-width:4.2!important}
.staunton-piece .piece-eye{fill:var(--piece-eye);stroke:var(--piece-edge)!important;stroke-width:1.6!important}
.staunton-piece.white{--piece-edge:#514838;--piece-glint:#fffdf7;--piece-detail:#8b7658;--piece-cut:#594d3d;--piece-eye:#25231e}
.staunton-piece.white .piece-grad-body-hi{stop-color:#fffdf4}.staunton-piece.white .piece-grad-body-mid{stop-color:#ead9b7}.staunton-piece.white .piece-grad-body-low{stop-color:#b99e74}
.staunton-piece.white .piece-grad-base-hi{stop-color:#f7ebd2}.staunton-piece.white .piece-grad-base-low{stop-color:#a98c64}.staunton-piece.white .piece-grad-band-hi{stop-color:#fff3d8}.staunton-piece.white .piece-grad-band-low{stop-color:#c4a77b}
.staunton-piece.white .piece-grad-shadow-hi{stop-color:#d5bd94}.staunton-piece.white .piece-grad-shadow-low{stop-color:#8f7657}.staunton-piece.white .piece-grad-mane-hi{stop-color:#dbc49c}.staunton-piece.white .piece-grad-mane-low{stop-color:#967b5a}
.staunton-piece.white .piece-grad-jewel-hi{stop-color:#fffef8}.staunton-piece.white .piece-grad-jewel-low{stop-color:#b99a6d}
.staunton-piece.black{--piece-edge:#020504;--piece-glint:#a8beb0;--piece-detail:#111b16;--piece-cut:#06100a;--piece-eye:#d8eadf}
.staunton-piece.black .piece-grad-body-hi{stop-color:#5e7465}.staunton-piece.black .piece-grad-body-mid{stop-color:#26372d}.staunton-piece.black .piece-grad-body-low{stop-color:#0b120e}
.staunton-piece.black .piece-grad-base-hi{stop-color:#465a4c}.staunton-piece.black .piece-grad-base-low{stop-color:#080d0a}.staunton-piece.black .piece-grad-band-hi{stop-color:#667b6c}.staunton-piece.black .piece-grad-band-low{stop-color:#18261e}
.staunton-piece.black .piece-grad-shadow-hi{stop-color:#31483a}.staunton-piece.black .piece-grad-shadow-low{stop-color:#060a07}.staunton-piece.black .piece-grad-mane-hi{stop-color:#405747}.staunton-piece.black .piece-grad-mane-low{stop-color:#0a100c}
.staunton-piece.black .piece-grad-jewel-hi{stop-color:#82988a}.staunton-piece.black .piece-grad-jewel-low{stop-color:#111c15}
.sq.light{background:radial-gradient(circle at 34% 25%,#eadfc5 0 18%,transparent 55%),linear-gradient(145deg,#e1cfaa,#c2aa7e)}
.sq.dark{background:radial-gradient(circle at 35% 24%,#8fa07b 0 12%,transparent 54%),linear-gradient(145deg,#788c68,#586d4d)}
.replay-primary{border-color:#80d8a477;background:#80d8a417;color:#baf2d1}
.result-actions{flex-wrap:wrap}
.replay-modal{width:min(1120px,calc(100% - 18px));max-width:none;max-height:96dvh;padding:0;overflow:hidden}
.replay-shell{max-height:96dvh;overflow:auto;padding:20px;background:radial-gradient(circle at 0 0,#80d8a414,transparent 28rem),#0b120d}
.replay-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:15px}
.replay-header h2{margin:4px 0 3px;font-size:clamp(23px,3vw,34px)}
.replay-header p{margin:0;color:var(--muted)}
.replay-header-actions{display:flex;align-items:center;gap:8px}
.replay-layout{display:grid;grid-template-columns:minmax(0,650px) minmax(300px,1fr);gap:18px;align-items:start}
.replay-board-column{min-width:0}
.replay-position-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:44px;padding:9px 12px;border:1px solid var(--line);border-radius:14px 14px 0 0;background:#101a13}
.replay-position-bar span{font-weight:850}.replay-position-bar b{color:var(--accent)}
.replay-boardwrap{padding:5px;border-bottom:1px solid var(--line)}
.replay-board .sq{cursor:default}
.replay-board .sq.best-preview-square::after{z-index:5;box-shadow:inset 0 0 0 5px #7cf58a,inset 0 0 18px #7cf58a45}
.replay-slider{width:100%;margin:13px 0 8px;accent-color:var(--accent)}
.replay-controls{display:grid;grid-template-columns:48px 48px minmax(100px,1fr) 48px 48px;gap:7px}
.replay-controls button{min-height:43px;border:1px solid var(--line);border-radius:12px;background:#202d23;font-weight:900;cursor:pointer}
.replay-controls button:disabled{opacity:.35;cursor:default}.replay-controls .replay-auto{color:var(--accent)}
.replay-coach-card{position:sticky;top:0;padding:19px;border:1px solid var(--line);border-radius:18px;background:linear-gradient(145deg,#18241b,#0f1711);box-shadow:0 18px 50px #0005}
.replay-rating-row{display:flex;align-items:center;justify-content:space-between;gap:10px;color:var(--muted);font-size:12px}
.replay-coach-card h2{margin:15px 0 8px;font-size:24px}.replay-coach-card>p{margin:0;color:#dbe4dc;line-height:1.55}
.replay-comparison{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:16px}
.replay-comparison article{padding:12px;border:1px solid #ffffff14;border-radius:14px;background:#ffffff05}
.replay-comparison small,.replay-comparison b,.replay-comparison span{display:block}.replay-comparison small{color:var(--muted);text-transform:uppercase;letter-spacing:.07em;font-size:9px}.replay-comparison b{margin-top:5px;font-size:18px}.replay-comparison span{margin-top:4px;color:#cdd8cf;font-size:11px;line-height:1.4}
.replay-line{margin-top:10px;padding:12px;border-left:3px solid var(--gold);border-radius:10px;background:#f4cc700b}.replay-line small,.replay-line b{display:block}.replay-line small{color:var(--gold);text-transform:uppercase;letter-spacing:.07em;font-size:9px}.replay-line b{margin-top:5px;font:700 12px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace}
.replay-best-button{width:100%;margin-top:12px}.replay-footnote{margin-top:12px!important;color:var(--muted)!important;font-size:10px!important}
.recent-row{grid-template-columns:54px minmax(150px,1.4fr) minmax(62px,.45fr) minmax(62px,.45fr) minmax(72px,.55fr) 68px}
.recent-replay{min-height:34px;border:1px solid #80d8a455;border-radius:10px;background:#80d8a411;color:#baf2d1;font-size:10px;font-weight:900;cursor:pointer}.recent-no-replay{color:var(--muted);text-align:center}
.sound-toggle.audio-ready{border-color:#80d8a477;background:#80d8a41b;color:#c9f9da}
.sound-toggle.audio-needs-tap{border-color:#f4cc7080;color:#ffe3a2;animation:soundReadyPulse 1.05s ease-in-out infinite alternate}
@keyframes soundReadyPulse{to{box-shadow:0 0 0 5px #f4cc7015;filter:brightness(1.18)}}
@media(max-width:760px){
  .replay-shell{padding:10px}.replay-header{align-items:center}.replay-header-actions .btn{display:none}.replay-layout{grid-template-columns:1fr}.replay-coach-card{position:static;padding:15px}.replay-comparison{grid-template-columns:1fr 1fr}.replay-boardwrap{padding:2px}.piece.staunton-piece{width:73%;height:73%}.replay-controls{grid-template-columns:42px 42px minmax(90px,1fr) 42px 42px}.recent-row{grid-template-columns:48px minmax(0,1fr) 68px}.recent-row .hide-small,.recent-row>span:nth-of-type(5){display:none}.recent-replay{display:block}
}
@media(max-width:430px){
  .replay-header h2{font-size:21px}.replay-header p{font-size:10px}.replay-comparison{grid-template-columns:1fr}.replay-coach-card h2{font-size:20px}.piece.staunton-piece{width:71%;height:71%}.replay-position-bar{font-size:11px}.replay-controls{gap:4px}.replay-controls button{min-height:40px}.result-actions .btn{flex:1 1 45%}
}
'''
write(css_path, css)
