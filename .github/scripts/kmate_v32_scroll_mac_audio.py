from __future__ import annotations

from pathlib import Path
import re

ROOT = Path("kmate-trainer")


def read(path: Path) -> str:
    return path.read_text()


def write(path: Path, content: str) -> None:
    path.write_text(content)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing patch marker: {label}")
    return text.replace(old, new, 1)


def replace_regex(text: str, pattern: str, replacement: str, label: str, flags: int = re.S) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"Expected one regex replacement for {label}; found {count}")
    return updated


# ---------------------------------------------------------------------------
# Interface: make coach audio testable before a game or replay starts.
# ---------------------------------------------------------------------------
index_path = ROOT / "index.html"
index = read(index_path)
old_voice_setup = '''          <label class="calibration-toggle live-coach-audio-toggle">
            <input id="liveCoachVoice" type="checkbox">
            <span><b>Speak Live Coach reviews aloud</b><small>Play a short coaching cue, then narrate the move, the stronger alternative, and the likely chess principle that was overlooked. A Hear coach button remains available if autoplay is blocked.</small></span>
          </label>
'''
new_voice_setup = '''          <label class="calibration-toggle live-coach-audio-toggle">
            <input id="liveCoachVoice" type="checkbox">
            <span><b>Speak all coach reviews aloud</b><small>Use the device’s best available English voice for both Live Coach and post-game Coach Replay. On a Mac, test it once before playing so Safari or Chrome can authorize speech.</small></span>
          </label>
          <div class="coach-audio-check" id="coachAudioCheck">
            <button class="sound-preview coach-audio-test" id="coachVoiceTestButton" type="button">▶ Test coach voice</button>
            <span id="coachVoiceSetupStatus" data-state="untested">Voice enabled · not yet tested on this device.</span>
          </div>
'''
index = replace_once(index, old_voice_setup, new_voice_setup, "setup coach audio test")

old_replay_voice_row = '''              <div class="coach-voice-row">
                <button class="coach-voice-button active" id="coachVoiceToggle" type="button">🔊 Voice on</button>
                <button class="coach-voice-button" id="coachSpeakButton" type="button">▶ Speak</button>
                <button class="coach-voice-button coach-own-voice" id="coachMyVoiceInfo" type="button">My voice?</button>
              </div>
'''
new_replay_voice_row = '''              <div class="coach-voice-row">
                <button class="coach-voice-button active" id="coachVoiceToggle" type="button">🔊 Voice on</button>
                <button class="coach-voice-button" id="coachSpeakButton" type="button">▶ Speak</button>
                <button class="coach-voice-button coach-own-voice" id="coachMyVoiceInfo" type="button">My voice?</button>
              </div>
              <div class="coach-replay-audio-status" id="coachReplayAudioStatus" data-state="untested">Voice enabled · tap Speak if automatic narration is blocked.</div>
'''
index = replace_once(index, old_replay_voice_row, new_replay_voice_row, "replay coach audio status")
index = re.sub(r"styles-v7\.css\?v=\d+\.\d+\.\d+", "styles-v7.css?v=32.0.0", index)
index = re.sub(r"app-v7\.js\?v=\d+\.\d+\.\d+", "app-v7.js?v=32.0.0", index)
write(index_path, index)


# ---------------------------------------------------------------------------
# Application logic: preserve viewport, make speech Mac-safe, and add testing.
# ---------------------------------------------------------------------------
app_path = ROOT / "app-v7-part1.txt"
app = read(app_path)

variable_marker = '''let liveCoachReviewTimer = null;
let liveCoachUtterance = null;
let liveCoachVoicePrimed = false;
let replayState = { session: null, frames: [], index: 0, timer: null, auto: false, showBest: false, bestLineKey: null, bestLineFrames: [], bestLineIndex: -1, bestLineTimer: null, bestLinePlaying: false };
let coachSpeechUtterance = null;
let coachSpeechTimer = null;
let coachVoiceCache = null;
let coachSpeechSerial = 0;
let coachSpeechQueue = [];
let coachSpeechQueueIndex = 0;
'''
variable_replacement = '''let liveCoachReviewTimer = null;
let liveCoachUtterance = null;
let liveCoachVoicePrimed = false;
let liveCoachSpeechSerial = 0;
let liveCoachSpeechQueue = [];
let liveCoachSpeechQueueIndex = 0;
let liveCoachSpeechTimer = null;
let liveCoachSpeechWatchdog = null;
let replayState = { session: null, frames: [], index: 0, timer: null, auto: false, showBest: false, bestLineKey: null, bestLineFrames: [], bestLineIndex: -1, bestLineTimer: null, bestLinePlaying: false };
let coachSpeechUtterance = null;
let coachSpeechTimer = null;
let coachSpeechStartWatchdog = null;
let coachVoiceCache = null;
let coachSpeechSerial = 0;
let coachSpeechQueue = [];
let coachSpeechQueueIndex = 0;
let coachAudioTestUtterance = null;
let coachAudioTestSerial = 0;
let coachAudioReady = false;
let coachAudioDeviceState = 'untested';
let coachAudioDeviceMessage = '';
let liveCoachViewportRestoreSerial = 0;
'''
app = replace_once(app, variable_marker, variable_replacement, "speech and viewport state")

