from __future__ import annotations

from pathlib import Path
import json
import re
import shutil

SOURCE = Path("kmate-trainer")
TARGET = Path("kmate-v42")


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing v42 patch marker: {label}")
    return text.replace(old, new, 1)


# Create a genuinely new physical path so an installed/in-app browser cannot
# satisfy the launch from an older cached /kmate-trainer/ document.
if TARGET.exists():
    shutil.rmtree(TARGET)
TARGET.mkdir(parents=True)
for filename in [
    "index.html",
    "styles-v7.css",
    "app-v7.js",
    "app-v7-part1.txt",
    "app-v7-part2.txt",
    "app-v7-part3.txt",
    "app-v7-part4.txt",
    "app-v7-part5.txt",
    "app-v7-part6.txt",
    "positions-v7.js",
    "manifest-v7.webmanifest",
]:
    shutil.copy2(SOURCE / filename, TARGET / filename)


# ---------------------------------------------------------------------------
# New path/version and shared large assets.
# ---------------------------------------------------------------------------
index_path = TARGET / "index.html"
index = index_path.read_text()
index = re.sub(r"styles-v7\.css\?v=\d+\.\d+\.\d+", "styles-v7.css?v=42.0.0", index)
index = re.sub(r"app-v7\.js\?v=\d+\.\d+\.\d+", "app-v7.js?v=42.0.0", index)
index = index.replace("<title>K-Mate — Timed Position Play</title>", "<title>K-Mate v42 — Position Play</title>")
index_path.write_text(index)

manifest_path = TARGET / "manifest-v7.webmanifest"
manifest = json.loads(manifest_path.read_text())
manifest["start_url"] = "./"
manifest["id"] = "./"
manifest["name"] = "K-Mate Position Play v42"
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")

loader_path = TARGET / "app-v7.js"
loader = loader_path.read_text()
loader = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=42.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=42.0.0", loader)
loader_path.write_text(loader)


# ---------------------------------------------------------------------------
# Critical start-path changes.
# ---------------------------------------------------------------------------
part1_path = TARGET / "app-v7-part1.txt"
part1 = part1_path.read_text()
part1 = part1.replace("url.search = '?v=20260830-41';", "url.search = '';\n  url.pathname = url.pathname.replace(/\\/?$/, '/');")
# Share the large sound and Stockfish assets with the existing trainer directory.
part1 = part1.replace("'./sounds/", "'../kmate-trainer/sounds/")
part1 = part1.replace('"./sounds/', '"../kmate-trainer/sounds/')
part1 = part1.replace("new URL('./stockfish/", "new URL('../kmate-trainer/stockfish/")
# Use fresh generator keys. Training history/settings remain shared, but legacy
# generated branches can no longer influence this new start path.
part1 = part1.replace("const GEN_KEY = 'kmate-generated-v23';", "const GEN_KEY = 'kmate-generated-v42';")
part1 = part1.replace("const GEN_TREE_KEY = 'kmate-generation-tree-v23';", "const GEN_TREE_KEY = 'kmate-generation-tree-v42';")
part1 = part1.replace("const GEN_COUNTER_KEY = 'kmate-generation-counter-v23';", "const GEN_COUNTER_KEY = 'kmate-generation-counter-v42';")

old_audio_context = '''function ensureAudioContext() {
  if (!soundEnabled()) return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!audioContext) audioContext = new AudioCtx();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}'''
new_audio_context = '''function ensureAudioContext() {
  if (!soundEnabled()) return null;
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioContext) audioContext = new AudioCtx();
    if (audioContext.state === 'suspended') {
      try {
        const resumeResult = audioContext.resume?.();
        if (resumeResult?.catch) resumeResult.catch(() => {});
      } catch {}
    }
    return audioContext;
  } catch (error) {
    // Audio must never prevent chess from starting in Safari, an in-app browser,
    // private browsing, or a device with a restricted media implementation.
    console.warn('Audio is unavailable; K-Mate will continue silently.', error);
    audioContext = null;
    return null;
  }
}'''
part1 = replace_once(part1, old_audio_context, new_audio_context, "safe AudioContext")

