from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


# -----------------------------------------------------------------------------
# Move the hint card out of the side panel and attach it directly above the board.
# -----------------------------------------------------------------------------
index_path = "kmate-trainer/index.html"
index = read(index_path)

hint_pattern = re.compile(
    r"\n\s*<section class=\"hint-card(?: board-hint)?\" id=\"hintCard\" aria-live=\"polite\">.*?</section>\n",
    re.S,
)
index, removed = hint_pattern.subn("\n", index, count=1)
if removed != 1:
    raise SystemExit(f"Expected one existing hint card, removed {removed}")

hint_block = '''          <section class="hint-card board-hint" id="hintCard" aria-live="polite">
            <div class="hint-head">
              <div><small>Coach hint</small><b id="hintTitle">Hidden for this move</b></div>
              <button class="hint-action" id="showHintButton" type="button">Show Hint</button>
            </div>
            <p id="hintText">Try the position first, or reveal a strategic hint whenever you need one.</p>
            <span class="hint-mode-label" id="hintModeLabel">On-demand hints</span>
          </section>

'''
board_marker = '          <div class="boardwrap"><div class="board" id="board" aria-label="Interactive chessboard"></div></div>'
if board_marker not in index:
    raise SystemExit("Board insertion marker missing")
index = index.replace(board_marker, hint_block + board_marker, 1)
index = re.sub(r"\./styles-v7\.css\?v=\d+\.\d+\.\d+", "./styles-v7.css?v=19.0.0", index)
index = re.sub(r"\./app-v7\.js\?v=\d+\.\d+\.\d+", "./app-v7.js?v=19.0.0", index)
write(index_path, index)


# -----------------------------------------------------------------------------
# Upgrade the board pieces to original inline SVG vectors and add reliable audio.
# -----------------------------------------------------------------------------
part1_path = "kmate-trainer/app-v7-part1.txt"
app = read(part1_path)

