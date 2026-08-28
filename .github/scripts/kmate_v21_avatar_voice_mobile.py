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
    updated, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"Expected one replacement for {label}, found {count}")
    return updated


# -----------------------------------------------------------------------------
# Richer, stereo sampled-style chess audio. These are original synthesized
# recordings built from modal wooden resonances, felt transients, and room taps.
# -----------------------------------------------------------------------------
SAMPLE_RATE = 44100
TOTAL_SECONDS = 7.25
left = [0.0] * int(SAMPLE_RATE * TOTAL_SECONDS)
right = [0.0] * int(SAMPLE_RATE * TOTAL_SECONDS)
rng = random.Random(210828)


def pan_gains(pan: float) -> tuple[float, float]:
    pan = max(-1.0, min(1.0, pan))
    angle = (pan + 1.0) * math.pi / 4.0
    return math.cos(angle), math.sin(angle)


def add_sample(index: int, value: float, pan: float = 0.0) -> None:
    if 0 <= index < len(left):
        lg, rg = pan_gains(pan)
        left[index] += value * lg
        right[index] += value * rg


def add_modal_hit(start: float, amplitude: float, body: float = 1.0,
                  brightness: float = 1.0, pan: float = 0.0,
                  room: float = 1.0) -> None:
    duration = 0.42
    first = int(start * SAMPLE_RATE)
    count = int(duration * SAMPLE_RATE)
    modes = [
        (104 * body, 14.0, 1.00),
        (168 * body, 20.0, 0.68),
        (274 * body, 28.0, 0.43),
        (446 * body, 39.0, 0.30 * brightness),
        (731 * body, 54.0, 0.17 * brightness),
        (1180 * body, 78.0, 0.08 * brightness),
    ]
    phases = [rng.random() * math.tau for _ in modes]
    filtered_noise = 0.0
    for offset in range(count):
        t = offset / SAMPLE_RATE
        value = 0.0
        for (frequency, decay, weight), phase in zip(modes, phases):
            value += math.sin(math.tau * frequency * t + phase) * math.exp(-decay * t) * weight
        noise = rng.uniform(-1.0, 1.0)
        filtered_noise += (noise - filtered_noise) * min(0.62, 0.18 * brightness)
        value += filtered_noise * math.exp(-88.0 * t) * 0.62 * brightness
        attack = min(1.0, t / 0.00125)
        add_sample(first + offset, amplitude * value * attack, pan)

    # A few asymmetric reflections make the sample feel like a physical board.
    source_l = left[first:first + int(0.19 * SAMPLE_RATE)]
    source_r = right[first:first + int(0.19 * SAMPLE_RATE)]
    for delay, gain, spread in ((0.012, 0.22 * room, -0.22), (0.024, 0.13 * room, 0.28), (0.043, 0.07 * room, -0.36)):
        dest = first + int(delay * SAMPLE_RATE)
        lg, rg = pan_gains(spread)
        for offset, (lv, rv) in enumerate(zip(source_l, source_r)):
            index = dest + offset
            if index >= len(left):
                break
            mono = (lv + rv) * 0.5
            left[index] += mono * gain * lg
            right[index] += mono * gain * rg


def add_felt_click(start: float, amplitude: float = 0.22, pan: float = 0.0,
                   brightness: float = 1.0) -> None:
    first = int(start * SAMPLE_RATE)
    count = int(0.09 * SAMPLE_RATE)
    low = 0.0
    high = 0.0
    for offset in range(count):
        t = offset / SAMPLE_RATE
        noise = rng.uniform(-1.0, 1.0)
        low += (noise - low) * 0.12
        high += ((noise - low) - high) * min(0.75, 0.34 * brightness)
        tone = math.sin(math.tau * 1430 * t) * math.exp(-115 * t) * 0.25
        envelope = math.exp(-72 * t)
        add_sample(first + offset, amplitude * (high * 0.85 + low * 0.32 + tone) * envelope, pan)


def add_tone(start: float, duration: float, frequency: float, amplitude: float,
             end_frequency: float | None = None, pan: float = 0.0,
             decay: float = 3.0, harmonic: float = 0.16) -> None:
    first = int(start * SAMPLE_RATE)
    count = int(duration * SAMPLE_RATE)
    phase = 0.0
    phase2 = 0.0
    phase3 = 0.0
    target = end_frequency if end_frequency is not None else frequency
    for offset in range(count):
        progress = offset / max(1, count - 1)
        current = frequency + (target - frequency) * progress
        phase += math.tau * current / SAMPLE_RATE
        phase2 += math.tau * current * 2.01 / SAMPLE_RATE
        phase3 += math.tau * current * 3.02 / SAMPLE_RATE
        attack = min(1.0, progress / 0.028)
        release = min(1.0, (1.0 - progress) / 0.16)
        envelope = attack * release * math.exp(-decay * progress)
        value = math.sin(phase) + harmonic * math.sin(phase2) + harmonic * 0.32 * math.sin(phase3)
        add_sample(first + offset, amplitude * value * envelope, pan)


def add_clock_tick(start: float, amplitude: float = 0.26, pan: float = 0.0) -> None:
    add_felt_click(start, amplitude, pan, brightness=1.4)
    add_tone(start, 0.052, 1890, amplitude * 0.33, end_frequency=1450, pan=pan, decay=7.5, harmonic=0.06)


# MOVE — lift, slide, and a rounded wooden placement.
add_felt_click(0.08, 0.13, -0.22, brightness=0.9)
add_modal_hit(0.145, 0.44, body=1.08, brightness=0.78, pan=0.12, room=0.85)
add_felt_click(0.225, 0.13, 0.28, brightness=1.0)

