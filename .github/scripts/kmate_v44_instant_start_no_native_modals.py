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


# ---------------------------------------------------------------------------
# HTML and resource versions. The principle review is now a normal app screen,
# not a native <dialog>, so it can never make the setup screen browser-inert.
# ---------------------------------------------------------------------------
index_path = ROOT / 'index.html'
index = read(index_path)
index = re.sub(r'styles-v7\.css\?v=\d+\.\d+\.\d+', 'styles-v7.css?v=44.0.0', index)
index = re.sub(r'app-v7\.js\?v=\d+\.\d+\.\d+', 'app-v7.js?v=44.0.0', index)

start = index.find('<dialog id="principlesDialog"')
if start < 0:
    start = index.find('<section id="principlesDialog"')
if start < 0:
    raise SystemExit('principles screen not found')
open_end = index.find('>', start)
close_dialog = index.find('</dialog>', open_end)
close_section = index.find('</section>', open_end)
if index.startswith('<dialog', start):
    original_open = index[start:open_end + 1]
    classes = re.search(r'class="([^"]*)"', original_open)
    class_name = classes.group(1) if classes else 'modal principles-modal'
    new_open = f'<section id="principlesDialog" class="{class_name} principles-app-screen" hidden aria-hidden="true">'
    if close_dialog < 0:
        raise SystemExit('principles dialog closing tag not found')
    index = index[:start] + new_open + index[open_end + 1:close_dialog] + '</section>' + index[close_dialog + len('</dialog>'):]
elif index.startswith('<section', start):
    original_open = index[start:open_end + 1]
    cleaned = re.sub(r'\s+hidden(?=[\s>])', '', original_open)
    cleaned = re.sub(r'\s+aria-hidden="[^"]*"', '', cleaned)
    cleaned = cleaned[:-1] + ' hidden aria-hidden="true">'
    index = index[:start] + cleaned + index[open_end + 1:]
write(index_path, index)

loader_path = ROOT / 'app-v7.js'
loader = read(loader_path)
loader = re.sub(r'positions-v7\.js\?v=\d+\.\d+\.\d+', 'positions-v7.js?v=44.0.0', loader)
loader = re.sub(r'app-v7-part\$\{number\}\.txt\?v=\d+\.\d+\.\d+', 'app-v7-part${number}.txt?v=44.0.0', loader)
write(loader_path, loader)


# ---------------------------------------------------------------------------
# Main runtime.
# ---------------------------------------------------------------------------
part1_path = ROOT / 'app-v7-part1.txt'
part1 = read(part1_path)
part1 = re.sub(r"url\.search = '\?v=20260830-\d+';", "url.search = '?v=20260830-44';", part1, count=1)

# Replace native modal helpers wholesale. Every overlay is fixed-position and
# nonmodal; closing/opening never toggles the browser's document-inert state.
dialog_pattern = re.compile(r"function openDialog\(id\) \{.*?\n\}\n\nfunction closeDialog\(id\) \{.*?\n\}", re.S)
nonmodal_helpers = r'''function overlayIsOpen(element) {
  return Boolean(element && !element.hidden && element.hasAttribute('open'));
}

function forceExitNativeModal(element) {
  if (!element) return;
  try {
    if (typeof element.matches === 'function' && element.matches(':modal') && typeof element.close === 'function') element.close();
  } catch {}
}

function openDialog(id) {
  const overlay = $(`#${id}`);
  if (!overlay) return false;
  forceExitNativeModal(overlay);
  overlay.hidden = false;
  overlay.setAttribute('open', '');
  overlay.setAttribute('aria-hidden', 'false');
  overlay.setAttribute('aria-modal', 'false');
  overlay.classList.add('app-nonmodal-overlay');
  return true;
}

function closeDialog(id) {
  if (id === 'replayDialog') { stopReplayAuto(); stopCoachSpeech(); }
  const overlay = $(`#${id}`);
  if (!overlay) return;
  forceExitNativeModal(overlay);
  overlay.removeAttribute('open');
  overlay.setAttribute('aria-hidden', 'true');
  overlay.hidden = true;
  overlay.classList.remove('app-nonmodal-overlay');
}

function closeAllAppOverlays() {
  $$('.modal[open], dialog[open], #principlesDialog[open]').forEach((overlay) => closeDialog(overlay.id));
  $$('#setupView, #setupFlow, .setup-flow-page').forEach((element) => {
    try { element.inert = false; } catch {}
    element.removeAttribute('inert');
  });
}'''
part1, count = dialog_pattern.subn(lambda _match: nonmodal_helpers, part1, count=1)
if count != 1:
    raise SystemExit('Unable to replace dialog helpers')