helpers = r'''
function isMacLikeDevice() {
  const platform = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
  return /mac|macintosh/i.test(String(platform));
}

function coachSpeechStartupDelay() {
  return isMacLikeDevice() ? 130 : 70;
}

function splitCoachSpeechText(text, maximum = 205) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
  const chunks = [];
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maximum) {
      chunks.push(trimmed);
      continue;
    }
    const words = trimmed.split(/\s+/);
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > maximum && current) {
        chunks.push(current);
        current = word;
      } else {
        current = candidate;
      }
    }
    if (current) chunks.push(current);
  }
  return chunks;
}

function setCoachAudioDeviceStatus(message, state = 'idle') {
  coachAudioDeviceMessage = String(message || '');
  coachAudioDeviceState = state;
  renderCoachAudioDeviceStatus();
}

function renderCoachAudioDeviceStatus() {
  const available = coachVoiceAvailable();
  const enabled = settings.coachVoice !== false;
  let state = coachAudioDeviceState;
  let message = coachAudioDeviceMessage;
  if (!available) {
    state = 'error';
    message = 'This browser does not expose a speech voice. Written coaching remains available.';
  } else if (!enabled) {
    state = 'muted';
    message = 'Coach voice is off. Turn it on or press Test coach voice.';
  } else if (!message) {
    state = coachAudioReady ? 'ready' : 'untested';
    message = coachAudioReady
      ? 'Coach audio is ready on this device.'
      : `Voice enabled · not yet tested${isMacLikeDevice() ? ' on this Mac' : ' on this device'}.`;
  }
  for (const selector of ['#coachVoiceSetupStatus', '#coachReplayAudioStatus']) {
    const element = $(selector);
    if (!element) continue;
    element.textContent = message;
    element.dataset.state = state;
  }
}

function primeCoachAudioFromGesture() {
  if (!coachVoiceAvailable()) return false;
  try { window.speechSynthesis.resume?.(); } catch {}
  try { ensureAudioContext()?.resume?.(); } catch {}
  const voices = window.speechSynthesis.getVoices?.() || [];
  if (voices.length) coachVoiceCache = null;
  if (!coachAudioReady && settings.coachVoice !== false) {
    setCoachAudioDeviceStatus(`Coach voice prepared${isMacLikeDevice() ? ' for this Mac' : ''}. Use Test coach voice to confirm it is audible.`, 'prepared');
  }
  return true;
}

function testCoachVoice() {
  if (!coachVoiceAvailable()) {
    setCoachAudioDeviceStatus('Spoken coaching is unavailable in this browser.', 'error');
    toast('Voice narration is unavailable in this browser');
    return false;
  }
  settings.coachVoice = true;
  const setup = $('#liveCoachVoice');
  if (setup) setup.checked = true;
  saveStore();
  updateCoachVoiceControls();
  primeCoachAudioFromGesture();

  const synth = window.speechSynthesis;
  const serial = ++coachAudioTestSerial;
  const wasBusy = Boolean(synth.speaking || synth.pending || liveCoachUtterance || coachSpeechUtterance || coachAudioTestUtterance);
  stopLiveCoachSpeech(false);
  stopCoachSpeech(false);
  if (wasBusy) {
    try { synth.cancel(); } catch {}
  }

  const launch = (useSelectedVoice = true) => {
    if (serial !== coachAudioTestSerial) return;
    const utterance = new SpeechSynthesisUtterance('K Mate coach audio is ready. You will hear both live coaching and post game reviews on this device.');
    const voice = useSelectedVoice ? chooseCoachVoice() : null;
    utterance.lang = voice?.lang || 'en-GB';
    utterance.rate = Math.max(0.84, Math.min(1.02, Number(settings.coachVoiceRate) || 0.92));
    utterance.pitch = 1;
    utterance.volume = 1;
    if (voice) utterance.voice = voice;
    let started = false;
    const watchdog = window.setTimeout(() => {
      if (serial !== coachAudioTestSerial || started) return;
      if (useSelectedVoice) {
        try { synth.cancel(); } catch {}
        window.setTimeout(() => launch(false), 160);
      } else {
        coachAudioTestUtterance = null;
        setCoachAudioDeviceStatus('The Mac did not start speech. Check that this browser tab is not muted, then press Test coach voice again.', 'error');
      }
    }, 1750);
    utterance.onstart = () => {
      if (serial !== coachAudioTestSerial) return;
      started = true;
      window.clearTimeout(watchdog);
      coachAudioTestUtterance = utterance;
      coachAudioReady = true;
      setCoachAudioDeviceStatus(`Speaking with ${voice?.name || 'the Mac system voice'}…`, 'speaking');
    };
    utterance.onend = () => {
      if (serial !== coachAudioTestSerial) return;
      window.clearTimeout(watchdog);
      coachAudioTestUtterance = null;
      coachAudioReady = true;
      setCoachAudioDeviceStatus(`Coach audio ready${voice?.name ? ` · ${voice.name}` : ''}.`, 'ready');
    };
    utterance.onerror = (event) => {
      if (serial !== coachAudioTestSerial) return;
      window.clearTimeout(watchdog);
      coachAudioTestUtterance = null;
      if (useSelectedVoice) {
        try { synth.cancel(); } catch {}
        window.setTimeout(() => launch(false), 160);
      } else {
        setCoachAudioDeviceStatus(`Voice could not start${event?.error ? ` (${event.error})` : ''}. Press Test coach voice once more.`, 'error');
      }
    };
    coachAudioTestUtterance = utterance;
    try {
      synth.resume?.();
      synth.speak(utterance);
    } catch (error) {
      window.clearTimeout(watchdog);
      coachAudioTestUtterance = null;
      setCoachAudioDeviceStatus('Voice could not start. Press Test coach voice once more.', 'error');
      console.warn('Coach voice test failed.', error);
    }
  };

  setCoachAudioDeviceStatus('Starting the coach voice test…', 'starting');
  if (wasBusy) window.setTimeout(() => launch(true), coachSpeechStartupDelay());
  else launch(true);
  return true;
}

function captureBoardViewportAnchor() {
  const board = $('#board');
  if (!board || board.offsetParent === null) return null;
  const rect = board.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  return {
    top: rect.top,
    scrollY: window.scrollY,
    visible: rect.bottom > 56 && rect.top < viewportHeight - 56,
  };
}

function restoreBoardViewportAnchor(anchor) {
  if (!anchor) return;
  const serial = ++liveCoachViewportRestoreSerial;
  const restore = () => {
    if (serial !== liveCoachViewportRestoreSerial) return;
    const board = $('#board');
    if (!board || board.offsetParent === null) return;
    if (!anchor.visible) {
      window.scrollTo({ top: anchor.scrollY, left: window.scrollX, behavior: 'auto' });
      return;
    }
    const delta = board.getBoundingClientRect().top - anchor.top;
    if (Math.abs(delta) > 0.5) window.scrollBy({ top: delta, left: 0, behavior: 'auto' });
  };
  window.requestAnimationFrame(() => {
    restore();
    window.requestAnimationFrame(restore);
  });
  window.setTimeout(restore, 180);
}

function setLiveCoachBoardOpenPreservingViewport(open) {
  const anchor = captureBoardViewportAnchor();
  setLiveCoachBoardOpen(open);
  restoreBoardViewportAnchor(anchor);
}

'''
app = replace_once(app, "function coachVoiceAvailable() {", helpers + "function coachVoiceAvailable() {", "Mac speech and viewport helpers")

