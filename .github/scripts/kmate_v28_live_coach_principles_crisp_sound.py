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


def read(path: Path) -> str:
    return path.read_text()


def write(path: Path, content: str) -> None:
    path.write_text(content)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing patch marker: {label}")
    return text.replace(old, new, 1)


# ---------------------------------------------------------------------------
# Original physically modelled desk-knock sounds.
# These are generated from impulses and modal resonances. No media is copied,
# sampled, extracted, or embedded from the user's YouTube reference.
# ---------------------------------------------------------------------------

def pan_gains(pan: float) -> tuple[float, float]:
    pan = max(-1.0, min(1.0, pan))
    angle = (pan + 1.0) * math.pi / 4.0
    return math.cos(angle), math.sin(angle)


def add_noise_impulse(
    left: array,
    right: array,
    rng: random.Random,
    start: float,
    amplitude: float,
    decay: float,
    pan: float,
) -> None:
    start_index = int(start * RATE)
    count = min(int(0.030 * RATE), len(left) - start_index)
    lg, rg = pan_gains(pan)
    previous = 0.0
    low = 0.0
    for offset in range(max(0, count)):
        t = offset / RATE
        raw = rng.uniform(-1.0, 1.0)
        # Broad, hard attack: transient difference plus a little upper-mid body.
        diff = raw - previous
        previous = raw
        low += 0.20 * (raw - low)
        bright = 0.78 * diff + 0.22 * (raw - low)
        attack = min(1.0, t / 0.00035)
        envelope = attack * math.exp(-t / max(0.0007, decay))
        value = bright * amplitude * envelope
        index = start_index + offset
        left[index] += value * lg
        right[index] += value * rg


def add_mode(
    left: array,
    right: array,
    start: float,
    frequency: float,
    amplitude: float,
    decay: float,
    duration: float,
    pan: float,
    phase_offset: float,
) -> None:
    start_index = int(start * RATE)
    count = min(int(duration * RATE), len(left) - start_index)
    lg, rg = pan_gains(pan)
    phase = phase_offset
    for offset in range(max(0, count)):
        t = offset / RATE
        # Tiny downward chirp mimics a hard object coupling into a wooden panel.
        current_frequency = frequency * (1.0 - 0.032 * min(1.0, t / max(0.001, duration)))
        phase += math.tau * current_frequency / RATE
        attack = min(1.0, t / 0.00085)
        envelope = attack * math.exp(-t / max(0.001, decay))
        value = math.sin(phase) * amplitude * envelope
        index = start_index + offset
        left[index] += value * lg
        right[index] += value * rg


def add_crisp_desk_knock(
    left: array,
    right: array,
    rng: random.Random,
    start: float,
    strength: float = 1.0,
    pitch: float = 1.0,
    pan: float = 0.0,
) -> None:
    add_noise_impulse(left, right, rng, start, 0.58 * strength, 0.0032, pan)
    # Short, inharmonic desk modes: strong midrange body, little reverberation.
    modes = (
        (214, 0.115, 0.073, 0.180),
        (367, 0.170, 0.060, 0.150),
        (582, 0.205, 0.043, 0.120),
        (905, 0.145, 0.029, 0.090),
        (1450, 0.090, 0.017, 0.062),
        (2520, 0.058, 0.010, 0.042),
        (4100, 0.032, 0.006, 0.026),
    )
    for index, (frequency, amplitude, decay, duration) in enumerate(modes):
        add_mode(
            left,
            right,
            start + 0.0005 * (index % 3),
            frequency * pitch * (1.0 + rng.uniform(-0.010, 0.010)),
            amplitude * strength,
            decay,
            duration,
            pan * (0.58 if index % 2 else 1.0),
            rng.random() * math.tau,
        )
    # One very early reflection adds physical width without a smeared tail.
    add_noise_impulse(left, right, rng, start + 0.0105, 0.050 * strength, 0.0022, -pan * 0.65)


def render_knock_file(filename: str, duration: float, events: list[tuple[float, float, float, float]]) -> None:
    frame_count = int(duration * RATE)
    left = array("f", [0.0]) * frame_count
    right = array("f", [0.0]) * frame_count
    rng = random.Random(28_000 + sum(ord(char) for char in filename))
    for start, strength, pitch, pan in events:
        add_crisp_desk_knock(left, right, rng, start, strength, pitch, pan)

    # Gentle saturation preserves the attack while avoiding digital clipping.
    processed_left = array("f", (math.tanh(value * 1.16) for value in left))
    processed_right = array("f", (math.tanh(value * 1.16) for value in right))
    peak = max(max(abs(value) for value in processed_left), max(abs(value) for value in processed_right), 1e-9)
    scale = 0.94 / peak

    payload = bytearray()
    for l_value, r_value in zip(processed_left, processed_right):
        l_sample = int(max(-1.0, min(1.0, l_value * scale)) * 32767)
        r_sample = int(max(-1.0, min(1.0, r_value * scale)) * 32767)
        payload.extend(struct.pack("<hh", l_sample, r_sample))

    destination = ROOT / "sounds" / "live-v28" / filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(destination), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(RATE)
        wav.writeframes(payload)


render_knock_file(
    "kmate-reference-move-v28.wav",
    0.230,
    [(0.0025, 1.00, 1.00, -0.035)],
)
render_knock_file(
    "kmate-reference-capture-v28.wav",
    0.330,
    [(0.0025, 0.50, 1.05, -0.18), (0.058, 1.08, 0.97, 0.16)],
)
render_knock_file(
    "kmate-reference-check-v28.wav",
    0.410,
    [(0.0025, 0.95, 1.00, -0.04), (0.105, 0.32, 1.34, 0.13), (0.166, 0.27, 1.52, -0.10)],
)


# ---------------------------------------------------------------------------
# Application JavaScript.
# ---------------------------------------------------------------------------
app_path = ROOT / "app-v7-part1.txt"
app = read(app_path)

app = replace_once(
    app,
    """  sound: true,
  soundTheme: 'desk-balanced',
  trainingGoal: 'all',
  blindCalibration: false,
  autoHints: false,""",
    """  sound: true,
  soundTheme: 'reference-crisp',
  referenceCrispMigrationDone: false,
  trainingGoal: 'all',
  blindCalibration: false,
  autoHints: false,
  liveCoach: false,
  principleReview: false,""",
    "default teaching settings",
)

migration_marker = """if (legacySoundProfileMap[store.settings.soundTheme]) {
  store.settings.soundTheme = legacySoundProfileMap[store.settings.soundTheme];
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch {}
}
"""
migration = migration_marker + """
if (!store.settings.referenceCrispMigrationDone) {
  if (!store.settings.soundTheme || store.settings.soundTheme === 'desk-balanced') {
    store.settings.soundTheme = 'reference-crisp';
  }
  store.settings.referenceCrispMigrationDone = true;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch {}
}
"""
app = replace_once(app, migration_marker, migration, "v28 crisp-sound migration")

