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


# ---------------------------------------------------------------------------
# Markup: viewport controls, direct coach-audio test, and mobile panel drawer.
# ---------------------------------------------------------------------------
index_path = ROOT / "index.html"
index = read(index_path)

old_play_actions = '''        <button class="roundbtn" id="flipButton" type="button" aria-label="Flip board">⇅</button>'''
new_play_actions = '''        <div class="play-actions" aria-label="Game view controls">
          <button class="roundbtn game-coach-audio-button" id="gameCoachAudioButton" type="button" aria-label="Test coach voice" title="Test coach voice">🔊</button>
          <button class="roundbtn panel-toggle-button" id="panelToggleButton" type="button" aria-label="Open game details" aria-expanded="false" title="Game details">☰</button>
          <button class="roundbtn fullscreen-button" id="fullscreenButton" type="button" aria-label="Enter full screen" aria-pressed="false" title="Enter full screen">⛶</button>
          <button class="roundbtn" id="flipButton" type="button" aria-label="Flip board" title="Flip board">⇅</button>
        </div>'''
index = replace_once(index, old_play_actions, new_play_actions, "game view action buttons")

old_game_end = '''        </aside>
      </div>
    </section>

    <section class="view" id="insightsView" hidden>'''
new_game_end = '''        </aside>
        <button class="game-panel-backdrop" id="gamePanelBackdrop" type="button" aria-label="Close game details" hidden></button>
      </div>
    </section>

    <section class="view" id="insightsView" hidden>'''
index = replace_once(index, old_game_end, new_game_end, "mobile game panel backdrop")

index = re.sub(r"styles-v7\.css\?v=\d+\.\d+\.\d+", "styles-v7.css?v=33.0.0", index)
index = re.sub(r"app-v7\.js\?v=\d+\.\d+\.\d+", "app-v7.js?v=33.0.0", index)
write(index_path, index)


# ---------------------------------------------------------------------------
# Runtime: lock the game into the viewport, fit the board, retain an optional
# native full-screen/focus mode, and prime macOS speech from a direct gesture.
# ---------------------------------------------------------------------------
app_path = ROOT / "app-v7-part1.txt"
app = read(app_path)
app = app.replace("url.search = '?v=20260830-32';", "url.search = '?v=20260830-33';")

variable_marker = "let liveCoachViewportRestoreSerial = 0;\n"
variable_addition = variable_marker + '''let coachSessionPrimeAttempted = false;
let coachSessionPrimeUtterance = null;
let gamePanelOpen = false;
let gameBoardFitSerial = 0;
'''
app = replace_once(app, variable_marker, variable_addition, "v33 runtime variables")

