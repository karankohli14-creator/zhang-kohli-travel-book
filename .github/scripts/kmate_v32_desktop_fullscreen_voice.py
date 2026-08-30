from __future__ import annotations

from pathlib import Path
import re

ROOT = Path("kmate-trainer")


def read(name: str) -> str:
    return (ROOT / name).read_text()


def write(name: str, text: str) -> None:
    (ROOT / name).write_text(text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"Missing patch marker: {label}")
    return text.replace(old, new, 1)


def replace_function(text: str, name: str, replacement: str) -> str:
    marker = f"function {name}("
    start = text.find(marker)
    if start < 0:
        raise RuntimeError(f"Missing function: {name}")
    brace = text.find("{", start)
    depth = 0
    quote = None
    escaped = False
    i = brace
    while i < len(text):
        ch = text[i]
        if quote:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                quote = None
            i += 1
            continue
        if ch in ('"', "'", "`"):
            quote = ch
            i += 1
            continue
        if ch == "/" and i + 1 < len(text):
            nxt = text[i + 1]
            if nxt == "/":
                i = text.find("\n", i + 2)
                if i < 0:
                    raise RuntimeError(f"Unterminated line comment in {name}")
                continue
            if nxt == "*":
                end_comment = text.find("*/", i + 2)
                if end_comment < 0:
                    raise RuntimeError(f"Unterminated block comment in {name}")
                i = end_comment + 2
                continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[:start] + replacement.rstrip() + text[i + 1:]
        i += 1
    raise RuntimeError(f"Unable to find end of function {name}")


# HTML controls.
index = read("index.html")
index = replace_once(
    index,
    '<button class="roundbtn" id="flipButton" type="button" aria-label="Flip board">⇅</button>',
    '''<div class="playtop-actions">
          <button class="roundbtn" id="gameFullscreenButton" type="button" aria-label="Enter full screen" title="Use the full screen">⛶</button>
          <button class="roundbtn" id="flipButton" type="button" aria-label="Flip board">⇅</button>
        </div>''',
    "desktop fullscreen control",
)
index = replace_once(
    index,
    '<div class="board" id="board" aria-label="Interactive chessboard"></div>',
    '<div class="board" id="board" tabindex="-1" aria-label="Interactive chessboard"></div>',
    "focusable chessboard",
)
voice_toggle = '''          <label class="calibration-toggle live-coach-audio-toggle">
            <input id="liveCoachVoice" type="checkbox">
            <span><b>Speak Live Coach reviews aloud</b><small>Play a short coaching cue, then narrate the move, the stronger alternative, and the likely chess principle that was overlooked. A Hear coach button remains available if autoplay is blocked.</small></span>
          </label>'''
index = replace_once(
    index,
    voice_toggle,
    voice_toggle + '''

          <div class="live-coach-device-test">
            <button class="btn" id="testLiveCoachVoiceButton" type="button">Test coach voice on this device</button>
            <small>Use this once on Safari or Chrome for macOS. You should hear a short cue followed by a spoken confirmation.</small>
          </div>''',
    "Mac coach voice test",
)
index = re.sub(r"styles-v7\.css\?v=\d+\.\d+\.\d+", "styles-v7.css?v=32.0.0", index)
index = re.sub(r"app-v7\.js\?v=\d+\.\d+\.\d+", "app-v7.js?v=32.0.0", index)
write("index.html", index)


app = read("app-v7-part1.txt")
app = app.replace("url.search = '?v=20260829-31';", "url.search = '?v=20260830-32';")

show_view_old = '''function showView(view) {
  $('#setupView').hidden = view !== 'setup';
  $('#gameView').hidden = view !== 'game';
  $('#insightsView').hidden = view !== 'insights';
  $$('.navbutton').forEach((button) => button.classList.toggle('active', button.dataset.view === view || (view === 'game' && button.dataset.view === 'setup')));
  if (view === 'insights') renderInsights();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}'''
