from __future__ import annotations

from pathlib import Path
import re

ROOT = Path("kmate-trainer")


def read(path: Path) -> str:
    return path.read_text()


def write(path: Path, text: str) -> None:
    path.write_text(text)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f"Missing patch marker: {label}")
    return text.replace(old, new, 1)


# Cache-bust every user-facing asset.
index_path = ROOT / "index.html"
index = read(index_path)
index = re.sub(r"styles-v7\.css\?v=\d+\.\d+\.\d+", "styles-v7.css?v=41.0.0", index)
index = re.sub(r"app-v7\.js\?v=\d+\.\d+\.\d+", "app-v7.js?v=41.0.0", index)
index = replace_once(
    index,
    '<button class="btn primary start" id="startButton" type="button">Generate position</button>',
    '<button class="btn primary start" id="startButton" type="button" onclick="window.__KMATE_GENERATE_POSITION__?.(event)">Generate position</button>',
    "direct Generate position activation",
)
write(index_path, index)

loader_path = ROOT / "app-v7.js"
loader = read(loader_path)
loader = re.sub(r"positions-v7\.js\?v=\d+\.\d+\.\d+", "positions-v7.js?v=41.0.0", loader)
loader = re.sub(r"app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+", "app-v7-part${number}.txt?v=41.0.0", loader)
write(loader_path, loader)

part1_path = ROOT / "app-v7-part1.txt"
part1 = read(part1_path)
part1 = part1.replace("url.search = '?v=20260830-40';", "url.search = '?v=20260830-41';")
part1 = part1.replace("url.search = '?v=20260830-35';", "url.search = '?v=20260830-41';")

# Track and repair legacy generator data. Clean-browser tests had passed, but an
# older local position tree can contain a malformed FEN and make freshPosition()
# throw before the game view opens.
part1 = replace_once(
    part1,
    "let lastGenerationMeta = null;",
    """let lastGenerationMeta = null;
let generatorCacheRepair = { removed: 0, repairedAt: null };
let lastStartRecovery = null;
let lastStartError = null;""",
    "start recovery state",
)

cache_marker = """try { generationCounter = Number(localStorage.getItem(GEN_COUNTER_KEY)) || 0; } catch {}

function randomFloat() {"""
cache_repair = """try { generationCounter = Number(localStorage.getItem(GEN_COUNTER_KEY)) || 0; } catch {}

function generatedEntryIsSafe(item) {
  if (!item?.fen || !item?.seedId || !item?.phase) return false;
  if (!validPositions.some((position) => position.id === item.seedId)) return false;
  try {
    const candidate = new Chess(item.fen);
    return !candidate.isGameOver() && candidate.moves().length > 0;
  } catch {
    return false;
  }
}

function persistGeneratedPositionCache() {
  try {
    localStorage.setItem(GEN_TREE_KEY, JSON.stringify(genTree));
    localStorage.setItem(GEN_KEY, JSON.stringify(genSeen));
    localStorage.setItem(GEN_COUNTER_KEY, String(generationCounter));
  } catch {}
}

function repairGeneratedPositionCache() {
  const original = genTree.length;
  genTree = genTree.filter(generatedEntryIsSafe).slice(0, GEN_TREE_LIMIT);
  const removed = Math.max(0, original - genTree.length);
  if (removed) {
    generatorCacheRepair = { removed, repairedAt: new Date().toISOString() };
    persistGeneratedPositionCache();
    console.warn(`K-Mate removed ${removed} invalid legacy generated position${removed === 1 ? '' : 's'}.`);
  }
  return removed;
}

function clearGeneratedPositionCache(reason = 'start recovery') {
  const removed = genTree.length;
  genTree = [];
  genSeen = [];
  generationCounter = 0;
  generatorCacheRepair = {
    removed: generatorCacheRepair.removed + removed,
    repairedAt: new Date().toISOString(),
    reason,
  };
  persistGeneratedPositionCache();
}

function discardGeneratedRoot(root) {
  if (!root?.id && !root?.fen) return;
  const before = genTree.length;
  genTree = genTree.filter((item) => item.id !== root.id && shortFen(item.fen) !== shortFen(root.fen));
  if (genTree.length !== before) persistGeneratedPositionCache();
}

function safeChessFromFen(fen) {
  try { return new Chess(fen); } catch { return null; }
}

repairGeneratedPositionCache();

function randomFloat() {"""
part1 = replace_once(part1, cache_marker, cache_repair, "legacy generator cache repair")