# CAPTURE — displaced piece plus a firmer, lower landing.
add_modal_hit(0.70, 0.34, body=0.93, brightness=0.77, pan=-0.34, room=0.82)
add_felt_click(0.775, 0.18, 0.26, brightness=1.25)
add_modal_hit(0.835, 0.68, body=0.74, brightness=0.88, pan=0.16, room=0.96)
add_felt_click(0.955, 0.10, -0.05, brightness=1.5)

# CHECK — physical move followed by a restrained two-note cue.
add_modal_hit(1.48, 0.47, body=1.00, brightness=1.06, pan=-0.08, room=0.84)
add_tone(1.61, 0.26, 659.25, 0.18, end_frequency=698.46, pan=-0.22, decay=2.8)
add_tone(1.80, 0.28, 880.00, 0.18, end_frequency=987.77, pan=0.24, decay=2.9)

# WIN — warm wooden contact and a short major-sixth flourish.
add_modal_hit(2.48, 0.28, body=1.06, brightness=0.67, pan=0.0, room=1.05)
for offset, note, amp, pan in ((0.08, 523.25, 0.16, -0.35), (0.22, 659.25, 0.17, 0.24), (0.37, 783.99, 0.18, -0.16), (0.54, 1046.50, 0.16, 0.30)):
    add_tone(2.48 + offset, 0.34, note, amp, pan=pan, decay=2.15, harmonic=0.12)

# LOSS — soft board contact and a dignified descending cadence.
add_modal_hit(3.75, 0.24, body=0.86, brightness=0.50, pan=0.0, room=0.92)
add_tone(3.84, 0.34, 392.00, 0.15, end_frequency=349.23, pan=-0.18, decay=2.5)
add_tone(4.08, 0.36, 293.66, 0.16, end_frequency=246.94, pan=0.18, decay=2.4)
add_tone(4.31, 0.30, 196.00, 0.11, end_frequency=174.61, pan=0.0, decay=3.0)

# DRAW — centered, neutral paired notes.
add_modal_hit(4.95, 0.22, body=1.00, brightness=0.58, pan=0.0, room=0.80)
add_tone(5.06, 0.29, 440.00, 0.14, pan=-0.22, decay=2.6)
add_tone(5.28, 0.30, 415.30, 0.14, pan=0.22, decay=2.6)

# TIMEOUT — three clock ticks, a flag click, and a decisive low fall.
for offset, pan in ((0.00, -0.32), (0.13, 0.28), (0.26, -0.12)):
    add_clock_tick(5.95 + offset, 0.28, pan)
add_felt_click(6.31, 0.30, 0.22, brightness=1.55)
add_modal_hit(6.37, 0.55, body=0.69, brightness=0.58, pan=0.0, room=1.10)
add_tone(6.39, 0.48, 329.63, 0.18, end_frequency=146.83, pan=0.0, decay=2.0, harmonic=0.21)

peak = max(max(abs(value) for value in left), max(abs(value) for value in right), 1e-9)
scale = 0.91 / peak
pcm = bytearray()
for l_value, r_value in zip(left, right):
    l_sample = int(max(-1.0, min(1.0, l_value * scale)) * 32767)
    r_sample = int(max(-1.0, min(1.0, r_value * scale)) * 32767)
    pcm += struct.pack('<hh', l_sample, r_sample)

sound_dir = Path('kmate-trainer/sounds')
sound_dir.mkdir(parents=True, exist_ok=True)
sound_path = sound_dir / 'kmate-sounds-v21.wav'
with wave.open(str(sound_path), 'wb') as wav:
    wav.setnchannels(2)
    wav.setsampwidth(2)
    wav.setframerate(SAMPLE_RATE)
    wav.writeframes(bytes(pcm))