show_view_new = '''function showView(view) {
  const gameMode = view === 'game';
  $('#setupView').hidden = view !== 'setup';
  $('#gameView').hidden = !gameMode;
  $('#insightsView').hidden = view !== 'insights';
  document.documentElement.classList.toggle('kmate-game-mode', gameMode);
  document.body.classList.toggle('kmate-game-mode', gameMode);
  $$('.navbutton').forEach((button) => button.classList.toggle('active', button.dataset.view === view || (gameMode && button.dataset.view === 'setup')));
  if (view === 'insights') renderInsights();
  if (!gameMode && (document.fullscreenElement || document.webkitFullscreenElement)) {
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    try { exit?.call(document); } catch {}
  }
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'auto' }));
  updateGameFullscreenButton();
}'''
app = replace_once(app, show_view_old, show_view_new, "viewport-aware showView")

helpers = r'''
function fullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

function updateGameFullscreenButton() {
  const button = $('#gameFullscreenButton');
  if (!button) return;
  const active = Boolean(fullscreenElement());
  button.textContent = '⛶';
  button.setAttribute('aria-label', active ? 'Exit full screen' : 'Enter full screen');
  button.title = active ? 'Exit full screen' : 'Use the full screen';
  button.classList.toggle('active', active);
}

async function toggleGameFullscreen() {
  try {
    if (fullscreenElement()) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) await exit.call(document);
    } else {
      const target = document.documentElement;
      const request = target.requestFullscreen || target.webkitRequestFullscreen;
      if (!request) {
        toast('Your browser does not expose full-screen mode');
        return false;
      }
      try { await request.call(target, { navigationUI: 'hide' }); }
      catch { await request.call(target); }
    }
    updateGameFullscreenButton();
    return true;
  } catch (error) {
    console.warn('Unable to toggle full screen', error);
    toast('Full screen was blocked by the browser');
    return false;
  }
}

let liveCoachViewportSnapshot = null;

function captureLiveCoachViewport() {
  const rect = $('#boardCoachStage')?.getBoundingClientRect?.();
  liveCoachViewportSnapshot = {
    x: window.scrollX || 0,
    y: window.scrollY || 0,
    stageTop: Number.isFinite(rect?.top) ? rect.top : null,
  };
}

function restoreLiveCoachViewport() {
  const snapshot = liveCoachViewportSnapshot;
  liveCoachViewportSnapshot = null;
  if (!snapshot || document.body.classList.contains('kmate-game-mode')) return;
  const restore = () => {
    const rect = $('#boardCoachStage')?.getBoundingClientRect?.();
    let top = snapshot.y;
    if (Number.isFinite(snapshot.stageTop) && Number.isFinite(rect?.top)) {
      top = Math.max(0, window.scrollY + rect.top - snapshot.stageTop);
    }
    window.scrollTo({ top, left: snapshot.x, behavior: 'auto' });
  };
  window.requestAnimationFrame(() => window.requestAnimationFrame(restore));
}

function primeCoachAudioForMac() {
  try { window.speechSynthesis?.resume?.(); } catch {}
  try {
    const ctx = ensureAudioContext?.();
    if (ctx?.state === 'suspended') ctx.resume?.();
  } catch {}
}

'''
app = replace_once(app, "function showView(view) {", helpers + "function showView(view) {", "fullscreen helpers")

if "let liveCoachSpeechQueue = [];" not in app:
    app = replace_once(
        app,
        "let liveCoachUtterance = null;",
        "let liveCoachUtterance = null;\nlet liveCoachSpeechQueue = [];\nlet liveCoachSpeechQueueIndex = 0;\nlet liveCoachSpeechRunId = 0;\nlet liveCoachSpeechStartTimer = null;\nlet liveCoachVoiceWaitPromise = null;\nlet liveCoachSpeechStarted = false;",
        "voice queue state",
    )