part1 = replace_once(
    part1,
    """  const descendants = genTree
    .filter((item) => item.phase === settings.phase)""",
    """  const descendants = genTree
    .filter(generatedEntryIsSafe)
    .filter((item) => item.phase === settings.phase)""",
    "safe generated descendants",
)

# Both the main generator loop and rescue loop must tolerate a stale entry even
# if another tab writes bad data after initial cache repair.
part1 = part1.replace(
    """    const g = new Chess(root.fen);
    const line = [];""",
    """    const g = safeChessFromFen(root?.fen);
    if (!g) {
      discardGeneratedRoot(root);
      continue;
    }
    const line = [];""",
)
if part1.count("const g = safeChessFromFen(root?.fen);") < 2:
    raise SystemExit("Expected to harden both generator loops")

part1 = replace_once(
    part1,
    """  const anchor = pool[randomInt(0, Math.max(0, pool.length - 1))];
  lastGenerationMeta = { seedId: anchor?.id || null, strictGate: false, fallback: true };
  return { ...anchor, id: `fallback-${anchor.id}-${Date.now()}`, seedId: anchor.id, generated: false, variationPlies: 0, rating: settings.positionRating };""",
    """  const anchor = pool[randomInt(0, Math.max(0, pool.length - 1))] || validPositions[0];
  if (!anchor) throw new Error('No valid training position is available');
  lastGenerationMeta = { seedId: anchor.id || null, strictGate: false, fallback: true };
  return { ...anchor, id: `fallback-${anchor.id}-${Date.now()}`, seedId: anchor.id, generated: false, variationPlies: 0, rating: settings.positionRating };""",
    "safe generator fallback anchor",
)

# Replace the v40 start handler with a two-stage recovery path. The first retry
# clears only generated-position history and opens a known curated seed; it does
# not erase games, preferences, insights, or coaching data.
handler_pattern = re.compile(
    r"function setGeneratePositionButtonReady\(\) \{.*?\n\}\n\nfunction stopReviewPlayback",
    re.S,
)
handler_replacement = r'''function setGeneratePositionButtonReady() {
  const button = $('#startButton');
  if (!button) return;
  button.disabled = false;
  button.removeAttribute('aria-busy');
  button.dataset.starting = '0';
  button.textContent = 'Generate position';
  button.title = stockfishLoadError
    ? 'Open a position now; K-Mate will use fallback play until Stockfish is available.'
    : 'Create a fresh position and begin play';
}

function safeCuratedRecoveryPosition() {
  let pool = validPositions.filter((position) => position.phase === settings.phase);
  if (settings.phase !== 'endgame' && settings.opening && settings.opening !== 'all') {
    const openingPool = pool.filter((position) => position.opening === settings.opening);
    if (openingPool.length) pool = openingPool;
  }
  if (!pool.length) pool = validPositions;
  const ordered = pool.slice().sort((first, second) =>
    Math.abs((Number(first.rating) || 1600) - settings.positionRating)
      - Math.abs((Number(second.rating) || 1600) - settings.positionRating));
  const seed = ordered[0];
  if (!seed) throw new Error('No curated recovery position is available');
  return {
    ...seed,
    id: `recovered-${seed.id}-${Date.now()}`,
    seedId: seed.id,
    generated: false,
    variationPlies: 0,
    branchDepth: 0,
    description: `${seed.description} Opened from a curated seed after repairing an older local position cache.`,
  };
}

function gameViewActivated() {
  return Boolean(game && current && document.body.classList.contains('game-mode') && !$('#gameView')?.hidden && $('#board'));
}

function finishGeneratePositionButton(button) {
  window.requestAnimationFrame(() => {
    button.dataset.starting = '0';
    button.disabled = false;
    button.removeAttribute('aria-busy');
    button.textContent = 'Generate position';
  });
}

function showGeneratePositionFailure(error) {
  lastStartError = String(error?.stack || error?.message || error || 'Unknown start error');
  console.error('Unable to generate a K-Mate position.', error);
  const box = $('#loadError');
  if (box) {
    box.textContent = 'K-Mate could not open the board. Reload this v41 page once and try again.';
    box.classList.add('show');
  }
  toast('The board did not open. Reload v41 once and try again.');
  setGeneratePositionButtonReady();
}

function handleGeneratePosition(event = null) {
  event?.preventDefault?.();
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
  primeCoachVoiceOnSessionStart();

  try {
    startPosition();
    if (!gameViewActivated()) throw new Error('The game view did not activate');
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
      toast('Opened a fresh board after repairing an older position cache');
      finishGeneratePositionButton(button);
      return true;
    } catch (recoveryError) {
      const combined = new Error(`Initial start failed: ${firstError?.message || firstError}; recovery failed: ${recoveryError?.message || recoveryError}`);
      showGeneratePositionFailure(combined);
      return false;
    }
  }
}

window.__KMATE_GENERATE_POSITION__ = handleGeneratePosition;

function installGeneratePositionActivationFallback() {
  const button = $('#startButton');
  if (!button || button.dataset.activationFallback === '1') return;
  button.dataset.activationFallback = '1';
  button.onclick = handleGeneratePosition;
  button.addEventListener('pointerup', (event) => {
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    event.preventDefault();
    handleGeneratePosition(event);
  }, { passive: false });
  button.addEventListener('touchend', (event) => {
    event.preventDefault();
    handleGeneratePosition(event);
  }, { passive: false });
}

function stopReviewPlayback'''
part1, count = handler_pattern.subn(handler_replacement, part1, count=1)
if count != 1:
    raise SystemExit("Unable to replace the v40 Generate position handler")