# Guarantee that browser dialog quirks cannot abort position creation.
old_dialogs = '''function openDialog(id) {
  const dialog = $(`#${id}`);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDialog(id) {
  if (id === 'replayDialog') { stopReplayAuto(); stopCoachSpeech(); }
  const dialog = $(`#${id}`);
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}'''
new_dialogs = '''function openDialog(id) {
  const dialog = $(`#${id}`);
  if (!dialog) return false;
  try {
    if (dialog.open) return true;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    return true;
  } catch (error) {
    console.warn(`Native dialog ${id} could not open; using the compatible overlay fallback.`, error);
    try { dialog.setAttribute('open', ''); } catch {}
    return Boolean(dialog.open || dialog.hasAttribute('open'));
  }
}

function closeDialog(id) {
  if (id === 'replayDialog') { stopReplayAuto(); stopCoachSpeech(); }
  const dialog = $(`#${id}`);
  if (!dialog) return false;
  try {
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  } catch (error) {
    console.warn(`Native dialog ${id} could not close; clearing its open state directly.`, error);
    try { dialog.removeAttribute('open'); } catch {}
  }
  return true;
}'''
part1 = replace_once(part1, old_dialogs, new_dialogs, "safe dialog APIs")

# The old generator could monopolize the main thread on slower WebKit devices.
part1 = replace_once(part1, "const deadline = performance.now() + 460;", "const deadline = performance.now() + 155;", "short generation deadline")
part1 = replace_once(
    part1,
    "if (attempt > 12 && performance.now() > deadline && bestRelaxed) break;",
    "if (performance.now() > deadline) break;",
    "unconditional generation deadline",
)
part1 = replace_once(
    part1,
    "for (let ply = 0; ply < targetPlies && !g.isGameOver(); ply += 1) {",
    "for (let ply = 0; ply < targetPlies && !g.isGameOver(); ply += 1) {\n      if (performance.now() > deadline) break;",
    "generation inner-loop deadline",
)
part1 = replace_once(
    part1,
    "for (let rescue = 0; rescue < 14; rescue += 1) {",
    "const rescueDeadline = performance.now() + 55;\n  for (let rescue = 0; rescue < 8; rescue += 1) {\n    if (performance.now() > rescueDeadline) break;",
    "bounded rescue generation",
)

# Media initialization is deferred until after the chessboard exists and paints.
media_helpers = '''
function warmNonCriticalMediaAfterGameStarts() {
  window.setTimeout(() => {
    try {
      const result = unlockMoveAudio(false);
      if (result?.catch) result.catch(() => {});
    } catch (error) {
      console.info('Move audio stayed disabled during startup.', error);
    }
    try { ensureAudioContext(); } catch {}
    try { primeLiveCoachVoice(); } catch (error) {
      console.info('Coach voice stayed unprimed during startup.', error);
    }
  }, 80);
}

function setStartStage(stage, detail = '') {
  document.body.dataset.startStage = stage;
  window.__KMATE_START_TRACE__ = {
    stage,
    detail: String(detail || ''),
    at: Date.now(),
  };
}

function showStartingGameShell() {
  setStartStage('opening-game-screen');
  showView('game');
  const title = $('#positionTitle');
  const meta = $('#gameMeta');
  const status = $('#statusText');
  if (title) title.textContent = 'Preparing your position…';
  if (meta) meta.textContent = 'Opening positional play';
  if (status) status.textContent = 'Selecting a legal position. This should take less than a second.';
  const board = $('#board');
  if (board) {
    board.classList.add('starting-position');
    board.innerHTML = '<div class="board-starting-state"><span class="board-starting-knight">♞</span><b>Preparing the board…</b><small>Position play is opening now</small></div>';
  }
  syncGameViewportLayout();
}

function nextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
  });
}

'''
part1 = replace_once(part1, "function setGeneratePositionButtonReady() {", media_helpers + "function setGeneratePositionButtonReady() {", "startup helpers")

# Remove media work from the synchronous chess creation path.
part1 = replace_once(
    part1,
    '''function startPosition({ preservePrevious = false } = {}) {
  unlockMoveAudio(false);
  ensureAudioContext();
  primeLiveCoachVoice();
  resetLiveCoachFlow({ closeModal: true });''',
    '''function startPosition({ preservePrevious = false } = {}) {
  setStartStage('building-position');
  resetLiveCoachFlow({ closeModal: true });''',
    "media-free startPosition",
)
part1 = replace_once(
    part1,
    "  current = pickPosition();\n  game = new Chess(current.fen);",
    "  current = pickPosition();\n  setStartStage('position-selected', current?.id || 'unknown');\n  game = new Chess(current.fen);\n  setStartStage('chess-created', current?.fen || '');",
    "start trace position/chess",
)
part1 = replace_once(
    part1,
    "  showView('game');\n  initClocks({ paused: Boolean(settings.principleReview) });",
    "  showView('game');\n  setStartStage('game-visible', current?.id || '');\n  const startingBoard = $('#board');\n  startingBoard?.classList.remove('starting-position');\n  initClocks({ paused: Boolean(settings.principleReview) });\n  warmNonCriticalMediaAfterGameStarts();",
    "deferred media after game view",
)
part1 = replace_once(
    part1,
    "function renderBoard() {\n  const board = $('#board');\n  board.innerHTML = '';",
    "function renderBoard() {\n  const board = $('#board');\n  board.classList.remove('starting-position');\n  board.innerHTML = '';",
    "clear board starting state",
)