# The voice setting also controls post-game replay, so it must stay usable even
# when Live Coach itself is disabled.
old_voice_disable = '''  const liveCoachVoiceControl = $('#liveCoachVoice');
  if (liveCoachVoiceControl) {
    liveCoachVoiceControl.disabled = !settings.liveCoach;
    liveCoachVoiceControl.closest('label')?.classList.toggle('disabled', !settings.liveCoach);
  }
'''
new_voice_disable = '''  const liveCoachVoiceControl = $('#liveCoachVoice');
  if (liveCoachVoiceControl) {
    liveCoachVoiceControl.disabled = false;
    liveCoachVoiceControl.closest('label')?.classList.remove('disabled');
  }
  const coachVoiceTestButton = $('#coachVoiceTestButton');
  if (coachVoiceTestButton) coachVoiceTestButton.disabled = !coachVoiceAvailable();
  renderCoachAudioDeviceStatus();
'''
app = replace_once(app, old_voice_disable, new_voice_disable, "voice control availability")

# Keep the setup/replay audio status synchronized with the existing controls.
app = replace_once(
    app,
    "  updateCoachAvatarControls();\n  toggle.disabled = !available;",
    "  updateCoachAvatarControls();\n  renderCoachAudioDeviceStatus();\n  toggle.disabled = !available;",
    "coach audio status refresh",
)