speech_helpers = r'''
function coachSpeechSentences(text, maxLength = 245) {
  const cleaned = String(text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];
  const sentences = cleaned.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [cleaned];
  const chunks = [];
  let current = '';
  for (const sentence of sentences) {
    const next = `${current} ${sentence}`.trim();
    if (current && next.length > maxLength) {
      chunks.push(current);
      current = sentence.trim();
    } else current = next;
  }
  if (current) chunks.push(current);
  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxLength) return [chunk];
    const words = chunk.split(' ');
    const parts = [];
    let part = '';
    for (const word of words) {
      const next = `${part} ${word}`.trim();
      if (part && next.length > maxLength) {
        parts.push(part);
        part = word;
      } else part = next;
    }
    if (part) parts.push(part);
    return parts;
  });
}

function liveCoachSpeechChunks() {
  const rating = $('#liveCoachRating')?.textContent?.trim() || '';
  const yourMove = $('#liveCoachYourMove')?.textContent?.trim() || '';
  const why = $('#liveCoachWhy')?.textContent?.trim() || '';
  const bestMove = $('#liveCoachBestMove')?.textContent?.trim() || '';
  const best = $('#liveCoachBestText')?.textContent?.trim() || '';
  const principles = $('#liveCoachPrinciplesText')?.textContent?.trim() || '';
  const chunks = [
    [rating, yourMove ? `Your move was ${yourMove}.` : ''].filter(Boolean).join('. '),
    why ? `Why the move was suboptimal. ${why}` : '',
    best ? `The stronger move was ${bestMove}. ${best}` : '',
    principles ? `Principle diagnosis. ${principles}` : '',
  ].filter(Boolean);
  return chunks.flatMap((chunk) => coachSpeechSentences(chunk));
}

function waitForCoachVoices(timeout = 1600) {
  if (!window.speechSynthesis) return Promise.resolve([]);
  const available = window.speechSynthesis.getVoices?.() || [];
  if (available.length) return Promise.resolve(available);
  if (liveCoachVoiceWaitPromise) return liveCoachVoiceWaitPromise;
  liveCoachVoiceWaitPromise = new Promise((resolve) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      try { window.speechSynthesis.removeEventListener?.('voiceschanged', finish); } catch {}
      const voices = window.speechSynthesis.getVoices?.() || [];
      liveCoachVoiceWaitPromise = null;
      resolve(voices);
    };
    try { window.speechSynthesis.addEventListener?.('voiceschanged', finish, { once: true }); } catch {}
    window.setTimeout(finish, timeout);
  });
  return liveCoachVoiceWaitPromise;
}

function completeLiveCoachSpeech(runId) {
  if (runId !== liveCoachSpeechRunId) return;
  liveCoachUtterance = null;
  liveCoachSpeechQueue = [];
  liveCoachSpeechQueueIndex = 0;
  liveCoachSpeechStarted = false;
  updateLiveCoachAudioControls('Narration complete. Tap Hear coach to listen again, or Resume game when ready.');
}

function speakNextLiveCoachChunk(runId) {
  if (runId !== liveCoachSpeechRunId || !window.speechSynthesis) return;
  const text = liveCoachSpeechQueue[liveCoachSpeechQueueIndex];
  if (!text) {
    completeLiveCoachSpeech(runId);
    return;
  }
  const utterance = new SpeechSynthesisUtterance(speechFriendlyText(text));
  const voice = chooseCoachVoice();
  utterance.lang = voice?.lang || 'en-GB';
  utterance.rate = Math.max(0.82, Math.min(1.06, Number(settings.coachVoiceRate) || 0.92));
  utterance.pitch = 1;
  utterance.volume = 1;
  if (voice) utterance.voice = voice;
  utterance.onstart = () => {
    if (runId !== liveCoachSpeechRunId) return;
    liveCoachUtterance = utterance;
    liveCoachSpeechStarted = true;
    updateLiveCoachAudioControls(`Speaking ${liveCoachSpeechQueueIndex + 1} of ${liveCoachSpeechQueue.length}…`);
  };
  utterance.onend = () => {
    if (runId !== liveCoachSpeechRunId) return;
    liveCoachUtterance = null;
    liveCoachSpeechQueueIndex += 1;
    window.setTimeout(() => speakNextLiveCoachChunk(runId), 90);
  };
  utterance.onerror = (event) => {
    if (runId !== liveCoachSpeechRunId) return;
    liveCoachUtterance = null;
    const reason = String(event?.error || 'speech error');
    if (['canceled', 'interrupted'].includes(reason)) return;
    updateLiveCoachAudioControls('Automatic narration was blocked. Tap Hear coach to play it directly.');
  };
  liveCoachUtterance = utterance;
  try {
    window.speechSynthesis.resume?.();
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.warn('Live Coach speech failed to start', error);
    updateLiveCoachAudioControls('Automatic narration was blocked. Tap Hear coach to play it directly.');
  }
}

async function startLiveCoachSpeech(chunks, { force = false, test = false } = {}) {
  if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') {
    updateLiveCoachAudioControls('Voice is unavailable in this browser. The written review remains active.');
    return false;
  }
  if (!force && settings.coachVoice === false) {
    updateLiveCoachAudioControls('Voice is off. Tap Voice on or Hear coach to listen.');
    return false;
  }
  const prepared = chunks.flatMap((chunk) => coachSpeechSentences(chunk)).filter(Boolean);
  if (!prepared.length) return false;
  if (liveCoachSpeechStartTimer) window.clearTimeout(liveCoachSpeechStartTimer);
  liveCoachSpeechRunId += 1;
  const runId = liveCoachSpeechRunId;
  liveCoachSpeechQueue = prepared;
  liveCoachSpeechQueueIndex = 0;
  liveCoachSpeechStarted = false;
  try { window.speechSynthesis.cancel(); } catch {}
  try { window.speechSynthesis.resume?.(); } catch {}
  updateLiveCoachAudioControls(test ? 'Starting the macOS coach-voice test…' : 'Starting Live Coach narration…');
  await waitForCoachVoices();
  if (runId !== liveCoachSpeechRunId) return false;
  liveCoachSpeechStartTimer = window.setTimeout(() => {
    liveCoachSpeechStartTimer = null;
    speakNextLiveCoachChunk(runId);
  }, 110);
  window.setTimeout(() => {
    if (runId === liveCoachSpeechRunId && !liveCoachSpeechStarted && liveCoachSpeechQueue.length) {
      updateLiveCoachAudioControls('macOS has not started automatic speech. Tap Hear coach to play it directly.');
    }
  }, 1300);
  return true;
}

async function testLiveCoachVoice() {
  settings.coachVoice = true;
  const setup = $('#liveCoachVoice');
  if (setup) setup.checked = true;
  saveStore();
  primeCoachAudioForMac();
  playLiveCoachCue();
  const started = await startLiveCoachSpeech([
    'K-Mate Live Coach is ready on this Mac.',
    'During a review I will explain your move, the stronger alternative, and the chess principle to remember.',
  ], { force: true, test: true });
  toast(started ? 'Coach voice test started' : 'Coach voice is unavailable in this browser');
}

'''
if "function coachSpeechSentences(" not in app:
    app = replace_once(app, "function stopLiveCoachSpeech()", speech_helpers + "function stopLiveCoachSpeech()", "speech reliability helpers")

