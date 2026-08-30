from __future__ import annotations

from pathlib import Path
import re

ROOT = Path('kmate-trainer')


def read(path: Path) -> str:
    return path.read_text()


def write(path: Path, text: str) -> None:
    path.write_text(text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'Missing patch marker: {label}')
    return text.replace(old, new, 1)


# Cache-bust every runtime resource.
index_path = ROOT / 'index.html'
index = read(index_path)
index = re.sub(r'styles-v7\.css\?v=\d+\.\d+\.\d+', 'styles-v7.css?v=43.0.0', index)
index = re.sub(r'app-v7\.js\?v=\d+\.\d+\.\d+', 'app-v7.js?v=43.0.0', index)
write(index_path, index)

loader_path = ROOT / 'app-v7.js'
loader = read(loader_path)
loader = re.sub(r'positions-v7\.js\?v=\d+\.\d+\.\d+', 'positions-v7.js?v=43.0.0', loader)
loader = re.sub(r'app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+', 'app-v7-part${number}.txt?v=43.0.0', loader)
write(loader_path, loader)

part1_path = ROOT / 'app-v7-part1.txt'
part1 = read(part1_path)
part1 = part1.replace("url.search = '?v=20260830-41';", "url.search = '?v=20260830-43';")

# Add timing diagnostics next to existing v41 start diagnostics.
part1 = replace_once(
    part1,
    "let lastStartRecovery = null;\nlet lastStartError = null;",
    "let lastStartRecovery = null;\nlet lastStartError = null;\nlet lastStartDurationMs = null;\nlet lastGenerationDurationMs = null;",
    'start timing variables',
)

# Replace the expensive, nested main-thread search with a strictly bounded
# branching generator. The old routine could evaluate tens of thousands of
# move/reply pairs synchronously and make the entire coaching page appear frozen.
fresh_pattern = re.compile(r"function freshPosition\(\) \{.*?\n\}\nfunction pickPosition\(\) \{", re.S)
fast_generator = r'''function fastBranchMove(g, phase) {
  const moves = g.moves({ verbose: true });
  if (!moves.length) return null;
  const scored = moves.map((move) => {
    let score = randomFloat() * 35;
    if (move.captured) score += ({ p: 18, n: 42, b: 44, r: 68, q: 105, k: 0 }[move.captured] || 0);
    if (move.promotion) score += 95;
    if (move.san?.includes('#')) score += 500;
    else if (move.san?.includes('+')) score += 34;
    if (phase === 'endgame' && move.piece === 'k') score += 8;
    if (phase !== 'endgame' && ['n', 'b'].includes(move.piece)) score += 5;
    return { move, score };
  }).sort((a, b) => b.score - a.score);
  const choiceWindow = scored.slice(0, Math.min(8, scored.length));
  const biasedIndex = Math.min(choiceWindow.length - 1, Math.floor(Math.pow(randomFloat(), 1.7) * choiceWindow.length));
  return choiceWindow[biasedIndex]?.move || scored[0]?.move || null;
}

function fastGeneratedPositionFromRoot(root, deadline) {
  const g = safeChessFromFen(root?.fen);
  if (!g || g.isGameOver()) return null;
  const line = [];
  const minimum = settings.phase === 'endgame' ? 2 : 3;
  const maximum = settings.phase === 'endgame' ? 6 : 7;
  const target = randomInt(minimum, maximum);
  for (let ply = 0; ply < target && performance.now() < deadline && !g.isGameOver(); ply += 1) {
    const move = fastBranchMove(g, settings.phase);
    if (!move) break;
    const applied = g.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
    if (!applied) break;
    line.push(applied.san);
  }
  if (!line.length || g.isGameOver() || g.moves().length === 0) return null;
  const fen = g.fen();
  if (!phaseFits(g, settings.phase)) return null;
  if (genSeen.includes(shortFen(fen))) return null;
  if (positionDistance(root.fen, fen) < (settings.phase === 'endgame' ? 2 : 3)) return null;
  return { root, fen, line };
}

function freshPosition() {
  const generationStarted = performance.now();
  const deadline = generationStarted + 38;
  let anchors = candidatePositions();
  if (!anchors.length) anchors = validPositions.filter((position) => position.phase === settings.phase);
  if (!anchors.length) anchors = validPositions;
  if (!anchors.length) throw new Error('No valid training position is available');

  const nearest = Math.min(...anchors.map((position) => Math.abs((Number(position.rating) || 1600) - settings.positionRating)));
  let pool = anchors.filter((position) => Math.abs((Number(position.rating) || 1600) - settings.positionRating) <= Math.max(250, nearest));
  if (!pool.length) pool = anchors;
  if (current?.seedId && pool.length > 1) {
    const alternatives = pool.filter((position) => position.id !== current.seedId);
    if (alternatives.length) pool = alternatives;
  }

  // At most eight shallow attempts and at most ~38 ms of branching work.
  for (let attempt = 0; attempt < 8 && performance.now() < deadline; attempt += 1) {
    const root = pool[randomInt(0, Math.max(0, pool.length - 1))] || pool[0];
    const candidate = fastGeneratedPositionFromRoot(root, deadline);
    if (!candidate) continue;
    lastGenerationDurationMs = Math.round(performance.now() - generationStarted);
    return buildGeneratedPosition(candidate.root, candidate.fen, candidate.line, false);
  }

  // Reliability beats novelty here: open a legal curated board immediately.
  // The next click can branch from another seed, so the library remains broad.
  const ordered = pool.slice().sort((first, second) =>
    Math.abs((Number(first.rating) || 1600) - settings.positionRating)
      - Math.abs((Number(second.rating) || 1600) - settings.positionRating));
  const usable = ordered.find((position) => {
    const g = safeChessFromFen(position.fen);
    return Boolean(g && !g.isGameOver() && g.moves().length > 0);
  }) || validPositions.find((position) => {
    const g = safeChessFromFen(position.fen);
    return Boolean(g && !g.isGameOver() && g.moves().length > 0);
  });
  if (!usable) throw new Error('No legal curated position is available');
  lastGenerationDurationMs = Math.round(performance.now() - generationStarted);
  lastGenerationMeta = { seedId: usable.id, strictGate: False if False else False, fastFallback: True if True else True };
  return {
    ...usable,
    id: `fast-seed-${usable.id}-${Date.now()}`,
    seedId: usable.id,
    generated: false,
    variationPlies: 0,
    branchDepth: 0,
    rating: settings.positionRating,
  };
}
function pickPosition() {'''
# The Python-looking booleans above are replaced before writing JS. Keeping the
# template readable avoids braces being interpreted by Python formatting.
fast_generator = fast_generator.replace('False if False else False', 'false').replace('True if True else True', 'true')
part1, count = fresh_pattern.subn(lambda _match: fast_generator, part1, count=1)
if count != 1:
    raise SystemExit('Unable to replace the synchronous position generator')