piece_marker = "const PIECES = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };\n"
vector_code = r'''const VECTOR_PIECES = {
  p: `<circle class="piece-shell" cx="50" cy="24" r="11"/><path class="piece-shell" d="M39 38c-3 8-2 15 4 21l-9 12h32l-9-12c6-6 7-13 4-21Z"/><path class="piece-tone" d="M31 69h38l7 12H24Z"/><path class="piece-shell" d="M22 80h56v9H22Z"/><path class="piece-highlight" d="M44 41c-2 6-1 11 3 15"/>`,
  r: `<path class="piece-shell" d="M24 17h13v10h8V17h10v10h8V17h13v21l-8 7H32l-8-7Z"/><path class="piece-shell" d="M34 44h32l-4 26H38Z"/><path class="piece-tone" d="M31 69h38l7 12H24Z"/><path class="piece-shell" d="M21 80h58v9H21Z"/><path class="piece-highlight" d="M39 49h19M38 74h25"/>`,
  n: `<path class="piece-shell" d="M25 81c4-13 9-23 18-31-6-6-9-13-8-21 8-1 15-5 21-13 12 10 18 21 16 34-2 10-9 16-16 22h15l7 9Z"/><path class="piece-tone" d="M37 30c9 0 18 5 23 13-7-2-13 0-17 7-5-6-8-13-6-20Z"/><circle class="piece-eye" cx="54" cy="33" r="2.7"/><path class="piece-cut" d="M42 51c7 1 13-1 17-5"/><path class="piece-highlight" d="M31 75c8-18 16-23 25-29"/><path class="piece-shell" d="M22 80h58v9H22Z"/>`,
  b: `<path class="piece-shell" d="M50 14c-10 8-15 16-13 24 1 5 5 9 10 12-7 6-10 12-11 20h28c-1-8-4-14-11-20 5-3 9-7 10-12 2-8-3-16-13-24Z"/><path class="piece-cut" d="M43 25l14 18"/><path class="piece-tone" d="M31 69h38l7 12H24Z"/><path class="piece-shell" d="M22 80h56v9H22Z"/><path class="piece-highlight" d="M45 53c-4 5-6 10-6 15"/>`,
  q: `<circle class="piece-shell" cx="24" cy="23" r="5"/><circle class="piece-shell" cx="41" cy="17" r="5"/><circle class="piece-shell" cx="59" cy="17" r="5"/><circle class="piece-shell" cx="76" cy="23" r="5"/><path class="piece-shell" d="M24 28l11 31h30l11-31-17 19-9-24-9 24Z"/><path class="piece-tone" d="M34 58h32l4 12H30Z"/><path class="piece-tone" d="M27 69h46l6 12H21Z"/><path class="piece-shell" d="M19 80h62v9H19Z"/><path class="piece-highlight" d="M36 54h28M34 73h32"/>`,
  k: `<path class="piece-shell" d="M46 12h8v9h9v8h-9v10h-8V29h-9v-8h9Z"/><path class="piece-shell" d="M50 37c-12 0-19 7-18 16 1 6 6 11 12 14H34l-5 14h42l-5-14H56c6-3 11-8 12-14 1-9-6-16-18-16Z"/><path class="piece-tone" d="M29 70h42l7 11H22Z"/><path class="piece-shell" d="M20 80h60v9H20Z"/><path class="piece-highlight" d="M42 47c-4 5-4 10 1 15M35 73h30"/>`,
};

function renderPieceGraphic(element, type, color) {
  const markup = VECTOR_PIECES[type];
  if (!markup) {
    element.textContent = PIECES[type] || '';
    return;
  }
  element.classList.add('vector-piece');
  element.dataset.pieceType = type;
  element.dataset.pieceColor = color;
  element.innerHTML = `<svg viewBox="0 0 100 100" focusable="false" aria-hidden="true">${markup}</svg>`;
}

'''
if "const VECTOR_PIECES = {" not in app:
    if piece_marker not in app:
        raise SystemExit("PIECES marker missing")
    app = app.replace(piece_marker, piece_marker + vector_code, 1)

app = app.replace("glyph.textContent = PIECES[piece.type];", "renderPieceGraphic(glyph, piece.type, piece.color);")
app = app.replace("glyph.textContent = PIECES[type];", "renderPieceGraphic(glyph, type, userColor);")

# Audio state.
audio_var_marker = "let audioNoiseBuffer = null;\n"
audio_vars = """let htmlMoveAudio = null;
let htmlMoveAudioStopTimer = null;
let htmlAudioUnlocked = false;
let soundSpriteUri = null;
let soundPlaybackBackend = 'not-unlocked';
let lastSoundKind = null;
let soundBlockedNoticeShown = false;
"""
if "let htmlMoveAudio = null;" not in app:
    if audio_var_marker not in app:
        raise SystemExit("Audio variable marker missing")
    app = app.replace(audio_var_marker, audio_var_marker + audio_vars, 1)

# Preserve the existing Web Audio implementation as a fallback.
if "function playSynthMoveSound(kind = 'move')" not in app:
    app = app.replace("function playMoveSound(kind = 'move') {", "function playSynthMoveSound(kind = 'move') {", 1)