app = replace_function(app, "stopLiveCoachSpeech", r'''function stopLiveCoachSpeech() {
  liveCoachSpeechRunId += 1;
  if (liveCoachSpeechStartTimer) window.clearTimeout(liveCoachSpeechStartTimer);
  liveCoachSpeechStartTimer = null;
  liveCoachSpeechQueue = [];
  liveCoachSpeechQueueIndex = 0;
  liveCoachSpeechStarted = false;
  try { window.speechSynthesis?.cancel(); } catch {}
  liveCoachUtterance = null;
  updateLiveCoachAudioControls();
}''')
app = replace_function(app, "liveCoachSpeechText", r'''function liveCoachSpeechText() {
  return liveCoachSpeechChunks().join(' ');
}''')
app = replace_function(app, "speakLiveCoach", r'''async function speakLiveCoach(force = false) {
  primeCoachAudioForMac();
  return startLiveCoachSpeech(liveCoachSpeechChunks(), { force });
}''')

app = replace_once(
    app,
    '''function queueLiveCoachReview(moveRecord) {
  resetLiveCoachFlow({ closePanel: true });
  pauseClockForTeaching();''',
    '''function queueLiveCoachReview(moveRecord) {
  captureLiveCoachViewport();
  resetLiveCoachFlow({ closePanel: true });
  pauseClockForTeaching();''',
    "capture viewport before Live Coach",
)
scroll_call = "  $('#boardCoachStage')?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });\n"
if scroll_call not in app:
    raise RuntimeError("Missing Live Coach scrollIntoView call")