old_show_view = '''function showView(view) {
  $('#setupView').hidden = view !== 'setup';
  $('#gameView').hidden = view !== 'game';
  $('#insightsView').hidden = view !== 'insights';
  $$('.navbutton').forEach((button) => button.classList.toggle('active', button.dataset.view === view || (view === 'game' && button.dataset.view === 'setup')));
  if (view === 'insights') renderInsights();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
'''
new_show_view = '''function fitGameBoardToViewport() {
  if (!document.body.classList.contains('game-mode')) return;
  const stage = $('#boardCoachStage');
  const wrap = stage?.querySelector('.live-boardwrap');
  if (!stage || !wrap || stage.offsetParent === null) return;
  const serial = ++gameBoardFitSerial;
  window.requestAnimationFrame(() => {
    if (serial !== gameBoardFitSerial || !document.body.classList.contains('game-mode')) return;
    const style = getComputedStyle(stage);
    const coachOpen = Boolean(liveCoachState.awaiting || liveCoachState.open || $('#gameView')?.classList.contains('live-coach-active'));
    const stacked = coachOpen && window.matchMedia('(max-width:760px)').matches;
    const gap = Number.parseFloat(stacked ? style.rowGap : style.columnGap) || 0;
    let availableWidth = Math.max(0, stage.clientWidth);
    let availableHeight = Math.max(0, stage.clientHeight);
    if (coachOpen) {
      if (stacked) availableHeight = Math.max(0, (availableHeight - gap) / 2);
      else availableWidth = Math.max(0, (availableWidth - gap) / 2);
    }
    const size = Math.max(120, Math.floor(Math.min(availableWidth, availableHeight)));
    wrap.style.setProperty('--kmate-board-size', `${size}px`);
  });
}

function syncGameViewportLayout() {
  const viewportHeight = Math.max(320, Math.round(window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0));
  document.documentElement.style.setProperty('--kmate-game-height', `${viewportHeight}px`);
  fitGameBoardToViewport();
}

function setGamePanelOpen(open = !gamePanelOpen) {
  const narrow = window.matchMedia('(max-width:980px)').matches;
  gamePanelOpen = Boolean(open && narrow && document.body.classList.contains('game-mode'));
  document.body.classList.toggle('game-panel-open', gamePanelOpen);
  const button = $('#panelToggleButton');
  if (button) {
    button.setAttribute('aria-expanded', String(gamePanelOpen));
    button.title = gamePanelOpen ? 'Close game details' : 'Game details';
  }
  const backdrop = $('#gamePanelBackdrop');
  if (backdrop) backdrop.hidden = !gamePanelOpen;
  fitGameBoardToViewport();
}

function fullscreenOrFocusActive() {
  return Boolean(document.fullscreenElement || document.body.classList.contains('board-focus'));
}

function updateFullscreenControl() {
  const button = $('#fullscreenButton');
  if (!button) return;
  const active = fullscreenOrFocusActive();
  button.classList.toggle('active', active);
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active ? 'Exit full screen' : 'Enter full screen');
  button.title = active ? 'Exit full screen' : 'Enter full screen';
}

async function toggleGameFullscreen() {
  if (!document.body.classList.contains('game-mode')) return;
  if (fullscreenOrFocusActive()) {
    if (document.fullscreenElement) {
      try { await document.exitFullscreen?.(); } catch {}
    }
    document.body.classList.remove('board-focus');
    updateFullscreenControl();
    syncGameViewportLayout();
    return;
  }

  setGamePanelOpen(false);
  document.body.classList.add('board-focus');
  updateFullscreenControl();
  syncGameViewportLayout();
  try {
    if (document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch (error) {
    console.info('Native full screen was unavailable; K-Mate kept the expanded focus layout.', error);
    toast('Board focus mode is on');
  }
  updateFullscreenControl();
  syncGameViewportLayout();
}

function handleGameFullscreenChange() {
  if (!document.fullscreenElement) document.body.classList.remove('board-focus');
  updateFullscreenControl();
  syncGameViewportLayout();
}

function showView(view) {
  const gameMode = view === 'game';
  if (!gameMode) {
    setGamePanelOpen(false);
    document.body.classList.remove('board-focus');
    if (document.fullscreenElement) {
      try { document.exitFullscreen?.().catch(() => {}); } catch {}
    }
  }
  document.documentElement.classList.toggle('game-mode', gameMode);
  document.body.classList.toggle('game-mode', gameMode);
  $('#setupView').hidden = view !== 'setup';
  $('#gameView').hidden = !gameMode;
  $('#insightsView').hidden = view !== 'insights';
  $$('.navbutton').forEach((button) => button.classList.toggle('active', button.dataset.view === view || (gameMode && button.dataset.view === 'setup')));
  if (view === 'insights') renderInsights();
  window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  syncGameViewportLayout();
  updateFullscreenControl();
}
'''
app = replace_once(app, old_show_view, new_show_view, "viewport-fitted showView")