principles_catalog = r'''
const CHESS_PRINCIPLES = Object.freeze([
  Object.freeze({ key: 'opponent-threat', title: 'Ask what the opponent threatens', rule: 'Before starting your own plan, identify the opponent’s strongest check, capture, threat, and pawn break.', tags: ['prophylaxis', 'king safety', 'calculation'] }),
  Object.freeze({ key: 'forcing-scan', title: 'Checks, captures, and threats first', rule: 'Scan forcing moves for both sides before spending time on a quiet positional move.', tags: ['calculation'] }),
  Object.freeze({ key: 'loose-pieces', title: 'Count loose and overloaded pieces', rule: 'Undefended pieces and overloaded defenders are tactical targets, even when no immediate capture is obvious.', tags: ['calculation', 'piece activity'] }),
  Object.freeze({ key: 'candidate-comparison', title: 'Compare at least two serious candidates', rule: 'Do not stop at the first playable move. Compare the strongest forcing move with the best improving move.', tags: ['calculation', 'conversion'] }),
  Object.freeze({ key: 'king-safety', title: 'King safety before ambition', rule: 'When a king is exposed, address checks, open lines, and defensive piece placement before launching another plan.', tags: ['king safety'] }),
  Object.freeze({ key: 'piece-activity', title: 'Improve the least active piece', rule: 'Before another pawn move, ask which piece is contributing least and whether it can enter the game with tempo.', tags: ['piece activity', 'space'] }),
  Object.freeze({ key: 'pawn-breaks', title: 'Prepare pawn breaks', rule: 'A pawn break should open a useful file or diagonal and should be checked against the opponent’s counter-break.', tags: ['pawn breaks', 'space'] }),
  Object.freeze({ key: 'pawn-structure', title: 'Treat pawn moves as permanent', rule: 'Before advancing or exchanging a pawn, identify the weak squares, files, and endgame structure that remain.', tags: ['pawn structure', 'pawn breaks'] }),
  Object.freeze({ key: 'conversion', title: 'Simplify only when the edge survives', rule: 'When ahead, trade counterplay rather than automatically trading pieces; calculate the resulting ending first.', tags: ['conversion'] }),
  Object.freeze({ key: 'endgame-transition', title: 'Evaluate the ending before exchanging', rule: 'Before trading queens or minor pieces, compare king activity, pawn majorities, and the resulting rook activity.', tags: ['endgame transition', 'conversion'] }),
  Object.freeze({ key: 'rook-activity', title: 'Active rooks belong on open lines', rule: 'Prioritize open files, checking distance, seventh-rank activity, and cutting off the opposing king.', tags: ['rook activity'] }),
  Object.freeze({ key: 'passed-pawns', title: 'Passed pawns must be calculated', rule: 'Count the pawn race, identify the best blockading square, and place rooks behind passed pawns when possible.', tags: ['passed pawns'] }),
  Object.freeze({ key: 'king-activity', title: 'The king is an endgame piece', rule: 'When queens are gone, activate the king toward critical entry squares instead of leaving it as a spectator.', tags: ['king activity'] }),
  Object.freeze({ key: 'opposition', title: 'Check the opposition', rule: 'In king-and-pawn endings, test direct, distant, and side opposition before moving the king.', tags: ['opposition'] }),
  Object.freeze({ key: 'central-control', title: 'Use the centre to coordinate pieces', rule: 'Central squares matter because they increase piece mobility and restrict the opponent’s counterplay.', tags: ['piece activity', 'space'] }),
]);
const CHESS_PRINCIPLE_BY_KEY = Object.freeze(Object.fromEntries(CHESS_PRINCIPLES.map((principle) => [principle.key, principle])));

function relevantPrinciplesForPosition(position, g, limit = 5) {
  const tags = new Set(position?.tags || []);
  const phase = position?.phase || 'middlegame';
  const boardInfo = { queens: 0, rooks: 0, pieces: 0 };
  g?.board?.().forEach((row) => row.forEach((piece) => {
    if (!piece) return;
    boardInfo.pieces += 1;
    if (piece.type === 'q') boardInfo.queens += 1;
    if (piece.type === 'r') boardInfo.rooks += 1;
  }));
  return CHESS_PRINCIPLES.map((principle, index) => {
    let score = 0;
    if (principle.key === 'opponent-threat') score += 45;
    if (principle.key === 'forcing-scan') score += 42;
    if (principle.key === 'candidate-comparison') score += 38;
    for (const tag of principle.tags || []) if (tags.has(tag)) score += 75;
    if (phase === 'middlegame' && ['king-safety', 'piece-activity', 'central-control', 'pawn-breaks'].includes(principle.key)) score += 22;
    if (phase === 'late-middlegame' && ['candidate-comparison', 'endgame-transition', 'rook-activity', 'pawn-structure'].includes(principle.key)) score += 28;
    if (phase === 'endgame' && ['king-activity', 'rook-activity', 'passed-pawns', 'opposition', 'conversion'].includes(principle.key)) score += 42;
    if (boardInfo.queens >= 1 && principle.key === 'king-safety') score += 25;
    if (boardInfo.queens === 0 && principle.key === 'king-activity') score += 28;
    if (boardInfo.rooks >= 2 && principle.key === 'rook-activity') score += 20;
    if (g?.isCheck?.() && ['forcing-scan', 'king-safety'].includes(principle.key)) score += 100;
    return { ...principle, score, order: index };
  })
    .sort((first, second) => second.score - first.score || first.order - second.order)
    .slice(0, Math.max(3, Math.min(7, Number(limit) || 5)))
    .map(({ score: _score, order: _order, ...principle }) => principle);
}

'''
app = replace_once(app, "const STORAGE_KEY = 'kmate-position-v7';", principles_catalog + "const STORAGE_KEY = 'kmate-position-v7';", "principle catalog")

# State for decoded reference sounds and teaching flows.
app = replace_once(
    app,
    """let soundBlockedNoticeShown = false;
let queuedCustomPosition = null;""",
    """let soundBlockedNoticeShown = false;
let decodedWoodProfileKey = null;
let decodedWoodBuffers = null;
let decodedWoodLoadPromise = null;
let queuedCustomPosition = null;""",
    "decoded wood sound state",
)
app = replace_once(app, "let clockRunning = false;", "let clockRunning = false;\nlet clockPaused = false;", "clock pause state")
app = replace_once(
    app,
    """let timeoutHandling = false;
let replayState = { session: null, frames: [], index: 0, timer: null, auto: false, showBest: false, bestLineKey: null, bestLineFrames: [], bestLineIndex: -1, bestLineTimer: null, bestLinePlaying: false };""",
    """let timeoutHandling = false;
let principleReviewPending = false;
let currentPositionPrinciples = [];
let liveCoachState = { awaiting: false, open: false, sessionId: null, moveId: null, record: null, narration: null, ignoredPrinciples: [] };
let liveCoachReviewTimer = null;
let liveCoachUtterance = null;
let replayState = { session: null, frames: [], index: 0, timer: null, auto: false, showBest: false, bestLineKey: null, bestLineFrames: [], bestLineIndex: -1, bestLineTimer: null, bestLinePlaying: false };""",
    "teaching-flow state",
)