app = app.replace(scroll_call, "", 1)

app = replace_once(
    app,
    '''function continueAfterLiveCoach({ automatic = false } = {}) {
  const hadTeachingPause = liveCoachState.awaiting || liveCoachState.open || clockPaused;
  resetLiveCoachFlow({ closeModal: true });
  if (!hadTeachingPause || finalized || !game) return;
  resumeClockFromTeaching();
  setStatus(automatic ? 'Play resumed. Opponent is considering the position.' : 'Coach review complete. Opponent is considering the position.', 'thinking');
  renderAll();
  if (!game.isGameOver() && game.turn() === engineColor) askEngine();
}''',
    '''function continueAfterLiveCoach({ automatic = false } = {}) {
  const hadTeachingPause = liveCoachState.awaiting || liveCoachState.open || clockPaused;
  try { $('#board')?.focus?.({ preventScroll: true }); } catch {}
  resetLiveCoachFlow({ closeModal: true });
  if (!hadTeachingPause || finalized || !game) return;
  resumeClockFromTeaching();
  setStatus(automatic ? 'Play resumed. Opponent is considering the position.' : 'Coach review complete. Opponent is considering the position.', 'thinking');
  renderAll();
  restoreLiveCoachViewport();
  if (!game.isGameOver() && game.turn() === engineColor) askEngine();
}''',
    "scroll-stable Resume game",
)
write("app-v7-part1.txt", app)


part6 = read("app-v7-part6.txt")
part6 = replace_once(
    part6,
    "  $('#flipButton').addEventListener('click', () => { orientation = orientation === 'w' ? 'b' : 'w'; renderBoard(); });",
    "  $('#flipButton').addEventListener('click', () => { orientation = orientation === 'w' ? 'b' : 'w'; renderBoard(); });\n  $('#gameFullscreenButton')?.addEventListener('click', toggleGameFullscreen);",
    "fullscreen event binding",
)
part6 = replace_once(
    part6,
    "  $('#liveCoachVoiceToggle')?.addEventListener('click', toggleLiveCoachVoice);",
    "  $('#liveCoachVoiceToggle')?.addEventListener('click', toggleLiveCoachVoice);\n  $('#testLiveCoachVoiceButton')?.addEventListener('click', testLiveCoachVoice);",
    "Mac voice test binding",
)
part6 = replace_once(
    part6,
    '''populateOpenings();
populateSoundProfiles();''',
    '''document.addEventListener('pointerdown', primeCoachAudioForMac, { once: true, capture: true });
document.addEventListener('fullscreenchange', updateGameFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateGameFullscreenButton);

populateOpenings();
populateSoundProfiles();''',
    "audio primer and fullscreen listeners",
)
part6 = part6.replace("version: '31.0-commercial-beta'", "version: '32.0-commercial-beta'")
part6 = replace_once(
    part6,
    "liveCoach: { awaiting: liveCoachState.awaiting, open: liveCoachState.open, inline: true, autoResume: false,",
    "liveCoach: { awaiting: liveCoachState.awaiting, open: liveCoachState.open, inline: true, autoResume: false, speechQueueLength: liveCoachSpeechQueue.length, speechQueueIndex: liveCoachSpeechQueueIndex, speechStarted: liveCoachSpeechStarted,",
    "speech state diagnostics",
)
write("app-v7-part6.txt", part6)


loader = read("app-v7.js")
loader = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=32.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=32.0.0", loader)
write("app-v7.js", loader)