# -----------------------------------------------------------------------------
# HTML — replace the replay coach panel with a compact avatar + speech workspace.
# -----------------------------------------------------------------------------
index_path = 'kmate-trainer/index.html'
index = read(index_path)
coach_panel = r'''        <aside class="replay-coach-card" id="replayCoachCard">
          <section class="coach-stage">
            <div class="coach-avatar-column">
              <div class="coach-avatar" id="coachAvatar" role="img" aria-label="Coach K, an animated chess knight coach">
                <svg viewBox="0 0 150 178" focusable="false" aria-hidden="true">
                  <defs>
                    <linearGradient id="coachJacket" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f6d5a"/><stop offset="1" stop-color="#17261d"/></linearGradient>
                    <linearGradient id="coachFace" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#f3deb4"/><stop offset=".55" stop-color="#d3b37c"/><stop offset="1" stop-color="#987447"/></linearGradient>
                    <linearGradient id="coachMane" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#253a2d"/><stop offset="1" stop-color="#07110b"/></linearGradient>
                    <radialGradient id="coachBadge" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="#efffbf"/><stop offset="1" stop-color="#88bd45"/></radialGradient>
                    <filter id="coachShadow" x="-30%" y="-20%" width="160%" height="170%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-opacity=".5"/></filter>
                  </defs>
                  <ellipse cx="75" cy="166" rx="49" ry="7" fill="#000" opacity=".24"/>
                  <g filter="url(#coachShadow)">
                    <path d="M28 163c3-31 19-47 47-47s44 16 47 47z" fill="url(#coachJacket)" stroke="#07110b" stroke-width="4"/>
                    <path d="M58 118l17 16 17-16 9 45H49z" fill="#eef0df" stroke="#17261d" stroke-width="3"/>
                    <path d="M62 135l13 9 13-9-3 20H65z" fill="#b9f474" stroke="#2a422f" stroke-width="2.5"/>
                    <path d="M43 38c9-22 25-31 47-24 18 6 29 23 27 44-2 18-13 31-29 40l-5 20H54l4-18c-21-9-31-27-27-48 2-7 6-12 12-14z" fill="url(#coachFace)" stroke="#47361f" stroke-width="4" stroke-linejoin="round"/>
                    <path d="M45 39c10-24 29-35 50-24 12 6 20 17 22 31-13-9-27-11-42-6-14 4-24 13-30 27-8-8-8-19 0-28z" fill="url(#coachMane)" stroke="#07110b" stroke-width="3"/>
                    <path d="M93 41c12 6 20 18 19 33-1 13-8 22-20 29l-15-8c10-3 17-8 20-16-8 3-16 2-23-3 6-10 8-21 5-34 5-2 10-2 14-1z" fill="#c9985d" stroke="#4a331c" stroke-width="3"/>
                    <path d="M43 41l-7-25c12 1 21 7 27 18" fill="#d7b57c" stroke="#47361f" stroke-width="4" stroke-linejoin="round"/>
                    <circle cx="68" cy="55" r="10" fill="#ecf6e9" stroke="#18251c" stroke-width="3"/>
                    <circle cx="96" cy="57" r="10" fill="#ecf6e9" stroke="#18251c" stroke-width="3"/>
                    <path d="M78 55h8M57 52l-12-4M107 54l10-1" fill="none" stroke="#18251c" stroke-width="4" stroke-linecap="round"/>
                    <circle cx="70" cy="56" r="3.5" fill="#152119"/><circle cx="94" cy="58" r="3.5" fill="#152119"/>
                    <path d="M66 73c8 4 17 5 25 1" fill="none" stroke="#6b4129" stroke-width="3" stroke-linecap="round"/>
                    <path class="coach-mouth" d="M68 85q10 7 20 0" fill="none" stroke="#4d2c23" stroke-width="4" stroke-linecap="round"/>
                    <circle cx="42" cy="92" r="13" fill="#26382d" stroke="#09100b" stroke-width="4"/>
                    <path d="M39 92c0-20 4-31 14-38" fill="none" stroke="#26382d" stroke-width="6" stroke-linecap="round"/>
                    <circle cx="40" cy="92" r="5" fill="#b9f474"/>
                    <circle cx="107" cy="122" r="15" fill="url(#coachBadge)" stroke="#203321" stroke-width="3"/>
                    <path d="M103 112h8v8h7v7h-7v8h-8v-8h-7v-7h7z" fill="#213322"/>
                  </g>
                  <g class="coach-sound-waves" fill="none" stroke="#b9f474" stroke-width="4" stroke-linecap="round">
                    <path class="coach-wave wave-one" d="M122 68q11 10 0 20"/>
                    <path class="coach-wave wave-two" d="M130 61q20 17 0 35"/>
                  </g>
                </svg>
              </div>
              <div class="coach-identity"><b>Coach K</b><span id="coachMood">Ready</span></div>
            </div>

            <div class="coach-bubble">
              <div class="replay-rating-row">
                <span class="move-quality-badge quality-pending" id="replayRating">Position</span>
                <span id="replayDecisionCount">0 / 0</span>
              </div>
              <div class="coach-voice-row">
                <button class="coach-voice-button active" id="coachVoiceToggle" type="button">🔊 Voice on</button>
                <button class="coach-voice-button" id="coachSpeakButton" type="button">▶ Speak</button>
              </div>
              <h2 id="replayCoachTitle">Start with the original position</h2>
              <p class="coach-transcript" id="replayCoachText">Coach K will explain each move and compare your decision with Stockfish’s preferred continuation.</p>
            </div>
          </section>

          <div class="replay-comparison" id="replayComparison" hidden>
            <article class="coach-your-card">
              <small>Your move</small><b id="replayYourMove">—</b><span id="replayYourOutcome">—</span>
              <p id="replayWhyText">Coach K will explain what the move allowed or failed to preserve.</p>
            </article>
            <article class="coach-best-card">
              <small>Best move</small><b id="replayBestMove">—</b><span id="replayBestOutcome">—</span>
              <p id="replayBestText">Coach K will explain what the stronger move would have achieved.</p>
            </article>
          </div>

          <div class="replay-line" id="replayLine" hidden>
            <small>Illustrative best line</small>
            <b id="replayLineMoves">—</b>
          </div>

          <button class="btn replay-best-button" id="replayBestButton" type="button" hidden>Show best move on board</button>
          <p class="replay-footnote" id="replayFootnote">Coach K uses local Stockfish analysis. The explanation is practical training guidance, not a claim that every strategic nuance has been proven.</p>
        </aside>'''
index = sub_once(
    r'        <aside class="replay-coach-card">.*?        </aside>(?=\n      </div>\n    </div>\n  </dialog>)',
    coach_panel,
    index,
    'replay coach panel',
    flags=re.S,
)
index = index.replace('>Coach replay</button>', '>Coach replay with Coach K</button>', 1)
index = re.sub(r'\./styles-v7\.css\?v=\d+(?:\.\d+){2}', './styles-v7.css?v=21.0.0', index)
index = re.sub(r'\./app-v7\.js\?v=\d+(?:\.\d+){2}', './app-v7.js?v=21.0.0', index)
write(index_path, index)


# -----------------------------------------------------------------------------
# Application logic — voice, richer explanations, compact replay sequencing.
# -----------------------------------------------------------------------------
app_path = 'kmate-trainer/app-v7-part1.txt'
app = read(app_path)

app = replace_once(
    app,
    "  autoHints: false,\n};",
    "  autoHints: false,\n  coachVoice: true,\n};",
    'coach voice default',
)
app = replace_once(
    app,
    "let replayState = { session: null, frames: [], index: 0, timer: null, auto: false, showBest: false };\n",
    "let replayState = { session: null, frames: [], index: 0, timer: null, auto: false, showBest: false };\nlet coachSpeechUtterance = null;\nlet coachSpeechTimer = null;\nlet coachVoiceCache = null;\nlet coachSpeechSerial = 0;\n",
    'coach speech state',
)