# Mac browsers can drop an utterance when cancel() and speak() happen in the same
# event-loop turn. Delay the first segment and retry once with the system default.
app = replace_regex(
    app,
    r"function stopCoachSpeech\(\) \{.*?\n\}\n\nfunction coachSpeechTextForCurrentFrame",
    r'''function stopCoachSpeech(cancelSpeech = true) {
  coachSpeechSerial += 1;
  if (coachSpeechTimer) window.clearTimeout(coachSpeechTimer);
  if (coachSpeechStartWatchdog) window.clearTimeout(coachSpeechStartWatchdog);
  coachSpeechTimer = null;
  coachSpeechStartWatchdog = null;
  coachSpeechQueue = [];
  coachSpeechQueueIndex = 0;
  if (cancelSpeech) {
    try { window.speechSynthesis?.cancel(); } catch {}
  }
  coachSpeechUtterance = null;
  setCoachSpeaking(false);
}

function coachSpeechTextForCurrentFrame''',
    "stop post-game coach speech",
)

app = replace_regex(
    app,
    r"function finishCoachSpeech\(serial\) \{.*?\n\}\n\nfunction speakCoachQueueSegment\(serial\) \{.*?\n\}\n\nfunction speakCoachFrame\(force = false\) \{.*?\n\}\n\nfunction scheduleCoachSpeech",
    r'''function finishCoachSpeech(serial, message = 'Narration complete. Tap Speak to listen again.') {
  if (serial !== coachSpeechSerial) return;
  if (coachSpeechStartWatchdog) window.clearTimeout(coachSpeechStartWatchdog);
  coachSpeechStartWatchdog = null;
  coachSpeechUtterance = null;
  coachSpeechQueue = [];
  coachSpeechQueueIndex = 0;
  setCoachSpeaking(false);
  coachAudioReady = true;
  setCoachAudioDeviceStatus(message, 'ready');
  updateCoachVoiceControls();
  updateCoachAvatarMood(replayState.frames[replayState.index]);
}

function speakCoachQueueSegment(serial) {
  if (serial !== coachSpeechSerial) return;
  const segment = coachSpeechQueue[coachSpeechQueueIndex];
  if (!segment) {
    finishCoachSpeech(serial);
    return;
  }
  const utterance = new SpeechSynthesisUtterance(speechFriendlyText(segment.text));
  const voice = segment.retry ? null : chooseCoachVoice();
  utterance.lang = voice?.lang || 'en-GB';
  utterance.rate = Math.max(0.82, Math.min(1.06, Number(settings.coachVoiceRate) || 0.92));
  utterance.pitch = 1.0;
  utterance.volume = 1;
  if (voice) utterance.voice = voice;
  let started = false;
  const retryOrFinish = (reason = '') => {
    if (serial !== coachSpeechSerial) return;
    if (coachSpeechStartWatchdog) window.clearTimeout(coachSpeechStartWatchdog);
    coachSpeechStartWatchdog = null;
    coachSpeechUtterance = null;
    if (!segment.retry) {
      segment.retry = 1;
      try { window.speechSynthesis?.cancel(); } catch {}
      coachSpeechTimer = window.setTimeout(() => speakCoachQueueSegment(serial), 150);
      return;
    }
    finishCoachSpeech(serial, `The Mac blocked narration${reason ? ` (${reason})` : ''}. Tap Speak to start it directly.');
  };
  utterance.onstart = () => {
    if (serial !== coachSpeechSerial) return;
    started = true;
    if (coachSpeechStartWatchdog) window.clearTimeout(coachSpeechStartWatchdog);
    coachSpeechStartWatchdog = null;
    coachSpeechUtterance = utterance;
    coachAudioReady = true;
    setCoachAudioDeviceStatus(`Coach Replay is speaking${voice?.name ? ` with ${voice.name}` : ''}.`, 'speaking');
    setCoachSpeaking(true);
    updateCoachVoiceControls();
  };
  utterance.onend = () => {
    if (serial !== coachSpeechSerial) return;
    if (coachSpeechStartWatchdog) window.clearTimeout(coachSpeechStartWatchdog);
    coachSpeechStartWatchdog = null;
    coachSpeechUtterance = null;
    coachSpeechQueueIndex += 1;
    coachSpeechTimer = window.setTimeout(() => speakCoachQueueSegment(serial), Math.max(45, segment.pause || 0));
  };
  utterance.onerror = (event) => retryOrFinish(event?.error || 'speech error');
  coachSpeechUtterance = utterance;
  try {
    window.speechSynthesis.resume?.();
    window.speechSynthesis.speak(utterance);
    coachSpeechStartWatchdog = window.setTimeout(() => {
      if (serial !== coachSpeechSerial || started) return;
      if (window.speechSynthesis?.speaking) {
        started = true;
        return;
      }
      retryOrFinish('no audio start');
    }, 1800);
    updateCoachVoiceControls();
  } catch (error) {
    console.warn('Coach voice could not start.', error);
    retryOrFinish('browser error');
  }
}

function speakCoachFrame(force = false) {
  if (!coachVoiceAvailable()) {
    if (force) toast('Voice narration is not available in this browser');
    setCoachAudioDeviceStatus('Voice narration is unavailable in this browser.', 'error');
    updateCoachVoiceControls();
    return false;
  }
  if (!force && settings.coachVoice === false) return false;
  const rawSegments = coachSpeechSegmentsForCurrentFrame();
  const segments = rawSegments.flatMap((segment) => {
    const chunks = splitCoachSpeechText(segment.text);
    return chunks.map((text, index) => ({
      text,
      pause: index === chunks.length - 1 ? segment.pause : 55,
      retry: 0,
    }));
  });
  if (!segments.length) return false;
  stopCoachSpeech();
  const serial = ++coachSpeechSerial;
  coachSpeechQueue = segments;
  coachSpeechQueueIndex = 0;
  setCoachAudioDeviceStatus('Starting Coach Replay narration…', 'starting');
  coachSpeechTimer = window.setTimeout(() => speakCoachQueueSegment(serial), coachSpeechStartupDelay());
  return true;
}

function scheduleCoachSpeech''',
    "Mac-safe post-game speech queue",
)