styles = read("styles-v7.css")
styles += r'''

/* K-Mate v32 — viewport-fitted desktop play, stable Live Coach resume, and macOS voice test */
.playtop-actions{display:flex;align-items:center;gap:7px}
#gameFullscreenButton.active{border-color:#b7ef75aa;background:#b7ef7520;color:#d9ffad}
.live-coach-device-test{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:-2px 0 14px;padding:10px 12px;border:1px solid #70b8ff2d;border-radius:13px;background:#70b8ff0a}
.live-coach-device-test .btn{flex:0 0 auto;min-height:38px}
.live-coach-device-test small{color:#aebbb2;line-height:1.35}

@media(min-width:781px){
  html.kmate-game-mode,body.kmate-game-mode{height:100%;overflow:hidden!important;overscroll-behavior:none}
  body.kmate-game-mode #gameView{position:fixed!important;inset:0!important;z-index:10000!important;display:flex!important;flex-direction:column;width:100dvw!important;height:100dvh!important;max-width:none!important;margin:0!important;padding:max(7px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(7px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left))!important;overflow:hidden!important;background:radial-gradient(circle at 12% 0,#20311f 0,transparent 34rem),#090e0b}
  body.kmate-game-mode #gameView .playtop{flex:0 0 44px;min-height:44px;margin:0 0 5px;align-items:center}
  body.kmate-game-mode #gameView .playtop h1{font-size:clamp(20px,2.1vw,30px);line-height:1;margin:1px 0 0}
  body.kmate-game-mode #gameView .playtop .eyebrow{font-size:9px}
  body.kmate-game-mode #gameView .playgrid{flex:1 1 auto;min-height:0;height:auto;grid-template-columns:minmax(0,1fr) minmax(280px,340px);gap:10px;align-items:stretch}
  body.kmate-game-mode #gameView .boardcol{display:flex;flex-direction:column;min-width:0;min-height:0;height:100%}
  body.kmate-game-mode #gameView .playerbar{flex:0 0 auto;min-height:46px;padding:6px 10px}
  body.kmate-game-mode #gameView .playerbar .avatar{width:34px;height:34px;font-size:22px}
  body.kmate-game-mode #gameView .clock{min-width:78px;padding:4px 8px;font-size:22px}
  body.kmate-game-mode #gameView .hint-card{flex:0 0 auto;max-height:62px;margin:4px 0;padding:7px 10px;overflow:auto}
  body.kmate-game-mode #gameView .hint-card p{margin:3px 0;font-size:10px;line-height:1.25}
  body.kmate-game-mode #gameView #boardCoachStage{flex:1 1 auto;min-height:0;display:grid;place-items:center;overflow:hidden}
  body.kmate-game-mode #gameView #boardCoachStage:not(.coach-open){grid-template-columns:minmax(0,1fr)}
  body.kmate-game-mode #gameView #boardCoachStage:not(.coach-open) .live-boardwrap{width:min(100%,calc(100dvh - 220px),820px);height:auto;aspect-ratio:1;max-height:100%;margin:auto;padding:4px}
  body.kmate-game-mode #gameView .live-boardwrap #board{width:100%;height:100%;aspect-ratio:1}
  body.kmate-game-mode #gameView .status{flex:0 0 auto;min-height:32px;margin-top:4px;padding:5px 9px;font-size:10px}
  body.kmate-game-mode #gameView .sidepanel{display:flex;flex-direction:column;min-height:0;height:100%;overflow:hidden}
  body.kmate-game-mode #gameView .sidepanel .sidebody{flex:1 1 auto;min-height:0;overflow:auto;padding-bottom:10px}
  body.kmate-game-mode #gameView .sidepanel .tools{flex:0 0 auto}
  body.kmate-game-mode #gameView.live-coach-active .playgrid{grid-template-columns:minmax(0,1fr)}
  body.kmate-game-mode #gameView.live-coach-active .sidepanel{display:none}
  body.kmate-game-mode #gameView.live-coach-active .hint-card{display:none}
  body.kmate-game-mode #gameView.live-coach-active .status{display:none}
  body.kmate-game-mode #gameView.live-coach-active #boardCoachStage{width:100%;height:100%;min-height:0;grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:10px;padding:8px;align-items:stretch}
  body.kmate-game-mode #gameView.live-coach-active .live-boardwrap{align-self:center;justify-self:center;width:min(100%,calc(100dvh - 165px),780px);height:auto;max-height:100%;aspect-ratio:1;margin:0}
  body.kmate-game-mode #gameView.live-coach-active .live-coach-board-panel{width:100%;height:100%;min-height:0;max-height:none;overflow:auto}
}

@media(max-width:780px){
  .live-coach-device-test{align-items:flex-start;flex-direction:column}
  .live-coach-device-test .btn{width:100%}
}
/* End K-Mate v32 */
'''
write("styles-v7.css", styles)