# An immediate position uses a curated seed plus at most three inexpensive legal
# plies. It does not call the open-ended generator during the button press.
start_helpers = r'''
function immediatePositionPool() {
  let pool = validPositions.filter((position) => position.phase === settings.phase);
  if (settings.phase !== 'endgame' && settings.opening && settings.opening !== 'all') {
    const openingPool = pool.filter((position) => position.opening === settings.opening);
    if (openingPool.length) pool = openingPool;
  }
  const goal = TRAINING_GOALS[settings.trainingGoal] || TRAINING_GOALS.all;
  if (settings.trainingGoal !== 'all') {
    const themed = pool.filter((position) => (position.tags || []).some((tag) => goal.tags?.includes(tag)));
    if (themed.length) pool = themed;
  }
  if (!pool.length) pool = validPositions.filter((position) => position.phase === settings.phase);
  if (!pool.length) pool = validPositions;
  return pool.filter((position) => {
    const candidate = safeChessFromFen(position.fen);
    return Boolean(candidate && !candidate.isGameOver() && candidate.moves().length > 0);
  });
}

function immediateMoveChoice(g) {
  const moves = g.moves({ verbose: true });
  if (!moves.length) return null;
  const ranked = moves.map((move) => ({
    move,
    score: randomFloat() * 28
      + (move.captured ? ({ p: 14, n: 30, b: 32, r: 48, q: 80, k: 0 }[move.captured] || 0) : 0)
      + (move.san?.includes('#') ? 250 : move.san?.includes('+') ? 24 : 0)
      + (move.promotion ? 70 : 0),
  })).sort((a, b) => b.score - a.score);
  const window = ranked.slice(0, Math.min(7, ranked.length));
  return window[Math.floor(randomFloat() * window.length)]?.move || ranked[0]?.move || null;
}

function immediatePositionForPlay() {
  const started = performance.now();
  const pool = immediatePositionPool();
  if (!pool.length) throw new Error('No legal training seed is available');
  const nearest = Math.min(...pool.map((position) => Math.abs((Number(position.rating) || 1600) - settings.positionRating)));
  let candidates = pool.filter((position) => Math.abs((Number(position.rating) || 1600) - settings.positionRating) <= Math.max(250, nearest));
  if (!candidates.length) candidates = pool;
  const seed = candidates[randomInt(0, candidates.length - 1)] || candidates[0];
  const g = safeChessFromFen(seed.fen);
  const line = [];
  const target = randomInt(0, settings.phase === 'endgame' ? 2 : 3);
  const deadline = performance.now() + 14;
  for (let ply = 0; ply < target && performance.now() < deadline && g && !g.isGameOver(); ply += 1) {
    const move = immediateMoveChoice(g);
    if (!move) break;
    const applied = g.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
    if (!applied) break;
    line.push(applied.san);
  }
  const usableFen = g && !g.isGameOver() && g.moves().length > 0 && phaseFits(g, settings.phase) ? g.fen() : seed.fen;
  lastGenerationDurationMs = Math.round(performance.now() - started);
  return {
    ...seed,
    id: `instant-${seed.id}-${Date.now()}-${randomInt(100, 999)}`,
    seedId: seed.id,
    generated: Boolean(line.length && usableFen !== seed.fen),
    variationPlies: usableFen === seed.fen ? 0 : line.length,
    branchDepth: usableFen === seed.fen ? 0 : line.length,
    variation: usableFen === seed.fen ? [] : line,
    fen: usableFen,
    rating: settings.positionRating,
    description: usableFen === seed.fen
      ? seed.description
      : `Instant legal branch from “${seed.title}.” The board opened before deeper background analysis.`,
  };
}

'''
marker = 'function setGeneratePositionButtonReady() {'
if start_helpers.strip() not in part1:
    part1 = replace_once(part1, marker, start_helpers + marker, 'instant position helpers')