sound_config = r'''const SOUND_SPRITE_SEGMENTS = {
  move: { start: 0.08, duration: 0.46, volume: 0.98 },
  capture: { start: 0.70, duration: 0.62, volume: 1.00 },
  check: { start: 1.48, duration: 0.76, volume: 0.98 },
  win: { start: 2.48, duration: 1.00, volume: 0.96 },
  loss: { start: 3.75, duration: 0.94, volume: 0.95 },
  draw: { start: 4.95, duration: 0.76, volume: 0.94 },
  timeout: { start: 5.95, duration: 1.18, volume: 1.00 },
};
const SOUND_SPRITE_URL = new URL('./sounds/kmate-sounds-v21.wav?v=21.0.0', document.baseURI).href;'''
app = sub_once(
    r'const SOUND_SPRITE_SEGMENTS = \{.*?const SOUND_SPRITE_URL = .*?;',
    sound_config,
    app,
    'v21 sound sprite config',
    flags=re.S,
)
app = app.replace("url.search = '?v=20260828-20';", "url.search = '?v=20260828-21';")

coach_logic = r'''
function coachVoiceAvailable() {
  return Boolean(window.speechSynthesis && window.SpeechSynthesisUtterance);
}

function chooseCoachVoice() {
  if (!coachVoiceAvailable()) return null;
  const voices = window.speechSynthesis.getVoices?.() || [];
  if (coachVoiceCache && voices.includes(coachVoiceCache)) return coachVoiceCache;
  const english = voices.filter((voice) => /^en([_-]|$)/i.test(voice.lang || ''));
  const preferredNames = ['Samantha', 'Daniel', 'Karen', 'Moira', 'Microsoft Aria', 'Google US English', 'Google UK English Female'];
  coachVoiceCache = preferredNames.map((name) => english.find((voice) => voice.name.includes(name))).find(Boolean)
    || english.find((voice) => voice.localService)
    || english[0]
    || voices[0]
    || null;
  return coachVoiceCache;
}

function updateCoachVoiceControls() {
  const toggle = $('#coachVoiceToggle');
  const speak = $('#coachSpeakButton');
  if (!toggle || !speak) return;
  const available = coachVoiceAvailable();
  const enabled = settings.coachVoice !== false;
  toggle.disabled = !available;
  speak.disabled = !available;
  toggle.classList.toggle('active', available && enabled);
  toggle.textContent = !available ? 'Text only' : enabled ? '🔊 Voice on' : '🔇 Voice off';
  toggle.title = !available ? 'Speech is unavailable in this browser' : enabled ? 'Turn Coach K voice off' : 'Turn Coach K voice on';
  speak.textContent = window.speechSynthesis?.speaking ? '■ Stop' : '▶ Speak';
}

function setCoachSpeaking(active) {
  const avatar = $('#coachAvatar');
  const card = $('#replayCoachCard');
  avatar?.classList.toggle('speaking', Boolean(active));
  card?.classList.toggle('coach-speaking', Boolean(active));
  const mood = $('#coachMood');
  if (mood && active) mood.textContent = 'Speaking';
  if (!active) updateCoachVoiceControls();
}

function stopCoachSpeech() {
  coachSpeechSerial += 1;
  if (coachSpeechTimer) window.clearTimeout(coachSpeechTimer);
  coachSpeechTimer = null;
  try { window.speechSynthesis?.cancel(); } catch {}
  coachSpeechUtterance = null;
  setCoachSpeaking(false);
}

function coachSpeechTextForCurrentFrame() {
  const title = $('#replayCoachTitle')?.textContent?.trim() || '';
  const text = $('#replayCoachText')?.textContent?.trim() || '';
  const comparison = $('#replayComparison');
  const why = comparison && !comparison.hidden ? $('#replayWhyText')?.textContent?.trim() || '' : '';
  const best = comparison && !comparison.hidden ? $('#replayBestText')?.textContent?.trim() || '' : '';
  return [title, text, why ? `About your move: ${why}` : '', best ? `The stronger move: ${best}` : '']
    .filter(Boolean)
    .join('. ')
    .replace(/\s+/g, ' ')
    .trim();
}

function speakCoachFrame(force = false) {
  if (!coachVoiceAvailable()) {
    if (force) toast('Voice narration is not available in this browser');
    updateCoachVoiceControls();
    return false;
  }
  if (!force && settings.coachVoice === false) return false;
  const text = coachSpeechTextForCurrentFrame();
  if (!text) return false;
  stopCoachSpeech();
  const serial = ++coachSpeechSerial;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 0.94;
  utterance.pitch = 1.02;
  utterance.volume = 1;
  const voice = chooseCoachVoice();
  if (voice) utterance.voice = voice;
  utterance.onstart = () => {
    if (serial !== coachSpeechSerial) return;
    coachSpeechUtterance = utterance;
    setCoachSpeaking(true);
    updateCoachVoiceControls();
  };
  const finish = () => {
    if (serial !== coachSpeechSerial) return;
    coachSpeechUtterance = null;
    setCoachSpeaking(false);
    updateCoachAvatarMood(replayState.frames[replayState.index]);
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  coachSpeechUtterance = utterance;
  try {
    window.speechSynthesis.speak(utterance);
    updateCoachVoiceControls();
    return true;
  } catch (error) {
    console.warn('Coach voice could not start.', error);
    finish();
    return false;
  }
}

function scheduleCoachSpeech(delay = 180, force = false) {
  if (coachSpeechTimer) window.clearTimeout(coachSpeechTimer);
  coachSpeechTimer = window.setTimeout(() => speakCoachFrame(force), delay);
}

function toggleCoachVoice() {
  if (!coachVoiceAvailable()) {
    toast('This browser does not provide speech narration');
    return;
  }
  settings.coachVoice = settings.coachVoice === false;
  saveStore();
  updateCoachVoiceControls();
  if (settings.coachVoice) {
    scheduleCoachSpeech(40, true);
    toast('Coach K voice on');
  } else {
    stopCoachSpeech();
    toast('Coach K voice off');
  }
}

function handleCoachSpeak() {
  if (window.speechSynthesis?.speaking) {
    stopCoachSpeech();
    return;
  }
  speakCoachFrame(true);
}

function updateCoachAvatarMood(frame) {
  const mood = $('#coachMood');
  const avatar = $('#coachAvatar');
  if (!mood || !avatar || avatar.classList.contains('speaking')) return;
  avatar.classList.remove('mood-happy', 'mood-thinking', 'mood-serious', 'mood-watch');
  if (!frame || frame.index === 0) {
    mood.textContent = 'Ready';
    avatar.classList.add('mood-thinking');
    return;
  }
  if (!frame.isUser) {
    mood.textContent = 'Watching';
    avatar.classList.add('mood-watch');
    return;
  }
  const key = qualityForLoss(frame.userRecord?.cpLoss).key;
  if (['best', 'excellent'].includes(key)) {
    mood.textContent = 'Impressed';
    avatar.classList.add('mood-happy');
  } else if (key === 'good') {
    mood.textContent = 'Encouraging';
    avatar.classList.add('mood-thinking');
  } else {
    mood.textContent = 'Teaching';
    avatar.classList.add('mood-serious');
  }
}

window.speechSynthesis?.addEventListener?.('voiceschanged', () => {
  coachVoiceCache = null;
  chooseCoachVoice();
  updateCoachVoiceControls();
});

'''
app = replace_once(app, 'function materialForPerspective(g, color) {', coach_logic + 'function materialForPerspective(g, color) {', 'coach voice logic')