# Fix an apostrophe introduced by the raw replacement above in the dynamic error
# message. Keeping this normalization here makes the patch easier to audit.
app = app.replace(
    "finishCoachSpeech(serial, `The Mac blocked narration${reason ? ` (${reason})` : ''}. Tap Speak to start it directly.');",
    "finishCoachSpeech(serial, `The Mac blocked narration${reason ? ` (${reason})` : ''}. Tap Speak to start it directly.`);",
)

# Replace the ineffective zero-volume whitespace primer with an actual engine
# resume that is safe to call from a pointer/click gesture.
app = replace_regex(
    app,
    r"function primeLiveCoachVoice\(\) \{.*?\n\}\n\nfunction playLiveCoachCue",
    r'''function primeLiveCoachVoice() {
  if (liveCoachVoicePrimed || settings.coachVoice === false || !coachVoiceAvailable()) return false;
  liveCoachVoicePrimed = true;
  return primeCoachAudioFromGesture();
}

function playLiveCoachCue''',
    "live coach voice primer",
)

# Live Coach now narrates in short chunks, waits after cancel(), and retries once
# without a selected voice if macOS drops the first start.
app = replace_regex(
    app,
    r"function stopLiveCoachSpeech\(\) \{.*?\n\}\n\nfunction liveCoachSpeechText\(\) \{.*?\n\}\n\nfunction speakLiveCoach\(force = false\) \{.*?\n\}\n\nfunction toggleLiveCoachVoice",
    r'''function stopLiveCoachSpeech(cancelSpeech = true) {
  liveCoachSpeechSerial += 1;
  if (liveCoachSpeechTimer) window.clearTimeout(liveCoachSpeechTimer);
  if (liveCoachSpeechWatchdog) window.clearTimeout(liveCoachSpeechWatchdog);
  liveCoachSpeechTimer = null;
  liveCoachSpeechWatchdog = null;
  liveCoachSpeechQueue = [];
  liveCoachSpeechQueueIndex = 0;
  if (cancelSpeech) {
    try { window.speechSynthesis?.cancel(); } catch {}
  }
  liveCoachUtterance = null;
  const button = $('#liveCoachSpeakButton');
  if (button) button.textContent = '▶ Hear coach';
  updateLiveCoachAudioControls();
}

function liveCoachSpeechSections() {
  const rating = $('#liveCoachRating')?.textContent?.trim() || '';
  const summary = $('#liveCoachSummary')?.textContent?.trim() || '';
  const why = $('#liveCoachWhy')?.textContent?.trim() || '';
  const best = $('#liveCoachBestText')?.textContent?.trim() || '';
  const principles = $('#liveCoachPrinciplesText')?.textContent?.trim() || '';
  return [
    { text: rating ? `${rating}. ${summary}` : summary, pause: 170 },
    { text: why ? `About your move. ${why}` : '', pause: 190 },
    { text: best ? `The stronger move. ${best}` : '', pause: 210 },
    { text: principles ? `Principle diagnosis. ${principles}` : '', pause: 0 },
  ].filter((section) => section.text);
}

function liveCoachSpeechText() {
  return liveCoachSpeechSections().map((section) => section.text).join(' ');
}

function finishLiveCoachSpeech(serial, message = 'Narration complete. Tap Hear coach to listen again, or Resume game when ready.', state = 'ready') {
  if (serial !== liveCoachSpeechSerial) return;
  if (liveCoachSpeechWatchdog) window.clearTimeout(liveCoachSpeechWatchdog);
  liveCoachSpeechWatchdog = null;
  liveCoachUtterance = null;
  liveCoachSpeechQueue = [];
  liveCoachSpeechQueueIndex = 0;
  coachAudioReady = state === 'ready' ? true : coachAudioReady;
  setCoachAudioDeviceStatus(message, state);
  updateLiveCoachAudioControls(message);
}

function speakLiveCoachQueueSegment(serial) {
  if (serial !== liveCoachSpeechSerial) return;
  const segment = liveCoachSpeechQueue[liveCoachSpeechQueueIndex];
  if (!segment) {
    finishLiveCoachSpeech(serial);
    return;
  }
  const utterance = new SpeechSynthesisUtterance(speechFriendlyText(segment.text));
  const voice = segment.retry ? null : chooseCoachVoice();
  utterance.lang = voice?.lang || 'en-GB';
  utterance.rate = Math.max(0.82, Math.min(1.06, Number(settings.coachVoiceRate) || 0.92));
  utterance.pitch = 1;
  utterance.volume = 1;
  if (voice) utterance.voice = voice;
  let started = false;
  const retryOrFinish = (reason = '') => {
    if (serial !== liveCoachSpeechSerial) return;
    if (liveCoachSpeechWatchdog) window.clearTimeout(liveCoachSpeechWatchdog);
    liveCoachSpeechWatchdog = null;
    liveCoachUtterance = null;
    if (!segment.retry) {
      segment.retry = 1;
      try { window.speechSynthesis?.cancel(); } catch {}
      liveCoachSpeechTimer = window.setTimeout(() => speakLiveCoachQueueSegment(serial), 150);
      return;
    }
    finishLiveCoachSpeech(
      serial,
      `The Mac blocked automatic narration${reason ? ` (${reason})` : ''}. Tap Hear coach to start it directly.`,
      'error',
    );
  };
  utterance.onstart = () => {
    if (serial !== liveCoachSpeechSerial) return;
    started = true;
    if (liveCoachSpeechWatchdog) window.clearTimeout(liveCoachSpeechWatchdog);
    liveCoachSpeechWatchdog = null;
    liveCoachUtterance = utterance;
    coachAudioReady = true;
    setCoachAudioDeviceStatus(`Live Coach is speaking${voice?.name ? ` with ${voice.name}` : ''}.`, 'speaking');
    const button = $('#liveCoachSpeakButton');
    if (button) button.textContent = '■ Stop voice';
    updateLiveCoachAudioControls('Coach is speaking: move assessment, best alternative, then principle diagnosis.');
  };
  utterance.onend = () => {
    if (serial !== liveCoachSpeechSerial) return;
    if (liveCoachSpeechWatchdog) window.clearTimeout(liveCoachSpeechWatchdog);
    liveCoachSpeechWatchdog = null;
    liveCoachUtterance = null;
    liveCoachSpeechQueueIndex += 1;
    liveCoachSpeechTimer = window.setTimeout(() => speakLiveCoachQueueSegment(serial), Math.max(55, segment.pause || 0));
  };
  utterance.onerror = (event) => retryOrFinish(event?.error || 'speech error');
  liveCoachUtterance = utterance;
  try {
    window.speechSynthesis.resume?.();
    window.speechSynthesis.speak(utterance);
    liveCoachSpeechWatchdog = window.setTimeout(() => {
      if (serial !== liveCoachSpeechSerial || started) return;
      if (window.speechSynthesis?.speaking) {
        started = true;
        return;
      }
      retryOrFinish('no audio start');
    }, 1800);
  } catch (error) {
    console.warn('Live Coach voice could not start.', error);
    retryOrFinish('browser error');
  }
}

function speakLiveCoach(force = false) {
  if (!coachVoiceAvailable()) {
    const message = 'Spoken coaching is unavailable in this browser; the complete written review remains below.';
    setCoachAudioDeviceStatus(message, 'error');
    updateLiveCoachAudioControls(message);
    return false;
  }
  if (!force && settings.coachVoice === false) return false;
  const queue = liveCoachSpeechSections().flatMap((section) => {
    const chunks = splitCoachSpeechText(section.text);
    return chunks.map((text, index) => ({
      text,
      pause: index === chunks.length - 1 ? section.pause : 55,
      retry: 0,
    }));
  });
  if (!queue.length) return false;
  stopLiveCoachSpeech();
  const serial = ++liveCoachSpeechSerial;
  liveCoachSpeechQueue = queue;
  liveCoachSpeechQueueIndex = 0;
  setCoachAudioDeviceStatus('Starting Live Coach narration…', 'starting');
  updateLiveCoachAudioControls('Starting Live Coach narration…');
  liveCoachSpeechTimer = window.setTimeout(() => speakLiveCoachQueueSegment(serial), coachSpeechStartupDelay());
  return true;
}

function toggleLiveCoachVoice''',
    "Mac-safe Live Coach narration",
)