# The ordinary click listener remains. The dataset guard makes the direct,
# pointer, touch, and click paths safely idempotent.
write(part1_path, part1)

part6_path = ROOT / "app-v7-part6.txt"
part6 = read(part6_path)
part6 = part6.replace("version: '40.0-commercial-beta'", "version: '41.0-commercial-beta'")
part6 = replace_once(
    part6,
    """bindControls();
syncGameViewportLayout();""",
    """bindControls();
installGeneratePositionActivationFallback();
syncGameViewportLayout();""",
    "install direct start activation",
)
part6 = replace_once(
    part6,
    """    generator: { mode: 'open-ended branch tree', branches: genTree.length, counter: generationCounter, last: lastGenerationMeta ? { ...lastGenerationMeta } : null },""",
    """    generator: { mode: 'open-ended branch tree', branches: genTree.length, counter: generationCounter, last: lastGenerationMeta ? { ...lastGenerationMeta } : null, cacheRepair: { ...generatorCacheRepair } },
    start: { recovery: lastStartRecovery ? { ...lastStartRecovery } : null, error: lastStartError, buttonReady: Boolean($('#startButton') && !$('#startButton').disabled), activationFallback: $('#startButton')?.dataset.activationFallback === '1' },""",
    "start diagnostics state",
)
write(part6_path, part6)

styles_path = ROOT / "styles-v7.css"
styles = read(styles_path)
styles += r'''

/* K-Mate v41 — unmistakable, resilient transition from setup to the board */
html.kmate-fixed-app body.paged-app:not(.game-mode) #startButton{
  position:relative;isolation:isolate;touch-action:manipulation;-webkit-tap-highlight-color:transparent;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) #startButton::after{
  content:'→';display:inline-grid;place-items:center;margin-left:10px;width:25px;height:25px;border-radius:999px;
  background:#17210f;color:#d7ff84;font-size:15px;font-weight:1000;vertical-align:middle;
}
html.kmate-fixed-app body.paged-app:not(.game-mode) #startButton[aria-busy="true"]::after{
  content:'';width:17px;height:17px;border:3px solid #17210f55;border-top-color:#17210f;background:transparent;
  animation:kmateStartSpin .7s linear infinite;
}
@keyframes kmateStartSpin{to{transform:rotate(360deg)}}
#loadError.show{display:block!important;padding:8px 11px!important;border:1px solid #ff8f8f55!important;border-radius:11px!important;background:#571b1b55!important;color:#ffdede!important;font-weight:800!important}
/* End K-Mate v41 */
'''
write(styles_path, styles)