narration_logic = r'''function decisionShortfall(record, session, comparison, band) {
  if (!Number.isFinite(record?.cpLoss)) return 'The move is still being analyzed.';
  const best = comparison.best.move;
  const selected = comparison.selected.move;
  const loss = Math.round(record.cpLoss);
  if (best?.san?.includes('#') && !selected?.san?.includes('#')) return `Your move missed a forced mate. That is why the position changed so sharply despite looking playable.`;
  if (best?.san?.includes('+') && !selected?.san?.includes('+')) return `Your move passed up a forcing check, allowing the opponent time to organize or create a counter-threat.`;
  if (best?.captured && !selected?.captured) return `Your move overlooked a tactical capture of the ${pieceName(best.captured)}, leaving material or initiative available to the opponent.`;
  if (best?.san?.startsWith('O-O') && !selected?.san?.startsWith('O-O')) return 'Your move delayed king safety and rook connection when castling was the most urgent improvement.';
  if (Number.isFinite(record.bestScore) && Number.isFinite(record.selectedScore)) {
    if (record.bestScore >= 120 && record.selectedScore < 40) return 'Your move let a clear advantage drift back toward equality instead of preserving pressure.';
    if (record.bestScore >= -35 && record.selectedScore <= -120) return 'Your move turned a defensible position into a clear disadvantage by missing the strongest resource.';
    if (record.bestScore > 0 && record.selectedScore < 0) return 'Your move reversed which side had the easier position, so the opponent took over the practical initiative.';
  }
  if ((session.tags || []).includes('king safety')) return `The move did not address king safety as directly as the position required. The estimated loss was ${loss} centipawns.`;
  if ((session.tags || []).some((tag) => ['pawn breaks', 'pawn structure'].includes(tag))) return `The move chose the wrong moment for the pawn structure and gave up a more useful break or restraint. The estimated loss was ${loss} centipawns.`;
  if ((session.tags || []).includes('piece activity')) return `The move did not improve coordination as efficiently as the engine’s candidate. The estimated loss was ${loss} centipawns.`;
  return `The move failed to preserve the strongest forcing or positional resource. Stockfish estimated a ${loss}-centipawn drop.`;
}

function coachNarrationForRecord(record, session, decisionNumber) {
  if (!record) return { title: `Decision ${decisionNumber}`, text: 'This move was not linked to a stored analysis record.', whyText: 'No stored explanation is available.', bestText: 'No best move is available.', bestSan: '—', yourSan: '—', bestOutcome: '—', yourOutcome: '—', line: [], band: { key: 'pending', label: 'Pending' } };
  const band = Number.isFinite(record.cpLoss) ? qualityForLoss(record.cpLoss) : { key: 'pending', label: 'Analyzing' };
  const comparison = strongestAlternativeAchievement(record, session);
  const bestSan = comparison.best.san || readableEngineMove(record.bestMove);
  const line = sanLineFromPv(record.fenBefore, record.bestLine, 8);
  const assisted = record.hintLevel ? ` You used ${record.hintLevel >= 2 ? 'the exact candidate reveal' : 'a strategic hint'} before moving.` : '';
  let text;
  let whyText;
  let bestText;
  if (!Number.isFinite(record.cpLoss)) {
    text = `Stockfish is still finishing the review of ${record.san}. The replay will refresh automatically when the evaluation arrives.${assisted}`;
    whyText = 'The engine comparison is still pending.';
    bestText = 'The preferred continuation will appear when analysis finishes.';
  } else if (['best', 'excellent'].includes(band.key)) {
    text = `${comparison.selected.text} This was ${band.label.toLowerCase()} and maintained ${evaluationText(record.selectedScore)}.${record.bestMove && record.bestMove !== record.uci ? ` Stockfish slightly preferred ${bestSan}, but the difference was only ${Math.round(record.cpLoss)} centipawns.` : ' It matched the engine’s principal choice.'}${assisted}`;
    whyText = `${record.san} preserved the position’s key resources and left you with ${evaluationText(record.selectedScore)}.`;
    bestText = record.bestMove && record.bestMove !== record.uci
      ? `${bestSan} was marginally more precise and would have ${comparison.achievement}.`
      : `${record.san} was the engine’s principal choice and achieved the position’s main objective.`;
  } else if (band.key === 'good') {
    text = `${comparison.selected.text} It was a good practical decision, but ${bestSan} was more precise because it would have ${comparison.achievement}. The estimated difference was ${Math.round(record.cpLoss)} centipawns.${assisted}`;
    whyText = `${record.san} was playable, but it gave up some precision and left ${evaluationText(record.selectedScore)}.`;
    bestText = `${bestSan} would have ${comparison.achievement}, preserving ${evaluationText(record.bestScore)}.`;
  } else {
    const transition = `The evaluation moved from ${evaluationText(record.bestScore)} with best play to ${evaluationText(record.selectedScore)} after your move.`;
    whyText = decisionShortfall(record, session, comparison, band);
    bestText = `${bestSan} would have ${comparison.achievement}, keeping ${evaluationText(record.bestScore)}.`;
    text = `${comparison.selected.text} ${transition} ${whyText} ${bestText}${assisted}`;
  }
  return {
    title: `Decision ${decisionNumber} · ${band.label}`,
    text,
    whyText,
    bestText,
    bestSan,
    yourSan: record.san,
    bestOutcome: evaluationText(record.bestScore),
    yourOutcome: evaluationText(record.selectedScore),
    line,
    band,
  };
}
'''
app = sub_once(
    r'function coachNarrationForRecord\(record, session, decisionNumber\) \{.*?\n\}\n(?=\nfunction sessionSequence)',
    narration_logic,
    app,
    'enhanced coach narration',
    flags=re.S,
)