# Preserve the exact board position in the viewport when Live Coach opens or
# closes. Remove the old unconditional scrollIntoView call.
app = app.replace("setLiveCoachBoardOpen(true);", "setLiveCoachBoardOpenPreservingViewport(true);")
app = app.replace("  $('#boardCoachStage')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });\n", "")

app = replace_regex(
    app,
    r"function continueAfterLiveCoach\(\{ automatic = false \} = \{\}\) \{.*?\n\}\n\nfunction handleLiveCoachSpeak",
    r'''function continueAfterLiveCoach({ automatic = false } = {}) {
  const hadTeachingPause = liveCoachState.awaiting || liveCoachState.open || clockPaused;
  const viewportAnchor = captureBoardViewportAnchor();
  try { document.activeElement?.blur?.(); } catch {}
  resetLiveCoachFlow({ closeModal: true });
  if (!hadTeachingPause || finalized || !game) {
    restoreBoardViewportAnchor(viewportAnchor);
    return;
  }
  resumeClockFromTeaching();
  setStatus(automatic ? 'Play resumed. Opponent is considering the position.' : 'Coach review complete. Opponent is considering the position.', 'thinking');
  renderAll();
  restoreBoardViewportAnchor(viewportAnchor);
  window.requestAnimationFrame(() => {
    if (!game?.isGameOver() && game?.turn() === engineColor) askEngine();
  });
}

function handleLiveCoachSpeak''',
    "viewport-stable Live Coach resume",
)