update_sound_marker = "function updateSoundToggle() {\n"
html_audio_code = r'''const SOUND_SPRITE_SEGMENTS = {
  move: { start: 0.05, duration: 0.18 },
  capture: { start: 0.38, duration: 0.24 },
  check: { start: 0.76, duration: 0.32 },
  win: { start: 1.20, duration: 0.48 },
  loss: { start: 1.82, duration: 0.40 },
  draw: { start: 2.34, duration: 0.34 },
};

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(bytes.length, index + chunk)));
  }
  return btoa(binary);
}

function buildSoundSpriteUri() {
  if (soundSpriteUri) return soundSpriteUri;
  const sampleRate = 24000;
  const totalSeconds = 2.82;
  const samples = new Float32Array(Math.ceil(sampleRate * totalSeconds));

  const mixTone = (start, duration, startFrequency, endFrequency, amplitude, shape = 'sine') => {
    const first = Math.floor(start * sampleRate);
    const count = Math.max(1, Math.floor(duration * sampleRate));
    let phase = 0;
    for (let offset = 0; offset < count && first + offset < samples.length; offset += 1) {
      const progress = offset / Math.max(1, count - 1);
      const frequency = startFrequency + (endFrequency - startFrequency) * progress;
      phase += (Math.PI * 2 * frequency) / sampleRate;
      const attack = Math.min(1, progress / 0.05);
      const release = Math.min(1, (1 - progress) / 0.18);
      const envelope = Math.max(0, Math.min(attack, release));
      let wave = Math.sin(phase);
      if (shape === 'triangle') wave = (2 / Math.PI) * Math.asin(Math.sin(phase));
      samples[first + offset] += wave * amplitude * envelope;
    }
  };

  const mixKnock = (start, duration, amplitude, lowPass = 0.16) => {
    const first = Math.floor(start * sampleRate);
    const count = Math.max(1, Math.floor(duration * sampleRate));
    let filtered = 0;
    let seed = Math.floor(start * 100000) + 1777;
    for (let offset = 0; offset < count && first + offset < samples.length; offset += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = (seed / 0xffffffff) * 2 - 1;
      filtered += (noise - filtered) * lowPass;
      const progress = offset / Math.max(1, count - 1);
      const envelope = Math.pow(1 - progress, 3.2);
      samples[first + offset] += filtered * amplitude * envelope;
    }
  };

  mixKnock(0.05, 0.075, 0.48, 0.18);
  mixTone(0.05, 0.13, 330, 190, 0.28, 'triangle');

  mixKnock(0.38, 0.11, 0.66, 0.13);
  mixTone(0.38, 0.18, 220, 105, 0.36, 'triangle');
  mixTone(0.405, 0.15, 150, 78, 0.24, 'sine');

  mixKnock(0.76, 0.07, 0.42, 0.22);
  mixTone(0.76, 0.12, 520, 690, 0.31, 'sine');
  mixTone(0.90, 0.13, 690, 870, 0.28, 'sine');

  mixTone(1.20, 0.14, 392, 440, 0.29, 'sine');
  mixTone(1.34, 0.15, 523, 587, 0.31, 'sine');
  mixTone(1.50, 0.18, 659, 784, 0.34, 'sine');

  mixTone(1.82, 0.18, 340, 245, 0.31, 'triangle');
  mixTone(2.02, 0.19, 245, 150, 0.28, 'triangle');

  mixTone(2.34, 0.13, 330, 330, 0.26, 'sine');
  mixTone(2.49, 0.15, 294, 294, 0.24, 'sine');

  const byteLength = 44 + samples.length * 2;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  const writeText = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, byteLength - 8, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const limited = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, limited < 0 ? limited * 0x8000 : limited * 0x7fff, true);
  }
  soundSpriteUri = `data:audio/wav;base64,${bytesToBase64(new Uint8Array(buffer))}`;
  return soundSpriteUri;
}

function ensureHtmlMoveAudio() {
  if (htmlMoveAudio) return htmlMoveAudio;
  const audio = new Audio();
  audio.preload = 'auto';
  audio.playsInline = true;
  audio.src = buildSoundSpriteUri();
  audio.volume = 0.92;
  htmlMoveAudio = audio;
  return audio;
}

async function unlockMoveAudio(audible = false) {
  if (!soundEnabled()) return false;
  const audio = ensureHtmlMoveAudio();
  if (htmlAudioUnlocked) return true;
  try {
    audio.pause();
    audio.currentTime = SOUND_SPRITE_SEGMENTS.move.start;
    audio.muted = false;
    audio.volume = audible ? 0.82 : 0.002;
    const promise = audio.play();
    if (promise?.then) await promise;
    await new Promise((resolve) => window.setTimeout(resolve, 55));
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0.92;
    htmlAudioUnlocked = true;
    soundPlaybackBackend = 'html-audio-sprite';
    soundBlockedNoticeShown = false;
    updateSoundToggle();
    return true;
  } catch (error) {
    soundPlaybackBackend = 'web-audio-fallback';
    ensureAudioContext();
    if (!soundBlockedNoticeShown) {
      soundBlockedNoticeShown = true;
      toast('Tap the speaker button once to enable sound');
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
  audio.volume = 0.94;
  const promise = audio.play();
  if (promise?.catch) {
    promise.catch((error) => {
      console.warn('HTML move audio was blocked; using synthesizer fallback.', error);
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
    soundPlaybackBackend = 'html-audio-sprite';
    playHtmlMoveSound(kind);
    return;
  }
  unlockMoveAudio(false).then((unlocked) => {
    if (unlocked) playHtmlMoveSound(kind);
    else playSynthMoveSound(kind);
  });
}

const primeSoundFromGesture = () => { unlockMoveAudio(false); };
document.addEventListener('pointerdown', primeSoundFromGesture, { capture: true, once: true });
document.addEventListener('touchstart', primeSoundFromGesture, { capture: true, once: true, passive: true });
document.addEventListener('keydown', primeSoundFromGesture, { capture: true, once: true });

'''
if "const SOUND_SPRITE_SEGMENTS = {" not in app:
    if update_sound_marker not in app:
        raise SystemExit("updateSoundToggle marker missing")
    app = app.replace(update_sound_marker, html_audio_code + update_sound_marker, 1)