render_replay = r'''function renderCoachReplay() {
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
    updateCoachAvatarMood(frame);
    updateCoachVoiceControls();
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
    $('#replayWhyText').textContent = narration.whyText;
    $('#replayBestMove').textContent = narration.bestSan;
    $('#replayBestOutcome').textContent = narration.bestOutcome;
    $('#replayBestText').textContent = narration.bestText;
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
    $('#replayCoachText').textContent = `${description.text} Ask what changed, what is now attacked, and what the opponent threatens.${nextDecision?.userRecord?.bestMove ? ` In the resulting position, Stockfish’s leading response was ${describeMoveFromFen(nextDecision.userRecord.fenBefore, nextDecision.userRecord.bestMove).san}.` : ''}`;
    comparison.hidden = true; lineBox.hidden = true; bestButton.hidden = true;
  }
  updateCoachAvatarMood(frame);
  updateCoachVoiceControls();
}
'''
app = sub_once(
    r'function renderCoachReplay\(\) \{.*?\n\}\n(?=\nfunction replayMoveSound)',
    render_replay,
    app,
    'coach replay renderer',
    flags=re.S,
)

set_index = r'''function setReplayIndex(index, playSound = true, speak = true) {
  if (!replayState.frames.length) return;
  const previous = replayState.index;
  replayState.index = Math.max(0, Math.min(replayState.frames.length - 1, Number(index) || 0));
  replayState.showBest = false;
  if (playSound && replayState.index === previous + 1) replayMoveSound(replayState.frames[replayState.index]);
  renderCoachReplay();
  if (speak && settings.coachVoice !== false) scheduleCoachSpeech(160);
}
'''
app = sub_once(
    r'function setReplayIndex\(index, playSound = true\) \{.*?\n\}\n(?=\nfunction stopReplayAuto)',
    set_index,
    app,
    'replay index voice scheduling',
    flags=re.S,
)

schedule_logic = r'''function scheduleReplayStep() {
  if (!replayState.auto) return;
  if (replayState.index >= replayState.frames.length - 1) {
    stopReplayAuto();
    return;
  }
  setReplayIndex(replayState.index + 1, true, true);
  const frame = replayState.frames[replayState.index];
  const words = coachSpeechTextForCurrentFrame().split(/\s+/).filter(Boolean).length;
  const narratedDelay = Math.max(frame?.isUser ? 4800 : 3000, Math.min(10500, words * 315 + 900));
  const silentDelay = frame?.isUser ? 4300 : 2400;
  replayState.timer = window.setTimeout(scheduleReplayStep, settings.coachVoice === false ? silentDelay : narratedDelay);
}
'''
app = sub_once(
    r'function scheduleReplayStep\(\) \{.*?\n\}\n(?=\nfunction toggleReplayAuto)',
    schedule_logic,
    app,
    'voice-aware replay timing',
    flags=re.S,
)

app = replace_once(
    app,
    "  replayState.auto = true;\n  renderCoachReplay();\n  replayState.timer = window.setTimeout(scheduleReplayStep, 700);",
    "  replayState.auto = true;\n  renderCoachReplay();\n  if (settings.coachVoice !== false) scheduleCoachSpeech(100);\n  replayState.timer = window.setTimeout(scheduleReplayStep, 900);",
    'auto replay voice start',
)
app = replace_once(
    app,
    "  renderCoachReplay();\n  openDialog('replayDialog');\n}",
    "  renderCoachReplay();\n  openDialog('replayDialog');\n  updateCoachVoiceControls();\n  if (settings.coachVoice !== false) scheduleCoachSpeech(220);\n}",
    'open replay narration',
)
app = replace_once(
    app,
    "  replayState.showBest = !replayState.showBest;\n  renderCoachReplay();\n}",
    "  replayState.showBest = !replayState.showBest;\n  renderCoachReplay();\n  if (replayState.showBest && settings.coachVoice !== false) scheduleCoachSpeech(90);\n}",
    'best move narration',
)
app = replace_once(
    app,
    "  if (id === 'replayDialog') stopReplayAuto();",
    "  if (id === 'replayDialog') { stopReplayAuto(); stopCoachSpeech(); }",
    'stop replay speech on close',
)