# Preserve the board when a non-error analysis closes the temporary pending panel.
app = replace_once(
    app,
    """  const label = band.label;
  resetLiveCoachFlow({ closeModal: true });
  resumeClockFromTeaching();
  setStatus(`${label}. Opponent is considering the position.`, 'thinking');
  renderAll();
  if (!game?.isGameOver() && game?.turn() === engineColor) askEngine();
""",
    """  const label = band.label;
  const viewportAnchor = captureBoardViewportAnchor();
  resetLiveCoachFlow({ closeModal: true });
  resumeClockFromTeaching();
  setStatus(`${label}. Opponent is considering the position.`, 'thinking');
  renderAll();
  restoreBoardViewportAnchor(viewportAnchor);
  if (!game?.isGameOver() && game?.turn() === engineColor) askEngine();
""",
    "good-move panel close viewport",
)

app = app.replace("url.search = '?v=20260829-31';", "url.search = '?v=20260830-32';")
write(app_path, app)


# ---------------------------------------------------------------------------
# Loader, bindings, runtime diagnostics, and test helpers.
# ---------------------------------------------------------------------------
loader_path = ROOT / "app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=32.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=32.0.0", loader)
write(loader_path, loader)

part6_path = ROOT / "app-v7-part6.txt"
part6 = read(part6_path)
part6 = replace_once(
    part6,
    """  $('#resultReplay')?.addEventListener('click', () => {
    closeDialog('resultDialog');
    openCoachReplay(currentSession);
  });
""",
    """  $('#resultReplay')?.addEventListener('click', () => {
    primeCoachAudioFromGesture();
    closeDialog('resultDialog');
    openCoachReplay(currentSession);
  });
""",
    "prime replay voice from gesture",
)
part6 = replace_once(
    part6,
    "  $('#liveCoachVoice')?.addEventListener('change', handleLiveCoachVoiceSetting);\n",
    "  $('#liveCoachVoice')?.addEventListener('change', handleLiveCoachVoiceSetting);\n  $('#coachVoiceTestButton')?.addEventListener('click', testCoachVoice);\n",
    "voice test binding",
)
part6 = replace_once(
    part6,
    "  $('#saveCalibrationGuess')?.addEventListener('click', saveCalibrationGuess);\n",
    "  $('#saveCalibrationGuess')?.addEventListener('click', saveCalibrationGuess);\n\n  for (const selector of ['#startButton', '#startRecommendedButton', '#coachSpeakButton', '#liveCoachSpeakButton', '#resultReplay']) {\n    $(selector)?.addEventListener('pointerdown', primeCoachAudioFromGesture, { passive: true });\n  }\n",
    "gesture-based speech preparation",
)
part6 = part6.replace("version: '31.0-commercial-beta'", "version: '32.0-commercial-beta'")
part6 = part6.replace(
    "liveCoach: { awaiting: liveCoachState.awaiting, open: liveCoachState.open, inline: true, autoResume: false, voiceEnabled: settings.coachVoice !== false, voiceSpeaking: Boolean(liveCoachUtterance || window.speechSynthesis?.speaking),",
    "liveCoach: { awaiting: liveCoachState.awaiting, open: liveCoachState.open, inline: true, autoResume: false, viewportPreserved: true, voiceEnabled: settings.coachVoice !== false, voiceSpeaking: Boolean(liveCoachUtterance || window.speechSynthesis?.speaking),",
)
part6 = part6.replace(
    "sound: { enabled: soundEnabled(), theme: selectedSoundTheme(), unlocked: htmlAudioUnlocked, audibleConfirmed: soundAudiblyConfirmed, backend: soundPlaybackBackend, lastKind: lastSoundKind },",
    "sound: { enabled: soundEnabled(), theme: selectedSoundTheme(), unlocked: htmlAudioUnlocked, audibleConfirmed: soundAudiblyConfirmed, backend: soundPlaybackBackend, lastKind: lastSoundKind },\n    coachAudio: { ready: coachAudioReady, state: coachAudioDeviceState, message: coachAudioDeviceMessage, macLike: isMacLikeDevice(), selectedVoice: chooseCoachVoice()?.name || null },",
)
part6 = replace_once(
    part6,
    "    forceTimeout: (color = userColor) => {\n",
    "    testCoachVoice: () => testCoachVoice(),\n    boardViewport: () => { const rect = $('#board')?.getBoundingClientRect(); return rect ? { top: rect.top, bottom: rect.bottom, scrollY: window.scrollY } : null; },\n    forceTimeout: (color = userColor) => {\n",
    "local test helpers",
)
write(part6_path, part6)