# Make the sound button report whether the reliable playback backend is unlocked.
old_update = """  button.textContent = soundEnabled() ? '🔊' : '🔇';
  button.setAttribute('aria-label', soundEnabled() ? 'Mute move sounds' : 'Turn on move sounds');
  button.title = soundEnabled() ? 'Move sounds on' : 'Move sounds off';
"""
new_update = """  button.textContent = soundEnabled() ? '🔊' : '🔇';
  button.classList.toggle('audio-ready', soundEnabled() && htmlAudioUnlocked);
  button.setAttribute('aria-label', soundEnabled() ? 'Mute move sounds' : 'Turn on move sounds');
  button.title = soundEnabled()
    ? (htmlAudioUnlocked ? 'Move sounds on' : 'Move sounds on — tap once to enable audio')
    : 'Move sounds off';
"""
if old_update in app:
    app = app.replace(old_update, new_update, 1)

old_toggle = re.compile(r"function toggleSound\(\) \{.*?\n\}\n", re.S)
toggle_match = old_toggle.search(app)
if not toggle_match:
    raise SystemExit("toggleSound function missing")
new_toggle = r'''async function toggleSound() {
  settings.sound = !soundEnabled();
  saveStore();
  updateSoundToggle();
  if (settings.sound) {
    await unlockMoveAudio(true);
    playMoveSound('move');
    toast('Move sounds on');
  } else {
    htmlMoveAudio?.pause();
    toast('Move sounds muted');
  }
}
'''
app = app[:toggle_match.start()] + new_toggle + app[toggle_match.end():]

# Prime the HTML audio element from the explicit Start gesture as well.
app = app.replace(
    "function startPosition({ preservePrevious = false } = {}) {\n  ensureAudioContext();",
    "function startPosition({ preservePrevious = false } = {}) {\n  unlockMoveAudio(false);\n  ensureAudioContext();",
    1,
)

# Make shared links use the new build.
app = app.replace("url.search = '?v=20260827-17';", "url.search = '?v=20260828-19';")
write(part1_path, app)