# Add the new original reference profile to the existing 25-profile library.
app = replace_once(
    app,
    """const SOUND_PROFILES = Object.freeze({
  \"desk-balanced\":""",
    """const SOUND_PROFILES = Object.freeze({
  \"reference-crisp\": Object.freeze({ label: \"00 · Reference-style crisp desk knock\", group: \"Desk knocks\", description: \"Original close-mic hard wooden desk knock with an immediate attack and almost no reverberation; it is not copied from the linked video.\", eventUrls: Object.freeze({ move: new URL('./sounds/live-v28/kmate-reference-move-v28.wav?v=28.0.0', document.baseURI).href, capture: new URL('./sounds/live-v28/kmate-reference-capture-v28.wav?v=28.0.0', document.baseURI).href, check: new URL('./sounds/live-v28/kmate-reference-check-v28.wav?v=28.0.0', document.baseURI).href }) }),
  \"desk-balanced\":""",
    "reference sound profile",
)
app = app.replace("return SOUND_PROFILES[normalized] ? normalized : 'desk-balanced';", "return SOUND_PROFILES[normalized] ? normalized : 'reference-crisp';", 1)
app = app.replace("SOUND_PROFILES['desk-balanced'];", "SOUND_PROFILES['reference-crisp'];", 1)

buffered_sound_functions = r'''
function selectedSoundProfile() {
  return SOUND_PROFILES[selectedSoundTheme()] || SOUND_PROFILES['reference-crisp'];
}

function resetDecodedWoodAudio() {
  decodedWoodProfileKey = null;
  decodedWoodBuffers = null;
  decodedWoodLoadPromise = null;
}

function decodeAudioDataCompat(ctx, bytes) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (value) => { if (!settled) { settled = true; resolve(value); } };
    const fail = (error) => { if (!settled) { settled = true; reject(error); } };
    try {
      const result = ctx.decodeAudioData(bytes.slice(0), done, fail);
      if (result?.then) result.then(done, fail);
    } catch (error) { fail(error); }
  });
}

async function ensureDecodedWoodBuffers() {
  const profileKey = selectedSoundTheme();
  const profile = SOUND_PROFILES[profileKey];
  if (!profile?.eventUrls) return null;
  if (decodedWoodProfileKey === profileKey && decodedWoodBuffers) return decodedWoodBuffers;
  if (decodedWoodProfileKey === profileKey && decodedWoodLoadPromise) return decodedWoodLoadPromise;
  const ctx = ensureAudioContext();
  if (!ctx) throw new Error('Web Audio is unavailable');
  if (ctx.state === 'suspended') await ctx.resume();
  decodedWoodProfileKey = profileKey;
  decodedWoodLoadPromise = Promise.all(Object.entries(profile.eventUrls).map(async ([kind, url]) => {
    const response = await fetch(url, { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Unable to load ${kind} wood sound: ${response.status}`);
    const buffer = await decodeAudioDataCompat(ctx, await response.arrayBuffer());
    return [kind, buffer];
  })).then((entries) => {
    if (decodedWoodProfileKey !== profileKey) return null;
    decodedWoodBuffers = Object.fromEntries(entries);
    return decodedWoodBuffers;
  }).finally(() => {
    if (decodedWoodProfileKey === profileKey) decodedWoodLoadPromise = null;
  });
  return decodedWoodLoadPromise;
}

function playDecodedWoodSound(kind = 'move') {
  const ctx = ensureAudioContext();
  const buffer = decodedWoodBuffers?.[kind];
  if (!ctx || !buffer) return false;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(kind === 'capture' ? 1.00 : kind === 'check' ? 0.96 : 0.98, ctx.currentTime);
  source.connect(gain);
  gain.connect(ctx.destination);
  source.start(ctx.currentTime + 0.001);
  htmlAudioUnlocked = true;
  soundAudiblyConfirmed = true;
  soundPlaybackBackend = 'decoded-wav-buffer';
  lastSoundKind = kind;
  updateSoundToggle();
  return true;
}

'''
app = replace_once(app, "function ensureHtmlMoveAudio() {", buffered_sound_functions + "function ensureHtmlMoveAudio() {", "decoded sound functions")

# Replace unlock logic to prioritize decoded, separate event files for the new profile.
unlock_start = app.find("async function unlockMoveAudio(audible = false) {")
unlock_end = app.find("function playHtmlMoveSound(kind) {", unlock_start)
if unlock_start < 0 or unlock_end < 0:
    raise SystemExit("Unable to locate audio unlock block")
new_unlock = r'''async function unlockMoveAudio(audible = false) {
  if (!soundEnabled()) return false;
  const profile = selectedSoundProfile();
  if (profile?.eventUrls) {
    try {
      await ensureDecodedWoodBuffers();
      htmlAudioUnlocked = true;
      soundPlaybackBackend = 'decoded-wav-buffer';
      soundBlockedNoticeShown = false;
      if (audible) playDecodedWoodSound('move');
      updateSoundToggle();
      return true;
    } catch (error) {
      console.warn('Decoded desk-knock audio could not unlock.', error);
      soundPlaybackBackend = 'web-audio-fallback';
      ensureAudioContext();
      return false;
    }
  }

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

'''
app = app[:unlock_start] + new_unlock + app[unlock_end:]

# Replace move routing so the new profile uses decoded AudioBuffers.
move_sound_start = app.find("function playMoveSound(kind = 'move') {")
move_sound_end = app.find("const primeSoundFromGesture", move_sound_start)
if move_sound_start < 0 or move_sound_end < 0:
    raise SystemExit("Unable to locate move sound routing")
new_move_sound = r'''function playMoveSound(kind = 'move') {
  if (!soundEnabled()) return;
  lastSoundKind = kind;
  const profile = selectedSoundProfile();
  if (profile?.eventUrls && ['move', 'capture', 'check'].includes(kind)) {
    if (decodedWoodProfileKey === selectedSoundTheme() && decodedWoodBuffers?.[kind]) {
      playDecodedWoodSound(kind);
      return;
    }
    ensureDecodedWoodBuffers()
      .then(() => {
        if (!playDecodedWoodSound(kind)) playSynthMoveSound(kind);
      })
      .catch((error) => {
        console.warn('Crisp desk knock failed; using synthesizer fallback.', error);
        soundPlaybackBackend = 'web-audio-fallback';
        playSynthMoveSound(kind);
      });
    return;
  }
  if (!SOUND_SPRITE_SEGMENTS[kind]) {
    playSynthMoveSound(kind);
    return;
  }
  if (htmlAudioUnlocked) {
    playHtmlMoveSound(kind);
    return;
  }
  unlockMoveAudio(false).then((unlocked) => {
    if (unlocked) playHtmlMoveSound(kind);
    else playSynthMoveSound(kind);
  });
}

'''
app = app[:move_sound_start] + new_move_sound + app[move_sound_end:]