# Keep the document locked at zero while the game itself is viewport-fitted.
app = replace_once(
    app,
    "function captureBoardViewportAnchor() {\n  const board = $('#board');",
    "function captureBoardViewportAnchor() {\n  if (document.body.classList.contains('game-mode')) return { locked: true, top: 0, scrollY: 0, visible: true };\n  const board = $('#board');",
    "game-mode viewport capture guard",
)
app = replace_once(
    app,
    "function restoreBoardViewportAnchor(anchor) {\n  if (!anchor) return;",
    "function restoreBoardViewportAnchor(anchor) {\n  if (!anchor) return;\n  if (anchor.locked || document.body.classList.contains('game-mode')) {\n    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });\n    fitGameBoardToViewport();\n    return;\n  }",
    "game-mode viewport restore guard",
)

# Add a short, audible, direct-gesture speech prime. This is deliberately much
# shorter than the diagnostic test and runs once per page session.
prime_marker = "function captureBoardViewportAnchor() {"
prime_function = '''function primeCoachVoiceOnSessionStart() {
  if (coachSessionPrimeAttempted || settings.coachVoice === false || !coachVoiceAvailable()) return false;
  coachSessionPrimeAttempted = true;
  primeCoachAudioFromGesture();
  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance('Coach voice ready.');
  const voice = chooseCoachVoice();
  utterance.lang = voice?.lang || 'en-GB';
  utterance.rate = 0.98;
  utterance.pitch = 1;
  utterance.volume = 0.92;
  if (voice) utterance.voice = voice;
  utterance.onstart = () => {
    coachSessionPrimeUtterance = utterance;
    coachAudioReady = true;
    setCoachAudioDeviceStatus(`Coach voice ready${voice?.name ? ` · ${voice.name}` : ''}.`, 'speaking');
  };
  utterance.onend = () => {
    coachSessionPrimeUtterance = null;
    coachAudioReady = true;
    setCoachAudioDeviceStatus(`Coach audio ready${voice?.name ? ` · ${voice.name}` : ''}.`, 'ready');
  };
  utterance.onerror = (event) => {
    coachSessionPrimeUtterance = null;
    coachSessionPrimeAttempted = false;
    setCoachAudioDeviceStatus(`The Mac blocked the automatic voice check${event?.error ? ` (${event.error})` : ''}. Press the 🔊 coach button once.`, 'error');
  };
  coachSessionPrimeUtterance = utterance;
  try {
    synth.resume?.();
    synth.speak(utterance);
  } catch (error) {
    coachSessionPrimeUtterance = null;
    coachSessionPrimeAttempted = false;
    setCoachAudioDeviceStatus('The Mac blocked the automatic voice check. Press the 🔊 coach button once.', 'error');
    console.warn('Session coach voice prime failed.', error);
  }
  return true;
}

'''
app = replace_once(app, prime_marker, prime_function + prime_marker, "audible Mac coach prime")

# Reflect audio readiness in the always-visible game toolbar button.
old_audio_status_tail = '''  for (const selector of ['#coachVoiceSetupStatus', '#coachReplayAudioStatus']) {
    const element = $(selector);
    if (!element) continue;
    element.textContent = message;
    element.dataset.state = state;
  }
}
'''
new_audio_status_tail = '''  for (const selector of ['#coachVoiceSetupStatus', '#coachReplayAudioStatus']) {
    const element = $(selector);
    if (!element) continue;
    element.textContent = message;
    element.dataset.state = state;
  }
  const gameButton = $('#gameCoachAudioButton');
  if (gameButton) {
    const ready = available && enabled && (coachAudioReady || state === 'ready' || state === 'speaking');
    gameButton.classList.toggle('audio-ready', ready);
    gameButton.classList.toggle('audio-error', state === 'error');
    gameButton.textContent = ready ? '🔊' : '▶';
    gameButton.title = ready ? 'Coach voice ready — play test' : 'Test coach voice';
    gameButton.setAttribute('aria-label', gameButton.title);
  }
}
'''
app = replace_once(app, old_audio_status_tail, new_audio_status_tail, "game coach audio status")

# Keep board fitting current after every render and every Live Coach transition.
render_all_marker = "  $('#takebackButton').disabled = thinking || finalized || principleReviewPending || liveCoachState.awaiting || liveCoachState.open || !game?.history().length;\n}"
render_all_replacement = "  $('#takebackButton').disabled = thinking || finalized || principleReviewPending || liveCoachState.awaiting || liveCoachState.open || !game?.history().length;\n  fitGameBoardToViewport();\n}"
app = replace_once(app, render_all_marker, render_all_replacement, "board fit after render")