# Replace any v41/v43 start handler with the guaranteed immediate route.
handle_pattern = re.compile(r"(?:async )?function handleGeneratePosition\(event = null\) \{.*?\n\}\n\nwindow\.__KMATE_GENERATE_POSITION__", re.S)
new_handle = r'''async function handleGeneratePosition(event = null) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  closeAllAppOverlays();
  const button = $('#startButton');
  if (!button || button.dataset.starting === '1' || document.body.classList.contains('game-mode')) return false;
  const box = $('#loadError');
  if (box) { box.textContent = ''; box.classList.remove('show'); }
  button.dataset.starting = '1';
  button.setAttribute('aria-busy', 'true');
  button.textContent = 'Opening board…';
  lastStartError = null;
  lastStartRecovery = null;
  const startedAt = performance.now();

  const watchdog = window.setTimeout(() => {
    if (document.body.classList.contains('game-mode')) return;
    button.dataset.starting = '0';
    button.removeAttribute('aria-busy');
    button.textContent = 'Generate position';
    toast('The board did not open. Tap Generate position again.');
  }, 2200);

  // Return control so the pressed state paints before opening the game view.
  await new Promise((resolve) => requestAnimationFrame(resolve));

  try {
    updateControls(true);
    queuedCustomPosition = immediatePositionForPlay();
    startPosition({ preservePrevious: true });
    if (!gameViewActivated()) throw new Error('The game view did not activate');
    lastStartDurationMs = Math.round(performance.now() - startedAt);
    window.clearTimeout(watchdog);
    finishGeneratePositionButton(button);
    return true;
  } catch (error) {
    window.clearTimeout(watchdog);
    lastStartDurationMs = Math.round(performance.now() - startedAt);
    showGeneratePositionFailure(error);
    return false;
  }
}

window.__KMATE_GENERATE_POSITION__'''
part1, count = handle_pattern.subn(lambda _match: new_handle, part1, count=1)
if count != 1:
    raise SystemExit('Unable to replace Generate position handler')

# Exactly one activation route: the native click event.
part1 = part1.replace("$('#startButton').addEventListener('click', handleGeneratePosition);", "$('#startButton').onclick = handleGeneratePosition;", 1)
fallback_pattern = re.compile(r"function installGeneratePositionActivationFallback\(\) \{.*?\n\}\n\nfunction stopReviewPlayback", re.S)
part1, count = fallback_pattern.subn("function installGeneratePositionActivationFallback() {\n  const button = $('#startButton');\n  if (button) { button.dataset.activationFallback = 'single-native-click'; button.style.touchAction = 'manipulation'; }\n}\n\nfunction stopReviewPlayback", part1, count=1)
if count != 1:
    raise SystemExit('Unable to simplify activation fallback')

# The setup is shown only after all overlays are closed.
part1 = replace_once(
    part1,
    "function showView(view) {\n  const gameMode = view === 'game';",
    "function showView(view) {\n  const gameMode = view === 'game';\n  if (!gameMode) closeAllAppOverlays();",
    'close overlays before setup',
)

# The principle screen uses the normal open attribute/hidden state, not a native
# dialog top layer. A watchdog starts play if it somehow cannot render.
principle_block_old = '''    renderAll();
    openDialog('principlesDialog');
    return;
  }
  beginPreparedPosition();'''
principle_block_new = '''    renderAll();
    openDialog('principlesDialog');
    requestAnimationFrame(() => {
      const screen = $('#principlesDialog');
      const rect = screen?.getBoundingClientRect?.();
      if (overlayIsOpen(screen) && rect?.width > 240 && rect?.height > 300) return;
      console.warn('Principle review could not render; starting play rather than freezing setup.');
      closeDialog('principlesDialog');
      principleReviewPending = false;
      beginPreparedPosition();
    });
    return;
  }
  beginPreparedPosition();'''
if principle_block_old in part1:
    part1 = replace_once(part1, principle_block_old, principle_block_new, 'principle screen route')
else:
    # v43 already contains a watchdog; normalize its check to the section helper.
    part1 = re.sub(
        r"renderAll\(\);\n    openDialog\('principlesDialog'\);\n    requestAnimationFrame\(\(\) => \{.*?\n    \}\);\n    return;\n  \}\n  beginPreparedPosition\(\);",
        principle_block_new,
        part1,
        count=1,
        flags=re.S,
    )
write(part1_path, part1)


# ---------------------------------------------------------------------------
# Setup-flow hardening and version state.
# ---------------------------------------------------------------------------
part6_path = ROOT / 'app-v7-part6.txt'
part6 = read(part6_path)
part6 = re.sub(r"version: '\d+\.0-commercial-beta'", "version: '44.0-commercial-beta'", part6, count=1)

part6 = replace_once(
    part6,
    '''function showSetupFlowPage(page = 'intro', { focus = true } = {}) {
  const allowed = new Set(['intro', 'challenge', 'coach']);''',
    '''function showSetupFlowPage(page = 'intro', { focus = true } = {}) {
  closeAllAppOverlays();
  const allowed = new Set(['intro', 'challenge', 'coach']);''',
    'setup page closes overlays',
)