write(app_path, app)


# -----------------------------------------------------------------------------
# Bind controls, expose state, and bump version.
# -----------------------------------------------------------------------------
part6_path = 'kmate-trainer/app-v7-part6.txt'
part6 = read(part6_path)
part6 = replace_once(
    part6,
    "  $('#replayBestButton')?.addEventListener('click', toggleReplayBestMove);",
    "  $('#replayBestButton')?.addEventListener('click', toggleReplayBestMove);\n  $('#coachVoiceToggle')?.addEventListener('click', toggleCoachVoice);\n  $('#coachSpeakButton')?.addEventListener('click', handleCoachSpeak);",
    'coach voice control bindings',
)
part6 = part6.replace("version: '20.0-commercial-beta'", "version: '21.0-commercial-beta'")
part6 = replace_once(
    part6,
    "    replay: { open: Boolean($('#replayDialog')?.open), index: replayState.index, frames: replayState.frames.length, showBest: replayState.showBest },",
    "    replay: { open: Boolean($('#replayDialog')?.open), index: replayState.index, frames: replayState.frames.length, showBest: replayState.showBest, coachVoice: settings.coachVoice !== false, coachSpeaking: Boolean(window.speechSynthesis?.speaking) },",
    'coach replay state',
)
part6 = replace_once(
    part6,
    "renderInsights();\n$('#startButton').disabled = true;",
    "renderInsights();\nupdateCoachVoiceControls();\n$('#startButton').disabled = true;",
    'initial coach controls',
)
part6 = replace_once(
    part6,
    "    openReplay: () => openCoachReplay(currentSession),",
    "    openReplay: () => openCoachReplay(currentSession),\n    speakCoach: () => speakCoachFrame(true),",
    'coach test helper',
)
write(part6_path, part6)