old_live_open = '''function setLiveCoachBoardOpen(open) {
  const visible = Boolean(open);
  const panel = $('#liveCoachBoardPanel');
  if (panel) panel.hidden = !visible;
  $('#gameView')?.classList.toggle('live-coach-active', visible);
  $('#boardCoachStage')?.classList.toggle('coach-open', visible);
}
'''
new_live_open = '''function setLiveCoachBoardOpen(open) {
  const visible = Boolean(open);
  if (visible) setGamePanelOpen(false);
  const panel = $('#liveCoachBoardPanel');
  if (panel) panel.hidden = !visible;
  $('#gameView')?.classList.toggle('live-coach-active', visible);
  $('#boardCoachStage')?.classList.toggle('coach-open', visible);
  syncGameViewportLayout();
}
'''
app = replace_once(app, old_live_open, new_live_open, "live coach viewport fitting")

# Make the short Live Coach cue more audible after the board gesture unlocks WebAudio.
app = replace_once(
    app,
    "  scheduleChessKnock(ctx, now, 0.12, 0.022, 3100);\n  scheduleChessKnock(ctx, now + 0.070, 0.16, 0.028, 2500);\n  scheduleChessTone(ctx, now + 0.095, 520, 690, 0.048, 0.095, 'sine');\n  scheduleChessTone(ctx, now + 0.178, 690, 820, 0.040, 0.105, 'sine');",
    "  scheduleChessKnock(ctx, now, 0.18, 0.022, 3300);\n  scheduleChessKnock(ctx, now + 0.070, 0.24, 0.030, 2700);\n  scheduleChessTone(ctx, now + 0.095, 520, 690, 0.065, 0.095, 'sine');\n  scheduleChessTone(ctx, now + 0.178, 690, 820, 0.055, 0.105, 'sine');",
    "audible Live Coach cue",
)

# Game toolbar and direct-gesture event wiring.
app = replace_once(
    app,
    "  $('#startButton').addEventListener('click', () => startPosition());",
    "  $('#startButton').addEventListener('click', () => { primeCoachVoiceOnSessionStart(); startPosition(); });",
    "start-button coach prime",
)
flip_binding = '''  $('#flipButton').addEventListener('click', () => {
    orientation = orientation === 'w' ? 'b' : 'w';
    renderBoard();
  });
'''
expanded_bindings = flip_binding + '''  $('#gameCoachAudioButton')?.addEventListener('click', testCoachVoice);
  $('#fullscreenButton')?.addEventListener('click', toggleGameFullscreen);
  $('#panelToggleButton')?.addEventListener('click', () => setGamePanelOpen());
  $('#gamePanelBackdrop')?.addEventListener('click', () => setGamePanelOpen(false));
  $('#board')?.addEventListener('pointerdown', primeCoachAudioFromGesture, { passive: true });
  window.addEventListener('resize', syncGameViewportLayout, { passive: true });
  window.visualViewport?.addEventListener?.('resize', syncGameViewportLayout, { passive: true });
  document.addEventListener('fullscreenchange', handleGameFullscreenChange);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && gamePanelOpen) setGamePanelOpen(false);
  });
'''
app = replace_once(app, flip_binding, expanded_bindings, "game viewport control bindings")

app = app.replace(
    "for (const selector of ['#startButton', '#startRecommendedButton', '#coachSpeakButton', '#liveCoachSpeakButton', '#resultReplay']) {",
    "for (const selector of ['#startButton', '#startRecommendedButton', '#coachSpeakButton', '#liveCoachSpeakButton', '#resultReplay', '#gameCoachAudioButton', '#board']) {",
    1,
)
write(app_path, app)