# -----------------------------------------------------------------------------
# Expose the sound backend for diagnostics and bump the application version.
# -----------------------------------------------------------------------------
part6_path = "kmate-trainer/app-v7-part6.txt"
part6 = read(part6_path)
part6 = part6.replace("version: '18.0-commercial-beta'", "version: '19.0-commercial-beta'")
state_marker = "    hint: { status: hintState.status, level: hintState.level, automatic: Boolean(settings.autoHints), candidate: hintState.level >= 2 ? hintState.candidate : null },\n"
state_sound = "    sound: { enabled: soundEnabled(), unlocked: htmlAudioUnlocked, backend: soundPlaybackBackend, lastKind: lastSoundKind },\n"
if state_sound not in part6:
    if state_marker not in part6:
        raise SystemExit("State hint marker missing")
    part6 = part6.replace(state_marker, state_marker + state_sound, 1)
write(part6_path, part6)


# -----------------------------------------------------------------------------
# Board-attached hint design and original 3D-styled SVG pieces.
# -----------------------------------------------------------------------------
css_path = "kmate-trainer/styles-v7.css"
css = read(css_path)
css_addition = r'''

/* K-Mate v19: board-attached hint, reliable-audio state, and original SVG pieces */
.board-hint{margin:0;padding:10px 12px;border-radius:0;border-top:0;border-left:1px solid var(--line);border-right:1px solid var(--line);border-bottom:1px solid #ffffff16;background:linear-gradient(90deg,#0f1a13,#132019)}
.board-hint .hint-head{align-items:center}
.board-hint .hint-head b{font-size:13px}
.board-hint p{margin-top:5px!important;line-height:1.35}
.board-hint .hint-mode-label{margin-top:4px}
.board-hint + .boardwrap{border-top:0}
.sound-toggle.audio-ready{border-color:#80d8a466;background:#80d8a416;box-shadow:0 0 0 2px #80d8a40d}
.piece.vector-piece{display:grid;place-items:center;width:80%;height:80%;font-size:0;line-height:1;transform:none;filter:none;color:inherit}
.piece.vector-piece svg{display:block;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 3px 1.5px #0007) drop-shadow(0 7px 7px #0004)}
.piece.vector-piece.white{color:#f2e5c8;--piece-edge:#4b4438;--piece-tone:#c9b48b;--piece-highlight:#fffaf0;--piece-shadow:#8f7b61}
.piece.vector-piece.black{color:#27352c;--piece-edge:#080e0a;--piece-tone:#425446;--piece-highlight:#9aab9d;--piece-shadow:#101813}
.piece-shell{fill:currentColor;stroke:var(--piece-edge);stroke-width:3.15;stroke-linejoin:round;stroke-linecap:round;paint-order:stroke fill}
.piece-tone{fill:var(--piece-tone);stroke:var(--piece-edge);stroke-width:2.8;stroke-linejoin:round;paint-order:stroke fill}
.piece-highlight{fill:none;stroke:var(--piece-highlight);stroke-width:2.15;stroke-linecap:round;opacity:.76}
.piece-cut{fill:none;stroke:var(--piece-edge);stroke-width:4;stroke-linecap:round}
.piece-eye{fill:var(--piece-highlight);stroke:var(--piece-edge);stroke-width:1.9}
.promos .piece.vector-piece{width:62px;height:62px;margin:auto}
@media(max-width:560px){
  .board-hint{padding:8px 9px}
  .board-hint .hint-head b{font-size:12px}
  .board-hint p{font-size:11px!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .board-hint .hint-mode-label{display:none}
  .piece.vector-piece{width:74%;height:74%}
  .piece.vector-piece svg{filter:drop-shadow(0 2px 1px #0007) drop-shadow(0 4px 4px #0004)}
}
'''
if "/* K-Mate v19:" not in css:
    css += css_addition
write(css_path, css)


# Cache-bust every loader dependency.
loader_path = "kmate-trainer/app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=19.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=19.0.0", loader)
write(loader_path, loader)