part6 = replace_once(
    part6,
    '''  document.querySelectorAll('.setup-flow-page').forEach((screen) => {
    const active = screen.dataset.setupPage === setupFlowPage;
    screen.hidden = !active;
    screen.classList.toggle('active', active);
    screen.setAttribute('aria-hidden', String(!active));
  });''',
    '''  document.querySelectorAll('.setup-flow-page').forEach((screen) => {
    const active = screen.dataset.setupPage === setupFlowPage;
    screen.hidden = !active;
    screen.classList.toggle('active', active);
    screen.setAttribute('aria-hidden', String(!active));
    try { screen.inert = false; } catch {}
    screen.removeAttribute('inert');
    screen.style.pointerEvents = active ? 'auto' : 'none';
    screen.style.zIndex = active ? '100' : '0';
  });''',
    'active setup page interaction',
)

part6 = replace_once(
    part6,
    '''  // Old scrolling setup shell and supplementary cards are no longer part of the visual flow.
  hero.hidden = true;
  setup.querySelector('.signal-card')?.classList.add('setup-supplement-hidden');
  setup.querySelector('.recommendation-card')?.classList.add('setup-supplement-hidden');''',
    '''  // Legacy cards stay only for existing statistic writers; they must never
  // cover the active setup page or participate in hit testing.
  hero.hidden = true;
  hero.style.display = 'none';
  hero.style.pointerEvents = 'none';
  for (const selector of ['.signal-card', '.recommendation-card']) {
    const legacy = setup.querySelector(selector);
    if (!legacy) continue;
    legacy.classList.add('setup-supplement-hidden');
    legacy.hidden = true;
    legacy.style.display = 'none';
    legacy.style.pointerEvents = 'none';
  }''',
    'remove legacy hit targets',
)

# Close any restored overlay when Safari resumes this page from BFCache.
event_marker = "window.visualViewport?.addEventListener?.('resize', pinPagedSetupViewport, { passive: true });"
part6 = replace_once(
    part6,
    event_marker,
    event_marker + "\nwindow.addEventListener('pageshow', () => { if (pagedSetupIsActive()) { closeAllAppOverlays(); showSetupFlowPage(setupFlowPage, { focus: false }); } });",
    'BFCache setup repair',
)

# If the v43 timing fields exist, retain them; otherwise append them to state.
if 'durationMs: lastStartDurationMs' not in part6:
    part6 = part6.replace(
        "start: { recovery: lastStartRecovery ? { ...lastStartRecovery } : null, error: lastStartError,",
        "start: { recovery: lastStartRecovery ? { ...lastStartRecovery } : null, error: lastStartError, durationMs: lastStartDurationMs, generationDurationMs: lastGenerationDurationMs,",
        1,
    )
write(part6_path, part6)


# ---------------------------------------------------------------------------
# CSS: guarantee the active setup page is the only hit-test layer, and style all
# overlays without relying on a native dialog backdrop.
# ---------------------------------------------------------------------------
styles_path = ROOT / 'styles-v7.css'
styles = read(styles_path)
styles += r'''

/* K-Mate v44 — instant board start and zero native modal/inert states */
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page{pointer-events:none!important;z-index:0!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active:not([hidden]){display:grid!important;pointer-events:auto!important;z-index:100!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page[hidden]{display:none!important;pointer-events:none!important}
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active button,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active input,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active select,
html.kmate-fixed-app body.paged-app:not(.game-mode) .setup-flow-page.active label{pointer-events:auto!important;touch-action:manipulation!important}
#setupView .hero[hidden],#setupView .setup-supplement-hidden,#setupView .signal-card[hidden],#setupView .recommendation-card[hidden]{display:none!important;visibility:hidden!important;pointer-events:none!important}
.modal:not([open]),#principlesDialog:not([open]){display:none!important;pointer-events:none!important}
.modal[open],#principlesDialog[open]{background-color:#08100bf2;pointer-events:auto!important}
.modal[open]::backdrop{display:none!important;background:transparent!important}
#principlesDialog.principles-app-screen[open]{display:block!important;position:fixed!important;inset:0!important;z-index:10000!important;width:100vw!important;max-width:none!important;height:100dvh!important;max-height:none!important;margin:0!important;padding:max(8px,env(safe-area-inset-top)) 8px max(8px,env(safe-area-inset-bottom))!important;border:0!important;overflow:hidden!important}
#principlesDialog[open] .modal-card,#principlesDialog[open] button{pointer-events:auto!important;touch-action:manipulation!important}
#startButton[aria-busy="true"]{opacity:.86!important;cursor:progress!important}
/* End K-Mate v44 */
'''
write(styles_path, styles)