# ---------------------------------------------------------------------------
# Debug state/version and initialization.
# ---------------------------------------------------------------------------
part6_path = ROOT / "app-v7-part6.txt"
part6 = read(part6_path)
part6 = part6.replace("version: '32.0-commercial-beta'", "version: '33.0-commercial-beta'")
part6 = replace_once(
    part6,
    "    coachAudio: { ready: coachAudioReady, state: coachAudioDeviceState, message: coachAudioDeviceMessage, macLike: isMacLikeDevice(), selectedVoice: chooseCoachVoice()?.name || null },",
    "    coachAudio: { ready: coachAudioReady, state: coachAudioDeviceState, message: coachAudioDeviceMessage, macLike: isMacLikeDevice(), selectedVoice: chooseCoachVoice()?.name || null, sessionPrimeAttempted: coachSessionPrimeAttempted },\n    layout: { gameMode: document.body.classList.contains('game-mode'), focusMode: document.body.classList.contains('board-focus'), fullscreen: Boolean(document.fullscreenElement), panelOpen: gamePanelOpen, viewportHeight: window.visualViewport?.height || window.innerHeight, documentScrollHeight: document.documentElement.scrollHeight, scrollY: window.scrollY },",
    "v33 layout debug state",
)
part6 = replace_once(
    part6,
    "bindControls();\nrenderSummary();",
    "bindControls();\nsyncGameViewportLayout();\nrenderSummary();",
    "initial viewport synchronization",
)
part6 = replace_once(
    part6,
    "    boardViewport: () => { const rect = $('#board')?.getBoundingClientRect(); return rect ? { top: rect.top, bottom: rect.bottom, scrollY: window.scrollY } : null; },",
    "    boardViewport: () => { const rect = $('#board')?.getBoundingClientRect(); return rect ? { top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, scrollY: window.scrollY } : null; },\n    fitViewport: () => { syncGameViewportLayout(); return window.__KMATE__.state().layout; },",
    "v33 viewport test helper",
)
write(part6_path, part6)


# ---------------------------------------------------------------------------
# Loader cache versions.
# ---------------------------------------------------------------------------
loader_path = ROOT / "app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=33.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=33.0.0", loader)
write(loader_path, loader)