# Rebuild the button activation around an immediate painted game shell. The old
# implementation did expensive work before the browser had an opportunity to
# reveal that anything had happened.
handle_pattern = re.compile(r"function handleGeneratePosition\(event = null\) \{.*?\n\}\n\nwindow\.__KMATE_GENERATE_POSITION__", re.S)
handle_replacement = '''async function handleGeneratePosition(event = null) {
  event?.preventDefault?.();
  const button = $('#startButton');
  if (!button) return false;
  const activeSince = Number(button.dataset.startingAt) || 0;
  if (button.dataset.starting === '1' && Date.now() - activeSince < 4000) return false;

  const box = $('#loadError');
  if (box) {
    box.textContent = '';
    box.classList.remove('show');
  }
  button.dataset.starting = '1';
  button.dataset.startingAt = String(Date.now());
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Opening board…';
  lastStartError = null;
  lastStartRecovery = null;
  setStartStage('button-activated', event?.type || 'direct');

  // Switch screens first, then yield so Safari/WebKit can paint the game shell
  // before any position generation runs.
  showStartingGameShell();
  await nextPaint();

  try {
    try { updateControls(true); } catch (error) {
      console.warn('Setup values could not all be persisted; using the visible selections.', error);
    }
    setStartStage('primary-start');
    startPosition();
    if (!gameViewActivated()) throw new Error('The game view did not activate');
    setStartStage(principleReviewPending ? 'principles-ready' : 'ready', current?.id || '');
    finishGeneratePositionButton(button);
    return true;
  } catch (firstError) {
    console.warn('Primary position generation failed; opening a curated recovery board.', firstError);
    lastStartRecovery = {
      attemptedAt: new Date().toISOString(),
      reason: String(firstError?.stack || firstError?.message || firstError),
      action: 'used an isolated curated seed',
    };
    try {
      setStartStage('curated-recovery', firstError?.message || firstError);
      clearGeneratedPositionCache('automatic v42 start recovery');
      queuedCustomPosition = safeCuratedRecoveryPosition();
      startPosition({ preservePrevious: true });
      if (!gameViewActivated()) throw new Error('The curated recovery board did not activate');
      setStartStage(principleReviewPending ? 'principles-ready' : 'ready', current?.id || '');
      toast('Opened a curated position after bypassing the generated-position stream');
      finishGeneratePositionButton(button);
      return true;
    } catch (recoveryError) {
      const combined = new Error(`Primary start failed: ${firstError?.message || firstError}; curated recovery failed: ${recoveryError?.message || recoveryError}`);
      setStartStage('failed', combined.message);
      showGeneratePositionFailure(combined);
      return false;
    }
  }
}

window.__KMATE_GENERATE_POSITION__'''
part1, count = handle_pattern.subn(lambda _match: handle_replacement, part1, count=1)
if count != 1:
    raise SystemExit("Unable to replace Generate position handler")

# Capture/delegate activation before any stale or duplicated element handler.
fallback_pattern = re.compile(r"function installGeneratePositionActivationFallback\(\) \{.*?\n\}\n\nfunction stopReviewPlayback", re.S)
fallback_replacement = '''function installGeneratePositionActivationFallback() {
  const button = $('#startButton');
  if (!button || button.dataset.activationFallback === '1') return;
  button.dataset.activationFallback = '1';
  const activate = (event) => {
    const target = event.target?.closest?.('#startButton');
    if (!target) return;
    if (event.type === 'pointerup' && !['touch', 'pen'].includes(event.pointerType)) return;
    event.preventDefault();
    event.stopImmediatePropagation?.();
    handleGeneratePosition(event);
  };
  document.addEventListener('click', activate, true);
  document.addEventListener('pointerup', activate, true);
  button.addEventListener('keydown', (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    handleGeneratePosition(event);
  });
}

function stopReviewPlayback'''
part1, count = fallback_pattern.subn(lambda _match: fallback_replacement, part1, count=1)
if count != 1:
    raise SystemExit("Unable to replace Generate position activation fallback")