# Reset decoded buffers when a profile changes and preview through the correct backend.
app = replace_once(
    app,
    """    htmlAudioUnlocked = false;
    soundAudiblyConfirmed = false;
    soundPlaybackBackend = 'not-unlocked';
  }""",
    """    htmlAudioUnlocked = false;
    soundAudiblyConfirmed = false;
    soundPlaybackBackend = 'not-unlocked';
    resetDecodedWoodAudio();
  }""",
    "sound profile backend reset",
)
app = replace_once(
    app,
    """    if (unlocked) {
      lastSoundKind = previewKind;
      playHtmlMoveSound(previewKind);
      const kindLabel = previewKind === 'capture' ? 'capture' : 'move';""",
    """    if (unlocked) {
      lastSoundKind = previewKind;
      if (selectedSoundProfile()?.eventUrls) playDecodedWoodSound(previewKind);
      else playHtmlMoveSound(previewKind);
      const kindLabel = previewKind === 'capture' ? 'capture' : 'move';""",
    "sound preview backend",
)

# Setup controls.
app = replace_once(
    app,
    """  if ($('#blindCalibration')) $('#blindCalibration').checked = Boolean(settings.blindCalibration);
  if ($('#autoHints')) $('#autoHints').checked = Boolean(settings.autoHints);""",
    """  if ($('#blindCalibration')) $('#blindCalibration').checked = Boolean(settings.blindCalibration);
  if ($('#autoHints')) $('#autoHints').checked = Boolean(settings.autoHints);
  if ($('#liveCoach')) $('#liveCoach').checked = Boolean(settings.liveCoach);
  if ($('#principleReview')) $('#principleReview').checked = Boolean(settings.principleReview);""",
    "teaching settings to controls",
)
app = replace_once(
    app,
    """  settings.blindCalibration = Boolean($('#blindCalibration')?.checked);
  settings.autoHints = Boolean($('#autoHints')?.checked);""",
    """  settings.blindCalibration = Boolean($('#blindCalibration')?.checked);
  settings.autoHints = Boolean($('#autoHints')?.checked);
  settings.liveCoach = Boolean($('#liveCoach')?.checked);
  settings.principleReview = Boolean($('#principleReview')?.checked);""",
    "teaching controls to settings",
)

# Clock pause/resume support.
old_init_clocks = r'''function initClocks() {
  stopClock();
  const control = timeControl();
  clockRunning = control.base > 0;
  clocks = {
    w: control.base * 1000,
    b: control.base * 1000,
  };
  clockLast = performance.now();
  turnStartRemaining = clocks[game.turn()];
  if (clockRunning) {
    clockInterval = window.setInterval(tickClock, 100);
  }
  renderClocks();
}'''
new_init_clocks = r'''function initClocks({ paused = false } = {}) {
  stopClock();
  const control = timeControl();
  clockRunning = control.base > 0;
  clockPaused = Boolean(paused);
  clocks = {
    w: control.base * 1000,
    b: control.base * 1000,
  };
  clockLast = performance.now();
  turnStartRemaining = clocks[game.turn()];
  if (clockRunning && !clockPaused) {
    clockInterval = window.setInterval(tickClock, 100);
  }
  renderClocks();
}'''
app = replace_once(app, old_init_clocks, new_init_clocks, "paused clock initialization")

clock_pause_functions = r'''

function pauseClockForTeaching() {
  if (clockPaused) return;
  if (clockRunning) syncClock();
  if (finalized) return;
  clockPaused = true;
  stopClock();
  clockLast = performance.now();
  turnStartRemaining = clocks[game?.turn?.()] ?? 0;
  renderClocks();
}

function resumeClockFromTeaching() {
  if (!game || finalized) {
    clockPaused = false;
    return;
  }
  clockPaused = false;
  clockLast = performance.now();
  turnStartRemaining = clocks[game.turn()] ?? 0;
  if (clockRunning && !clockInterval) clockInterval = window.setInterval(tickClock, 100);
  renderClocks();
}
'''
app = replace_once(app, "function syncClock() {", clock_pause_functions + "\nfunction syncClock() {", "clock pause helpers")
app = app.replace("if (!clockRunning || !game || finalized || game.isGameOver()) return;", "if (!clockRunning || clockPaused || !game || finalized || game.isGameOver()) return;", 1)
app = app.replace("renderClockElement($('#userClock'), userMs, game && !finalized && game.turn() === userColor);", "renderClockElement($('#userClock'), userMs, game && !finalized && !clockPaused && game.turn() === userColor);", 1)
app = app.replace("renderClockElement($('#engineClock'), engineMs, game && !finalized && game.turn() === engineColor);", "renderClockElement($('#engineClock'), engineMs, game && !finalized && !clockPaused && game.turn() === engineColor);", 1)

# Principle-review helpers and entry into actual play.
start_marker = "function startPosition({ preservePrevious = false } = {}) {"
start_helpers = r'''function renderPrinciplesDialog() {
  const list = $('#principlesList');
  const title = $('#principlesPositionTitle');
  const subtitle = $('#principlesPositionSubtitle');
  if (!list || !title || !subtitle) return;
  title.textContent = current?.title || 'Position principles';
  subtitle.textContent = `${phaseLabel(current?.phase || 'middlegame')} · ${current?.opening || 'Various'} · ${currentPositionPrinciples.length} principles`;
  list.innerHTML = currentPositionPrinciples.map((principle, index) => `<article class="principle-card"><span>${index + 1}</span><div><b>${escapeHtml(principle.title)}</b><p>${escapeHtml(principle.rule)}</p></div></article>`).join('');
}

function beginPreparedPosition() {
  if (!game || finalized) return;
  principleReviewPending = false;
  closeDialog('principlesDialog');
  resumeClockFromTeaching();
  if (currentSession) currentSession.principlesReviewedAt = settings.principleReview ? new Date().toISOString() : null;
  setStatus(game.turn() === userColor ? 'Choose a piece, then a legal destination.' : 'The opponent moves first.', game.turn() === userColor ? '' : 'thinking');
  renderAll();
  prepareHintForTurn();
  if (game.isGameOver()) finishIfNeeded();
  else if (game.turn() === engineColor) askEngine();
}

function startAfterPrincipleReview() {
  beginPreparedPosition();
}

function cancelPrincipleReview() {
  principleReviewPending = false;
  closeDialog('principlesDialog');
  if (game && !finalized) finalizeSession('abandoned', 'principle review canceled', false);
  showView('setup');
}

'''
app = replace_once(app, start_marker, start_helpers + start_marker, "principle review helpers")

app = replace_once(
    app,
    """function startPosition({ preservePrevious = false } = {}) {
  unlockMoveAudio(false);
  ensureAudioContext();""",
    """function startPosition({ preservePrevious = false } = {}) {
  unlockMoveAudio(false);
  ensureAudioContext();
  resetLiveCoachFlow({ closeModal: true });
  principleReviewPending = false;
  closeDialog('principlesDialog');
  clockPaused = false;""",
    "start-position teaching reset",
)
app = replace_once(
    app,
    """  current = pickPosition();
  game = new Chess(current.fen);""",
    """  current = pickPosition();
  game = new Chess(current.fen);
  currentPositionPrinciples = relevantPrinciplesForPosition(current, game, 5);""",
    "position-specific principles",
)
app = replace_once(
    app,
    """    blindCalibration: Boolean(settings.blindCalibration),
    autoHints: Boolean(settings.autoHints),
    hintsUsed: 0,""",
    """    blindCalibration: Boolean(settings.blindCalibration),
    autoHints: Boolean(settings.autoHints),
    liveCoach: Boolean(settings.liveCoach),
    principleReview: Boolean(settings.principleReview),
    positionPrinciples: currentPositionPrinciples.map((principle) => ({ ...principle })),
    liveCoachInterventions: 0,
    liveCoachAnalysisTimeouts: 0,
    hintsUsed: 0,""",
    "session teaching metadata",
)