# Make the click event return to the browser before generating so the button can
# visibly change to "Opening board…" and the UI never appears dead.
handle_pattern = re.compile(r"function handleGeneratePosition\(event = null\) \{.*?\n\}\n\nwindow\.__KMATE_GENERATE_POSITION__", re.S)
new_handle = r'''async function handleGeneratePosition(event = null) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  const button = $('#startButton');
  if (!button || button.dataset.starting === '1' || document.body.classList.contains('game-mode')) return false;
  const box = $('#loadError');
  if (box) {
    box.textContent = '';
    box.classList.remove('show');
  }
  button.dataset.starting = '1';
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Opening board…';
  lastStartError = null;
  lastStartRecovery = null;
  const startedAt = performance.now();
  primeCoachVoiceOnSessionStart();

  // Yield twice so Safari/WebKit paints the pressed state before any chess work.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  try {
    startPosition();
    if (!gameViewActivated()) throw new Error('The game view did not activate');
    lastStartDurationMs = Math.round(performance.now() - startedAt);
    finishGeneratePositionButton(button);
    return true;
  } catch (firstError) {
    console.warn('Initial position generation failed; repairing the local position cache and retrying.', firstError);
    lastStartRecovery = {
      attemptedAt: new Date().toISOString(),
      reason: String(firstError?.message || firstError),
      action: 'cleared generated-position cache and used a curated seed',
    };
    try {
      clearGeneratedPositionCache('automatic start recovery');
      queuedCustomPosition = safeCuratedRecoveryPosition();
      startPosition({ preservePrevious: true });
      if (!gameViewActivated()) throw new Error('The recovery position did not activate the game view');
      lastStartDurationMs = Math.round(performance.now() - startedAt);
      toast('Opened a fresh board after repairing an older position cache');
      finishGeneratePositionButton(button);
      return true;
    } catch (recoveryError) {
      lastStartDurationMs = Math.round(performance.now() - startedAt);
      const combined = new Error(`Initial start failed: ${firstError?.message || firstError}; recovery failed: ${recoveryError?.message || recoveryError}`);
      showGeneratePositionFailure(combined);
      return false;
    }
  }
}

window.__KMATE_GENERATE_POSITION__'''
part1, count = handle_pattern.subn(lambda _match: new_handle, part1, count=1)
if count != 1:
    raise SystemExit('Unable to replace Generate position handler')