# ---------------------------------------------------------------------------
# Styles: the game view fills the browser window by default. The document never
# needs to scroll; details and coaching scroll only inside their own panels.
# ---------------------------------------------------------------------------
styles_path = ROOT / "styles-v7.css"
styles = read(styles_path)
styles += r'''

/* K-Mate v33 — viewport-fitted board, true full screen, and Mac audio controls */
html.game-mode,body.game-mode{width:100%;height:100%;overflow:hidden!important;overscroll-behavior:none}
body.game-mode .appbar{display:none}
body.game-mode .shell{width:100%;height:var(--kmate-game-height,100dvh);margin:0;padding:0;overflow:hidden}
body.game-mode #gameView{display:grid;grid-template-rows:auto minmax(0,1fr);gap:6px;width:100%;height:100%;min-height:0;padding:max(6px,env(safe-area-inset-top)) 10px max(6px,env(safe-area-inset-bottom));overflow:hidden}
body.game-mode #gameView[hidden]{display:none!important}
body.game-mode .playtop{min-height:42px;margin:0;padding:0 2px}
body.game-mode .playtop h1{margin-top:2px;font-size:clamp(20px,2.35vw,31px);line-height:1.05}
body.game-mode .playtop .eyebrow{font-size:9px;letter-spacing:.11em}
.play-actions{display:flex;align-items:center;justify-content:flex-end;gap:6px}
body.game-mode .roundbtn{width:40px;height:40px;border-radius:12px;font-size:18px}
.panel-toggle-button{display:none}
.fullscreen-button.active{border-color:#b9f47488;background:#b9f4741b;color:var(--accent);box-shadow:inset 0 0 0 1px #b9f47424}
.game-coach-audio-button.audio-ready{border-color:#80d8a477;background:#80d8a418;color:#c8f8dd;box-shadow:0 0 0 2px #80d8a40d}
.game-coach-audio-button.audio-error{border-color:#ff8e8670;background:#ff8e8613;color:#ffc0ba}

body.game-mode .playgrid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,340px);gap:10px;align-items:stretch;width:100%;height:100%;min-height:0;overflow:hidden}
body.game-mode .boardcol{display:grid;grid-template-rows:auto auto minmax(0,1fr) auto auto;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden}
body.game-mode .playerbar{min-height:48px;padding:5px 9px}
body.game-mode .avatar{width:34px;height:34px;border-radius:10px;font-size:22px}
body.game-mode .identity{gap:7px}
body.game-mode .identity small{font-size:9px}
body.game-mode .clock-wrap{gap:6px}
body.game-mode .turnpill{padding:4px 7px;font-size:9px}
body.game-mode .materialpill{min-width:36px;padding:4px 6px;font-size:9px}
body.game-mode .clock{min-width:78px;padding:5px 8px;font-size:21px}
body.game-mode .board-hint{min-height:0;padding:6px 9px}
body.game-mode .board-hint .hint-head b{font-size:11px}
body.game-mode .board-hint p{margin-top:3px!important;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:9.5px!important;line-height:1.25}
body.game-mode .board-hint .hint-mode-label{display:none}
body.game-mode .hint-action{min-height:29px;padding:0 8px;font-size:9px}
body.game-mode .board-coach-stage{display:grid;grid-template-columns:minmax(0,1fr);place-items:center;width:100%;height:100%;min-width:0;min-height:0;padding:4px;overflow:hidden}
body.game-mode .live-boardwrap{display:flex;align-items:center;justify-content:center;width:var(--kmate-board-size,min(100%,70dvh));height:var(--kmate-board-size,min(100%,70dvh));max-width:100%;max-height:100%;padding:3px;border:1px solid #ffffff18;border-radius:12px;background:#0c140e;box-shadow:0 18px 52px #0009}
body.game-mode .live-boardwrap #board{width:100%;height:100%;aspect-ratio:1;border-radius:8px}
body.game-mode .status{min-height:34px;margin-top:4px;padding:5px 9px;font-size:10px}
body.game-mode .statusdot{width:7px;height:7px}

body.game-mode .sidepanel{position:static;display:flex;height:100%;min-height:0;flex-direction:column;overflow:hidden;border-radius:16px}
body.game-mode .sidebody{flex:1 1 auto;min-height:0;padding:14px;overflow:auto;overscroll-behavior:contain}
body.game-mode .sidepanel h2{margin:8px 0 4px;font-size:20px}
body.game-mode .sidepanel p{font-size:11px;line-height:1.38}
body.game-mode .tag-row{margin-top:8px}
body.game-mode .brief{margin-top:8px;padding:10px;border-radius:12px}
body.game-mode .live-quality{margin-top:8px}
body.game-mode .moves{display:flex;min-height:0;flex-direction:column;margin-top:9px}
body.game-mode .movelist{min-height:72px;max-height:none;overflow:auto;overscroll-behavior:contain}
body.game-mode .sessionnote{margin-top:7px;font-size:9px}
body.game-mode .tools{flex:0 0 auto;padding:8px;gap:6px}
body.game-mode .tool{min-height:36px;font-size:10px}
.game-panel-backdrop{display:none}

body.game-mode .live-coach-active .playgrid{grid-template-columns:minmax(0,1fr)}
body.game-mode .live-coach-active .sidepanel{display:none}
body.game-mode .live-coach-active .boardcol{max-width:none}
body.game-mode .live-coach-active .board-coach-stage{grid-template-columns:minmax(0,1fr) minmax(0,1fr);grid-template-rows:minmax(0,1fr);gap:8px;place-items:stretch;padding:5px}
body.game-mode .live-coach-active .live-boardwrap{align-self:center;justify-self:center}
body.game-mode .live-coach-active .live-coach-board-panel{width:100%;height:100%;min-height:0;max-height:none;padding:12px;overflow:auto;overscroll-behavior:contain}
body.game-mode .live-coach-active .hint-card{display:none}
body.game-mode .live-coach-active .live-coach-actions{bottom:-12px}

body.game-mode.board-focus .playgrid{grid-template-columns:minmax(0,1fr)}
body.game-mode.board-focus .sidepanel{display:none}
body.game-mode.board-focus .boardcol{max-width:none}
body.game-mode.board-focus .playtop h1{font-size:22px}

@media(max-width:980px){
  body.game-mode .playgrid{grid-template-columns:minmax(0,1fr)}
  body.game-mode .panel-toggle-button{display:grid}
  body.game-mode .sidepanel{position:fixed;top:8px;right:8px;bottom:8px;z-index:76;width:min(360px,calc(100vw - 24px));height:auto;transform:translateX(calc(100% + 24px));transition:transform .2s ease;box-shadow:0 28px 90px #000d}
  body.game-mode.game-panel-open .sidepanel{transform:translateX(0)}
  body.game-mode .game-panel-backdrop{position:fixed;inset:0;z-index:75;border:0;background:#0009;cursor:pointer}
  body.game-mode.game-panel-open .game-panel-backdrop{display:block}
}

@media(max-width:760px){
  body.game-mode #gameView{gap:4px;padding:max(4px,env(safe-area-inset-top)) 5px max(4px,env(safe-area-inset-bottom))}
  body.game-mode .playtop{min-height:38px}
  body.game-mode .playtop .left{gap:6px}
  body.game-mode .playtop h1{font-size:17px}
  body.game-mode .playtop .eyebrow{font-size:7px}
  body.game-mode .roundbtn{width:34px;height:34px;border-radius:10px;font-size:15px}
  body.game-mode .play-actions{gap:3px}
  body.game-mode .boardcol{grid-template-rows:auto auto minmax(0,1fr) auto}
  body.game-mode .playerbar{min-height:43px;padding:4px 6px}
  body.game-mode .avatar{width:30px;height:30px;font-size:19px}
  body.game-mode .identity b{font-size:11px}
  body.game-mode .identity small{display:none}
  body.game-mode .clock{min-width:66px;padding:4px 6px;font-size:17px}
  body.game-mode .materialpill{min-width:30px;font-size:8px}
  body.game-mode .turnpill{display:none}
  body.game-mode .board-hint{padding:4px 6px}
  body.game-mode .board-hint p{display:none}
  body.game-mode .board-hint .hint-head b{font-size:9.5px}
  body.game-mode .hint-action{min-height:25px;font-size:8px}
  body.game-mode .board-coach-stage{padding:2px}
  body.game-mode .live-boardwrap{padding:2px;border-radius:8px}
  body.game-mode .status{display:none}
  body.game-mode .live-coach-active .boardcol{grid-template-rows:auto minmax(0,1fr) auto}
  body.game-mode .live-coach-active .board-coach-stage{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) minmax(0,1fr);gap:5px;padding:3px}
  body.game-mode .live-coach-active .live-coach-board-panel{padding:8px 8px 0;border-radius:11px}
  body.game-mode .live-coach-active .live-coach-summary{max-height:42px;font-size:8px}
  body.game-mode .live-coach-active .live-coach-comparison p{max-height:58px;font-size:7.6px}
  body.game-mode .live-coach-active .live-coach-actions{margin-left:-8px;margin-right:-8px;padding:7px 8px 6px}
}

@media(max-height:700px) and (min-width:761px){
  body.game-mode .playtop{min-height:36px}
  body.game-mode .playerbar{min-height:42px}
  body.game-mode .avatar{width:30px;height:30px;font-size:20px}
  body.game-mode .clock{font-size:18px}
  body.game-mode .board-hint{padding:4px 8px}
  body.game-mode .board-hint p{display:none}
  body.game-mode .status{display:none}
  body.game-mode .boardcol{grid-template-rows:auto auto minmax(0,1fr) auto}
}
/* End K-Mate v33 */
'''
write(styles_path, styles)