old_start_tail = r'''  showView('game');
  initClocks();
  setStatus(game.turn() === userColor ? 'Choose a piece, then a legal destination.' : 'The opponent moves first.', game.turn() === userColor ? '' : 'thinking');
  renderAll();
  prepareHintForTurn();

  if (game.isGameOver()) {
    finishIfNeeded();
  } else if (game.turn() === engineColor) {
    askEngine();
  }
}'''
new_start_tail = r'''  showView('game');
  initClocks({ paused: Boolean(settings.principleReview) });
  if (settings.principleReview) {
    principleReviewPending = true;
    renderPrinciplesDialog();
    setStatus('Review the position principles. The clock has not started.', 'thinking');
    renderAll();
    openDialog('principlesDialog');
    return;
  }
  beginPreparedPosition();
}'''
app = replace_once(app, old_start_tail, new_start_tail, "principle-gated game start")

# Render paused teaching states clearly.
old_render_turns = r'''function renderTurns() {
  if (!game) return;
  const userLive = !thinking && !finalized && game.turn() === userColor;
  const engineLive = !finalized && game.turn() === engineColor;
  $('#userTurn').textContent = finalized ? 'Finished' : userLive ? 'Your move' : 'Waiting';
  $('#userTurn').classList.toggle('live', userLive);
  $('#engineTurn').textContent = finalized ? 'Finished' : thinking ? 'Thinking…' : engineLive ? 'To move' : 'Waiting';
  $('#engineTurn').classList.toggle('live', engineLive);
  $('#userBar').classList.toggle('active', userLive);
  $('#engineBar').classList.toggle('active', engineLive);
}'''
new_render_turns = r'''function renderTurns() {
  if (!game) return;
  const teachingPause = Boolean(principleReviewPending || liveCoachState.awaiting || liveCoachState.open);
  const userLive = !teachingPause && !thinking && !finalized && game.turn() === userColor;
  const engineLive = !teachingPause && !finalized && game.turn() === engineColor;
  $('#userTurn').textContent = finalized ? 'Finished' : principleReviewPending ? 'Review principles' : liveCoachState.awaiting ? 'Coach reviewing' : liveCoachState.open ? 'Coach paused' : userLive ? 'Your move' : 'Waiting';
  $('#userTurn').classList.toggle('live', userLive);
  $('#engineTurn').textContent = finalized ? 'Finished' : principleReviewPending ? 'Clock paused' : (liveCoachState.awaiting || liveCoachState.open) ? 'Clock paused' : thinking ? 'Thinking…' : engineLive ? 'To move' : 'Waiting';
  $('#engineTurn').classList.toggle('live', engineLive);
  $('#userBar').classList.toggle('active', userLive);
  $('#engineBar').classList.toggle('active', engineLive);
}'''
app = replace_once(app, old_render_turns, new_render_turns, "teaching pause turn display")
app = app.replace("$('#takebackButton').disabled = thinking || finalized || !game?.history().length;", "$('#takebackButton').disabled = thinking || finalized || principleReviewPending || liveCoachState.awaiting || liveCoachState.open || !game?.history().length;", 1)

# Pause after every user move while the review engine determines whether coaching is needed.
old_move_tail = r'''  playMoveSound(game.isCheck() ? 'check' : move.captured ? 'capture' : 'move');
  beginNextTurn();
  setStatus(`${game.isCheck() ? 'Check. ' : ''}Opponent is considering the position.`, 'thinking');
  renderAll();
  if (finishIfNeeded()) return;
  askEngine();
}'''
new_move_tail = r'''  playMoveSound(game.isCheck() ? 'check' : move.captured ? 'capture' : 'move');
  beginNextTurn();
  if (settings.liveCoach) {
    queueLiveCoachReview(moveRecord);
    setStatus('Live Coach is reviewing your move. The clock is paused.', 'thinking');
    renderAll();
    if (finishIfNeeded()) {
      resetLiveCoachFlow({ closeModal: true });
      return;
    }
    return;
  }
  setStatus(`${game.isCheck() ? 'Check. ' : ''}Opponent is considering the position.`, 'thinking');
  renderAll();
  if (finishIfNeeded()) return;
  askEngine();
}'''
app = replace_once(app, old_move_tail, new_move_tail, "live coach move gate")

# Hand analyzed moves to the live coach before the opponent is allowed to move.
app = replace_once(
    app,
    """    showMoveQualityBadge(targetMove);
    updateStoredCurrentSession();
    if (finalized) {""",
    """    showMoveQualityBadge(targetMove);
    updateStoredCurrentSession();
    if (!finalized) handleLiveCoachAnalysis(targetSession, targetMove);
    if (finalized) {""",
    "live coach analysis handoff",
)