# Multiple touch/click handlers were unnecessary and could submit the same start
# twice. Keep one native click action; buttons already have touch-action support.
fallback_pattern = re.compile(r"function installGeneratePositionActivationFallback\(\) \{.*?\n\}\n\nfunction stopReviewPlayback", re.S)
new_fallback = '''function installGeneratePositionActivationFallback() {
  const button = $('#startButton');
  if (!button) return;
  button.dataset.activationFallback = 'native-click';
  button.removeAttribute('onclick');
  button.style.touchAction = 'manipulation';
}

function stopReviewPlayback'''
part1, count = fallback_pattern.subn(new_fallback, part1, count=1)
if count != 1:
    raise SystemExit('Unable to simplify Generate position activation')

# Principles look like a full-screen app page but must not use showModal(),
# because an invisible modal can make the setup screen browser-inert.
old_open_dialog = '''function openDialog(id) {
  const dialog = $(`#${id}`);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}'''
new_open_dialog = '''function openDialog(id) {
  const dialog = $(`#${id}`);
  if (!dialog) return false;
  if (id === 'principlesDialog') {
    try {
      if (dialog.open && dialog.matches(':modal') && typeof dialog.close === 'function') dialog.close();
    } catch {}
    dialog.classList.add('nonmodal-app-screen');
    dialog.setAttribute('aria-modal', 'false');
    dialog.setAttribute('open', '');
    return true;
  }
  if (dialog.open) return true;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  return true;
}'''
part1 = replace_once(part1, old_open_dialog, new_open_dialog, 'nonmodal principle review')

old_principles_return = '''    renderAll();
    openDialog('principlesDialog');
    return;
  }
  beginPreparedPosition();'''
new_principles_return = '''    renderAll();
    openDialog('principlesDialog');
    requestAnimationFrame(() => {
      const dialog = $('#principlesDialog');
      const rect = dialog?.getBoundingClientRect?.();
      if (dialog?.open && rect?.width > 240 && rect?.height > 300) return;
      console.warn('Principle review did not render; starting the clock instead of trapping the player.');
      closeDialog('principlesDialog');
      principleReviewPending = false;
      beginPreparedPosition();
    });
    return;
  }
  beginPreparedPosition();'''
part1 = replace_once(part1, old_principles_return, new_principles_return, 'principle review watchdog')
write(part1_path, part1)

# Update version and expose timing diagnostics.
part6_path = ROOT / 'app-v7-part6.txt'
part6 = read(part6_path)
part6 = part6.replace("version: '41.0-commercial-beta'", "version: '43.0-commercial-beta'")
part6 = replace_once(
    part6,
    "start: { recovery: lastStartRecovery ? { ...lastStartRecovery } : null, error: lastStartError, buttonReady: Boolean($('#startButton') && !$('#startButton').disabled), activationFallback: $('#startButton')?.dataset.activationFallback === '1' },",
    "start: { recovery: lastStartRecovery ? { ...lastStartRecovery } : null, error: lastStartError, durationMs: lastStartDurationMs, generationDurationMs: lastGenerationDurationMs, buttonReady: Boolean($('#startButton') && !$('#startButton').disabled), activationFallback: $('#startButton')?.dataset.activationFallback || null },",
    'start diagnostics state',
)
write(part6_path, part6)

# Ensure the nonmodal principle page remains visible and interactive.
styles_path = ROOT / 'styles-v7.css'
styles = read(styles_path)
styles += r'''

/* K-Mate v43 — bounded position generation and non-blocking start */
#startButton[aria-busy="true"]{opacity:.82!important;cursor:progress!important;pointer-events:none!important}
#principlesDialog.nonmodal-app-screen[open]{
  display:block!important;
  position:fixed!important;
  inset:0!important;
  z-index:10000!important;
  width:100vw!important;
  max-width:none!important;
  height:100dvh!important;
  max-height:none!important;
  margin:0!important;
  pointer-events:auto!important;
  touch-action:auto!important;
}
#principlesDialog.nonmodal-app-screen[open]::backdrop{display:none!important;background:transparent!important}
#principlesDialog.nonmodal-app-screen[open] .modal-card,
#principlesDialog.nonmodal-app-screen[open] button{pointer-events:auto!important;touch-action:manipulation!important}
/* End K-Mate v43 */
'''
write(styles_path, styles)