# Make the failure state visible on the already-open game screen rather than
# silently returning the user to the setup page.
old_failure = '''function showGeneratePositionFailure(error) {
  lastStartError = String(error?.stack || error?.message || error || 'Unknown start error');
  console.error('Unable to generate a K-Mate position.', error);
  const box = $('#loadError');
  if (box) {
    box.textContent = 'K-Mate could not open the board. Reload this v41 page once and try again.';
    box.classList.add('show');
  }
  toast('The board did not open. Reload v41 once and try again.');
  setGeneratePositionButtonReady();
}'''
new_failure = '''function showGeneratePositionFailure(error) {
  lastStartError = String(error?.stack || error?.message || error || 'Unknown start error');
  console.error('Unable to generate a K-Mate position.', error);
  showView('game');
  const board = $('#board');
  if (board) {
    board.classList.add('starting-position');
    board.innerHTML = `<div class="board-starting-state start-failed"><span class="board-starting-knight">!</span><b>The board could not initialize</b><small>Diagnostic stage: ${escapeHtml(document.body.dataset.startStage || 'unknown')}</small><button class="btn primary" type="button" id="startRetryButton">Retry with a curated position</button><button class="btn" type="button" id="startHomeButton">Return to setup</button></div>`;
    $('#startRetryButton')?.addEventListener('click', async () => {
      clearGeneratedPositionCache('manual v42 retry');
      queuedCustomPosition = safeCuratedRecoveryPosition();
      const setupButton = $('#startButton');
      if (setupButton) {
        setupButton.dataset.starting = '0';
        setupButton.disabled = false;
      }
      await handleGeneratePosition();
    });
    $('#startHomeButton')?.addEventListener('click', () => showView('setup'));
  }
  toast('K-Mate reached a startup error screen with a direct retry option.');
  setGeneratePositionButtonReady();
}'''
part1 = replace_once(part1, old_failure, new_failure, "visible failure screen")

part1_path.write_text(part1)


# ---------------------------------------------------------------------------
# Initialization/version/diagnostics.
# ---------------------------------------------------------------------------
part6_path = TARGET / "app-v7-part6.txt"
part6 = part6_path.read_text()
part6 = part6.replace("version: '41.0-commercial-beta'", "version: '42.0-commercial-beta'")
# Install the delegated activation only after the setup button has been moved to
# its final page and normal controls are bound.
part6 = replace_once(
    part6,
    "bindControls();\nsyncGameViewportLayout();",
    "bindControls();\ninstallGeneratePositionActivationFallback();\nsyncGameViewportLayout();",
    "activation fallback initialization",
)
# Allow tests and failure reports to identify the exact last successful stage.
part6 = replace_once(
    part6,
    "layout: { gameMode: document.body.classList.contains('game-mode'), focusMode:",
    "start: { stage: document.body.dataset.startStage || null, trace: window.__KMATE_START_TRACE__ || null, lastRecovery: lastStartRecovery, lastError: lastStartError },\n    layout: { gameMode: document.body.classList.contains('game-mode'), focusMode:",
    "startup diagnostics state",
)
part6_path.write_text(part6)


# ---------------------------------------------------------------------------
# Loading/error presentation.
# ---------------------------------------------------------------------------
styles_path = TARGET / "styles-v7.css"
styles = styles_path.read_text()
styles += r'''

/* K-Mate v42 — painted game shell before generation and resilient WebKit start */
#board.starting-position{display:grid!important;place-items:center!important;grid-template-columns:1fr!important;grid-template-rows:1fr!important;background:radial-gradient(circle at 50% 35%,#b9f4741d,transparent 18rem),linear-gradient(145deg,#1b2119,#09100c)!important}
.board-starting-state{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;width:min(440px,88%);min-height:220px;padding:28px;text-align:center;color:#f7f3e6}
.board-starting-knight{display:grid;place-items:center;width:72px;height:72px;border:1px solid #f4cc7055;border-radius:22px;background:linear-gradient(145deg,#f4cc7028,#b9f47418);font-size:44px;line-height:1;box-shadow:0 18px 45px #0008;animation:kmate-start-pulse 1.05s ease-in-out infinite alternate}
.board-starting-state b{font-size:clamp(20px,3vw,30px);letter-spacing:-.025em}
.board-starting-state small{font-size:12px;color:#c9d6c7}
.board-starting-state.start-failed{gap:12px}
.board-starting-state.start-failed .board-starting-knight{animation:none;color:#ffb4aa;border-color:#ff8e8666;background:#ff8e8613}
.board-starting-state .btn{width:min(310px,100%);min-height:44px}
@keyframes kmate-start-pulse{from{transform:translateY(0) scale(.98);box-shadow:0 12px 34px #0008}to{transform:translateY(-4px) scale(1.025);box-shadow:0 22px 52px #b9f4741b}}
@media(prefers-reduced-motion:reduce){.board-starting-knight{animation:none}}
@media(max-width:600px){.board-starting-state{min-height:170px;padding:16px}.board-starting-knight{width:58px;height:58px;border-radius:17px;font-size:35px}.board-starting-state b{font-size:20px}}
/* End K-Mate v42 */
'''
styles_path.write_text(styles)