# Live-coach intervention functions. They reuse the existing post-game coaching
# explanation system, while adding principles that were available before play.
live_coach_functions = r'''
const LIVE_COACH_ERROR_KEYS = Object.freeze(new Set(['inaccuracy', 'miss', 'mistake', 'blunder']));

function ignoredPrinciplesForMove(record, session) {
  const available = new Map((session?.positionPrinciples || []).map((principle) => [principle.key, principle]));
  if (!available.size) return [];
  const comparison = strongestAlternativeAchievement(record, session);
  const best = comparison.best.move;
  const selectedMove = comparison.selected.move;
  const keys = [];
  const add = (key) => { if (available.has(key) && !keys.includes(key)) keys.push(key); };

  if (best?.san?.includes('+') || best?.san?.includes('#') || (best?.captured && !selectedMove?.captured)) add('forcing-scan');
  if (best?.captured && !selectedMove?.captured) add('loose-pieces');
  if (best?.san?.startsWith('O-O') || (session.tags || []).includes('king safety')) add('king-safety');
  if ((session.tags || []).includes('prophylaxis') || (Number.isFinite(record.bestScore) && Number.isFinite(record.selectedScore) && record.bestScore >= -35 && record.selectedScore <= -120)) add('opponent-threat');
  if ((session.tags || []).some((tag) => ['piece activity', 'space'].includes(tag))) add('piece-activity');
  if ((session.tags || []).includes('pawn breaks')) add('pawn-breaks');
  if ((session.tags || []).includes('pawn structure')) add('pawn-structure');
  if ((session.tags || []).includes('conversion')) add('conversion');
  if ((session.tags || []).includes('endgame transition')) add('endgame-transition');
  if ((session.tags || []).includes('rook activity')) add('rook-activity');
  if ((session.tags || []).includes('passed pawns')) add('passed-pawns');
  if ((session.tags || []).includes('king activity')) add('king-activity');
  if ((session.tags || []).includes('opposition')) add('opposition');
  add('candidate-comparison');
  if (!keys.length) add('opponent-threat');
  return keys.slice(0, 3).map((key) => available.get(key));
}

function stopLiveCoachSpeech() {
  try { window.speechSynthesis?.cancel(); } catch {}
  liveCoachUtterance = null;
  const button = $('#liveCoachSpeakButton');
  if (button) button.textContent = '▶ Speak again';
}

function liveCoachSpeechText() {
  const rating = $('#liveCoachRating')?.textContent?.trim() || '';
  const summary = $('#liveCoachSummary')?.textContent?.trim() || '';
  const why = $('#liveCoachWhy')?.textContent?.trim() || '';
  const best = $('#liveCoachBestText')?.textContent?.trim() || '';
  const principles = $('#liveCoachPrinciplesText')?.textContent?.trim() || '';
  return [rating ? `${rating}.` : '', summary, why ? `About your move. ${why}` : '', best ? `The stronger move. ${best}` : '', principles ? `Principles to revisit. ${principles}` : ''].filter(Boolean).join(' ');
}

function speakLiveCoach(force = false) {
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return false;
  if (!force && settings.coachVoice === false) return false;
  stopLiveCoachSpeech();
  const text = speechFriendlyText(liveCoachSpeechText());
  if (!text) return false;
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = chooseCoachVoice();
  utterance.lang = voice?.lang || 'en-GB';
  utterance.rate = Math.max(0.82, Math.min(1.06, Number(settings.coachVoiceRate) || 0.92));
  utterance.pitch = 1;
  utterance.volume = 1;
  if (voice) utterance.voice = voice;
  utterance.onstart = () => {
    liveCoachUtterance = utterance;
    const button = $('#liveCoachSpeakButton');
    if (button) button.textContent = '■ Stop';
  };
  utterance.onend = utterance.onerror = () => {
    liveCoachUtterance = null;
    const button = $('#liveCoachSpeakButton');
    if (button) button.textContent = '▶ Speak again';
  };
  liveCoachUtterance = utterance;
  window.speechSynthesis.speak(utterance);
  return true;
}

function resetLiveCoachFlow({ closeModal = false } = {}) {
  if (liveCoachReviewTimer) window.clearTimeout(liveCoachReviewTimer);
  liveCoachReviewTimer = null;
  stopLiveCoachSpeech();
  liveCoachState = { awaiting: false, open: false, sessionId: null, moveId: null, record: null, narration: null, ignoredPrinciples: [] };
  if (closeModal) closeDialog('liveCoachDialog');
}

function queueLiveCoachReview(moveRecord) {
  resetLiveCoachFlow({ closeModal: true });
  pauseClockForTeaching();
  liveCoachState = {
    awaiting: true,
    open: false,
    sessionId: currentSession?.id || null,
    moveId: moveRecord?.id || null,
    record: moveRecord || null,
    narration: null,
    ignoredPrinciples: [],
  };
  liveCoachReviewTimer = window.setTimeout(() => {
    if (!liveCoachState.awaiting || finalized || liveCoachState.moveId !== moveRecord?.id) return;
    if (currentSession) currentSession.liveCoachAnalysisTimeouts = (currentSession.liveCoachAnalysisTimeouts || 0) + 1;
    toast('Live Coach analysis took too long, so play is resuming');
    continueAfterLiveCoach({ automatic: true });
  }, 16000);
}

function renderLiveCoachIntervention(record, narration, ignoredPrinciples) {
  const rating = $('#liveCoachRating');
  rating.className = `move-quality-badge quality-${narration.band.key}`;
  rating.textContent = narration.band.label;
  $('#liveCoachTitle').textContent = `Pause after ${record.san}`;
  $('#liveCoachSummary').textContent = narration.text;
  $('#liveCoachYourMove').textContent = narration.yourSan;
  $('#liveCoachWhy').textContent = narration.whyText;
  $('#liveCoachBestMove').textContent = narration.bestSan;
  $('#liveCoachBestText').textContent = narration.bestText;
  const line = $('#liveCoachLine');
  const lineText = narration.line?.length ? narration.line.join('  ') : 'The principal variation is not available yet.';
  line.textContent = lineText;

  const principlesSection = $('#liveCoachPrinciples');
  const principleList = $('#liveCoachPrincipleList');
  const principlesText = $('#liveCoachPrinciplesText');
  const showPrinciples = Boolean(settings.principleReview && ignoredPrinciples.length);
  principlesSection.hidden = !showPrinciples;
  if (showPrinciples) {
    principleList.innerHTML = ignoredPrinciples.map((principle) => `<article><b>${escapeHtml(principle.title)}</b><span>${escapeHtml(principle.rule)}</span></article>`).join('');
    principlesText.textContent = ignoredPrinciples.map((principle) => principle.title).join('; ');
  } else {
    principleList.innerHTML = '';
    principlesText.textContent = '';
  }
}

function openLiveCoachIntervention(record) {
  const decisionNumber = Math.max(1, (currentSession?.userMoves || []).findIndex((move) => move.id === record.id) + 1);
  const narration = coachNarrationForRecord(record, currentSession, decisionNumber);
  const ignoredPrinciples = settings.principleReview ? ignoredPrinciplesForMove(record, currentSession) : [];
  record.ignoredPrinciples = ignoredPrinciples.map((principle) => principle.key);
  record.liveCoachIntervention = true;
  if (currentSession) currentSession.liveCoachInterventions = (currentSession.liveCoachInterventions || 0) + 1;
  liveCoachState = { ...liveCoachState, awaiting: false, open: true, record, narration, ignoredPrinciples };
  renderLiveCoachIntervention(record, narration, ignoredPrinciples);
  setStatus(`${narration.band.label}: Live Coach paused the clock.`, 'bad');
  renderAll();
  openDialog('liveCoachDialog');
  if (settings.coachVoice !== false) window.setTimeout(() => speakLiveCoach(false), 180);
}

function handleLiveCoachAnalysis(session, record) {
  if (!settings.liveCoach || finalized) return;
  if (!liveCoachState.awaiting || liveCoachState.sessionId !== session?.id || liveCoachState.moveId !== record?.id) return;
  if (liveCoachReviewTimer) window.clearTimeout(liveCoachReviewTimer);
  liveCoachReviewTimer = null;
  const band = qualityForMoveRecord(record);
  if (LIVE_COACH_ERROR_KEYS.has(band.key)) {
    openLiveCoachIntervention(record);
    return;
  }
  const label = band.label;
  resetLiveCoachFlow({ closeModal: true });
  resumeClockFromTeaching();
  setStatus(`${label}. Opponent is considering the position.`, 'thinking');
  renderAll();
  if (!game?.isGameOver() && game?.turn() === engineColor) askEngine();
}

function continueAfterLiveCoach({ automatic = false } = {}) {
  const hadTeachingPause = liveCoachState.awaiting || liveCoachState.open || clockPaused;
  resetLiveCoachFlow({ closeModal: true });
  if (!hadTeachingPause || finalized || !game) return;
  resumeClockFromTeaching();
  setStatus(automatic ? 'Play resumed. Opponent is considering the position.' : 'Coach review complete. Opponent is considering the position.', 'thinking');
  renderAll();
  if (!game.isGameOver() && game.turn() === engineColor) askEngine();
}

function handleLiveCoachSpeak() {
  if (liveCoachUtterance || window.speechSynthesis?.speaking) stopLiveCoachSpeech();
  else speakLiveCoach(true);
}

'''
app = replace_once(app, "function sessionSequence(session) {", live_coach_functions + "function sessionSequence(session) {", "live coach functions")