# -----------------------------------------------------------------------------
# CSS — one-screen mobile replay, animated avatar, and more polished pieces.
# -----------------------------------------------------------------------------
css_path = 'kmate-trainer/styles-v7.css'
css = read(css_path)
css += r'''

/* K-Mate v21 — Coach K avatar, voice narration, and compact one-screen replay */
.coach-stage{display:grid;grid-template-columns:104px minmax(0,1fr);gap:13px;align-items:stretch}
.coach-avatar-column{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:6px}
.coach-avatar{position:relative;display:grid;place-items:center;width:98px;aspect-ratio:150/178;border:1px solid #b9f47435;border-radius:22px;background:radial-gradient(circle at 50% 25%,#91cc6940,transparent 50%),linear-gradient(160deg,#23362a,#0b130e);box-shadow:inset 0 1px #fff2,0 16px 36px #0006;overflow:hidden;transform-origin:50% 88%;transition:filter .2s,transform .2s,border-color .2s}
.coach-avatar svg{display:block;width:96%;height:96%;overflow:visible}
.coach-avatar .coach-mouth{transform-box:fill-box;transform-origin:center;transition:transform .12s}
.coach-avatar .coach-wave{opacity:0}
.coach-avatar.speaking{border-color:#b9f47499;filter:brightness(1.08);animation:coachBob 1.25s ease-in-out infinite}
.coach-avatar.speaking .coach-mouth{animation:coachTalk .22s ease-in-out infinite alternate}
.coach-avatar.speaking .coach-wave-one{animation:coachWave 1s ease-out infinite}
.coach-avatar.speaking .coach-wave-two{animation:coachWave 1s .18s ease-out infinite}
.coach-avatar.mood-happy{filter:saturate(1.1) brightness(1.06)}
.coach-avatar.mood-serious{border-color:#ffad5950}
.coach-avatar.mood-watch{border-color:#70b8ff45}
@keyframes coachTalk{from{transform:scaleY(.35)}to{transform:scaleY(1.55)}}
@keyframes coachWave{0%{opacity:0;transform:translateX(-2px) scale(.75)}30%{opacity:.85}100%{opacity:0;transform:translateX(5px) scale(1.08)}}
@keyframes coachBob{50%{transform:translateY(-2px) rotate(-.4deg)}}
.coach-identity{text-align:center}.coach-identity b,.coach-identity span{display:block}.coach-identity b{font-size:13px}.coach-identity span{color:var(--accent);font-size:9px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}
.coach-bubble{position:relative;min-width:0;padding:13px 14px;border:1px solid #ffffff16;border-radius:17px;background:linear-gradient(145deg,#ffffff09,#ffffff04)}
.coach-bubble:before{content:"";position:absolute;left:-8px;top:35px;width:14px;height:14px;border-left:1px solid #ffffff16;border-bottom:1px solid #ffffff16;background:#18241b;transform:rotate(45deg)}
.coach-voice-row{display:flex;justify-content:flex-end;gap:6px;margin-top:7px}
.coach-voice-button{min-height:32px;padding:0 10px;border:1px solid #ffffff1b;border-radius:10px;background:#ffffff07;color:var(--muted);font-size:10px;font-weight:900;cursor:pointer}
.coach-voice-button.active{border-color:#80d8a466;background:#80d8a414;color:#c2f7d8}
.coach-voice-button:disabled{opacity:.45;cursor:default}
.coach-transcript{max-height:132px;overflow:auto;margin:7px 0 0!important;padding-right:3px;color:#e4ebe5!important;line-height:1.48!important;scrollbar-width:thin}
.replay-comparison article p{margin:8px 0 0;color:#d6ded7;font-size:11px;line-height:1.43}
.coach-your-card{border-left:3px solid #ffad5970!important}.coach-best-card{border-left:3px solid #7cf58a70!important}
.coach-speaking .coach-bubble{border-color:#b9f47444;box-shadow:0 0 0 3px #b9f47408}
.replay-board .piece.staunton-piece{width:68%;height:68%}
.piece.staunton-piece svg{filter:drop-shadow(0 2px 1px #0005) drop-shadow(0 6px 7px #0003)}
.sq.selected .piece-art{transform:translateY(-1.5px) scale(1.035)}
.replay-boardwrap{background:linear-gradient(145deg,#1d281f,#0b120d);box-shadow:inset 0 1px #fff1,0 16px 32px #0004}

@media(max-width:760px){
  .replay-modal{inset:0;width:100vw;height:100dvh;max-height:100dvh;margin:0;border-radius:0}
  .replay-shell{display:grid;grid-template-rows:auto minmax(0,1fr);width:100%;height:100dvh;max-height:100dvh;padding:7px;overflow:hidden}
  .replay-header{align-items:center;min-height:40px;margin:0 0 5px}
  .replay-header .eyebrow,.replay-header p{display:none}
  .replay-header h2{margin:0;font-size:17px}
  .replay-header-actions .btn{min-height:32px;padding:0 8px;font-size:9px}
  .replay-header-actions .roundbtn{width:34px;height:34px;border-radius:10px;font-size:17px}
  .replay-layout{display:grid;grid-template-rows:auto minmax(0,1fr);height:100%;min-height:0;gap:6px;overflow:hidden}
  .replay-board-column{display:grid;grid-template-rows:auto auto auto auto;width:min(58vw,34dvh,238px);margin:0 auto;min-height:0}
  .replay-position-bar{min-height:27px;padding:4px 7px;border-radius:9px 9px 0 0;font-size:9px}
  .replay-boardwrap{padding:1px}
  .replay-board{border-radius:4px}
  .replay-board .coord{font-size:6px}
  .replay-board .piece.staunton-piece{width:62%;height:62%}
  .replay-slider{height:13px;margin:3px 0 1px}
  .replay-controls{grid-template-columns:34px 34px minmax(72px,1fr) 34px 34px;gap:3px}
  .replay-controls button{min-height:31px;border-radius:8px;font-size:10px}
  .replay-coach-card{position:static;display:grid;grid-template-rows:auto auto auto auto;gap:5px;height:100%;min-height:0;padding:7px;border-radius:12px;overflow:hidden}
  .coach-stage{grid-template-columns:64px minmax(0,1fr);gap:7px;min-height:0}
  .coach-avatar{width:60px;border-radius:14px}
  .coach-avatar-column{gap:2px}
  .coach-identity b{font-size:10px}.coach-identity span{font-size:7px}
  .coach-bubble{padding:6px 7px;border-radius:10px;min-height:0;overflow:hidden}
  .coach-bubble:before{left:-5px;top:25px;width:9px;height:9px}
  .replay-rating-row{font-size:8px}
  .replay-rating-row .move-quality-badge{padding:3px 6px;font-size:7px}
  .coach-voice-row{position:absolute;right:5px;top:4px;gap:3px;margin:0}
  .coach-voice-button{min-height:24px;padding:0 6px;border-radius:7px;font-size:7px}
  .replay-coach-card h2{margin:6px 0 2px;font-size:13px;line-height:1.15;padding-right:2px}
  .coach-transcript{max-height:68px;margin-top:3px!important;font-size:9.5px!important;line-height:1.28!important}
  .replay-comparison{grid-template-columns:1fr 1fr;gap:4px;margin:0;min-height:0}
  .replay-comparison article{min-width:0;padding:5px 6px;border-radius:8px;overflow:auto}
  .replay-comparison small{font-size:7px}.replay-comparison b{margin-top:2px;font-size:12px}.replay-comparison span{margin-top:1px;font-size:8px;line-height:1.2}
  .replay-comparison article p{max-height:49px;overflow:auto;margin-top:3px;font-size:8.5px;line-height:1.22}
  .replay-line{max-height:34px;overflow:auto;margin:0;padding:4px 6px;border-radius:7px}
  .replay-line small{display:none}.replay-line b{margin:0;font-size:8px;line-height:1.35}
  .replay-best-button{min-height:28px;margin:0;padding:0 8px;font-size:8px}
  .replay-footnote{display:none}
}

@media(max-width:430px){
  .replay-comparison{grid-template-columns:1fr 1fr}
  .replay-coach-card h2{font-size:12px}
  .replay-board .piece.staunton-piece{width:60%;height:60%}
}

@media(max-height:720px) and (max-width:760px){
  .replay-board-column{width:min(54vw,29dvh,205px)}
  .replay-header{min-height:34px}.replay-header h2{font-size:15px}
  .replay-controls button{min-height:27px}
  .coach-stage{grid-template-columns:54px minmax(0,1fr)}
  .coach-avatar{width:50px}
  .coach-transcript{max-height:52px}
  .replay-comparison article p{max-height:38px}
}
'''
write(css_path, css)


# Cache-bust loader pieces.
loader_path = 'kmate-trainer/app-v7.js'
loader = read(loader_path)
loader = re.sub(r'positions-v7\.js\?v=\d+(?:\.\d+){2}', 'positions-v7.js?v=21.0.0', loader)
loader = re.sub(r'app-v7-part\$\{number\}\.txt\?v=\d+(?:\.\d+){2}', 'app-v7-part${number}.txt?v=21.0.0', loader)
write(loader_path, loader)