# ---------------------------------------------------------------------------
# Styles: explicit audio diagnostics and scroll anchoring safeguards.
# ---------------------------------------------------------------------------
styles_path = ROOT / "styles-v7.css"
styles = read(styles_path)
styles += r'''

/* K-Mate v32 — stable Live Coach viewport and Mac coach-audio diagnostics */
.board-coach-stage,.live-coach-board-panel,.live-coach-actions{overflow-anchor:none}
.coach-audio-check{display:flex;align-items:center;gap:10px;margin:-2px 0 14px;padding:9px 10px;border:1px solid #ffffff16;border-radius:12px;background:#ffffff05}
.coach-audio-test{flex:0 0 auto;min-width:142px}
#coachVoiceSetupStatus,.coach-replay-audio-status{color:#aebbb1;font-size:10px;line-height:1.35}
#coachVoiceSetupStatus[data-state="ready"],.coach-replay-audio-status[data-state="ready"]{color:#9be9aa}
#coachVoiceSetupStatus[data-state="speaking"],.coach-replay-audio-status[data-state="speaking"]{color:#a9d5ff}
#coachVoiceSetupStatus[data-state="error"],.coach-replay-audio-status[data-state="error"]{color:#ffb3aa}
#coachVoiceSetupStatus[data-state="muted"],.coach-replay-audio-status[data-state="muted"]{color:#d8bd78}
.coach-replay-audio-status{margin:7px 0 3px;padding:7px 9px;border:1px solid #ffffff13;border-radius:9px;background:#ffffff05}
.live-coach-active .boardcol{overflow-anchor:none}
.live-coach-active .board-coach-stage{scroll-margin-top:86px}
@media(max-width:560px){
  .coach-audio-check{align-items:flex-start;flex-direction:column;gap:7px}
  .coach-audio-test{width:100%}
}
/* End K-Mate v32 */
'''
write(styles_path, styles)