# Finish/abandon flows must clear paused modals without resuming play.
app = replace_once(
    app,
    """  stockfishEngine?.stop();
  stopClock();
  currentSession.outcome = outcome;""",
    """  stockfishEngine?.stop();
  stopClock();
  clockPaused = false;
  principleReviewPending = false;
  closeDialog('principlesDialog');
  resetLiveCoachFlow({ closeModal: true });
  currentSession.outcome = outcome;""",
    "finalize teaching cleanup",
)

# Cache/share version.
app = app.replace("url.search = '?v=20260829-27';", "url.search = '?v=20260829-28';")
write(app_path, app)


# ---------------------------------------------------------------------------
# HTML setup toggles and teaching dialogs.
# ---------------------------------------------------------------------------
index_path = ROOT / "index.html"
index = read(index_path)

auto_hint_block = """          <label class="calibration-toggle hint-toggle">
            <input id="autoHints" type="checkbox">
            <span><b>Automatic hints before every move</b><small>Show a strategic idea at the start of each turn. The exact candidate remains hidden unless you reveal it.</small></span>
          </label>
"""
teaching_toggles = auto_hint_block + """

          <label class="calibration-toggle principles-toggle">
            <input id="principleReview" type="checkbox">
            <span><b>Review relevant principles before play</b><small>K-Mate selects five principles for the exact position and starts the clock only after you review them.</small></span>
          </label>

          <label class="calibration-toggle live-coach-toggle">
            <input id="liveCoach" type="checkbox">
            <span><b>Live Coach after bad moves</b><small>After an Inaccurate, Miss, or Blunder, pause both clocks and explain your move, the best move, and the principles overlooked.</small></span>
          </label>
"""
index = replace_once(index, auto_hint_block, teaching_toggles, "teaching setup toggles")

# Insert before the promotion dialog.
dialog_marker = "  <dialog id=\"promotionDialog\" class=\"modal\">"
teaching_dialogs = r'''  <dialog id="principlesDialog" class="modal principles-modal">
    <div class="modal-card">
      <div class="eyebrow">Before the clock starts</div>
      <h2 id="principlesPositionTitle">Principles for this position</h2>
      <p id="principlesPositionSubtitle">Review the ideas that are most relevant to the board in front of you.</p>
      <div class="principles-list" id="principlesList"></div>
      <p class="principles-note">Keep these principles in mind, but still calculate the concrete position. Principles guide candidate selection; they do not replace calculation.</p>
      <div class="dialogactions">
        <button class="btn" id="principlesSetupButton" type="button">Change setup</button>
        <button class="btn primary" id="principlesStartButton" type="button">I reviewed them — start clock</button>
      </div>
    </div>
  </dialog>

  <dialog id="liveCoachDialog" class="modal live-coach-modal">
    <div class="modal-card">
      <div class="live-coach-head">
        <div><div class="eyebrow">Live Coach · clock paused</div><h2 id="liveCoachTitle">Reviewing your move</h2></div>
        <span class="move-quality-badge quality-pending" id="liveCoachRating">Analyzing</span>
      </div>
      <p class="live-coach-summary" id="liveCoachSummary">K-Mate is comparing your move with the strongest continuation.</p>
      <div class="live-coach-comparison">
        <article class="your-move">
          <small>Your move</small><b id="liveCoachYourMove">—</b>
          <p id="liveCoachWhy">Analysis pending.</p>
        </article>
        <article class="best-move">
          <small>Best move</small><b id="liveCoachBestMove">—</b>
          <p id="liveCoachBestText">Analysis pending.</p>
        </article>
      </div>
      <section class="live-coach-principles" id="liveCoachPrinciples" hidden>
        <small>Principles this move appears to have overlooked</small>
        <div class="live-coach-principle-list" id="liveCoachPrincipleList"></div>
        <span id="liveCoachPrinciplesText" hidden></span>
      </section>
      <section class="live-coach-line-wrap">
        <small>Illustrative best continuation</small>
        <div class="live-coach-line" id="liveCoachLine">Principal variation pending.</div>
      </section>
      <div class="dialogactions live-coach-actions">
        <button class="btn" id="liveCoachSpeakButton" type="button">▶ Speak again</button>
        <button class="btn primary" id="liveCoachContinueButton" type="button">Continue game</button>
      </div>
    </div>
  </dialog>

'''
index = replace_once(index, dialog_marker, teaching_dialogs + dialog_marker, "teaching dialogs")
index = re.sub(r"styles-v7\.css\?v=\d+\.\d+\.\d+", "styles-v7.css?v=28.0.0", index)
index = re.sub(r"app-v7\.js\?v=\d+\.\d+\.\d+", "app-v7.js?v=28.0.0", index)
write(index_path, index)


# ---------------------------------------------------------------------------
# CSS for teaching setup and compact mobile interventions.
# ---------------------------------------------------------------------------
styles_path = ROOT / "styles-v7.css"
styles = read(styles_path)
styles += r'''

/* K-Mate v28 — pre-game principles and clock-pausing Live Coach */
.principles-toggle{border-color:#70b8ff38;background:#70b8ff08}
.live-coach-toggle{border-color:#f4cc7044;background:#f4cc7009}
.principles-modal{width:min(700px,calc(100% - 18px));max-height:92dvh;overflow:auto}
.principles-list{display:grid;gap:8px;margin:16px 0}
.principle-card{display:grid;grid-template-columns:34px minmax(0,1fr);gap:10px;padding:12px;border:1px solid #ffffff14;border-radius:14px;background:#ffffff05;text-align:left}
.principle-card>span{display:grid;place-items:center;width:31px;height:31px;border:1px solid #70b8ff55;border-radius:10px;background:#70b8ff12;color:#a9d5ff;font-weight:950}
.principle-card b,.principle-card p{display:block}.principle-card p{margin:3px 0 0;color:#cad5ce;font-size:12px;line-height:1.45}
.principles-note{padding:10px 12px;border-left:3px solid var(--gold);border-radius:8px;background:#f4cc700b;color:#dce4dd!important;font-size:11px}
.live-coach-modal{width:min(760px,calc(100% - 18px));max-height:94dvh;overflow:auto}
.live-coach-modal .modal-card{padding:22px}
.live-coach-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.live-coach-head h2{margin:5px 0 0}
.live-coach-summary{margin:13px 0!important;padding:11px 12px;border:1px solid #ffffff13;border-radius:13px;background:#ffffff05;color:#dce5de!important;line-height:1.48}
.live-coach-comparison{display:grid;grid-template-columns:1fr 1fr;gap:9px}
.live-coach-comparison article{min-width:0;padding:13px;border:1px solid #ffffff14;border-radius:14px;background:#ffffff05;text-align:left}
.live-coach-comparison .your-move{border-left:4px solid #ffad59}
.live-coach-comparison .best-move{border-left:4px solid #8ee7a2}
.live-coach-comparison small,.live-coach-comparison b{display:block}.live-coach-comparison small{color:var(--muted);font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.live-coach-comparison b{margin-top:4px;font-size:20px}.live-coach-comparison p{margin:7px 0 0!important;color:#d1dcd4!important;font-size:12px;line-height:1.48}
.live-coach-principles{margin-top:10px;padding:12px;border:1px solid #f4cc7045;border-radius:14px;background:#f4cc7009;text-align:left}
.live-coach-principles>small,.live-coach-line-wrap>small{display:block;color:var(--gold);font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
.live-coach-principle-list{display:grid;gap:6px;margin-top:8px}.live-coach-principle-list article{padding:8px 9px;border:1px solid #ffffff10;border-radius:10px;background:#0002}.live-coach-principle-list b,.live-coach-principle-list span{display:block}.live-coach-principle-list span{margin-top:2px;color:#cbd6ce;font-size:10px;line-height:1.35}
.live-coach-line-wrap{margin-top:10px;padding:11px 12px;border:1px solid #75d6ff32;border-radius:13px;background:#168ec60d;text-align:left}
.live-coach-line{margin-top:5px;color:#ccefff;font:750 11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;overflow-wrap:anywhere}
.live-coach-actions{margin-top:14px}.live-coach-actions .btn{flex:1}
@media(max-width:560px){
  .principles-modal .modal-card,.live-coach-modal .modal-card{padding:15px}
  .principle-card{grid-template-columns:29px minmax(0,1fr);padding:9px}.principle-card>span{width:27px;height:27px}.principle-card p{font-size:10px}
  .live-coach-comparison{grid-template-columns:1fr;gap:6px}
  .live-coach-summary{font-size:11px}
  .live-coach-comparison article{padding:10px}.live-coach-comparison b{font-size:17px}.live-coach-comparison p{font-size:10.5px}
  .live-coach-principles,.live-coach-line-wrap{padding:9px}
}
/* End K-Mate v28 */
'''
write(styles_path, styles)


# ---------------------------------------------------------------------------
# Runtime bindings, state diagnostics, and local test hooks.
# ---------------------------------------------------------------------------
part6_path = ROOT / "app-v7-part6.txt"
part6 = read(part6_path)
part6 = replace_once(
    part6,
    """  $('#blindCalibration')?.addEventListener('change', () => updateControls());
  $('#autoHints')?.addEventListener('change', () => updateControls());""",
    """  $('#blindCalibration')?.addEventListener('change', () => updateControls());
  $('#autoHints')?.addEventListener('change', () => updateControls());
  $('#liveCoach')?.addEventListener('change', () => updateControls());
  $('#principleReview')?.addEventListener('change', () => updateControls());""",
    "teaching toggle bindings",
)
part6 = replace_once(
    part6,
    """  $('#previewCaptureButton')?.addEventListener('click', previewCaptureSoundTheme);
  $('#coachMyVoiceInfo')?.addEventListener('click', () => openDialog('voiceCloneDialog'));""",
    """  $('#previewCaptureButton')?.addEventListener('click', previewCaptureSoundTheme);
  $('#principlesStartButton')?.addEventListener('click', startAfterPrincipleReview);
  $('#principlesSetupButton')?.addEventListener('click', cancelPrincipleReview);
  $('#principlesDialog')?.addEventListener('cancel', (event) => event.preventDefault());
  $('#liveCoachContinueButton')?.addEventListener('click', () => continueAfterLiveCoach());
  $('#liveCoachSpeakButton')?.addEventListener('click', handleLiveCoachSpeak);
  $('#liveCoachDialog')?.addEventListener('cancel', (event) => { event.preventDefault(); continueAfterLiveCoach(); });
  $('#coachMyVoiceInfo')?.addEventListener('click', () => openDialog('voiceCloneDialog'));""",
    "teaching dialog bindings",
)
part6 = part6.replace("version: '27.0-commercial-beta'", "version: '28.0-commercial-beta'")
part6 = replace_once(
    part6,
    """    clocks: { ...clocks },
    finalized,""",
    """    clocks: { ...clocks },
    clockPaused,
    principleReviewPending,
    principles: currentPositionPrinciples.map((principle) => ({ key: principle.key, title: principle.title })),
    liveCoach: { awaiting: liveCoachState.awaiting, open: liveCoachState.open, moveId: liveCoachState.moveId, ignoredPrinciples: liveCoachState.ignoredPrinciples.map((principle) => principle.key) },
    thinking,
    finalized,""",
    "teaching diagnostic state",
)

# Test-only helpers: start a deterministic teaching position and inject a bad
# engine comparison so browser verification does not depend on search variance.
test_marker = """    forceTimeout: (color = userColor) => {
      if (!game || finalized) return false;
      clocks[color] = 0;
      handleTimeout(color);
      return true;
    },"""
test_helpers = test_marker + r'''
    startTeachingDemo: () => {
      settings.side = 'w';
      settings.timeControl = '3+0';
      settings.liveCoach = true;
      settings.principleReview = true;
      settings.autoHints = false;
      settings.soundTheme = 'reference-crisp';
      queuedCustomPosition = {
        id: 'teaching-demo', custom: true, generated: false, phase: 'middlegame', opening: 'Teaching demo', rating: 1600,
        title: 'Live Coach teaching demo', theme: 'Candidate moves and piece activity',
        tags: ['calculation', 'piece activity', 'prophylaxis'],
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        description: 'A deterministic local test position for the Live Coach and principle review.',
      };
      startPosition();
      return { principles: currentPositionPrinciples.map((principle) => principle.key), paused: clockPaused };
    },
    forceLiveCoachIntervention: () => {
      const record = currentSession?.userMoves?.[currentSession.userMoves.length - 1];
      if (!record) return false;
      const g = new Chess(record.fenBefore);
      const alternatives = g.moves({ verbose: true }).filter((move) => uciFromMove(move) !== record.uci);
      const preferred = alternatives.find((move) => move.from === 'd2' && move.to === 'd4') || alternatives[0];
      if (!preferred) return false;
      const bestMove = uciFromMove(preferred);
      const lineGame = new Chess(record.fenBefore);
      const bestLine = [];
      let applied = lineGame.move({ from: preferred.from, to: preferred.to, promotion: preferred.promotion || 'q' });
      if (applied) bestLine.push(uciFromMove(applied));
      while (bestLine.length < 6 && !lineGame.isGameOver()) {
        const next = lineGame.moves({ verbose: true })[0];
        if (!next) break;
        applied = lineGame.move({ from: next.from, to: next.to, promotion: next.promotion || 'q' });
        if (!applied) break;
        bestLine.push(uciFromMove(applied));
      }
      applyMoveAnalysisResult(currentSession.id, record.id, {
        cpLoss: 280, bestMove, bestLine, selectedLine: [record.uci], bestScore: 165, selectedScore: -115,
        depth: 18, exactBest: false, analysisConsistency: 'test-injection', source: 'Local v28 teaching test',
      });
      return { moveId: record.id, bestMove };
    },'''
part6 = replace_once(part6, test_marker, test_helpers, "teaching test hooks")
write(part6_path, part6)


# Loader cache versions.
loader_path = ROOT / "app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=28.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=28.0.0", loader)
write(loader_path, loader)
